/**
 * OSINT Intelligence News Pipeline — Multi-Tier Intelligence Funnel
 * 
 * Architecture:
 *   Tier 1: Local Rule Filter (Keywords + Ontology terms match) → $0 cost
 *   Tier 2: Dedup Cache (title similarity hash) → $0 cost
 *   Tier 3: Micro-Batch Queue (3-5 articles → 1 API call, gemini-flash) → 1/50 cost
 * 
 * Only articles surviving all 3 tiers reach the LLM.
 */
import type { IntelArticle } from '../types';

// ============================================================
// RSS FEED SOURCES — CORS-free via rss2json proxy
// ============================================================

interface RSSSource {
    name: string;
    badge: string;
    feedUrl: string;
    category: 'macro' | 'maritime' | 'geopolitics';
}

const RSS_SOURCES: RSSSource[] = [
    // Maritime / Shipping
    { name: 'gCaptain', badge: '⚓', feedUrl: 'https://gcaptain.com/feed/', category: 'maritime' },
    { name: 'Hellenic Shipping News', badge: '🚢', feedUrl: 'https://www.hellenicshippingnews.com/feed/', category: 'maritime' },
    { name: 'Ship & Bunker', badge: '⛽', feedUrl: 'https://shipandbunker.com/rss', category: 'maritime' },
    { name: 'Splash247', badge: '🌊', feedUrl: 'https://splash247.com/feed/', category: 'maritime' },
    { name: 'The Maritime Executive', badge: '📋', feedUrl: 'https://maritime-executive.com/rss', category: 'maritime' },
    // Macro / Geopolitics
    { name: 'Reuters World', badge: '🔴', feedUrl: 'https://www.reutersagency.com/feed/', category: 'macro' },
    { name: 'UN News', badge: '🌐', feedUrl: 'https://news.un.org/feed/subscribe/en/news/all/rss.xml', category: 'geopolitics' },
    { name: 'WEF Agenda', badge: '🏛️', feedUrl: 'https://www.weforum.org/feed/agenda.xml', category: 'macro' },
    { name: 'UNCTAD', badge: '📊', feedUrl: 'https://unctad.org/rss.xml', category: 'macro' },
    { name: 'Chatham House', badge: '🔬', feedUrl: 'https://www.chathamhouse.org/publications/rss', category: 'geopolitics' },
];

// Direct JSON APIs (no RSS proxy needed)
const DIRECT_API_URLS = [
    'https://saurav.tech/NewsAPI/top-headlines/category/business/us.json',
    'https://saurav.tech/NewsAPI/top-headlines/category/general/us.json',
];

const RSS2JSON_PROXY = 'https://api.rss2json.com/v1/api.json?rss_url=';

// ============================================================
// FINOPS TELEMETRY — Exported stats for UI transparency
// ============================================================

export interface FinOpsStats {
    totalFetched: number;       // Total articles fetched from sources
    droppedByLocalFilter: number; // Tier 1: killed by keyword/ontology check
    droppedByDedup: number;      // Tier 2: killed by dedup cache
    sentToAIP: number;           // Tier 3: actually sent to LLM
    apiCallCount: number;        // Number of actual API calls made
    costSavingsPercent: number;  // Estimated cost savings %
}

const _stats: FinOpsStats = {
    totalFetched: 0,
    droppedByLocalFilter: 0,
    droppedByDedup: 0,
    sentToAIP: 0,
    apiCallCount: 0,
    costSavingsPercent: 0,
};

export function getFinOpsStats(): FinOpsStats {
    const total = _stats.totalFetched || 1;
    _stats.costSavingsPercent = Math.round(((total - _stats.sentToAIP) / total) * 100);
    return { ..._stats };
}

export function incrementApiCallCount() {
    _stats.apiCallCount++;
}

// ============================================================
// TIER 1: LOCAL RULE-BASED FILTER ($0 cost)
// ============================================================

// Built-in maritime/supply-chain terms that always match (domain-aware baseline)
const DOMAIN_BASELINE_TERMS = [
    'shipping', 'vessel', 'tanker', 'cargo', 'freight', 'port', 'maritime',
    'oil', 'crude', 'brent', 'wti', 'lng', 'lpg', 'vlcc', 'suezmax', 'aframax',
    'hormuz', 'suez', 'panama canal', 'malacca', 'red sea', 'houthi',
    'sanctions', 'embargo', 'blockade', 'piracy', 'war risk', 'insurance',
    'supply chain', 'logistics', 'container', 'bulk', 'bunker', 'fuel',
    'imo', 'cii', 'eexi', 'decarbonization', 'emission',
    'geopolit', 'tariff', 'trade war', 'opec', 'energy crisis',
    'strike', 'congestion', 'disruption', 'iran', 'russia', 'ukraine',
    '해운', '유가', '원유', '선박', '항만', '호르무즈', '수에즈', '공급망',
    '물류', '제재', '보험료', '운임', '컨테이너', '벌크',
];

function buildRelevanceTerms(): string[] {
    const terms = [...DOMAIN_BASELINE_TERMS];

    // Add user-configured keywords from Settings
    try {
        const settings = JSON.parse(localStorage.getItem('sidecar_settings') || '{}');
        if (Array.isArray(settings.osintKeywords)) {
            terms.push(...settings.osintKeywords.map((k: string) => k.toLowerCase()));
        }
    } catch { /* ignore */ }

    // Add ontology object names from the ontology store
    try {
        const ontology = JSON.parse(localStorage.getItem('sidecar_ontology') || '[]');
        for (const obj of ontology) {
            if (obj.title) terms.push(obj.title.toLowerCase());
            if (obj.properties?.name) terms.push(String(obj.properties.name).toLowerCase());
        }
    } catch { /* ignore */ }

    return [...new Set(terms)];
}

/**
 * Tier 1: Returns true if article contains at least 1 relevance term
 */
function passesLocalFilter(article: IntelArticle): boolean {
    const terms = buildRelevanceTerms();
    const haystack = `${article.title} ${article.description}`.toLowerCase();

    for (const term of terms) {
        if (term.length >= 2 && haystack.includes(term)) return true;
    }

    return false;
}

// ============================================================
// TIER 2: DEDUP CACHE (title similarity)
// ============================================================

const seenIds = new Set<string>();
const recentTitleHashes = new Map<number, string>(); // hash → articleId
const DEDUP_CACHE_MAX = 200;

function simpleHash(str: string): number {
    let hash = 0;
    const s = str.toLowerCase().replace(/[^a-z0-9가-힣]/g, '').slice(0, 60);
    for (let i = 0; i < s.length; i++) {
        hash = ((hash << 5) - hash) + s.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

/**
 * Tier 2: Returns true if article is NOT a duplicate
 */
function passesDedup(article: IntelArticle): boolean {
    // Check id-level dedup
    if (seenIds.has(article.id)) return false;
    seenIds.add(article.id);

    // Check title-similarity dedup
    const titleHash = simpleHash(article.title);
    if (recentTitleHashes.has(titleHash)) {
        _stats.droppedByDedup++;
        return false;
    }

    // Evict old entries if cache is full
    if (recentTitleHashes.size >= DEDUP_CACHE_MAX) {
        const firstKey = recentTitleHashes.keys().next().value;
        if (firstKey !== undefined) recentTitleHashes.delete(firstKey);
    }
    recentTitleHashes.set(titleHash, article.id);
    return true;
}

// ============================================================
// TIER 3: MICRO-BATCH QUEUE (3-5 articles → 1 API call)
// ============================================================

const evaluationQueue: IntelArticle[] = [];
const BATCH_SIZE = 5;              // Max articles per API call
const BATCH_FLUSH_DELAY_MS = 8000; // Flush after 8s even if batch not full
let batchFlushTimer: ReturnType<typeof setTimeout> | null = null;
let isProcessingBatch = false;

export type BatchEvaluationCallback = (
    articles: IntelArticle[]
) => Promise<void>;

let _onBatchReady: BatchEvaluationCallback | null = null;

export function setBatchEvaluationHandler(handler: BatchEvaluationCallback) {
    _onBatchReady = handler;
}

function enqueueToBatch(article: IntelArticle) {
    evaluationQueue.push(article);
    _stats.sentToAIP++;

    // Flush when batch is full
    if (evaluationQueue.length >= BATCH_SIZE) {
        flushBatch();
    } else if (!batchFlushTimer) {
        // Or flush after timeout
        batchFlushTimer = setTimeout(flushBatch, BATCH_FLUSH_DELAY_MS);
    }
}

async function flushBatch() {
    if (batchFlushTimer) {
        clearTimeout(batchFlushTimer);
        batchFlushTimer = null;
    }

    if (isProcessingBatch || evaluationQueue.length === 0) return;
    isProcessingBatch = true;

    const batch = evaluationQueue.splice(0, BATCH_SIZE);

    if (_onBatchReady) {
        try {
            await _onBatchReady(batch);
        } catch (err) {
            console.warn('[NewsService] Batch evaluation failed:', err);
        }
    }

    isProcessingBatch = false;

    // Process remaining
    if (evaluationQueue.length > 0) {
        setTimeout(flushBatch, 3000); // 3s delay between batches
    }
}

// ============================================================
// MULTI-TIER PIPELINE: Fetch → Filter → Dedup → Batch
// ============================================================

export async function fetchAndProcess(
    enabledSources?: string[],
    keywords?: string[],
): Promise<{ passed: IntelArticle[]; dropped: IntelArticle[] }> {
    const rawArticles = await fetchAllFeedsRaw(enabledSources, keywords);
    _stats.totalFetched += rawArticles.length;

    const passed: IntelArticle[] = [];
    const dropped: IntelArticle[] = [];

    for (const article of rawArticles) {
        // TIER 1: Local keyword/ontology filter
        if (!passesLocalFilter(article)) {
            _stats.droppedByLocalFilter++;
            dropped.push({ ...article, dropped: true, evaluated: true });
            continue;
        }

        // TIER 2: Dedup
        if (!passesDedup(article)) {
            continue; // silently skip duplicates
        }

        // Survived all local tiers — queue for TIER 3 (LLM batch)
        passed.push(article);
        enqueueToBatch(article);
    }

    return { passed, dropped };
}

// ============================================================
// RAW FETCH LAYER (no filtering, just aggregation)
// ============================================================

async function fetchAllFeedsRaw(
    enabledSources?: string[],
    keywords?: string[],
): Promise<IntelArticle[]> {
    const activeSources = enabledSources && enabledSources.length > 0
        ? RSS_SOURCES.filter(s =>
            enabledSources.some(es => s.name.toLowerCase().includes(es.toLowerCase()) || es.toLowerCase().includes(s.name.toLowerCase()))
        )
        : RSS_SOURCES;

    const sourcesToFetch = activeSources.length > 0 ? activeSources : RSS_SOURCES;

    const rssPromises = sourcesToFetch.slice(0, 6).map(s => fetchRSSFeed(s));
    const directPromises = DIRECT_API_URLS.map(u => fetchDirectAPI(u));

    const results = await Promise.allSettled([...rssPromises, ...directPromises]);

    let allArticles: IntelArticle[] = [];
    for (const result of results) {
        if (result.status === 'fulfilled') {
            allArticles = allArticles.concat(result.value);
        }
    }

    // Sort by published date, newest first
    if (keywords && keywords.length > 0) {
        const keywordLower = keywords.map(k => k.toLowerCase());
        allArticles.sort((a, b) => {
            const aMatch = keywordLower.some(k => a.title.toLowerCase().includes(k) || a.description.toLowerCase().includes(k));
            const bMatch = keywordLower.some(k => b.title.toLowerCase().includes(k) || b.description.toLowerCase().includes(k));
            if (aMatch && !bMatch) return -1;
            if (!aMatch && bMatch) return 1;
            return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
        });
    } else {
        allArticles.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
    }

    return allArticles;
}

// Keep legacy export for backward compat
export async function fetchAllFeeds(
    enabledSources?: string[],
    keywords?: string[],
): Promise<IntelArticle[]> {
    const { passed } = await fetchAndProcess(enabledSources, keywords);
    return passed;
}

// ============================================================
// POLLING SERVICE
// ============================================================

let pollingInterval: ReturnType<typeof setInterval> | null = null;

export function startPolling(
    onNewArticles: (articles: IntelArticle[]) => void,
    enabledSources?: string[],
    keywords?: string[],
    intervalMs: number = 15000,
) {
    stopPolling();

    fetchAndProcess(enabledSources, keywords).then(({ passed }) => {
        if (passed.length > 0) onNewArticles(passed);
    });

    pollingInterval = setInterval(async () => {
        try {
            const { passed } = await fetchAndProcess(enabledSources, keywords);
            if (passed.length > 0) onNewArticles(passed);
        } catch (err) {
            console.warn('[NewsService] Polling cycle error:', err);
        }
    }, intervalMs);
}

export function stopPolling() {
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }
}

// ============================================================
// DEFAULT RECOMMENDED SOURCES & KEYWORDS
// ============================================================

export const DEFAULT_OSINT_SOURCES = [
    'Bloomberg News',
    'AP News',
    'Reuters',
    'Lloyd\'s List',
    'Clarksons',
    'TradeWinds',
    'gCaptain',
    'Hellenic Shipping News',
    'Ship & Bunker',
    'Splash247',
    'WEF Agenda',
    'UN News',
];

export const DEFAULT_OSINT_KEYWORDS = [
    'War Risk Premium',
    'Oil Price',
    'Suez Canal',
    'Hormuz Strait',
    'Port Strike',
    'Geopolitics',
    'VLCC',
    'Container Shipping',
    'Freight Rate',
    'Supply Chain',
    'Sanctions',
    'Maritime Security',
];

// ============================================================
// RSS FETCHERS (unchanged)
// ============================================================

async function fetchRSSFeed(source: RSSSource): Promise<IntelArticle[]> {
    try {
        const proxyUrl = `${RSS2JSON_PROXY}${encodeURIComponent(source.feedUrl)}`;
        const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return [];
        const json = await res.json();
        if (json.status !== 'ok' || !json.items) return [];

        return json.items
            .filter((item: any) => item.title && item.title.trim())
            .slice(0, 8)
            .map((item: any) => {
                const id = generateArticleId(item.title, source.name);
                return {
                    id,
                    title: cleanHtml(item.title),
                    description: cleanHtml(item.description || item.content || '').slice(0, 300),
                    url: item.link || item.guid || '',
                    source: source.name,
                    sourceBadge: source.badge,
                    publishedAt: item.pubDate || new Date().toISOString(),
                    fetchedAt: new Date().toISOString(),
                    evaluated: false,
                    dropped: false,
                } as IntelArticle;
            });
    } catch (err) {
        console.warn(`[NewsService] RSS fetch failed for ${source.name}:`, err);
        return [];
    }
}

async function fetchDirectAPI(url: string): Promise<IntelArticle[]> {
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return [];
        const json = await res.json();
        const articles = json.articles || [];

        return articles
            .filter((a: any) => a.title && a.description && a.url)
            .slice(0, 6)
            .map((a: any) => {
                const sourceName = a.source?.name || 'News Wire';
                const id = generateArticleId(a.title, sourceName);
                return {
                    id,
                    title: a.title,
                    description: (a.description || '').slice(0, 300),
                    url: a.url,
                    source: sourceName,
                    sourceBadge: getSourceBadge(sourceName),
                    publishedAt: a.publishedAt || new Date().toISOString(),
                    fetchedAt: new Date().toISOString(),
                    evaluated: false,
                    dropped: false,
                } as IntelArticle;
            });
    } catch (err) {
        console.warn(`[NewsService] Direct API fetch failed:`, err);
        return [];
    }
}

// ============================================================
// UTILITIES
// ============================================================

function generateArticleId(title: string, source: string): string {
    const str = `${source}_${title}`.toLowerCase().replace(/\s+/g, '_').slice(0, 80);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const ch = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + ch;
        hash |= 0;
    }
    return `intel_${Math.abs(hash).toString(36)}`;
}

function cleanHtml(html: string): string {
    return html
        .replace(/<[^>]*>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function getSourceBadge(sourceName: string): string {
    const lower = sourceName.toLowerCase();
    if (lower.includes('ap ') || lower.includes('associated press')) return '🔴';
    if (lower.includes('bloomberg')) return '🟠';
    if (lower.includes('reuters')) return '🔵';
    if (lower.includes('lloyd') || lower.includes('clarksons')) return '⚓';
    if (lower.includes('cnbc') || lower.includes('financial')) return '💹';
    if (lower.includes('bbc')) return '📡';
    return '📰';
}
