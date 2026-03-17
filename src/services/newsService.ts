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

// ============================================================
// GOOGLE NEWS RSS FEEDS — Free, unlimited, topic-specific
// Format: https://news.google.com/rss/search?q={query}&hl={lang}&gl={country}&ceid={ceid}
// Returns ~20 articles per query, auto-deduplicated by Google
// ============================================================
interface GoogleNewsFeed {
    name: string;
    badge: string;
    query: string;
    lang: 'en' | 'ko';
    category: 'macro' | 'maritime' | 'geopolitics';
}

const GOOGLE_NEWS_FEEDS: GoogleNewsFeed[] = [
    // Maritime / Shipping (English)
    { name: 'Maritime Shipping', badge: '⚓', query: 'maritime shipping vessel tanker freight', lang: 'en', category: 'maritime' },
    { name: 'Oil & Energy', badge: '🛢️', query: 'crude oil price OPEC brent energy market', lang: 'en', category: 'macro' },
    { name: 'Geopolitics Trade', badge: '🌍', query: 'trade sanctions embargo geopolitics war', lang: 'en', category: 'geopolitics' },
    { name: 'Supply Chain', badge: '📦', query: 'supply chain logistics disruption port congestion', lang: 'en', category: 'macro' },
    { name: 'Suez Hormuz Red Sea', badge: '🚢', query: 'Suez Canal Hormuz Strait Red Sea Houthi shipping', lang: 'en', category: 'maritime' },
    // Korean maritime news
    { name: '해운뉴스', badge: '🇰🇷', query: '해운 해사 선박 항만 물류 컨테이너', lang: 'ko', category: 'maritime' },
    { name: '유가·에너지', badge: '⛽', query: '유가 원유 에너지 OPEC 운임', lang: 'ko', category: 'macro' },
    { name: '지정학 리스크', badge: '🏛️', query: '제재 무역전쟁 호르무즈 수에즈 지정학', lang: 'ko', category: 'geopolitics' },
];

// Supplementary domain RSS feeds (proven working for maritime)
const RSS_SOURCES: RSSSource[] = [
    { name: 'gCaptain', badge: '⚓', feedUrl: 'https://gcaptain.com/feed/', category: 'maritime' },
    { name: 'Hellenic Shipping News', badge: '🚢', feedUrl: 'https://www.hellenicshippingnews.com/feed/', category: 'maritime' },
    { name: 'Ship & Bunker', badge: '⛽', feedUrl: 'https://shipandbunker.com/rss', category: 'maritime' },
    { name: 'Splash247', badge: '🌊', feedUrl: 'https://splash247.com/feed/', category: 'maritime' },
    { name: 'The Maritime Executive', badge: '📋', feedUrl: 'https://maritime-executive.com/rss', category: 'maritime' },
];

// ============================================================
// P&I / MARITIME INSURANCE RSS FEED SOURCES
// Used to populate the 'P&I · 보험 공문' tab (official circulars)
// Feeds marked skipKeywordFilter=true bypass relevance check
// (all content from dedicated P&I sources is relevant by default)
// ============================================================
interface PIRSSSource {
    name: string;
    badge: string;
    feedUrl: string;
    skipKeywordFilter?: boolean;  // true = all items pass relevance
}

const PI_RSS_SOURCES: PIRSSSource[] = [
    // Maritime Safety & P&I (verified working with rss2json)
    { name: 'Safety4Sea', badge: '🔒', feedUrl: 'https://safety4sea.com/feed/', skipKeywordFilter: false },
    { name: 'gCaptain', badge: '⚓', feedUrl: 'https://gcaptain.com/tag/insurance/feed/', skipKeywordFilter: true },
    { name: 'Splash247', badge: '🌊', feedUrl: 'https://splash247.com/tag/pi-clubs/feed/', skipKeywordFilter: true },
    { name: 'Hellenic Shipping', badge: '🚢', feedUrl: 'https://www.hellenicshippingnews.com/category/shipping-finance/marine-insurance/feed/', skipKeywordFilter: true },
    // P&I Club direct feeds (some may fail — handled gracefully)
    { name: 'GARD P&I', badge: '🛡️', feedUrl: 'https://www.gard.no/web/updates/rss', skipKeywordFilter: true },
    { name: 'Standard Club', badge: '🛡️', feedUrl: 'https://www.standard-club.com/knowledge-news/rss/', skipKeywordFilter: true },
    { name: 'West P&I', badge: '🛡️', feedUrl: 'https://www.westpandi.com/feed/', skipKeywordFilter: true },
    { name: 'Skuld P&I', badge: '🛡️', feedUrl: 'https://www.skuld.com/topics/rss/', skipKeywordFilter: true },
    // Regulatory feeds
    { name: 'IMO News', badge: '🏛️', feedUrl: 'https://www.imo.org/en/MediaCentre/Pages/RSS.aspx', skipKeywordFilter: true },
    // General maritime (keyword-filtered for insurance/P&I relevance)
    { name: 'Ship & Bunker', badge: '⛽', feedUrl: 'https://shipandbunker.com/rss', skipKeywordFilter: false },
    { name: 'Maritime Executive', badge: '📋', feedUrl: 'https://maritime-executive.com/rss', skipKeywordFilter: false },
];

// Fallback CORS proxies (tried in order when rss2json fails)
const CORS_PROXIES = [
    'https://api.rss2json.com/v1/api.json?rss_url=',
    'https://api.allorigins.win/raw?url=',
];

// Keywords for filtering P&I / insurance relevance from general sources
const PI_RELEVANCE_KEYWORDS = [
    'p&i', 'p & i', 'protection and indemnity', 'war risk', 'hull', 'marine insurance',
    'insurance', 'circular', 'club', 'premium', 'underwriter', 'claims', 'coverage',
    'indemnity', 'average', 'salvage', 'surveyor', 'classification', 'class society',
    'flag state', 'imo', 'marpol', 'solas', 'iacs', 'loss prevention', 'crew welfare',
    'cargo claims', 'collision', 'grounding', 'pollution', 'oil spill', 'wreck removal',
    'sanctions', 'compliance', 'regulation', 'convention', 'amendment', 'safety',
    'piracy', 'war zone', 'high risk area', 'crew', 'pilot', 'survey',
    '보험', '회람', '공문', 'P&I', '선급', '보험료', '해상보험', '전쟁위험',
    'bunker', 'fuel', 'emission', 'ets', 'decarbonisation', 'cyber',
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
    // Build Google News queries (primary source — free & unlimited)
    // Stagger requests slightly to avoid rss2json rate-limiting
    const googleResults: IntelArticle[][] = [];
    for (let i = 0; i < GOOGLE_NEWS_FEEDS.length; i++) {
        const result = fetchGoogleNewsFeed(GOOGLE_NEWS_FEEDS[i]);
        googleResults.push(await result.catch(() => []));
        // Small delay between requests (100ms) to avoid 429s
        if (i < GOOGLE_NEWS_FEEDS.length - 1) {
            await new Promise(r => setTimeout(r, 100));
        }
    }

    // Supplementary domain RSS (proven reliable maritime sources, parallel is fine)
    const activeSources = enabledSources && enabledSources.length > 0
        ? RSS_SOURCES.filter(s =>
            enabledSources.some(es => s.name.toLowerCase().includes(es.toLowerCase()) || es.toLowerCase().includes(s.name.toLowerCase()))
        )
        : RSS_SOURCES;
    const rssResults = await Promise.allSettled(activeSources.slice(0, 5).map(s => fetchRSSFeed(s)));

    // Merge all results
    let allArticles: IntelArticle[] = [];
    // Google News results (already resolved)
    for (const batch of googleResults) {
        allArticles = allArticles.concat(batch);
    }
    // RSS results
    for (const result of rssResults) {
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

async function fetchDirectAPI(_url: string): Promise<IntelArticle[]> {
    // DEPRECATED: Direct API fetching removed in favor of Google News RSS.
    // Kept as stub for backward compatibility.
    return [];
}

// ============================================================
// GOOGLE NEWS RSS FETCHER — Free, unlimited, topic-specific
// ============================================================

function buildGoogleNewsUrl(query: string, lang: 'en' | 'ko'): string {
    const params = new URLSearchParams({
        q: query,
        hl: lang,
        gl: lang === 'ko' ? 'KR' : 'US',
        ceid: lang === 'ko' ? 'KR:ko' : 'US:en',
    });
    return `https://news.google.com/rss/search?${params.toString()}`;
}

async function fetchGoogleNewsFeed(feed: GoogleNewsFeed): Promise<IntelArticle[]> {
    const rssUrl = buildGoogleNewsUrl(feed.query, feed.lang);
    const proxyUrl = `${RSS2JSON_PROXY}${encodeURIComponent(rssUrl)}`;

    try {
        const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) {
            console.warn(`[NewsService] Google News fetch failed for "${feed.name}" (HTTP ${res.status})`);
            return [];
        }
        const json = await res.json();
        if (json.status !== 'ok' || !json.items) return [];

        return json.items
            .filter((item: any) => item.title && item.title.trim())
            .slice(0, 12) // Top 12 per query
            .map((item: any) => {
                // Google News titles often have " - SourceName" appended
                let title = item.title || '';
                let sourceName = feed.name;
                const dashIdx = title.lastIndexOf(' - ');
                if (dashIdx > 0 && dashIdx > title.length - 60) {
                    sourceName = title.slice(dashIdx + 3).trim() || feed.name;
                    title = title.slice(0, dashIdx).trim();
                }

                const id = generateArticleId(title, sourceName);
                return {
                    id,
                    title: cleanHtml(title),
                    description: cleanHtml(item.description || item.content || '').slice(0, 300),
                    url: item.link || item.guid || '',
                    source: sourceName,
                    sourceBadge: feed.badge,
                    publishedAt: item.pubDate || new Date().toISOString(),
                    fetchedAt: new Date().toISOString(),
                    evaluated: false,
                    dropped: false,
                } as IntelArticle;
            });
    } catch (err) {
        console.warn(`[NewsService] Google News RSS failed for "${feed.name}":`, err);
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

// ============================================================
// P&I RSS FEED FETCHER — Real RSS feeds from insurance clubs
// ============================================================

function passesPIRelevanceFilter(title: string, description: string): boolean {
    const text = `${title} ${description}`.toLowerCase();
    return PI_RELEVANCE_KEYWORDS.some(kw => text.includes(kw.toLowerCase()));
}

export async function fetchPIRSSFeeds(): Promise<IntelArticle[]> {
    const promises = PI_RSS_SOURCES.map(async (source) => {
        try {
            // Try primary rss2json proxy first
            let json: any = null;
            const proxyUrl = `${RSS2JSON_PROXY}${encodeURIComponent(source.feedUrl)}`;
            try {
                const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) });
                if (res.ok) {
                    json = await res.json();
                    if (json.status !== 'ok' || !json.items) json = null;
                }
            } catch { /* primary proxy failed, try fallback */ }

            // Fallback: allorigins proxy (returns raw XML, but rss2json should work for most)
            if (!json) {
                try {
                    const fallbackUrl = `${CORS_PROXIES[1]}${encodeURIComponent(source.feedUrl)}`;
                    const res2 = await fetch(fallbackUrl, { signal: AbortSignal.timeout(8000) });
                    if (res2.ok) {
                        // allorigins returns raw content; try to parse if it's JSON
                        const text = await res2.text();
                        try {
                            json = JSON.parse(text);
                            if (!json.items) json = null;
                        } catch {
                            // Not JSON — can't use this fallback for RSS parsing
                            json = null;
                        }
                    }
                } catch { /* fallback also failed */ }
            }

            if (!json?.items) return [];

            const items = json.items
                .filter((item: any) => item.title && item.title.trim())
                .slice(0, 10);

            // Apply relevance filter only for non-P&I-dedicated sources
            const filtered = source.skipKeywordFilter
                ? items
                : items.filter((item: any) => passesPIRelevanceFilter(
                    item.title || '',
                    item.description || item.content || '',
                ));

            return filtered.map((item: any) => {
                const id = generateArticleId(item.title, source.name);
                return {
                    id,
                    title: cleanHtml(item.title),
                    description: cleanHtml(item.description || item.content || '').slice(0, 400),
                    url: item.link || item.guid || source.feedUrl,
                    source: source.name,
                    sourceBadge: source.badge,
                    publishedAt: item.pubDate || new Date().toISOString(),
                    fetchedAt: new Date().toISOString(),
                    evaluated: true,
                    dropped: false,
                    impactScore: 75,
                    riskLevel: 'Medium' as const,
                    category: 'OFFICIAL_CIRCULAR' as const,
                    refNumber: undefined,
                    aiInsight: undefined,
                    ontologyTags: ['P&I', 'Marine Insurance', '해상보험'],
                } as IntelArticle;
            });
        } catch (err) {
            console.warn(`[NewsService] P&I RSS fetch failed for ${source.name}:`, err);
            return [];
        }
    });

    const results = await Promise.allSettled(promises);
    const articles: IntelArticle[] = [];
    for (const result of results) {
        if (result.status === 'fulfilled') articles.push(...result.value);
    }

    // Sort newest first
    articles.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
    console.info(`[NewsService] P&I RSS: fetched ${articles.length} articles from ${PI_RSS_SOURCES.length} sources`);
    return articles;
}

// ============================================================
// OFFICIAL CIRCULAR BOOTSTRAP — Seeds P&I data from Feb 26
// ============================================================
let _officialBootstrapDone = false;
let _officialBootstrapInFlight: Promise<IntelArticle[]> | null = null;

export async function bootstrapOfficialCirculars(): Promise<IntelArticle[]> {
    if (_officialBootstrapDone) {
        console.info('[NewsService] Official backfill already completed this session');
        return [];
    }
    if (_officialBootstrapInFlight) return _officialBootstrapInFlight;

    _officialBootstrapInFlight = (async (): Promise<IntelArticle[]> => {
        console.log('[NewsService] Starting P&I official circular backfill...');
        const allArticles: IntelArticle[] = [];

        // Phase A: Try RSS feeds first (free, reliable)
        try {
            const rssResults = await fetchPIRSSFeeds();
            allArticles.push(...rssResults);
            console.log(`[NewsService] P&I RSS bootstrap: ${rssResults.length} articles`);
        } catch (err) {
            console.warn('[NewsService] P&I RSS bootstrap error:', err);
        }

        // Phase B: Gemini Search Grounding for KP&I and historical data
        try {
            const { bffGenerate } = await import('./geminiService');

            const today = new Date().toISOString().split('T')[0];
            const prompt = `You are a maritime insurance specialist. Search for REAL P&I Club circulars, marine insurance updates, and class society notices from 2026-02-26 to ${today}.

Search specifically for:
- Korea P&I Club (한국선주상호보험) circulars and notices
- International Group of P&I Clubs announcements
- War Risk Premium changes (AWRP/JWLA updates)
- IMO regulatory updates affecting marine insurance
- Classification society (Lloyd's Register, DNV, BV, ABS) technical circulars
- Marine hull & machinery insurance market updates
- Loss prevention bulletins from P&I clubs

Find 8-12 REAL documents/updates. For each:
- title: Document title in Korean (한국어)
- description: 2-3 sentence summary in Korean (한국어)
- source: Issuing organization (e.g. "한국선주상호보험", "GARD P&I", "IMO", "Lloyd's Register")
- publishedAt: Date in ISO format
- refNumber: Document reference number if available (e.g. "CIR-2026-005")
- url: Source URL if available
- impactScore: 60-95 based on significance
- riskLevel: "Low" | "Medium" | "High" | "Critical"
- ontologyTags: Array of 2-4 relevant keywords

Return ONLY a JSON array. No other text.
If you cannot find results, return empty array [].`;

            const text = await bffGenerate(prompt, 'gemini-2.5-flash', undefined, [{ googleSearch: {} }]);
            let jsonStr = text.trim();
            if (jsonStr.startsWith('```json')) jsonStr = jsonStr.slice(7);
            else if (jsonStr.startsWith('```')) jsonStr = jsonStr.slice(3);
            if (jsonStr.endsWith('```')) jsonStr = jsonStr.slice(0, -3);
            jsonStr = jsonStr.trim();

            if (jsonStr && jsonStr !== '[]') {
                const parsed = JSON.parse(jsonStr);
                if (Array.isArray(parsed)) {
                    const geminiArticles: IntelArticle[] = parsed.map((item: any, i: number) => ({
                        id: generateArticleId(item.title || `pi-official-${i}`, item.source || 'P&I'),
                        title: item.title || 'P&I 공문',
                        description: item.description || '',
                        url: item.url || 'https://www.kpiclub.or.kr',
                        source: item.source || 'P&I Club',
                        sourceBadge: item.source?.includes('한국') || item.source?.includes('Korea') ? '🇰🇷' : '🛡️',
                        publishedAt: item.publishedAt || new Date(2026, 1, 26 + i).toISOString(),
                        fetchedAt: new Date().toISOString(),
                        evaluated: true,
                        dropped: false,
                        impactScore: item.impactScore ?? 75,
                        riskLevel: (item.riskLevel || 'Medium') as IntelArticle['riskLevel'],
                        category: 'OFFICIAL_CIRCULAR' as const,
                        refNumber: item.refNumber || `CIR-2026-${String(i + 1).padStart(3, '0')}`,
                        aiInsight: item.description?.slice(0, 100) || undefined,
                        ontologyTags: item.ontologyTags || ['P&I', 'Marine Insurance', '해상보험'],
                    }));
                    allArticles.push(...geminiArticles);
                    console.log(`[NewsService] Gemini P&I bootstrap: ${geminiArticles.length} articles`);
                }
            }
        } catch (err) {
            console.warn('[NewsService] Gemini P&I bootstrap error:', err);
        }

        // Dedup by id
        const seen = new Set<string>();
        const deduped = allArticles.filter(a => {
            if (seen.has(a.id)) return false;
            seen.add(a.id);
            return true;
        });

        // Sort newest first
        deduped.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

        console.log(`[NewsService] P&I official backfill complete: ${deduped.length} total articles`);
        _officialBootstrapDone = true;
        return deduped;
    })();

    try {
        return await _officialBootstrapInFlight;
    } finally {
        _officialBootstrapInFlight = null;
    }
}

/**
 * Fetch all official sources (KP&I + UKMTO + P&I RSS).
 * Rate-limited to once per 5 minutes.
 * Returns cached results if called too frequently.
 */
export async function fetchOfficialSources(): Promise<IntelArticle[]> {
    const now = Date.now();
    if (now - lastOfficialFetchTime < OFFICIAL_FETCH_INTERVAL_MS && officialArticleCache.length > 0) {
        return [...officialArticleCache];
    }

    try {
        const [kpiArticles, securityArticles, piRssArticles] = await Promise.allSettled([
            fetchKPICirculars(),
            fetchSecurityAlerts(),
            fetchPIRSSFeeds(),
        ]);

        const results: IntelArticle[] = [];
        if (kpiArticles.status === 'fulfilled') results.push(...kpiArticles.value);
        if (securityArticles.status === 'fulfilled') results.push(...securityArticles.value);
        if (piRssArticles.status === 'fulfilled') results.push(...piRssArticles.value);

        // Dedup against cache
        const existingIds = new Set(officialArticleCache.map(a => a.id));
        const newItems = results.filter(a => !existingIds.has(a.id));
        officialArticleCache.push(...newItems);

        // Keep cache bounded
        while (officialArticleCache.length > 50) officialArticleCache.shift();

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

// ============================================================
// RSS FEED PROXY CLIENT — calls /api/rss serverless function
// ============================================================

import type { FeedItem } from '../types';
import { scanHeadlinesForRisk, RISK_KEYWORDS } from '../lib/sentimentScanner';

/** Feed URL configurations per category */
const RSS_FEED_URLS: Record<'news' | 'circular' | 'alert', string[]> = {
    news: [
        // Google News RSS — maritime/shipping/energy
        'https://news.google.com/rss/search?q=maritime+shipping+vessel+tanker+freight&hl=en&gl=US&ceid=US:en',
        'https://news.google.com/rss/search?q=crude+oil+price+OPEC+brent+energy+market&hl=en&gl=US&ceid=US:en',
        'https://news.google.com/rss/search?q=supply+chain+logistics+disruption+port&hl=en&gl=US&ceid=US:en',
        'https://news.google.com/rss/search?q=Suez+Canal+Hormuz+Red+Sea+shipping&hl=en&gl=US&ceid=US:en',
        // Korean news
        'https://news.google.com/rss/search?q=해운+해사+선박+항만+물류&hl=ko&gl=KR&ceid=KR:ko',
        'https://news.google.com/rss/search?q=유가+원유+에너지+OPEC+운임&hl=ko&gl=KR&ceid=KR:ko',
        // Domain RSS
        'https://gcaptain.com/feed/',
        'https://shipandbunker.com/rss',
        'https://splash247.com/feed/',
    ],
    circular: [
        // P&I Club and insurance feeds
        'https://news.google.com/rss/search?q=P%26I+club+marine+insurance+circular&hl=en&gl=US&ceid=US:en',
        'https://news.google.com/rss/search?q=해상보험+P%26I+보험료+선급&hl=ko&gl=KR&ceid=KR:ko',
        'https://www.gard.no/web/updates/rss',
        'https://safety4sea.com/feed/',
        'https://www.hellenicshippingnews.com/category/shipping-finance/marine-insurance/feed/',
        'https://gcaptain.com/tag/insurance/feed/',
    ],
    alert: [
        // Maritime security and accident alerts
        'https://news.google.com/rss/search?q=maritime+accident+collision+grounding+fire+ship&hl=en&gl=US&ceid=US:en',
        'https://news.google.com/rss/search?q=piracy+attack+Houthi+hijack+maritime+security&hl=en&gl=US&ceid=US:en',
        'https://news.google.com/rss/search?q=해사사고+선박충돌+좌초+해적&hl=ko&gl=KR&ceid=KR:ko',
        'https://safety4sea.com/feed/',
    ],
};

/**
 * Fetch RSS feeds for a given category via the /api/rss serverless proxy.
 * Applies sentiment/risk scanning on each item before returning.
 */
export async function fetchRssFeeds(category: 'news' | 'circular' | 'alert'): Promise<FeedItem[]> {
    const urls = RSS_FEED_URLS[category];
    const feedsParam = urls.map(u => encodeURIComponent(u)).join(',');
    const apiUrl = `/api/rss?category=${category}&feeds=${feedsParam}`;

    try {
        const res = await fetch(apiUrl, { signal: AbortSignal.timeout(15000) });
        if (!res.ok) {
            console.warn(`[NewsService] RSS proxy failed (${res.status})`);
            return [];
        }

        const json = await res.json();
        const rawItems: Array<{
            title: string;
            link: string;
            description: string;
            pubDate: string;
            source: string;
            thumbnailUrl?: string;
        }> = json.items || [];

        // Run sentiment scanner on all titles at once
        const headlines = rawItems.map(i => i.title);
        const scanResult = scanHeadlinesForRisk(headlines);

        return rawItems.map((item, idx) => {
            const id = generateArticleId(item.title, item.source);

            // Per-item risk assessment
            const lower = item.title.toLowerCase() + ' ' + (item.description || '').toLowerCase();
            let riskScore = 0;
            for (const kw of RISK_KEYWORDS) {
                if (lower.includes(kw.term)) riskScore += kw.weight;
            }

            let riskLevel: FeedItem['riskLevel'] = undefined;
            if (riskScore >= 15) riskLevel = 'Critical';
            else if (riskScore >= 10) riskLevel = 'High';
            else if (riskScore >= 5) riskLevel = 'Medium';
            else if (riskScore >= 2) riskLevel = 'Low';

            // Sentiment based on risk
            let sentiment: FeedItem['sentiment'] = 'neutral';
            if (riskScore >= 8) sentiment = 'negative';
            else if (riskScore <= 0) sentiment = 'positive';

            return {
                id,
                title: item.title,
                description: item.description || '',
                url: item.link || '',
                source: item.source || 'Unknown',
                publishedAt: item.pubDate || new Date().toISOString(),
                fetchedAt: json.fetchedAt || new Date().toISOString(),
                thumbnailUrl: item.thumbnailUrl,
                category,
                riskLevel,
                sentiment,
                riskScore,
            } as FeedItem;
        });
    } catch (err) {
        console.warn(`[NewsService] fetchRssFeeds(${category}) error:`, err);
        return [];
    }
}
