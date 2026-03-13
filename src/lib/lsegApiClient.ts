/**
 * LSEG API Client — Queue, Throttle, Cache & Retry (BFF Proxy)
 *
 * Core safety layer for LSEG Data API.
 * All requests are routed through /api/proxy (Vercel Serverless BFF)
 * so that API keys are never exposed to the browser.
 *
 * Constraints:
 *   - Max 1 request per second (sequential queue)
 *   - Daily 10,000 request hard limit (9,500 soft cap)
 *   - 300s timeout per request
 *   - localStorage cache with 2h TTL
 *   - Exponential backoff retry (1x only)
 */

// ============================================================
// TYPES
// ============================================================

export interface LSEGRequestOptions {
    method?: 'GET' | 'POST';
    endpoint: string;
    params?: Record<string, string | number>;
    body?: unknown;
    /** Override cache TTL in seconds (default 7200 = 2h) */
    cacheTtlSeconds?: number;
    /** Skip cache lookup, always fetch fresh */
    skipCache?: boolean;
}

export interface LSEGResponse<T = unknown> {
    data: T;
    fromCache: boolean;
    cachedAt?: string;
}

// ============================================================
// CONSTANTS
// ============================================================

const CACHE_PREFIX = 'lseg_cache_';
const DAILY_COUNT_KEY = 'sidecar_lseg_daily_count';
const DAILY_COUNT_DATE_KEY = 'sidecar_lseg_daily_date';
const DEFAULT_CACHE_TTL_S = 7200; // 2 hours
const DAILY_SOFT_CAP = 9500;
const REQUEST_INTERVAL_MS = 1000; // 1 request per second
const REQUEST_TIMEOUT_MS = 300_000; // 300 seconds
const RETRY_BASE_DELAY_MS = 2000;

// ============================================================
// CACHE LAYER — localStorage with TTL
// ============================================================

function getCacheKey(endpoint: string, params?: Record<string, string | number>): string {
    const paramStr = params ? JSON.stringify(params, Object.keys(params).sort()) : '';
    // Simple FNV-1a-like hash for compact keys
    let hash = 0x811c9dc5;
    const str = `${endpoint}|${paramStr}`;
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return `${CACHE_PREFIX}${(hash >>> 0).toString(36)}`;
}

function getFromCache<T>(key: string, ttlSeconds: number): LSEGResponse<T> | null {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;

        const entry = JSON.parse(raw) as { data: T; timestamp: number };
        const age = (Date.now() - entry.timestamp) / 1000;

        if (age > ttlSeconds) {
            localStorage.removeItem(key);
            return null;
        }

        return {
            data: entry.data,
            fromCache: true,
            cachedAt: new Date(entry.timestamp).toISOString(),
        };
    } catch {
        return null;
    }
}

function setCache<T>(key: string, data: T): void {
    try {
        localStorage.setItem(key, JSON.stringify({
            data,
            timestamp: Date.now(),
        }));
    } catch {
        // localStorage full — try clearing old LSEG cache entries
        try {
            const keysToRemove: string[] = [];
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k?.startsWith(CACHE_PREFIX)) keysToRemove.push(k);
            }
            // Remove oldest half
            keysToRemove.slice(0, Math.ceil(keysToRemove.length / 2)).forEach(k => localStorage.removeItem(k));
            // Retry
            localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }));
        } catch { /* give up */ }
    }
}

// ============================================================
// DAILY REQUEST COUNTER — Prevents account block
// ============================================================

function getDailyCount(): number {
    const today = new Date().toISOString().slice(0, 10);
    const storedDate = localStorage.getItem(DAILY_COUNT_DATE_KEY);

    if (storedDate !== today) {
        // New day — reset counter
        localStorage.setItem(DAILY_COUNT_DATE_KEY, today);
        localStorage.setItem(DAILY_COUNT_KEY, '0');
        return 0;
    }

    return parseInt(localStorage.getItem(DAILY_COUNT_KEY) || '0', 10);
}

function incrementDailyCount(): void {
    const count = getDailyCount() + 1;
    localStorage.setItem(DAILY_COUNT_KEY, String(count));
}

export function getLSEGDailyUsage(): { count: number; limit: number; remaining: number } {
    const count = getDailyCount();
    return { count, limit: DAILY_SOFT_CAP, remaining: Math.max(0, DAILY_SOFT_CAP - count) };
}

// ============================================================
// ADAPTIVE CACHE TTL — Cost-Aware Dynamic Throttling
// ============================================================

export type LSEGUsageTier = 'normal' | 'moderate' | 'elevated' | 'critical';

/**
 * Returns the current usage tier based on daily request count.
 * External consumers can use this to display usage health.
 */
export function getLSEGUsageTier(): { tier: LSEGUsageTier; multiplier: number; usagePercent: number } {
    const { count } = getLSEGDailyUsage();
    const usagePercent = Math.round((count / DAILY_SOFT_CAP) * 100);

    if (usagePercent >= 90) return { tier: 'critical', multiplier: 8, usagePercent };
    if (usagePercent >= 75) return { tier: 'elevated', multiplier: 4, usagePercent };
    if (usagePercent >= 50) return { tier: 'moderate', multiplier: 2, usagePercent };
    return { tier: 'normal', multiplier: 1, usagePercent };
}

/**
 * Computes an adaptive cache TTL based on current daily API usage.
 * As usage increases, cache lifetime extends to reduce outgoing requests.
 *   - 0–50%  usage → base TTL (e.g. 2h)
 *   - 50–75% usage → 2× base TTL
 *   - 75–90% usage → 4× base TTL
 *   - 90%+   usage → 8× base TTL
 */
function getAdaptiveCacheTtl(baseTtlSeconds: number): number {
    const { multiplier } = getLSEGUsageTier();
    return baseTtlSeconds * multiplier;
}

// ============================================================
// REQUEST QUEUE — Sequential, 1 req/sec throttle
// ============================================================

interface QueuedRequest {
    options: LSEGRequestOptions;
    resolve: (value: LSEGResponse) => void;
    reject: (reason: Error) => void;
}

const queue: QueuedRequest[] = [];
let isProcessing = false;
let lastRequestTime = 0;

async function processQueue(): Promise<void> {
    if (isProcessing) return;
    isProcessing = true;

    while (queue.length > 0) {
        const item = queue.shift()!;

        // Enforce minimum interval between requests
        const elapsed = Date.now() - lastRequestTime;
        if (elapsed < REQUEST_INTERVAL_MS) {
            await sleep(REQUEST_INTERVAL_MS - elapsed);
        }

        try {
            const result = await executeRequest(item.options);
            item.resolve(result);
        } catch (err) {
            item.reject(err instanceof Error ? err : new Error(String(err)));
        }

        lastRequestTime = Date.now();
    }

    isProcessing = false;
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
// EXECUTE SINGLE REQUEST — With retry
// ============================================================

async function executeRequest(options: LSEGRequestOptions): Promise<LSEGResponse> {
    // Check daily limit
    if (getDailyCount() >= DAILY_SOFT_CAP) {
        throw new Error(
            `[LSEG] Daily request limit reached (${DAILY_SOFT_CAP}). ` +
            `Refusing to send more requests to protect your account.`
        );
    }

    const { method = 'GET', endpoint, params, body } = options;

    // BFF proxy URL — all requests go through our own backend
    const proxyUrl = '/api/proxy';
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };

    // Attempt with retry (max 1 retry)
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < 2; attempt++) {
        if (attempt > 0) {
            // Exponential backoff: 2s * 2^attempt
            const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
            console.warn(`[LSEG] Retry #${attempt} after ${delay}ms`);
            await sleep(delay);
        }

        try {
            incrementDailyCount();

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

            // Route through BFF proxy — send endpoint, params, method, body
            // The serverless function injects API keys server-side
            const response = await fetch(proxyUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    endpoint,
                    params: params ? Object.fromEntries(
                        Object.entries(params).map(([k, v]) => [k, String(v)])
                    ) : undefined,
                    method,
                    body,
                }),
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`[LSEG] HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            return { data, fromCache: false };
        } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
            console.warn(`[LSEG] Request failed (attempt ${attempt + 1}/2):`, lastError.message);
        }
    }

    throw lastError || new Error('[LSEG] Request failed after retries');
}

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Enqueue an LSEG API request. Returns cached data if available.
 * All requests go through the sequential queue (max 1/sec).
 */
export function lsegRequest<T = unknown>(options: LSEGRequestOptions): Promise<LSEGResponse<T>> {
    // Apply adaptive cache TTL based on daily usage tier
    const effectiveTtl = getAdaptiveCacheTtl(options.cacheTtlSeconds ?? DEFAULT_CACHE_TTL_S);

    // 1. Check cache first (unless skipped)
    if (!options.skipCache) {
        const cacheKey = getCacheKey(options.endpoint, options.params);
        const cached = getFromCache<T>(cacheKey, effectiveTtl);
        if (cached) {
            console.debug(`[LSEG] Cache hit for ${options.endpoint} (adaptive TTL: ${effectiveTtl}s)`);
            return Promise.resolve(cached);
        }
    }

    // 2. Enqueue the request
    return new Promise<LSEGResponse<T>>((resolve, reject) => {
        queue.push({
            options,
            resolve: (result) => {
                // Cache the response
                if (!options.skipCache) {
                    const cacheKey = getCacheKey(options.endpoint, options.params);
                    setCache(cacheKey, result.data);
                }
                resolve(result as LSEGResponse<T>);
            },
            reject,
        });

        processQueue();
    });
}

/** Convenience wrapper for GET requests */
export function lsegGet<T = unknown>(
    endpoint: string,
    params?: Record<string, string | number>,
    cacheTtlSeconds?: number,
): Promise<LSEGResponse<T>> {
    return lsegRequest<T>({ method: 'GET', endpoint, params, cacheTtlSeconds });
}

/** Convenience wrapper for POST requests */
export function lsegPost<T = unknown>(
    endpoint: string,
    body: unknown,
    cacheTtlSeconds?: number,
): Promise<LSEGResponse<T>> {
    return lsegRequest<T>({ method: 'POST', endpoint, body, cacheTtlSeconds });
}

/**
 * Check if the BFF proxy is reachable (lightweight health check).
 * Sends a minimal request to /api/proxy and checks for a valid response.
 */
export async function isLSEGAvailable(): Promise<boolean> {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const res = await fetch('/api/proxy?endpoint=/api/status', {
            method: 'GET',
            signal: controller.signal,
        });

        clearTimeout(timeoutId);
        // Even a 401/403 from upstream means our proxy is working
        return res.status !== 502;
    } catch {
        return false;
    }
}

/**
 * Clear all LSEG cache entries from localStorage.
 */
export function clearLSEGCache(): void {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith(CACHE_PREFIX)) keysToRemove.push(k);
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
    console.info(`[LSEG] Cleared ${keysToRemove.length} cache entries`);
}
