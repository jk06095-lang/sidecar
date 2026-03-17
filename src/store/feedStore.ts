/**
 * Feed Store — Zustand Persist + Smart Caching
 *
 * Architecture:
 *   1. LocalStorage cache (persist) → instant tab render (Zero Loading)
 *   2. Background fetch → compare timestamps → toast if new items
 *   3. Pending queue → user clicks toast → merge into visible list
 *   4. GC: max 100 items per category to stay under 5MB localStorage limit
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { FeedItem } from '../types';

const MAX_ITEMS_PER_CATEGORY = 100;

type FeedCategory = 'news' | 'circular' | 'alert';

interface FeedState {
    // Visible items (rendered in UI)
    news: FeedItem[];
    circular: FeedItem[];
    alert: FeedItem[];

    // Pending items (waiting for user confirmation)
    pendingNews: FeedItem[];
    pendingCircular: FeedItem[];
    pendingAlert: FeedItem[];

    // Timestamps for SWR
    lastFetchedAt: Record<FeedCategory, number>;

    // Loading states
    isLoading: Record<FeedCategory, boolean>;
    isBackgroundFetching: Record<FeedCategory, boolean>;

    // Actions
    setItems: (category: FeedCategory, items: FeedItem[]) => void;
    setPending: (category: FeedCategory, items: FeedItem[]) => void;
    mergePending: (category: FeedCategory) => void;
    setLoading: (category: FeedCategory, loading: boolean) => void;
    setBackgroundFetching: (category: FeedCategory, fetching: boolean) => void;
    updateLastFetched: (category: FeedCategory) => void;
    getStaleMs: (category: FeedCategory) => number;
}

export const useFeedStore = create<FeedState>()(
    persist(
        (set, get) => ({
            news: [],
            circular: [],
            alert: [],
            pendingNews: [],
            pendingCircular: [],
            pendingAlert: [],
            lastFetchedAt: { news: 0, circular: 0, alert: 0 },
            isLoading: { news: false, circular: false, alert: false },
            isBackgroundFetching: { news: false, circular: false, alert: false },

            setItems: (category, items) => set(state => ({
                [category]: items.slice(0, MAX_ITEMS_PER_CATEGORY),
            })),

            setPending: (category, items) => {
                const pendingKey = `pending${category.charAt(0).toUpperCase() + category.slice(1)}` as keyof FeedState;
                set({ [pendingKey]: items } as any);
            },

            mergePending: (category) => {
                const state = get();
                const pendingKey = `pending${category.charAt(0).toUpperCase() + category.slice(1)}` as keyof FeedState;
                const pending = state[pendingKey] as FeedItem[];
                const current = state[category] as FeedItem[];

                // Merge pending at top, dedup by id, GC to max
                const existingIds = new Set(current.map(i => i.id));
                const newItems = pending.filter(i => !existingIds.has(i.id));
                const merged = [...newItems, ...current].slice(0, MAX_ITEMS_PER_CATEGORY);

                set({
                    [category]: merged,
                    [pendingKey]: [],
                } as any);
            },

            setLoading: (category, loading) => set(state => ({
                isLoading: { ...state.isLoading, [category]: loading },
            })),

            setBackgroundFetching: (category, fetching) => set(state => ({
                isBackgroundFetching: { ...state.isBackgroundFetching, [category]: fetching },
            })),

            updateLastFetched: (category) => set(state => ({
                lastFetchedAt: { ...state.lastFetchedAt, [category]: Date.now() },
            })),

            getStaleMs: (category) => {
                return Date.now() - get().lastFetchedAt[category];
            },
        }),
        {
            name: 'sidecar-feeds',
            // Only persist visible items + timestamps (not loading states)
            partialize: (state) => ({
                news: state.news,
                circular: state.circular,
                alert: state.alert,
                lastFetchedAt: state.lastFetchedAt,
            }),
        }
    )
);
