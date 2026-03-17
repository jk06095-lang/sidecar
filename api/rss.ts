/**
 * Vercel Serverless RSS Proxy — SIDECAR
 * 
 * Fetches and parses RSS feeds server-side to bypass CORS.
 * Uses rss-parser for XML→JSON conversion.
 * 
 * Query params:
 *   ?category=news|pni|accident
 * 
 * Caching:
 *   s-maxage=3600 — Vercel edge caches responses for 1 hour
 *   stale-while-revalidate — serves stale while refreshing in background
 * 
 * Deploy: Vercel auto-detects api/ folder as serverless functions.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import Parser from 'rss-parser';

const parser = new Parser({
    timeout: 10000,
    headers: {
        'User-Agent': 'SIDECAR-RSS-Bot/1.0',
        Accept: 'application/rss+xml, application/xml, text/xml',
    },
});

// ── Feed Category Definitions ────────────────────────────────
interface FeedSource {
    name: string;
    badge: string;
    url: string;
}

const FEED_MAP: Record<string, FeedSource[]> = {
    news: [
        // Google News RSS — topic-targeted maritime/macro queries
        { name: 'Maritime Shipping', badge: '⚓', url: 'https://news.google.com/rss/search?q=maritime+shipping+vessel+tanker+freight&hl=en&gl=US&ceid=US:en' },
        { name: 'Oil & Energy', badge: '🛢️', url: 'https://news.google.com/rss/search?q=crude+oil+price+OPEC+brent+energy+market&hl=en&gl=US&ceid=US:en' },
        { name: 'Geopolitics', badge: '🌍', url: 'https://news.google.com/rss/search?q=trade+sanctions+embargo+geopolitics+war&hl=en&gl=US&ceid=US:en' },
        { name: 'Supply Chain', badge: '📦', url: 'https://news.google.com/rss/search?q=supply+chain+logistics+disruption+port+congestion&hl=en&gl=US&ceid=US:en' },
        { name: '해운뉴스', badge: '🇰🇷', url: 'https://news.google.com/rss/search?q=해운+해사+선박+항만+물류+컨테이너&hl=ko&gl=KR&ceid=KR:ko' },
        { name: '유가·에너지', badge: '⛽', url: 'https://news.google.com/rss/search?q=유가+원유+에너지+OPEC+운임&hl=ko&gl=KR&ceid=KR:ko' },
        // Domain RSS (supplement)
        { name: 'gCaptain', badge: '⚓', url: 'https://gcaptain.com/feed/' },
        { name: 'Splash247', badge: '🌊', url: 'https://splash247.com/feed/' },
    ],
    pni: [
        // P&I / Insurance RSS
        { name: 'Safety4Sea', badge: '🔒', url: 'https://safety4sea.com/feed/' },
        { name: 'gCaptain Insurance', badge: '⚓', url: 'https://gcaptain.com/tag/insurance/feed/' },
        { name: 'Hellenic Marine Insurance', badge: '🚢', url: 'https://www.hellenicshippingnews.com/category/shipping-finance/marine-insurance/feed/' },
        { name: 'PI Insurance', badge: '🛡️', url: 'https://news.google.com/rss/search?q=P%26I+club+marine+insurance+circular+hull+war+risk&hl=en&gl=US&ceid=US:en' },
        { name: '해상보험', badge: '🇰🇷', url: 'https://news.google.com/rss/search?q=해상보험+P%26I+선주상호보험+보험료&hl=ko&gl=KR&ceid=KR:ko' },
    ],
    accident: [
        // Maritime Accident / Security RSS
        { name: 'Maritime Accidents', badge: '🚨', url: 'https://news.google.com/rss/search?q=maritime+accident+collision+grounding+oil+spill+sinking&hl=en&gl=US&ceid=US:en' },
        { name: 'Piracy & Security', badge: '⚠️', url: 'https://news.google.com/rss/search?q=piracy+maritime+security+Houthi+attack+vessel&hl=en&gl=US&ceid=US:en' },
        { name: '해사사고', badge: '🇰🇷', url: 'https://news.google.com/rss/search?q=해사+사고+충돌+좌초+침몰+유출&hl=ko&gl=KR&ceid=KR:ko' },
        { name: 'Safety4Sea Accidents', badge: '🔒', url: 'https://safety4sea.com/tag/incident/feed/' },
    ],
};

// ── Response Item Shape ──────────────────────────────────────
interface RSSFeedItem {
    guid: string;
    title: string;
    link: string;
    source: string;
    sourceBadge: string;
    pubDate: string;
    contentSnippet: string;
    category: string;
}

// ── Strip HTML tags ──────────────────────────────────────────
function stripHtml(html: string): string {
    return html
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // ── CORS ─────────────────────────────────────────────────
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(204).end();

    // ── Cache Control (Vercel Edge) ──────────────────────────
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');

    // ── Parse query ──────────────────────────────────────────
    const category = (req.query.category as string) || 'news';
    const sources = FEED_MAP[category];
    if (!sources) {
        return res.status(400).json({
            error: `Unknown category: "${category}". Valid: ${Object.keys(FEED_MAP).join(', ')}`,
        });
    }

    // ── Fetch & parse all feeds in parallel ──────────────────
    const allItems: RSSFeedItem[] = [];
    const errors: string[] = [];

    await Promise.allSettled(
        sources.map(async (source) => {
            try {
                const feed = await parser.parseURL(source.url);
                for (const item of (feed.items || []).slice(0, 15)) {
                    // Extract real source from Google News title ("Title - Source")
                    let title = item.title || '';
                    let realSource = source.name;
                    const dashIdx = title.lastIndexOf(' - ');
                    if (dashIdx > 0 && source.url.includes('news.google.com')) {
                        realSource = title.slice(dashIdx + 3).trim() || source.name;
                        title = title.slice(0, dashIdx).trim();
                    }

                    allItems.push({
                        guid: item.guid || item.link || `${title}-${item.pubDate}`,
                        title,
                        link: item.link || '',
                        source: realSource,
                        sourceBadge: source.badge,
                        pubDate: item.pubDate || item.isoDate || new Date().toISOString(),
                        contentSnippet: stripHtml(item.contentSnippet || item.content || item.summary || '').slice(0, 300),
                        category,
                    });
                }
            } catch (err) {
                errors.push(`${source.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
        }),
    );

    // ── Sort by date, newest first ───────────────────────────
    allItems.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());

    // ── Deduplicate by guid ──────────────────────────────────
    const seen = new Set<string>();
    const deduped = allItems.filter(item => {
        if (seen.has(item.guid)) return false;
        seen.add(item.guid);
        return true;
    });

    return res.status(200).json({
        category,
        count: deduped.length,
        items: deduped,
        errors: errors.length > 0 ? errors : undefined,
        fetchedAt: new Date().toISOString(),
    });
}
