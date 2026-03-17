/**
 * Feed Store — Zustand + Persist
 * 
 * Smart caching layer for RSS feeds:
 * - LocalStorage persistence via zustand/middleware persist
 * - Stale-while-revalidate: show cache immediately, refresh in background
 * - "Pending feeds" queue: new items waiting for user to ack before render
 * - Per-category lastFetched tracking
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ── Types ────────────────────────────────────────────────────
export type FeedCategory = 'news' | 'pni' | 'accident';

export interface FeedItem {
    guid: string;
    title: string;
    link: string;
    source: string;
    sourceBadge: string;
    pubDate: string;
    contentSnippet: string;
    category: string;
}

interface CategoryState {
    items: FeedItem[];
    lastFetched: number; // timestamp
}

interface FeedState {
    // Per-category caches
    categories: Record<FeedCategory, CategoryState>;
    // Pending new items (not yet acked by user)
    pendingItems: Record<FeedCategory, FeedItem[]>;
    // Loading state (only true on first-ever load with no cache)
    isLoading: Record<FeedCategory, boolean>;
    // Background refresh in progress
    isRefreshing: Record<FeedCategory, boolean>;

    // Actions
    fetchCategory: (category: FeedCategory) => Promise<void>;
    acknowledgePending: (category: FeedCategory) => void;
    getCategoryItems: (category: FeedCategory) => FeedItem[];
    hasPendingItems: (category: FeedCategory) => boolean;
    getPendingCount: (category: FeedCategory) => number;
}

// ── Config ───────────────────────────────────────────────────
const STALE_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour

// ── API Endpoint ─────────────────────────────────────────────
function getRssApiUrl(category: FeedCategory): string {
    // In production (Vercel), use /api/rss
    // In development, use rss2json proxy as fallback
    if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
        return `/api/rss?category=${category}`;
    }
    // Dev fallback: use rss2json proxy for individual feeds
    return `/api/rss?category=${category}`;
}

// Fallback: client-side fetch via rss2json proxy
const RSS2JSON = 'https://api.rss2json.com/v1/api.json?rss_url=';

const GOOGLE_NEWS_URLS: Record<FeedCategory, string[]> = {
    news: [
        'https://news.google.com/rss/search?q=maritime+shipping+vessel+tanker+freight&hl=en&gl=US&ceid=US:en',
        'https://news.google.com/rss/search?q=crude+oil+OPEC+energy+market&hl=en&gl=US&ceid=US:en',
        'https://news.google.com/rss/search?q=해운+해사+선박+항만+물류&hl=ko&gl=KR&ceid=KR:ko',
    ],
    pni: [
        'https://news.google.com/rss/search?q=P%26I+club+marine+insurance+hull+war+risk&hl=en&gl=US&ceid=US:en',
        'https://news.google.com/rss/search?q=해상보험+선주상호보험+보험료&hl=ko&gl=KR&ceid=KR:ko',
    ],
    accident: [
        'https://news.google.com/rss/search?q=maritime+accident+collision+grounding+sinking&hl=en&gl=US&ceid=US:en',
        'https://news.google.com/rss/search?q=해사+사고+충돌+좌초+침몰&hl=ko&gl=KR&ceid=KR:ko',
    ],
};

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

async function fetchViaRss2json(feedUrl: string, badge: string): Promise<FeedItem[]> {
    try {
        const url = `${RSS2JSON}${encodeURIComponent(feedUrl)}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return [];
        const json = await res.json();
        if (json.status !== 'ok' || !json.items) return [];

        return json.items
            .filter((item: any) => item.title?.trim())
            .slice(0, 12)
            .map((item: any) => {
                let title = item.title || '';
                let source = 'News';
                // Google News format: "Title - Source Name"
                const dashIdx = title.lastIndexOf(' - ');
                if (dashIdx > 0 && feedUrl.includes('news.google.com')) {
                    source = title.slice(dashIdx + 3).trim();
                    title = title.slice(0, dashIdx).trim();
                } else {
                    source = json.feed?.title || 'News';
                }

                return {
                    guid: item.guid || item.link || `${title}-${item.pubDate}`,
                    title,
                    link: item.link || '',
                    source,
                    sourceBadge: badge,
                    pubDate: item.pubDate || new Date().toISOString(),
                    contentSnippet: stripHtml(item.description || item.content || '').slice(0, 300),
                    category: '',
                } as FeedItem;
            });
    } catch {
        return [];
    }
}

async function fetchCategoryFromClient(category: FeedCategory): Promise<FeedItem[]> {
    const urls = GOOGLE_NEWS_URLS[category] || [];
    const badges = category === 'news'
        ? ['⚓', '🛢️', '🇰🇷']
        : category === 'pni'
            ? ['🛡️', '🇰🇷']
            : ['🚨', '🇰🇷'];

    const results: FeedItem[] = [];
    for (let i = 0; i < urls.length; i++) {
        const items = await fetchViaRss2json(urls[i], badges[i] || '📰');
        results.push(...items.map(it => ({ ...it, category })));
        // Stagger to avoid rate-limiting
        if (i < urls.length - 1) await new Promise(r => setTimeout(r, 150));
    }

    // Dedup by guid
    const seen = new Set<string>();
    return results
        .filter(item => {
            if (seen.has(item.guid)) return false;
            seen.add(item.guid);
            return true;
        })
        .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
}

// ── In-flight request dedup ──────────────────────────────────
const inFlightRequests = new Map<FeedCategory, Promise<void>>();

const emptyCategory: CategoryState = { items: [], lastFetched: 0 };

// ── Store ────────────────────────────────────────────────────
export const useFeedStore = create<FeedState>()(
    persist(
        (set, get) => ({
            categories: {
                news: { ...emptyCategory },
                pni: { ...emptyCategory },
                accident: { ...emptyCategory },
            },
            pendingItems: { news: [], pni: [], accident: [] },
            isLoading: { news: false, pni: false, accident: false },
            isRefreshing: { news: false, pni: false, accident: false },

            fetchCategory: async (category: FeedCategory) => {
                const state = get();
                const catState = state.categories[category];
                const now = Date.now();
                const isStale = now - catState.lastFetched > STALE_THRESHOLD_MS;
                const hasCache = catState.items.length > 0;

                // Has fresh cache → skip
                if (hasCache && !isStale) return;

                // Already fetching → skip
                if (inFlightRequests.has(category)) return;

                // No cache at all → show loading spinner
                if (!hasCache) {
                    set(s => ({
                        isLoading: { ...s.isLoading, [category]: true },
                    }));
                }

                // Has stale cache → show "refreshing" indicator
                if (hasCache && isStale) {
                    set(s => ({
                        isRefreshing: { ...s.isRefreshing, [category]: true },
                    }));
                }

                const promise = (async () => {
                    try {
                        let freshItems: FeedItem[] = [];

                        // Try serverless proxy first
                        try {
                            const apiUrl = getRssApiUrl(category);
                            const res = await fetch(apiUrl, { signal: AbortSignal.timeout(12000) });
                            if (res.ok) {
                                const json = await res.json();
                                if (json.items?.length > 0) {
                                    freshItems = json.items;
                                }
                            }
                        } catch {
                            // Serverless proxy not available (dev mode) → use client-side fetch
                        }

                        // Fallback: client-side rss2json
                        if (freshItems.length === 0) {
                            freshItems = await fetchCategoryFromClient(category);
                        }

                        if (freshItems.length === 0) return;

                        const currentState = get();
                        const existingGuids = new Set(currentState.categories[category].items.map(i => i.guid));
                        const newItems = freshItems.filter(item => !existingGuids.has(item.guid));

                        if (!hasCache || currentState.categories[category].items.length === 0) {
                            // First load → directly populate
                            set(s => ({
                                categories: {
                                    ...s.categories,
                                    [category]: {
                                        items: freshItems.slice(0, 100),
                                        lastFetched: Date.now(),
                                    },
                                },
                            }));
                        } else if (newItems.length > 0) {
                            // Has cache → queue as pending (don't disrupt reading)
                            set(s => ({
                                pendingItems: {
                                    ...s.pendingItems,
                                    [category]: [...newItems, ...s.pendingItems[category]],
                                },
                                categories: {
                                    ...s.categories,
                                    [category]: {
                                        ...s.categories[category],
                                        lastFetched: Date.now(),
                                    },
                                },
                            }));
                        } else {
                            // No new items, just update timestamp
                            set(s => ({
                                categories: {
                                    ...s.categories,
                                    [category]: {
                                        ...s.categories[category],
                                        lastFetched: Date.now(),
                                    },
                                },
                            }));
                        }
                    } catch (err) {
                        console.warn(`[FeedStore] Fetch failed for ${category}:`, err);
                    } finally {
                        set(s => ({
                            isLoading: { ...s.isLoading, [category]: false },
                            isRefreshing: { ...s.isRefreshing, [category]: false },
                        }));
                        inFlightRequests.delete(category);
                    }
                })();

                inFlightRequests.set(category, promise);
                await promise;
            },

            acknowledgePending: (category: FeedCategory) => {
                set(s => {
                    const pending = s.pendingItems[category];
                    if (pending.length === 0) return s;

                    // Merge pending to top of existing items
                    const merged = [...pending, ...s.categories[category].items];
                    // Keep bounded
                    const bounded = merged.slice(0, 150);

                    return {
                        categories: {
                            ...s.categories,
                            [category]: {
                                items: bounded,
                                lastFetched: s.categories[category].lastFetched,
                            },
                        },
                        pendingItems: {
                            ...s.pendingItems,
                            [category]: [],
                        },
                    };
                });
            },

            getCategoryItems: (category: FeedCategory) => {
                return get().categories[category].items;
            },

            hasPendingItems: (category: FeedCategory) => {
                return get().pendingItems[category].length > 0;
            },

            getPendingCount: (category: FeedCategory) => {
                return get().pendingItems[category].length;
            },
        }),
        {
            name: 'sidecar-feed-cache',
            // Only persist categories (not loading/refreshing states)
            partialize: (state) => ({
                categories: state.categories,
            }),
        },
    ),
);
