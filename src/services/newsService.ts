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
import { lsegGet } from '../lib/lsegApiClient';

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
// TIER 2.5: KEYWORD PERSISTENCE TRACKER (Cost: $0)
// Regex-only crisis detection → buffer → 30min threshold gate
// ============================================================

export const DEFAULT_CRISIS_TERMS = [
    'strike', 'missile', 'blockade', 'premium', 'hormuz', 'ukmto',
    'houthi', 'piracy', 'drone', 'war.?risk', 'sanctions', 'closure',
    'attack', 'seizure', 'hostage', 'mine', 'torpedo', 'convoy',
    'naval', 'escalat', 'conflict', 'threat', 'terror', 'hijack',
    'detained', 'explosion', 'casualt', 'embargo', 'evacuat',
];

interface TrackedKeyword {
    keyword: string;
    firstSeenAt: number;       // timestamp
    articleBuffer: IntelArticle[];
    escalated: boolean;        // already flushed to LLM
}

// In-memory persistence map: keyword → tracker state
const keywordTrackerMap = new Map<string, TrackedKeyword>();

// Read thresholds from settings (fallback defaults)
function getTrackerSettings(): { thresholdMs: number; minArticles: number; crisisRegex: RegExp } {
    try {
        const raw = localStorage.getItem('sidecar_settings');
        if (raw) {
            const s = JSON.parse(raw);
            const thresholdMin = s.persistenceThresholdMinutes ?? 30;
            const minArticles = s.persistenceMinArticles ?? 3;
            const customTerms: string[] = s.crisisKeywords ?? [];
            const allTerms = [...DEFAULT_CRISIS_TERMS, ...customTerms.map((t: string) => t.toLowerCase().replace(/[^a-z0-9.?]/g, ''))].filter(Boolean);
            const uniqueTerms = [...new Set(allTerms)];
            return {
                thresholdMs: thresholdMin * 60 * 1000,
                minArticles,
                crisisRegex: new RegExp(`(${uniqueTerms.join('|')})`, 'i'),
            };
        }
    } catch { /* ignore */ }
    return {
        thresholdMs: 30 * 60 * 1000,
        minArticles: 3,
        crisisRegex: new RegExp(`(${DEFAULT_CRISIS_TERMS.join('|')})`, 'i'),
    };
}

/**
 * Scan article for crisis keywords using pure regex ($0 cost).
 * Returns matched keywords or empty array.
 */
function detectCrisisKeywords(article: IntelArticle): string[] {
    const text = `${article.title} ${article.description}`.toLowerCase();
    const matches: string[] = [];

    // Get custom terms from settings
    let customTerms: string[] = [];
    try {
        const s = JSON.parse(localStorage.getItem('sidecar_settings') || '{}');
        customTerms = (s.crisisKeywords || []).map((t: string) => t.toLowerCase().trim()).filter(Boolean);
    } catch { /* ignore */ }

    const allTerms = [...new Set([...DEFAULT_CRISIS_TERMS, ...customTerms])];

    for (const term of allTerms) {
        try {
            if (new RegExp(term, 'i').test(text) && !matches.includes(term)) {
                matches.push(term);
            }
        } catch { /* invalid regex term, skip */ }
    }

    return matches;
}

/**
 * Tier 2.5: Persistence Gate
 * Returns true if article should be escalated to LLM (Tier 3).
 * Returns false if article should go to feed silently.
 */
function persistenceGate(article: IntelArticle): boolean {
    const keywords = detectCrisisKeywords(article);

    // No crisis keywords → bypass gate, show in feed without LLM
    if (keywords.length === 0) {
        return false;
    }

    const now = Date.now();
    const { thresholdMs, minArticles } = getTrackerSettings();

    // Track each matched keyword
    for (const kw of keywords) {
        let tracker = keywordTrackerMap.get(kw);
        if (!tracker) {
            tracker = {
                keyword: kw,
                firstSeenAt: now,
                articleBuffer: [],
                escalated: false,
            };
            keywordTrackerMap.set(kw, tracker);
        }

        // Add article to buffer (dedup by id)
        if (!tracker.articleBuffer.some(a => a.id === article.id)) {
            tracker.articleBuffer.push(article);
        }

        // Check escalation: persistence >= threshold AND buffer >= minArticles
        const persisted = (now - tracker.firstSeenAt) >= thresholdMs;
        const sufficient = tracker.articleBuffer.length >= minArticles;

        if (persisted && sufficient && !tracker.escalated) {
            tracker.escalated = true;
            console.log(
                `[KeywordTracker] 🚨 ESCALATION: "${kw}" persisted ${Math.round((now - tracker.firstSeenAt) / 60000)}min with ${tracker.articleBuffer.length} articles → sending to LLM`
            );
            // Flush all buffered articles for this keyword to batch
            for (const buffered of tracker.articleBuffer) {
                enqueueToBatch(buffered);
            }
            return true; // escalated
        }

        if (tracker.escalated) {
            // Already escalated — new articles in this cluster go directly to LLM
            return true;
        }
    }

    // Not yet escalated — hold in buffer, show in feed without LLM
    _stats.droppedByLocalFilter++; // count as locally filtered (saved from LLM)
    return false;
}

// Garbage collect old trackers (> 2h since last seen)
function gcKeywordTrackers() {
    const now = Date.now();
    const GC_THRESHOLD = 2 * 60 * 60 * 1000; // 2 hours
    for (const [kw, tracker] of keywordTrackerMap) {
        if (now - tracker.firstSeenAt > GC_THRESHOLD) {
            keywordTrackerMap.delete(kw);
        }
    }
}

/** Export for UI display: current tracker state */
export function getKeywordTrackerState(): Array<{
    keyword: string;
    firstSeenAt: number;
    articleCount: number;
    escalated: boolean;
    persistedMinutes: number;
}> {
    const now = Date.now();
    return Array.from(keywordTrackerMap.values()).map(t => ({
        keyword: t.keyword,
        firstSeenAt: t.firstSeenAt,
        articleCount: t.articleBuffer.length,
        escalated: t.escalated,
        persistedMinutes: Math.round((now - t.firstSeenAt) / 60000),
    }));
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
    // Skip if already in queue
    if (evaluationQueue.some(a => a.id === article.id)) return;
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
// MULTI-TIER PIPELINE: Fetch → Filter → Dedup → Persistence Gate → Batch
// ============================================================

export async function fetchAndProcess(
    enabledSources?: string[],
    keywords?: string[],
): Promise<{ passed: IntelArticle[]; dropped: IntelArticle[] }> {
    const rawArticles = await fetchAllFeedsRaw(enabledSources, keywords);
    _stats.totalFetched += rawArticles.length;

    const passed: IntelArticle[] = [];
    const dropped: IntelArticle[] = [];

    // GC old keyword trackers periodically
    gcKeywordTrackers();

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

        // TIER 2.5: Persistence Gate (regex-only, $0)
        // Only crisis articles that persist ≥30min with ≥3 hits escalate to LLM
        const shouldEscalate = persistenceGate(article);

        if (shouldEscalate) {
            // Escalated → queue for TIER 3 (LLM batch)
            passed.push(article);
            // enqueueToBatch already called inside persistenceGate
        } else {
            // Not escalated → show in feed silently, no LLM cost
            passed.push({ ...article, evaluated: false });
        }
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
    intervalMs: number = 600_000, // 10-minute batch cycle
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
// HISTORICAL BACKFILL — Gemini Search Grounding
// Runs ONCE on first load when Firestore has no cached articles.
// Results written to Firestore by the caller (GlobalNewsWidget).
// ============================================================
/**
 * Bootstrap the intelligence feed with real historical data.
 * Uses Gemini Search Grounding to find actual maritime/geopolitical events
 * from 2026-03-01 to present date.
 * Called only when Firestore has no cached articles.
 */
let _bootstrapDone = false;
let _bootstrapInFlight: Promise<IntelArticle[]> | null = null;

export async function bootstrapHistoricalData(): Promise<IntelArticle[]> {
    // Session guard: only run once per session
    if (_bootstrapDone) {
        console.info('[NewsService] Backfill already completed this session, skipping');
        return [];
    }
    // In-flight dedup: if already running, return existing promise
    if (_bootstrapInFlight) return _bootstrapInFlight;

    _bootstrapInFlight = (async (): Promise<IntelArticle[]> => {
        console.log('[NewsService] Starting historical backfill via Gemini Search...');

        const today = new Date().toISOString().split('T')[0]; // e.g. '2026-03-11'

        try {
            const { bffGenerate } = await import('./geminiService');

            const prompt = `You are a maritime intelligence analyst. Search for REAL news events from 2026-03-01 to ${today} related to:
- Strait of Hormuz tensions, Middle East geopolitical risks
- Oil price movements (Brent crude)  
- Maritime security incidents (UKMTO warnings, piracy, drone attacks on vessels)
- P&I Club / War Risk Premium insurance changes
- Shipping route disruptions, Cape of Good Hope rerouting
- Port congestion, bunker fuel price spikes
- Red Sea/Houthi/Gulf of Aden shipping threats
- Any IMO, MSCHOA, or naval force advisories

Find 10-15 REAL events that actually happened. For each event, return:
- title: News headline (English)
- titleKo: Korean translation of the headline
- description: 2-3 sentence summary of the event
- source: Original news source (e.g. "Reuters", "Bloomberg", "Lloyd's List", "UKMTO")
- publishedAt: Actual date of the event in ISO format (YYYY-MM-DDTHH:mm:ssZ)
- url: Source URL if available
- category: "OSINT" | "OFFICIAL_CIRCULAR" | "SECURITY_ALERT"
- refNumber: Reference number if it's an official document (null otherwise)
- impactScore: 50-100 based on actual significance to global shipping
- riskLevel: "Low" | "Medium" | "High" | "Critical"
- insight: One-line actionable insight in Korean (한국어)
- ontologyTags: Array of 2-4 relevant keywords

ORDER events chronologically (oldest first). Include events from different dates to show a timeline.
If you cannot find events from 2026, use the most recent real maritime security events you can find.

Return ONLY a JSON array. No other text.`;

            const text = await bffGenerate(prompt, 'gemini-2.5-flash', undefined, [{ googleSearch: {} }]);
            let jsonStr = text.trim();
            if (jsonStr.startsWith('```json')) jsonStr = jsonStr.slice(7);
            else if (jsonStr.startsWith('```')) jsonStr = jsonStr.slice(3);
            if (jsonStr.endsWith('```')) jsonStr = jsonStr.slice(0, -3);
            jsonStr = jsonStr.trim();

            if (!jsonStr || jsonStr === '[]') return [];

            const parsed = JSON.parse(jsonStr);
            if (!Array.isArray(parsed)) return [];

            const articles: IntelArticle[] = parsed.map((item: any, i: number) => {
                const category = (['OSINT', 'OFFICIAL_CIRCULAR', 'SECURITY_ALERT'].includes(item.category))
                    ? item.category as IntelArticle['category']
                    : 'OSINT' as const;

                return {
                    id: generateArticleId(item.title || `backfill-${i}`, item.source || 'Backfill'),
                    title: item.titleKo || item.title || 'Maritime Intelligence',
                    description: item.description || '',
                    url: item.url || '#',
                    source: item.source || 'Intelligence',
                    sourceBadge: getSourceBadge(item.source || ''),
                    publishedAt: item.publishedAt || new Date(2026, 2, 1 + i).toISOString(),
                    fetchedAt: new Date().toISOString(),
                    evaluated: true,
                    dropped: false,
                    impactScore: item.impactScore ?? 70,
                    riskLevel: (item.riskLevel || 'Medium') as IntelArticle['riskLevel'],
                    aiInsight: item.insight || undefined,
                    ontologyTags: item.ontologyTags || [],
                    category,
                    refNumber: item.refNumber || undefined,
                };
            });

            // Sort newest first for display
            articles.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

            console.log('[NewsService] Backfill complete:', articles.length, 'historical articles');

            _bootstrapDone = true;
            return articles;
        } catch (err) {
            console.warn('[NewsService] Backfill failed:', err);
            return [];
        }
    })();

    try {
        return await _bootstrapInFlight;
    } finally {
        _bootstrapInFlight = null;
    }
}

// ============================================================
// OFFICIAL SOURCE FETCHERS — Gemini Search Grounding
// (KP&I website is Angular SPA, UKMTO is dynamic — can't scrape directly)
// ============================================================

let lastOfficialFetchTime = 0;
const OFFICIAL_FETCH_INTERVAL_MS = 15 * 60 * 1000; // 15 min between official fetches (was 5 min)
const officialArticleCache: IntelArticle[] = [];

// In-flight dedup for KPI and Security fetchers
let _kpiInFlight: Promise<IntelArticle[]> | null = null;
let _securityInFlight: Promise<IntelArticle[]> | null = null;

export async function fetchKPICirculars(): Promise<IntelArticle[]> {
    if (_kpiInFlight) return _kpiInFlight;
    _kpiInFlight = _fetchKPICircularsInner();
    try { return await _kpiInFlight; } finally { _kpiInFlight = null; }
}

async function _fetchKPICircularsInner(): Promise<IntelArticle[]> {
    try {
        const { bffGenerate } = await import('./geminiService');

        const prompt = `한국 P&I 클럽(Korea P&I Club, kpiclub.or.kr)의 최근 공식 회람(Circular)을 검색해서 찾아줘.
최근 6개월 이내에 발행된 해상보험 관련 회람을 최대 5건 찾아서 아래 JSON 형식으로 반환해.

검색 키워드: "한국선주상호보험" OR "kpiclub" 회람 circular war risk premium 보험

각 항목에 대해:
- refNumber: 문서 번호 (예: "CIR-2025-001")이 없으면 날짜 기반으로 생성
- title: 회람 제목 (한국어)
- description: 핵심 내용 요약 (2-3문장, 한국어)
- url: 가능한 경우 원본 URL, 없으면 "https://www.kpiclub.or.kr"
- publishedAt: 발행일 ISO 형식
- suggestedAction: 보험료/위험 관련 수치가 있다면 아래 형식으로:
  { "targetNodeId": "insurance-war-risk", "targetNodeTitle": "War Risk Premium", "propertyKey": "rateTo", "newValue": 수치, "displayLabel": "표시 텍스트", "sourceRef": "문서 번호" }

반드시 JSON 배열만 반환. 다른 텍스트 없이.
만약 결과를 찾을 수 없다면 빈 배열 []을 반환.`;

        const text = await bffGenerate(prompt, 'gemini-2.5-flash', undefined, [{ googleSearch: {} }]);
        let jsonStr = text.trim();
        if (jsonStr.startsWith('```json')) jsonStr = jsonStr.slice(7);
        else if (jsonStr.startsWith('```')) jsonStr = jsonStr.slice(3);
        if (jsonStr.endsWith('```')) jsonStr = jsonStr.slice(0, -3);
        jsonStr = jsonStr.trim();

        if (!jsonStr || jsonStr === '[]') return [];

        const parsed = JSON.parse(jsonStr);
        if (!Array.isArray(parsed)) return [];

        return parsed.map((item: any, i: number) => ({
            id: generateArticleId(item.title || `kpi-circular-${i}`, 'KP&I'),
            title: item.title || 'KP&I 회람',
            description: item.description || '',
            url: item.url || 'https://www.kpiclub.or.kr',
            source: 'Korea P&I Club',
            sourceBadge: '🇰🇷',
            publishedAt: item.publishedAt || new Date().toISOString(),
            fetchedAt: new Date().toISOString(),
            evaluated: true,
            dropped: false,
            impactScore: 85,
            riskLevel: 'High' as const,
            category: 'OFFICIAL_CIRCULAR' as const,
            refNumber: item.refNumber || `CIR-${new Date().getFullYear()}-${String(i + 1).padStart(3, '0')}`,
            suggestedAction: item.suggestedAction || undefined,
            aiInsight: item.description?.slice(0, 100) || undefined,
            ontologyTags: ['P&I', 'War Risk', '보험료'],
        }));
    } catch (err) {
        console.warn('[NewsService] KP&I fetch failed:', err);
        return [];
    }
}

export async function fetchSecurityAlerts(): Promise<IntelArticle[]> {
    if (_securityInFlight) return _securityInFlight;
    _securityInFlight = _fetchSecurityAlertsInner();
    try { return await _securityInFlight; } finally { _securityInFlight = null; }
}

async function _fetchSecurityAlertsInner(): Promise<IntelArticle[]> {
    try {
        const { bffGenerate } = await import('./geminiService');

        const prompt = `Search for the latest UKMTO (United Kingdom Maritime Trade Operations) maritime security alerts, warnings, and advisories.
Also search for IMB (International Maritime Bureau), MSCHOA, and NATO Shipping Centre alerts.

Find up to 5 recent maritime security incidents or warnings from the last 3 months. Return as JSON array:

- refNumber: Warning reference (e.g. "WARNING 042/MAR/2026" or "UKMTO-2026-xxx")
- title: Alert title in English
- description: 2-3 sentence summary including coordinates if available, type of incident (attack, suspicious approach, piracy, etc.)
- url: Source URL if available, otherwise "https://www.ukmto.org"
- publishedAt: Date in ISO format
- location: { "lat": number, "lng": number } if coordinates mentioned
- suggestedAction: If risk level change is warranted, include:
  { "targetNodeId": "macro-hormuz-tension", "targetNodeTitle": "Hormuz Tension", "propertyKey": "riskScore", "newValue": number, "displayLabel": "description", "sourceRef": "ref number" }

Return ONLY a JSON array. No other text.
If no results found, return empty array [].`;

        const text = await bffGenerate(prompt, 'gemini-2.5-flash', undefined, [{ googleSearch: {} }]);
        let jsonStr = text.trim();
        if (jsonStr.startsWith('```json')) jsonStr = jsonStr.slice(7);
        else if (jsonStr.startsWith('```')) jsonStr = jsonStr.slice(3);
        if (jsonStr.endsWith('```')) jsonStr = jsonStr.slice(0, -3);
        jsonStr = jsonStr.trim();

        if (!jsonStr || jsonStr === '[]') return [];

        const parsed = JSON.parse(jsonStr);
        if (!Array.isArray(parsed)) return [];

        return parsed.map((item: any, i: number) => ({
            id: generateArticleId(item.title || `security-alert-${i}`, 'UKMTO'),
            title: item.title || 'Maritime Security Alert',
            description: item.description || '',
            url: item.url || 'https://www.ukmto.org',
            source: item.source || 'UKMTO',
            sourceBadge: '🇬🇧',
            publishedAt: item.publishedAt || new Date().toISOString(),
            fetchedAt: new Date().toISOString(),
            evaluated: true,
            dropped: false,
            impactScore: 90,
            riskLevel: 'Critical' as const,
            category: 'SECURITY_ALERT' as const,
            refNumber: item.refNumber || `UKMTO-${new Date().getFullYear()}-${String(i + 1).padStart(3, '0')}`,
            suggestedAction: item.suggestedAction || undefined,
            aiInsight: item.description?.slice(0, 100) || undefined,
            ontologyTags: ['UKMTO', 'Maritime Security', '해양안보'],
        }));
    } catch (err) {
        console.warn('[NewsService] Security alerts fetch failed:', err);
        return [];
    }
}

/**
 * Fetch all official sources (KP&I + UKMTO). Rate-limited to once per 5 minutes.
 * Returns cached results if called too frequently.
 */
export async function fetchOfficialSources(): Promise<IntelArticle[]> {
    const now = Date.now();
    if (now - lastOfficialFetchTime < OFFICIAL_FETCH_INTERVAL_MS && officialArticleCache.length > 0) {
        return [...officialArticleCache];
    }

    try {
        const [kpiArticles, securityArticles] = await Promise.allSettled([
            fetchKPICirculars(),
            fetchSecurityAlerts(),
        ]);

        const results: IntelArticle[] = [];
        if (kpiArticles.status === 'fulfilled') results.push(...kpiArticles.value);
        if (securityArticles.status === 'fulfilled') results.push(...securityArticles.value);

        // Dedup against cache
        const existingIds = new Set(officialArticleCache.map(a => a.id));
        const newItems = results.filter(a => !existingIds.has(a.id));
        officialArticleCache.push(...newItems);

        // Keep cache bounded
        while (officialArticleCache.length > 20) officialArticleCache.shift();

        lastOfficialFetchTime = now;
        return [...officialArticleCache];
    } catch (err) {
        console.warn('[NewsService] Official sources fetch failed:', err);
        return [...officialArticleCache];
    }
}

// ============================================================
// LSEG NEWS HEADLINES — Workspace API Integration
// Fetches shipping/freight/oil/middle-east news from LSEG
// Falls back gracefully to empty array (RSS pipeline still provides news)
// ============================================================



interface LSEGNewsItem {
    headline?: string;
    summary?: string;
    timestamp?: string;
    source?: string;
    storyId?: string;
}

interface LSEGNewsResponse {
    data?: LSEGNewsItem[];
}

/**
 * Fetch LSEG news headlines related to maritime/shipping topics.
 * Limited to 10-15 results to conserve API quota.
 * Falls back to empty array if LSEG is unavailable.
 */
export async function fetchLSEGNewsHeadlines(): Promise<IntelArticle[]> {
    try {
        const response = await lsegGet<LSEGNewsResponse>(
            '/api/news/headlines',
            {
                query: 'Shipping OR Freight OR Oil OR "Middle East" OR Maritime OR Tanker OR "Strait of Hormuz"',
                count: 15,
                sort: 'newest',
            },
            1800, // 30min cache for news
        );

        const items = response.data?.data || [];
        if (items.length === 0) return [];

        return items
            .filter((item: LSEGNewsItem) => item.headline && item.headline.trim())
            .slice(0, 15)
            .map((item: LSEGNewsItem, i: number) => {
                const id = generateArticleId(item.headline || `lseg-${i}`, 'LSEG Workspace');
                return {
                    id,
                    title: item.headline || '',
                    description: item.summary || '',
                    url: item.storyId ? `lseg://story/${item.storyId}` : '#',
                    source: item.source || 'LSEG Workspace',
                    sourceBadge: '🔷',
                    publishedAt: item.timestamp || new Date().toISOString(),
                    fetchedAt: new Date().toISOString(),
                    evaluated: true,
                    dropped: false,
                    impactScore: 60,
                    riskLevel: 'Medium' as const,
                    category: 'OSINT' as const,
                } satisfies IntelArticle;
            });
    } catch (err) {
        console.warn('[NewsService] LSEG news fetch failed (expected if Workspace not running):', err);
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
