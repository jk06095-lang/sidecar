/**
 * OSINT Intelligence News Pipeline
 * Multi-source RSS aggregation via rss2json proxy + existing API
 * 15-second polling with deduplication
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

// RSS to JSON proxy (free, CORS-enabled)
const RSS2JSON_PROXY = 'https://api.rss2json.com/v1/api.json?rss_url=';

// Deduplicated seen-IDs
const seenIds = new Set<string>();

// ============================================================
// CORE: Fetch from a single RSS source via proxy
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

// ============================================================
// CORE: Fetch from direct JSON API
// ============================================================

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
// MASTER FETCH: Aggregate from all sources
// ============================================================

export async function fetchAllFeeds(
    enabledSources?: string[],
    keywords?: string[],
): Promise<IntelArticle[]> {
    // Filter RSS sources by user's enabled sources
    const activeSources = enabledSources && enabledSources.length > 0
        ? RSS_SOURCES.filter(s =>
            enabledSources.some(es => s.name.toLowerCase().includes(es.toLowerCase()) || es.toLowerCase().includes(s.name.toLowerCase()))
        )
        : RSS_SOURCES;

    // If no sources matched the filter, use all RSS sources
    const sourcesToFetch = activeSources.length > 0 ? activeSources : RSS_SOURCES;

    // Fetch all sources in parallel (limit concurrency to avoid overwhelming)
    const rssPromises = sourcesToFetch.slice(0, 6).map(s => fetchRSSFeed(s));
    const directPromises = DIRECT_API_URLS.map(u => fetchDirectAPI(u));

    const results = await Promise.allSettled([...rssPromises, ...directPromises]);

    let allArticles: IntelArticle[] = [];
    for (const result of results) {
        if (result.status === 'fulfilled') {
            allArticles = allArticles.concat(result.value);
        }
    }

    // Deduplicate
    const newArticles = allArticles.filter(a => {
        if (seenIds.has(a.id)) return false;
        seenIds.add(a.id);
        return true;
    });

    // Keyword relevance boost — if keywords are set, prioritize matching articles
    if (keywords && keywords.length > 0) {
        const keywordLower = keywords.map(k => k.toLowerCase());
        newArticles.sort((a, b) => {
            const aMatch = keywordLower.some(k =>
                a.title.toLowerCase().includes(k) || a.description.toLowerCase().includes(k)
            );
            const bMatch = keywordLower.some(k =>
                b.title.toLowerCase().includes(k) || b.description.toLowerCase().includes(k)
            );
            if (aMatch && !bMatch) return -1;
            if (!aMatch && bMatch) return 1;
            return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
        });
    } else {
        // Sort by published date, newest first
        newArticles.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
    }

    return newArticles;
}

// ============================================================
// POLLING SERVICE — starts a 15-sec interval
// ============================================================

let pollingInterval: ReturnType<typeof setInterval> | null = null;

export function startPolling(
    onNewArticles: (articles: IntelArticle[]) => void,
    enabledSources?: string[],
    keywords?: string[],
    intervalMs: number = 15000,
) {
    // Stop any existing polling
    stopPolling();

    // Immediate first fetch
    fetchAllFeeds(enabledSources, keywords).then(articles => {
        if (articles.length > 0) onNewArticles(articles);
    });

    // Then poll every interval
    pollingInterval = setInterval(async () => {
        try {
            const articles = await fetchAllFeeds(enabledSources, keywords);
            if (articles.length > 0) onNewArticles(articles);
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
