/**
 * Vercel Serverless Function — RSS Feed Proxy with Edge Caching
 *
 * Fetches and parses RSS/Atom feeds from Google News, RSSHub, and domain feeds.
 * Returns sanitized JSON with Edge CDN caching (1h fresh, SWR).
 *
 * Query params:
 *   ?feeds=url1,url2,url3  — comma-separated RSS feed URLs (URL-encoded)
 *   ?category=news|circular|alert — feed category hint
 *
 * Deploy: Vercel auto-detects api/ folder as serverless functions.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

// ── Simple RSS/XML parser (no external dependency for serverless) ──
interface ParsedFeedItem {
    title: string;
    link: string;
    description: string;
    pubDate: string;
    source: string;
    thumbnailUrl?: string;
}

function stripHtml(html: string): string {
    return html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

function extractFirstImage(html: string): string | undefined {
    const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (imgMatch?.[1]) {
        const src = imgMatch[1];
        // Skip tiny tracking pixels
        if (src.includes('1x1') || src.includes('pixel') || src.includes('tracking')) return undefined;
        return src;
    }
    // Also check for media:content or enclosure
    const mediaMatch = html.match(/url=["']([^"']+\.(jpg|jpeg|png|webp))/i);
    return mediaMatch?.[1];
}

function extractItems(xml: string, feedUrl: string): ParsedFeedItem[] {
    const items: ParsedFeedItem[] = [];

    // Try to extract feed title for source
    const feedTitleMatch = xml.match(/<channel>[\s\S]*?<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/i);
    const feedTitle = feedTitleMatch ? stripHtml(feedTitleMatch[1]) : new URL(feedUrl).hostname;

    // Match <item> blocks (RSS 2.0) or <entry> blocks (Atom)
    const itemRegex = /<item[\s>]([\s\S]*?)<\/item>|<entry[\s>]([\s\S]*?)<\/entry>/gi;
    let match;

    while ((match = itemRegex.exec(xml)) !== null && items.length < 15) {
        const block = match[1] || match[2];

        const titleMatch = block.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
        const linkMatch = block.match(/<link[^>]*(?:href=["'](.*?)["'])?[^>]*>(.*?)<\/link>/i)
            || block.match(/<link[^>]*href=["'](.*?)["'][^>]*\/?>/i);
        const descMatch = block.match(/<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i)
            || block.match(/<summary[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/summary>/i)
            || block.match(/<content[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/content>/i);
        const dateMatch = block.match(/<pubDate[^>]*>(.*?)<\/pubDate>/i)
            || block.match(/<published[^>]*>(.*?)<\/published>/i)
            || block.match(/<updated[^>]*>(.*?)<\/updated>/i);
        const sourceMatch = block.match(/<source[^>]*>(.*?)<\/source>/i);

        const rawTitle = titleMatch ? titleMatch[1].trim() : '';
        const rawDesc = descMatch ? descMatch[1] : '';
        const link = linkMatch ? (linkMatch[1] || linkMatch[2] || '').trim() : '';

        if (!rawTitle) continue;

        // Google News: split "Title - Source"
        let title = stripHtml(rawTitle);
        let source = sourceMatch ? stripHtml(sourceMatch[1]) : feedTitle;
        const dashIdx = title.lastIndexOf(' - ');
        if (dashIdx > 0 && dashIdx > title.length - 60) {
            source = title.slice(dashIdx + 3).trim() || source;
            title = title.slice(0, dashIdx).trim();
        }

        const thumbnailUrl = extractFirstImage(rawDesc);
        const description = stripHtml(rawDesc).slice(0, 400);

        items.push({
            title,
            link,
            description,
            pubDate: dateMatch ? dateMatch[1].trim() : new Date().toISOString(),
            source,
            thumbnailUrl,
        });
    }

    return items;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // ── CORS ──
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

    // ── Parse query params ──
    const feedsParam = (req.query.feeds as string) || '';
    const category = (req.query.category as string) || 'news';

    if (!feedsParam) {
        return res.status(400).json({ error: 'Missing ?feeds= parameter' });
    }

    const feedUrls = feedsParam.split(',').map(u => decodeURIComponent(u.trim())).filter(Boolean);
    if (feedUrls.length === 0) {
        return res.status(400).json({ error: 'No valid feed URLs' });
    }

    // ── Fetch all feeds in parallel ──
    const allItems: ParsedFeedItem[] = [];

    const results = await Promise.allSettled(
        feedUrls.map(async (url) => {
            try {
                const resp = await fetch(url, {
                    signal: AbortSignal.timeout(8000),
                    headers: { 'User-Agent': 'SIDECAR-RSS/1.0 (+https://sidecar.app)' },
                });
                if (!resp.ok) return [];
                const xml = await resp.text();
                return extractItems(xml, url);
            } catch {
                return [];
            }
        })
    );

    for (const result of results) {
        if (result.status === 'fulfilled') {
            allItems.push(...result.value);
        }
    }

    // Sort by date
    allItems.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());

    // ── Edge Cache: 1 hour fresh, stale-while-revalidate ──
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    res.setHeader('Content-Type', 'application/json');

    return res.status(200).json({
        items: allItems.slice(0, 50),
        category,
        fetchedAt: new Date().toISOString(),
        feedCount: feedUrls.length,
        totalItems: allItems.length,
    });
}
