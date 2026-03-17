import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    Newspaper, Search, Bookmark, BookmarkCheck, Trash2, Globe, Landmark,
    Timer, Shield, AlertTriangle, Loader2, Sparkles, ArrowRight,
    ExternalLink, X, Send, MessageSquare, FileText, Link2,
    RefreshCw, Bell, ChevronUp, Flame, Zap, TrendingDown
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useOntologyStore } from '../store/ontologyStore';
import { useFeedStore } from '../store/feedStore';
import { useToastStore } from '../hooks/useToast';
import { fetchRssFeeds, getFinOpsStats, type FinOpsStats } from '../services/newsService';
import { researchWithGrounding, type ResearchResult } from '../services/geminiService';
import SkeletonLoader from './widgets/SkeletonLoader';
import type { IntelArticle, FeedItem } from '../types';

type FeedTab = 'news' | 'circular' | 'alert';

interface ScrapItem {
    id: string;
    title: string;
    source: string;
    url: string;
    description: string;
    tags: string[];
    scrapDate: string;
    articleData?: IntelArticle;
    feedData?: FeedItem;
}

// Stale threshold: 10 minutes
const STALE_THRESHOLD_MS = 10 * 60 * 1000;

// Risk level badge config
const RISK_BADGE: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    Critical: { label: 'CRITICAL', color: 'bg-red-500/20 text-red-300 border-red-500/40', icon: <Flame size={10} /> },
    High: { label: 'HIGH', color: 'bg-orange-500/20 text-orange-300 border-orange-500/40', icon: <Zap size={10} /> },
    Medium: { label: 'MED', color: 'bg-amber-500/20 text-amber-300 border-amber-500/40', icon: <AlertTriangle size={10} /> },
    Low: { label: 'LOW', color: 'bg-blue-500/15 text-blue-300 border-blue-500/30', icon: <TrendingDown size={10} /> },
};

// Tab theme configuration
const TAB_THEMES: Record<FeedTab, { accent: string; bg: string; border: string; icon: React.ReactNode; label: string; desc: string }> = {
    news: {
        accent: 'cyan',
        bg: 'bg-cyan-500/15',
        border: 'border-cyan-500/30',
        icon: <Globe size={14} />,
        label: '뉴스 피드',
        desc: 'Maritime OSINT · Google News RSS',
    },
    circular: {
        accent: 'amber',
        bg: 'bg-amber-500/15',
        border: 'border-amber-500/30',
        icon: <Landmark size={14} />,
        label: 'P&I · 보험 공문',
        desc: 'P&I Club · Marine Insurance · RSS',
    },
    alert: {
        accent: 'rose',
        bg: 'bg-rose-500/15',
        border: 'border-rose-500/30',
        icon: <AlertTriangle size={14} />,
        label: '해사 사고 경보',
        desc: 'Maritime Accidents · Security Alerts',
    },
};

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function News() {
    const [activeTab, setActiveTab] = useState<FeedTab>('news');
    const [searchQuery, setSearchQuery] = useState('');
    const [scraps, setScraps] = useState<ScrapItem[]>([]);
    const [selectedScrap, setSelectedScrap] = useState<ScrapItem | null>(null);
    const [researchQuery, setResearchQuery] = useState('');
    const [researchResult, setResearchResult] = useState<ResearchResult | null>(null);
    const [researchError, setResearchError] = useState<string | null>(null);
    const [isResearching, setIsResearching] = useState(false);
    const pendingResearchRef = useRef<string | null>(null);
    const feedListRef = useRef<HTMLDivElement>(null);

    // Stores
    const objects = useOntologyStore(s => s.objects);
    const addToast = useToastStore(s => s.addToast);

    // Feed store
    const feedItems = useFeedStore(s => s[activeTab]);
    const pendingKey = `pending${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}` as 'pendingNews' | 'pendingCircular' | 'pendingAlert';
    const pendingItems = useFeedStore(s => s[pendingKey] as FeedItem[]);
    const isLoading = useFeedStore(s => s.isLoading[activeTab]);
    const isBgFetching = useFeedStore(s => s.isBackgroundFetching[activeTab]);
    const setItems = useFeedStore(s => s.setItems);
    const setPending = useFeedStore(s => s.setPending);
    const mergePending = useFeedStore(s => s.mergePending);
    const setLoading = useFeedStore(s => s.setLoading);
    const setBgFetch = useFeedStore(s => s.setBackgroundFetching);
    const updateLastFetched = useFeedStore(s => s.updateLastFetched);
    const getStaleMs = useFeedStore(s => s.getStaleMs);

    // Load scraps from localStorage
    useEffect(() => {
        try {
            const saved = JSON.parse(localStorage.getItem('sidecar_scraps') || '[]');
            setScraps(saved);
        } catch { }
    }, []);

    const persistScraps = (items: ScrapItem[]) => {
        setScraps(items);
        localStorage.setItem('sidecar_scraps', JSON.stringify(items));
    };

    // ── Smart fetch: cache-first with background SWR ──
    const fetchForTab = useCallback(async (tab: FeedTab, force = false) => {
        const staleMs = getStaleMs(tab);
        const currentItems = useFeedStore.getState()[tab];
        const hasCacheData = currentItems.length > 0;

        // If cache exists and not stale, skip (unless forced)
        if (hasCacheData && staleMs < STALE_THRESHOLD_MS && !force) return;

        // First load with no cache → show skeleton
        if (!hasCacheData) {
            setLoading(tab, true);
        } else {
            // Background fetch
            setBgFetch(tab, true);
        }

        try {
            const items = await fetchRssFeeds(tab);
            if (items.length === 0) {
                setLoading(tab, false);
                setBgFetch(tab, false);
                return;
            }

            if (!hasCacheData) {
                // First load → set items directly
                setItems(tab, items);
            } else {
                // Background update → compare with existing
                const existingIds = new Set(currentItems.map(i => i.id));
                const newItems = items.filter(i => !existingIds.has(i.id));

                if (newItems.length > 0) {
                    // Queue new items as pending → show toast
                    setPending(tab, newItems);
                    addToast(`${TAB_THEMES[tab].label}: ${newItems.length}건 업데이트됨`, 'info');
                }
            }

            updateLastFetched(tab);
        } catch (err) {
            console.warn(`[News] Feed fetch error (${tab}):`, err);
        } finally {
            setLoading(tab, false);
            setBgFetch(tab, false);
        }
    }, [getStaleMs, setItems, setPending, setLoading, setBgFetch, updateLastFetched, addToast]);

    // Fetch on tab change
    useEffect(() => {
        fetchForTab(activeTab);
    }, [activeTab, fetchForTab]);

    // Handle merge pending
    const handleMergePending = useCallback(() => {
        mergePending(activeTab);
        feedListRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }, [activeTab, mergePending]);

    // Handle scrap (bookmark) from feed
    const handleScrap = useCallback((item: FeedItem) => {
        setScraps(prev => {
            if (prev.find(s => s.url === item.url)) return prev;
            const newScrap: ScrapItem = {
                id: `scrap-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                title: item.title,
                source: item.source,
                url: item.url,
                description: item.description,
                tags: item.ontologyTags || [],
                scrapDate: new Date().toISOString(),
                feedData: item,
            };
            const updated = [newScrap, ...prev];
            localStorage.setItem('sidecar_scraps', JSON.stringify(updated));
            window.dispatchEvent(new CustomEvent('scenario_update_trigger'));
            addToast('스크랩에 추가됨', 'success');
            return updated;
        });
    }, [addToast]);

    const handleDeleteScrap = (id: string) => {
        const updated = scraps.filter(s => s.id !== id);
        persistScraps(updated);
        if (selectedScrap?.id === id) setSelectedScrap(null);
    };

    // Filter feed items by search
    const filteredItems = searchQuery
        ? feedItems.filter(item => {
            const q = searchQuery.toLowerCase();
            return item.title.toLowerCase().includes(q)
                || item.source.toLowerCase().includes(q)
                || item.description.toLowerCase().includes(q);
        })
        : feedItems;

    // Check if item is scrapped
    const isScraped = (url: string) => scraps.some(s => s.url === url);

    // Handle ontology tag clicks
    const handleTagClick = useCallback((tag: string) => {
        setSearchQuery(tag);
    }, []);

    // Deep Research — Gemini Google Search Grounding
    const handleResearch = useCallback(async (queryOverride?: string) => {
        const q = (queryOverride || researchQuery).trim();
        if (!q) return;
        if (queryOverride) setResearchQuery(q);
        setIsResearching(true);
        setResearchResult(null);
        setResearchError(null);

        const scrapContext = selectedScrap ? {
            scrapTitle: selectedScrap.title,
            scrapDescription: selectedScrap.description,
        } : undefined;

        const qLower = q.toLowerCase();
        const relatedObjects = objects
            .filter(o =>
                o.title.toLowerCase().includes(qLower) ||
                o.description?.toLowerCase().includes(qLower) ||
                o.type.toLowerCase().includes(qLower)
            )
            .slice(0, 5);

        const ontologyContext = relatedObjects.length > 0
            ? relatedObjects.map(o => `[${o.type}] ${o.title}: ${o.description || ''}`).join(' | ')
            : undefined;

        try {
            const result = await researchWithGrounding(q, {
                ...scrapContext,
                ontologyContext,
            });
            setResearchResult(result);
        } catch (err) {
            console.error('[News] Research failed:', err);
            setResearchError(err instanceof Error ? err.message : '리서치 중 오류가 발생했습니다.');
        } finally {
            setIsResearching(false);
        }
    }, [researchQuery, selectedScrap, objects]);

    // Auto-trigger research when query is set from scrap button
    useEffect(() => {
        if (pendingResearchRef.current) {
            const q = pendingResearchRef.current;
            pendingResearchRef.current = null;
            handleResearch(q);
        }
    }, [researchQuery, handleResearch]);

    // Format relative time
    const formatRelativeTime = (dateStr: string): string => {
        const diff = Date.now() - new Date(dateStr).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return '방금';
        if (mins < 60) return `${mins}분 전`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours}시간 전`;
        const days = Math.floor(hours / 24);
        return `${days}일 전`;
    };

    const theme = TAB_THEMES[activeTab];

    return (
        <div className="flex h-full bg-slate-950 overflow-hidden font-mono">
            {/* ========== CENTER: Signal Feed ========== */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Header toolbar */}
                <div className="shrink-0 px-6 pt-5 pb-3 border-b border-slate-800/50 bg-slate-950">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 flex items-center justify-center">
                                <Newspaper className="text-cyan-400" size={20} />
                            </div>
                            <div>
                                <h1 className="text-lg font-bold text-slate-100 tracking-wide">인텔리전스 피드</h1>
                                <p className="text-[10px] text-slate-500">{theme.desc}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {/* Background fetch indicator */}
                            {isBgFetching && (
                                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20">
                                    <Loader2 size={10} className="animate-spin text-blue-400" />
                                    <span className="text-[9px] text-blue-300">동기화 중...</span>
                                </div>
                            )}
                            {/* Refresh button */}
                            <button
                                onClick={() => fetchForTab(activeTab, true)}
                                disabled={isLoading || isBgFetching}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/50 border border-slate-700/40 text-xs text-slate-300 hover:bg-slate-700/50 hover:text-slate-100 transition-all disabled:opacity-40"
                            >
                                <RefreshCw size={12} className={isBgFetching ? 'animate-spin' : ''} />
                                <span>새로고침</span>
                            </button>
                            {/* Live badge */}
                            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                <span className="text-[10px] text-emerald-400 font-bold tracking-widest uppercase">RSS</span>
                            </div>
                        </div>
                    </div>

                    {/* Search bar */}
                    <div className="relative mb-3">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                            type="text"
                            placeholder="뉴스 검색... (키워드, 소스, 태그)"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full bg-slate-900/60 border border-slate-800 rounded-lg px-9 py-2.5 text-sm text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20 transition-all"
                        />
                        {searchQuery && (
                            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    {/* Tab navigation */}
                    <div className="flex gap-2">
                        {(['news', 'circular', 'alert'] as FeedTab[]).map(tab => {
                            const t = TAB_THEMES[tab];
                            const count = useFeedStore.getState()[tab].length;
                            const pendK = `pending${tab.charAt(0).toUpperCase() + tab.slice(1)}` as 'pendingNews' | 'pendingCircular' | 'pendingAlert';
                            const pendCount = (useFeedStore.getState()[pendK] as FeedItem[]).length;
                            return (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab)}
                                    className={cn(
                                        "flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all",
                                        activeTab === tab
                                            ? `${t.bg} text-${t.accent}-300 ${t.border} border shadow-lg`
                                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent"
                                    )}
                                >
                                    {t.icon}
                                    {t.label}
                                    <span className={cn("px-1.5 py-0.5 rounded-full text-[9px] font-mono",
                                        activeTab === tab ? `bg-${t.accent}-500/20 text-${t.accent}-300` : 'bg-slate-800 text-slate-500'
                                    )}>
                                        {count}
                                    </span>
                                    {pendCount > 0 && (
                                        <span className="px-1 py-0.5 rounded-full text-[8px] bg-rose-500/30 text-rose-300 animate-pulse">
                                            +{pendCount}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {/* Source info bar */}
                    <div className="mt-2 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-950/15 border border-emerald-800/15">
                        <Shield size={12} className="text-emerald-500 shrink-0" />
                        <span className="text-[9px] text-emerald-400/80 font-mono leading-tight truncate">
                            Edge Cache · Zustand Persist · {feedItems.length}건 캐시 · Sentiment Scanner 연동
                        </span>
                    </div>
                </div>

                {/* ── Feed Body ── */}
                <div className="flex-1 overflow-y-auto custom-scrollbar" ref={feedListRef}>
                    {/* Pending items banner */}
                    {pendingItems.length > 0 && (
                        <div className="sticky top-0 z-10 px-4 py-2 bg-slate-900/95 backdrop-blur border-b border-slate-800/50">
                            <button
                                onClick={handleMergePending}
                                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-xs font-bold hover:bg-cyan-500/25 transition-all animate-pulse"
                            >
                                <ChevronUp size={14} />
                                {pendingItems.length}건의 새로운 피드가 있습니다
                                <Bell size={12} />
                            </button>
                        </div>
                    )}

                    <div className="max-w-4xl mx-auto px-4 py-3 space-y-2">
                        {/* Loading skeleton */}
                        {isLoading && feedItems.length === 0 && (
                            <SkeletonLoader variant="news" lines={6} />
                        )}

                        {/* Empty state */}
                        {!isLoading && feedItems.length === 0 && (
                            <div className="flex flex-col items-center justify-center h-64 text-center">
                                <Newspaper size={32} className="text-slate-700 mb-3" />
                                <p className="text-sm text-slate-500 font-medium">피드가 비어 있습니다</p>
                                <p className="text-xs text-slate-600 mt-1">새로고침을 눌러 최신 피드를 불러오세요</p>
                                <button
                                    onClick={() => fetchForTab(activeTab, true)}
                                    className="mt-4 px-4 py-2 rounded-lg bg-cyan-500/20 text-cyan-300 text-xs font-bold hover:bg-cyan-500/30 transition-all"
                                >
                                    <RefreshCw size={12} className="inline mr-1" /> 피드 불러오기
                                </button>
                            </div>
                        )}

                        {/* Feed cards */}
                        {filteredItems.map(item => {
                            const scraped = isScraped(item.url);
                            const riskBadge = item.riskLevel ? RISK_BADGE[item.riskLevel] : null;

                            return (
                                <div
                                    key={item.id}
                                    className="group flex flex-col gap-1.5 p-4 rounded-xl border border-slate-800/40 bg-slate-900/30 hover:bg-slate-800/40 hover:border-slate-700/60 transition-all"
                                >
                                    {/* Top row: source badge + risk badge + time */}
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-bold text-slate-400 bg-slate-800/60 px-2 py-0.5 rounded-md truncate max-w-[140px]">
                                            {item.source}
                                        </span>

                                        {riskBadge && (
                                            <span className={cn(
                                                "flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-md border",
                                                riskBadge.color
                                            )}>
                                                {riskBadge.icon}
                                                {riskBadge.label}
                                            </span>
                                        )}

                                        {item.sentiment === 'negative' && !riskBadge && (
                                            <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-rose-500/10 text-rose-400 border border-rose-500/20">
                                                ⚠ 부정
                                            </span>
                                        )}

                                        <span className="text-[9px] text-slate-600 ml-auto shrink-0">
                                            {formatRelativeTime(item.publishedAt)}
                                        </span>
                                    </div>

                                    {/* Title */}
                                    <h3 className="text-sm font-semibold text-slate-200 leading-snug line-clamp-2 group-hover:text-slate-100 transition-colors">
                                        {item.title}
                                    </h3>

                                    {/* Description */}
                                    {item.description && (
                                        <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                                            {item.description}
                                        </p>
                                    )}

                                    {/* Bottom row: actions */}
                                    <div className="flex items-center gap-2 mt-1 pt-1.5">
                                        {/* Open URL */}
                                        {item.url && (
                                            <a
                                                href={item.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-1 text-[10px] text-cyan-400/70 hover:text-cyan-300 transition-colors"
                                            >
                                                <ExternalLink size={10} /> 원문
                                            </a>
                                        )}

                                        {/* Scrap/bookmark button */}
                                        <button
                                            onClick={() => handleScrap(item)}
                                            disabled={scraped}
                                            className={cn(
                                                "flex items-center gap-1 text-[10px] transition-colors",
                                                scraped
                                                    ? "text-amber-400/50 cursor-default"
                                                    : "text-slate-500 hover:text-amber-400"
                                            )}
                                        >
                                            {scraped ? <BookmarkCheck size={10} /> : <Bookmark size={10} />}
                                            {scraped ? '스크랩됨' : '스크랩'}
                                        </button>

                                        {/* Quick research */}
                                        <button
                                            onClick={() => {
                                                pendingResearchRef.current = item.title.slice(0, 60);
                                                setResearchQuery(item.title.slice(0, 60));
                                            }}
                                            className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-violet-400 transition-colors"
                                        >
                                            <Sparkles size={10} /> 조사
                                        </button>

                                        {/* Risk score indicator */}
                                        {(item.riskScore ?? 0) > 0 && (
                                            <span className="ml-auto text-[9px] text-slate-600 font-mono">
                                                Risk: {item.riskScore}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* ========== RIGHT SIDEBAR: Scrapbook + Research ========== */}
            <div className="w-[380px] shrink-0 border-l border-slate-800/50 bg-slate-900/40 flex flex-col overflow-hidden">
                {/* Scrapbook header */}
                <div className="shrink-0 p-4 border-b border-slate-800/50">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
                            <BookmarkCheck size={16} className="text-amber-400" />
                        </div>
                        <div className="flex-1">
                            <h2 className="text-sm font-bold text-slate-100">스크랩 북</h2>
                            <p className="text-[9px] text-slate-500">{scraps.length}건 저장됨</p>
                        </div>
                    </div>
                </div>

                {/* Scrapbook list */}
                <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
                    {scraps.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-48 text-center px-6">
                            <Bookmark size={24} className="text-slate-700 mb-3" />
                            <p className="text-xs text-slate-500 font-medium mb-1">스크랩이 없습니다</p>
                            <p className="text-[10px] text-slate-600 leading-relaxed">
                                뉴스 카드의 스크랩 버튼을 눌러<br />중요 뉴스를 저장하세요
                            </p>
                        </div>
                    ) : (
                        <div className="p-2 space-y-1">
                            {scraps.map(scrap => (
                                <div
                                    key={scrap.id}
                                    onClick={() => setSelectedScrap(selectedScrap?.id === scrap.id ? null : scrap)}
                                    className={cn(
                                        "group p-3 rounded-lg cursor-pointer transition-all border",
                                        selectedScrap?.id === scrap.id
                                            ? "bg-amber-500/10 border-amber-500/30"
                                            : "bg-slate-800/30 border-slate-800/50 hover:bg-slate-800/50 hover:border-slate-700/50"
                                    )}
                                >
                                    <div className="flex items-start gap-2 mb-1.5">
                                        <FileText size={12} className="text-amber-400 mt-0.5 shrink-0" />
                                        <h4 className="text-xs font-medium text-slate-200 leading-snug line-clamp-2 flex-1">{scrap.title}</h4>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDeleteScrap(scrap.id); }}
                                            className="opacity-0 group-hover:opacity-100 p-1 rounded text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-all shrink-0"
                                        >
                                            <Trash2 size={10} />
                                        </button>
                                    </div>

                                    <div className="flex items-center gap-2 text-[9px] text-slate-500 ml-5">
                                        <span className="font-mono">{scrap.source}</span>
                                        <span>·</span>
                                        <span>{new Date(scrap.scrapDate).toLocaleDateString('ko-KR')}</span>
                                    </div>

                                    {/* Tags */}
                                    {scrap.tags.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-2 ml-5">
                                            {scrap.tags.slice(0, 3).map(tag => (
                                                <span
                                                    key={tag}
                                                    onClick={(e) => { e.stopPropagation(); handleTagClick(tag); }}
                                                    className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700/50 hover:bg-cyan-500/10 hover:text-cyan-300 cursor-pointer transition-colors"
                                                >
                                                    #{tag}
                                                </span>
                                            ))}
                                            {scrap.tags.length > 3 && (
                                                <span className="text-[9px] text-slate-600">+{scrap.tags.length - 3}</span>
                                            )}
                                        </div>
                                    )}

                                    {/* Expanded detail */}
                                    {selectedScrap?.id === scrap.id && (
                                        <div className="mt-3 ml-5 space-y-2 animate-in slide-in-from-top-1">
                                            <p className="text-[11px] text-slate-400 leading-relaxed line-clamp-4">
                                                {scrap.description}
                                            </p>
                                            <a
                                                href={scrap.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                onClick={e => e.stopPropagation()}
                                                className="inline-flex items-center gap-1 text-[10px] text-cyan-400 hover:text-cyan-300 transition-colors"
                                            >
                                                원문 보기 <ExternalLink size={10} />
                                            </a>

                                            {/* Quick research button */}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const query = scrap.title.slice(0, 60);
                                                    pendingResearchRef.current = query;
                                                    setResearchQuery(query);
                                                }}
                                                className="flex items-center gap-1 text-[10px] text-violet-400 hover:text-violet-300 transition-colors"
                                            >
                                                <Sparkles size={10} /> 이어서 조사하기
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* ========== Research Panel (Perplexity-style follow-up) ========== */}
                <div className="shrink-0 border-t border-slate-800/50 bg-slate-900/60">
                    <div className="p-3">
                        <div className="flex items-center gap-2 mb-2">
                            <Search size={13} className="text-violet-400" />
                            <span className="text-xs font-bold text-slate-200">심층 조사</span>
                            <span className="text-[9px] text-emerald-400/60 ml-auto flex items-center gap-1">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400/80" />
                                Google Search Grounding
                            </span>
                        </div>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={researchQuery}
                                onChange={e => setResearchQuery(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleResearch()}
                                placeholder="조사할 키워드 입력... (예: 호르무즈 해협 최신 동향)"
                                className="flex-1 bg-slate-800/60 border border-slate-700/50 rounded-lg px-3 py-2 text-xs text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/20 transition-all"
                            />
                            <button
                                onClick={() => handleResearch()}
                                disabled={isResearching || !researchQuery.trim()}
                                className="px-3 py-2 rounded-lg bg-violet-600/80 hover:bg-violet-500 text-white text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                            >
                                {isResearching ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                            </button>
                        </div>

                        {/* Research results */}
                        {isResearching && (
                            <div className="mt-3 p-4 rounded-lg bg-violet-950/20 border border-violet-800/20 flex items-center gap-3">
                                <Loader2 size={16} className="animate-spin text-violet-400" />
                                <div>
                                    <span className="text-xs text-violet-300 font-medium">Google Search로 조사 중...</span>
                                    <p className="text-[9px] text-slate-500 mt-0.5">Gemini AI가 최신 웹 정보를 분석하고 있습니다</p>
                                </div>
                            </div>
                        )}

                        {researchError && (
                            <div className="mt-3 p-3 rounded-lg bg-rose-950/20 border border-rose-800/20">
                                <p className="text-[11px] text-rose-300">⚠ {researchError}</p>
                            </div>
                        )}

                        {researchResult && !isResearching && (
                            <div className="mt-3 space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                                <div className="p-3 rounded-lg bg-violet-950/20 border border-violet-800/20">
                                    <p className="text-[11px] text-slate-200 leading-relaxed">{researchResult.summary}</p>
                                </div>

                                {researchResult.keyFacts.length > 0 && (
                                    <div className="p-3 rounded-lg bg-slate-800/30 border border-slate-700/30">
                                        <span className="text-[9px] text-violet-400 uppercase tracking-wider font-bold">핵심 팩트</span>
                                        <ul className="mt-1.5 space-y-1">
                                            {researchResult.keyFacts.map((fact, i) => (
                                                <li key={i} className="text-[10px] text-slate-300 flex items-start gap-1.5">
                                                    <span className="text-violet-400 mt-0.5">▸</span>
                                                    {fact}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {researchResult.sources.length > 0 && (
                                    <div className="p-2 rounded-lg bg-slate-800/20 border border-slate-700/20">
                                        <span className="text-[9px] text-slate-500 uppercase tracking-wider font-bold flex items-center gap-1"><Link2 size={9} /> 출처</span>
                                        <div className="mt-1 space-y-0.5">
                                            {researchResult.sources.map((src, i) => (
                                                <a key={i} href={src.url} target="_blank" rel="noopener noreferrer"
                                                    className="flex items-center gap-1.5 text-[10px] text-cyan-400 hover:text-cyan-300 transition-colors truncate">
                                                    <ExternalLink size={9} className="shrink-0" />
                                                    {src.title || src.url}
                                                </a>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {researchResult.relatedQueries.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                        {researchResult.relatedQueries.map((rq, i) => (
                                            <button
                                                key={i}
                                                onClick={() => {
                                                    pendingResearchRef.current = rq;
                                                    setResearchQuery(rq);
                                                }}
                                                className="text-[9px] px-2 py-1 rounded-full bg-violet-500/10 text-violet-300 border border-violet-500/20 hover:bg-violet-500/20 hover:text-violet-200 transition-all"
                                            >
                                                🔍 {rq}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Quick research suggestions */}
                        {!researchResult && !isResearching && !researchError && (
                            <div className="mt-2 flex flex-wrap gap-1">
                                {['호르무즈 해협 최신 동향', 'VLCC 운임 전망', '중동 유가 전망', 'P&I 보험료 추이', '글로벌 해운 시장'].map(keyword => (
                                    <button
                                        key={keyword}
                                        onClick={() => {
                                            pendingResearchRef.current = keyword;
                                            setResearchQuery(keyword);
                                        }}
                                        className="text-[9px] px-2 py-1 rounded-full bg-slate-800/60 text-slate-400 border border-slate-700/40 hover:bg-violet-500/10 hover:text-violet-300 hover:border-violet-500/30 transition-all"
                                    >
                                        🔍 {keyword}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
