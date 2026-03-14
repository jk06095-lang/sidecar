/**
 * GDELT Service — Real-time Geopolitical & Maritime Risk Intelligence
 * 
 * Uses the GDELT Project's free API (no API key required) to fetch
 * real-world geopolitical events relevant to maritime shipping.
 * 
 * API: https://api.gdeltproject.org/api/v2/doc/doc
 * Rate limit: None (public API)
 * Cache: 10-minute TTL to avoid excessive calls
 */

interface GDELTArticle {
    url: string;
    title: string;
    seendate: string;
    socialimage: string;
    domain: string;
    language: string;
    sourcecountry: string;
}

interface GDELTResponse {
    articles?: GDELTArticle[];
}

export interface GDELTRiskData {
    articleCount: number;
    avgTone: number;
    riskScore: number;          // 0-100 normalized
    topKeywords: string[];
    lastUpdated: string;
    articles: Array<{
        title: string;
        source: string;
        date: string;
        url: string;
    }>;
}

// ============================================================
// CACHE — 10-minute TTL
// ============================================================

let cachedData: GDELTRiskData | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// ============================================================
// MAIN FETCH FUNCTION
// ============================================================

export async function fetchGDELTRiskData(): Promise<GDELTRiskData> {
    // Return cached if still fresh
    const now = Date.now();
    if (cachedData && (now - cacheTimestamp) < CACHE_TTL_MS) {
        return cachedData;
    }

    try {
        // Query GDELT for maritime/shipping/geopolitical events
        const query = encodeURIComponent(
            '(maritime OR shipping OR "strait of hormuz" OR "red sea" OR tanker OR VLCC OR "supply chain" OR "oil price") ' +
            'AND (risk OR crisis OR attack OR blockade OR sanction OR war OR tension OR disruption)'
        );
        const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${query}&mode=artlist&format=json&maxrecords=25&timespan=24h&sort=datedesc`;

        const res = await fetch(url);
        if (!res.ok) throw new Error(`GDELT API error: ${res.status}`);

        const data: GDELTResponse = await res.json();
        const articles = data.articles || [];

        // Compute risk score based on article volume and content
        // More articles about maritime crises = higher risk
        const articleCount = articles.length;
        const volumeScore = Math.min(50, articleCount * 2); // 0-50 based on volume

        // Extract keywords for tag cloud
        const keywordMap = new Map<string, number>();
        const maritimeKeywords = [
            'hormuz', 'red sea', 'suez', 'malacca', 'oil', 'tanker', 'vlcc',
            'shipping', 'sanctions', 'blockade', 'attack', 'houthi', 'iran',
            'piracy', 'navy', 'maritime', 'cargo', 'port', 'bunker', 'crude',
        ];

        for (const article of articles) {
            const titleLower = (article.title || '').toLowerCase();
            for (const kw of maritimeKeywords) {
                if (titleLower.includes(kw)) {
                    keywordMap.set(kw, (keywordMap.get(kw) || 0) + 1);
                }
            }
        }

        // Content intensity score (more keyword hits = higher risk)
        const totalHits = Array.from(keywordMap.values()).reduce((sum, v) => sum + v, 0);
        const contentScore = Math.min(50, totalHits * 3); // 0-50

        const riskScore = Math.min(100, volumeScore + contentScore);
        const topKeywords = Array.from(keywordMap.entries())
            .sort(([, a], [, b]) => b - a)
            .slice(0, 8)
            .map(([kw]) => kw);

        const result: GDELTRiskData = {
            articleCount,
            avgTone: 0, // GDELT v2 artlist doesn't include tone; set 0
            riskScore,
            topKeywords,
            lastUpdated: new Date().toISOString(),
            articles: articles.slice(0, 10).map(a => ({
                title: a.title || 'Untitled',
                source: a.domain || 'Unknown',
                date: a.seendate || '',
                url: a.url || '',
            })),
        };

        // Update cache
        cachedData = result;
        cacheTimestamp = now;

        console.info(`[GDELT] Fetched ${articleCount} articles, risk score: ${riskScore}`);
        return result;
    } catch (err) {
        console.warn('[GDELT] Fetch failed:', err);
        
        // Return cached data if available, otherwise empty
        if (cachedData) return cachedData;

        return {
            articleCount: 0,
            avgTone: 0,
            riskScore: 0,
            topKeywords: [],
            lastUpdated: new Date().toISOString(),
            articles: [],
        };
    }
}
