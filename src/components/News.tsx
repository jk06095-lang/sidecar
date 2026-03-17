/**
 * News.tsx — Intelligence Feed (완전 개편)
 *
 * RSS Feed 기반 3-탭 구조:
 *  1. 뉴스 피드 (news)     — Google News RSS + 해운 도메인 RSS
 *  2. P&I · 보험 공문 (pni) — P&I, marine insurance, 해상보험
 *  3. 해사 사고 경보 (accident) — 충돌, 좌초, 해적 등
 *
 * Architecture:
 *  - Zustand persist → 즉시 캐시 렌더 (Zero Loading)
 *  - Stale-while-revalidate → 백그라운드 자동 새로고침 (1h)
 *  - Pending feed toast → 읽는 중 스크롤 방해 없음
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Newspaper, Shield, AlertTriangle, ExternalLink, RefreshCw,
    ArrowUp, Clock, Search, Rss, Loader2, Globe, ChevronDown,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';
import { cn } from '../lib/utils';
import { useFeedStore, type FeedCategory, type FeedItem } from '../store/feedStore';
import SkeletonLoader from './widgets/SkeletonLoader';

// ── Tab Definitions ──────────────────────────────────────────
interface TabDef {
    id: FeedCategory;
    label: string;
    labelEn: string;
    icon: typeof Newspaper;
    color: string;
    gradient: string;
}

const TABS: TabDef[] = [
    {
        id: 'news',
        label: '뉴스 피드',
        labelEn: 'News Feed',
        icon: Newspaper,
        color: 'text-cyan-400',
        gradient: 'from-cyan-500/20 to-blue-500/20',
    },
    {
        id: 'pni',
        label: 'P&I · 보험 공문',
        labelEn: 'P&I Circulars',
        icon: Shield,
        color: 'text-amber-400',
        gradient: 'from-amber-500/20 to-orange-500/20',
    },
    {
        id: 'accident',
        label: '해사 사고 경보',
        labelEn: 'Maritime Alerts',
        icon: AlertTriangle,
        color: 'text-rose-400',
        gradient: 'from-rose-500/20 to-red-500/20',
    },
];

// ── Relative Time ────────────────────────────────────────────
function relativeTime(dateStr: string): string {
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return '';
        return formatDistanceToNow(d, { addSuffix: true, locale: ko });
    } catch {
        return '';
    }
}

// ── Feed Card ────────────────────────────────────────────────
function FeedCard({ item }: { item: FeedItem }) {
    return (
        <a
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="group block p-4 rounded-xl border border-slate-700/40 bg-slate-800/30 
                       hover:bg-slate-800/60 hover:border-slate-600/60 
                       transition-all duration-200 cursor-pointer"
        >
            {/* Header: badge + source + time */}
            <div className="flex items-center gap-2 mb-2">
                <span className="text-sm" title={item.source}>{item.sourceBadge}</span>
                <span className="text-xs font-semibold text-slate-300 truncate max-w-[180px]">
                    {item.source}
                </span>
                <span className="ml-auto flex items-center gap-1 text-[10px] text-slate-500 shrink-0">
                    <Clock size={10} />
                    {relativeTime(item.pubDate)}
                </span>
            </div>

            {/* Title */}
            <h3 className="text-sm font-semibold text-slate-100 leading-snug mb-1.5 
                          group-hover:text-white transition-colors line-clamp-2">
                {item.title}
            </h3>

            {/* Content snippet */}
            {item.contentSnippet && (
                <p className="text-xs text-slate-400 leading-relaxed line-clamp-2 mb-2">
                    {item.contentSnippet}
                </p>
            )}

            {/* Footer: link indicator */}
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500 
                           group-hover:text-cyan-400 transition-colors">
                <ExternalLink size={10} />
                <span>원문 보기</span>
            </div>
        </a>
    );
}

// ── Main Component ──────────────────────────────────────────
export default function News() {
    const [activeTab, setActiveTab] = useState<FeedCategory>('news');
    const [searchQuery, setSearchQuery] = useState('');
    const [showSearch, setShowSearch] = useState(false);

    // Zustand store
    const categories = useFeedStore(s => s.categories);
    const pendingItems = useFeedStore(s => s.pendingItems);
    const isLoading = useFeedStore(s => s.isLoading);
    const isRefreshing = useFeedStore(s => s.isRefreshing);
    const fetchCategory = useFeedStore(s => s.fetchCategory);
    const acknowledgePending = useFeedStore(s => s.acknowledgePending);

    // Fetch on tab change (respects SWR — no-op if fresh cache exists)
    useEffect(() => {
        fetchCategory(activeTab);
    }, [activeTab, fetchCategory]);

    // Auto poll every 15 minutes for active tab
    useEffect(() => {
        const interval = setInterval(() => {
            fetchCategory(activeTab);
        }, 15 * 60 * 1000);
        return () => clearInterval(interval);
    }, [activeTab, fetchCategory]);

    // Manual refresh
    const handleRefresh = useCallback(() => {
        // Reset lastFetched to 0 to force refetch
        useFeedStore.setState(s => ({
            categories: {
                ...s.categories,
                [activeTab]: {
                    ...s.categories[activeTab],
                    lastFetched: 0,
                },
            },
        }));
        fetchCategory(activeTab);
    }, [activeTab, fetchCategory]);

    // Acknowledge pending feeds
    const handleAckPending = useCallback(() => {
        acknowledgePending(activeTab);
    }, [activeTab, acknowledgePending]);

    // Current tab data
    const items = categories[activeTab].items;
    const loading = isLoading[activeTab];
    const refreshing = isRefreshing[activeTab];
    const pendingCount = pendingItems[activeTab].length;
    const lastFetched = categories[activeTab].lastFetched;

    // Search filter
    const filteredItems = useMemo(() => {
        if (!searchQuery.trim()) return items;
        const q = searchQuery.toLowerCase();
        return items.filter(
            it =>
                it.title.toLowerCase().includes(q) ||
                it.source.toLowerCase().includes(q) ||
                it.contentSnippet.toLowerCase().includes(q),
        );
    }, [items, searchQuery]);

    // Active tab definition
    const activeTabDef = TABS.find(t => t.id === activeTab)!;

    return (
        <div className="flex flex-col h-full bg-slate-950 overflow-hidden">
            {/* ═══════ HEADER ═══════ */}
            <div className="shrink-0 px-6 pt-5 pb-3 border-b border-slate-800/50">
                {/* Title Row */}
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className={cn(
                            'w-10 h-10 rounded-xl bg-gradient-to-br border flex items-center justify-center',
                            `${activeTabDef.gradient} border-slate-700/40`,
                        )}>
                            <Rss className={activeTabDef.color} size={20} />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-slate-100 tracking-wide">
                                인텔리전스 피드
                            </h1>
                            <p className="text-[10px] text-slate-500">
                                RSS-Driven · Smart Cache · Stale-While-Revalidate
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Refresh indicator */}
                        {refreshing && (
                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                                <Loader2 size={12} className="text-cyan-400 animate-spin" />
                                <span className="text-[10px] text-cyan-400">백그라운드 갱신 중</span>
                            </div>
                        )}

                        {/* Last updated */}
                        {lastFetched > 0 && (
                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/50 border border-slate-700/40">
                                <Clock size={11} className="text-slate-500" />
                                <span className="text-[10px] text-slate-500">
                                    {relativeTime(new Date(lastFetched).toISOString())}
                                </span>
                            </div>
                        )}

                        {/* Search toggle */}
                        <button
                            onClick={() => setShowSearch(!showSearch)}
                            className={cn(
                                'p-2 rounded-lg border transition-colors',
                                showSearch
                                    ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
                                    : 'bg-slate-800/50 border-slate-700/40 text-slate-500 hover:text-slate-300',
                            )}
                        >
                            <Search size={14} />
                        </button>

                        {/* Manual refresh button */}
                        <button
                            onClick={handleRefresh}
                            disabled={refreshing}
                            className="p-2 rounded-lg bg-slate-800/50 border border-slate-700/40 text-slate-500 
                                       hover:text-cyan-400 hover:border-cyan-500/30 transition-colors disabled:opacity-50"
                        >
                            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                        </button>
                    </div>
                </div>

                {/* Search bar (collapsible) */}
                {showSearch && (
                    <div className="relative mb-3 animate-in slide-in-from-top-2 duration-200">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                            type="text"
                            placeholder="제목, 소스, 내용 검색..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            autoFocus
                            className="w-full pl-9 pr-4 py-2 rounded-lg bg-slate-800/50 border border-slate-700/40 
                                       text-sm text-slate-200 placeholder-slate-600 
                                       focus:outline-none focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20"
                        />
                    </div>
                )}

                {/* ═══════ TAB BAR ═══════ */}
                <div className="flex gap-1">
                    {TABS.map(tab => {
                        const isActive = activeTab === tab.id;
                        const Icon = tab.icon;
                        const catPending = pendingItems[tab.id].length;
                        const catCount = categories[tab.id].items.length;

                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={cn(
                                    'flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-semibold transition-all duration-200',
                                    isActive
                                        ? `bg-gradient-to-r ${tab.gradient} border border-slate-600/40 ${tab.color} shadow-lg`
                                        : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/30 border border-transparent',
                                )}
                            >
                                <Icon size={14} />
                                <span>{tab.label}</span>
                                {/* Item count */}
                                {catCount > 0 && (
                                    <span className={cn(
                                        'px-1.5 py-0.5 rounded-full text-[9px] font-mono',
                                        isActive ? 'bg-white/10' : 'bg-slate-800/50',
                                    )}>
                                        {catCount}
                                    </span>
                                )}
                                {/* Pending badge */}
                                {catPending > 0 && (
                                    <span className="relative flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500" />
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ═══════ FEED CONTENT ═══════ */}
            <div className="flex-1 overflow-y-auto relative">
                {/* Pending Items Toast — floating at top */}
                {pendingCount > 0 && (
                    <div className="sticky top-0 z-20 px-4 pt-3">
                        <button
                            onClick={handleAckPending}
                            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl
                                       bg-gradient-to-r from-cyan-500/20 to-blue-500/20 
                                       border border-cyan-500/30 backdrop-blur-sm
                                       text-cyan-300 text-xs font-semibold
                                       hover:from-cyan-500/30 hover:to-blue-500/30
                                       transition-all duration-200 shadow-lg shadow-cyan-500/5
                                       animate-in slide-in-from-top-4 duration-300"
                        >
                            <ArrowUp size={14} />
                            <span>새로운 피드가 {pendingCount}개 있습니다</span>
                            <ChevronDown size={12} className="ml-1 rotate-180" />
                        </button>
                    </div>
                )}

                {/* Loading skeleton (first-ever load with no cache) */}
                {loading && items.length === 0 && (
                    <div className="p-4">
                        <SkeletonLoader variant="news" lines={6} />
                    </div>
                )}

                {/* Empty state */}
                {!loading && filteredItems.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-64 text-slate-600">
                        <Globe size={40} className="mb-3 opacity-40" />
                        <p className="text-sm font-medium">
                            {searchQuery ? '검색 결과가 없습니다' : '피드 데이터를 불러오는 중...'}
                        </p>
                        <p className="text-xs mt-1">
                            {searchQuery ? '다른 키워드로 검색해 보세요' : '잠시 후 자동으로 업데이트됩니다'}
                        </p>
                        {!searchQuery && (
                            <button
                                onClick={handleRefresh}
                                className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg 
                                          bg-slate-800/50 border border-slate-700/40 text-slate-400 text-xs
                                          hover:text-cyan-400 hover:border-cyan-500/30 transition-colors"
                            >
                                <RefreshCw size={12} />
                                수동 새로고침
                            </button>
                        )}
                    </div>
                )}

                {/* Feed cards */}
                {filteredItems.length > 0 && (
                    <div className="p-4 space-y-2">
                        {filteredItems.map((item) => (
                            <FeedCard key={item.guid} item={item} />
                        ))}
                    </div>
                )}
            </div>

            {/* ═══════ FOOTER STATUS BAR ═══════ */}
            <div className="shrink-0 px-6 py-2 border-t border-slate-800/50 flex items-center justify-between">
                <div className="flex items-center gap-3 text-[10px] text-slate-600">
                    <span className="flex items-center gap-1">
                        <Rss size={10} />
                        RSS Smart Cache
                    </span>
                    <span className="text-slate-700">·</span>
                    <span>SWR 1h</span>
                    <span className="text-slate-700">·</span>
                    <span>Auto-poll 15m</span>
                </div>
                <div className="text-[10px] text-slate-600">
                    {items.length > 0 && `${items.length} articles cached`}
                </div>
            </div>
        </div>
    );
}
