import React, { useState, useEffect, useCallback } from 'react';
import {
    Newspaper, Search, Bookmark, BookmarkCheck, Trash2, Globe, Landmark,
    Timer, Shield, AlertTriangle, Loader2, Sparkles, ArrowRight,
    ExternalLink, X, Send, MessageSquare, FileText
} from 'lucide-react';
import { cn } from '../lib/utils';
import GlobalNewsWidget from './widgets/GlobalNewsWidget';
import { useOntologyStore } from '../store/ontologyStore';
import { getFinOpsStats, type FinOpsStats } from '../services/newsService';
import type { IntelArticle } from '../types';

type FeedTab = 'osint' | 'official';

interface ScrapItem {
    id: string;
    title: string;
    source: string;
    url: string;
    description: string;
    tags: string[];
    scrapDate: string;
    articleData: IntelArticle;
}

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function News() {
    const [activeTab, setActiveTab] = useState<FeedTab>('osint');
    const [countdownSeconds, setCountdownSeconds] = useState(600);
    const [finOpsStats, setFinOpsStats] = useState<FinOpsStats>(getFinOpsStats());
    const [scraps, setScraps] = useState<ScrapItem[]>([]);
    const [researchQuery, setResearchQuery] = useState('');
    const [researchResults, setResearchResults] = useState<string[]>([]);
    const [isResearching, setIsResearching] = useState(false);
    const [selectedScrap, setSelectedScrap] = useState<ScrapItem | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    // Ontology store for tag navigation & article storage
    const objects = useOntologyStore(s => s.objects);
    const intelArticles = useOntologyStore(s => s.intelArticles);

    // Load scraps from localStorage on mount
    useEffect(() => {
        try {
            const saved = JSON.parse(localStorage.getItem('sidecar_scraps') || '[]');
            setScraps(saved);
        } catch { }
    }, []);

    // Persist scraps to localStorage
    const persistScraps = (items: ScrapItem[]) => {
        setScraps(items);
        localStorage.setItem('sidecar_scraps', JSON.stringify(items));
    };

    // Countdown callback
    const handleCountdownUpdate = useCallback((seconds: number) => {
        setCountdownSeconds(seconds);
    }, []);

    const formatCountdown = (totalSeconds: number): string => {
        const m = Math.floor(totalSeconds / 60);
        const s = totalSeconds % 60;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    // Handle ontology tag clicks
    const handleTagClick = useCallback((tag: string) => {
        setSearchQuery(tag);
    }, []);

    // Handle scrap from GlobalNewsWidget
    const handleScrap = useCallback((article: IntelArticle) => {
        setScraps(prev => {
            if (prev.find(s => s.url === article.url)) return prev; // no dupes
            const newScrap: ScrapItem = {
                id: `scrap-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                title: article.title,
                source: article.source,
                url: article.url,
                description: article.description,
                tags: article.ontologyTags || [],
                scrapDate: new Date().toISOString(),
                articleData: article,
            };
            const updated = [newScrap, ...prev];
            localStorage.setItem('sidecar_scraps', JSON.stringify(updated));
            return updated;
        });
    }, []);

    // Delete a scrap
    const handleDeleteScrap = (id: string) => {
        const updated = scraps.filter(s => s.id !== id);
        persistScraps(updated);
        if (selectedScrap?.id === id) setSelectedScrap(null);
    };

    // Perplexity-style follow-up research
    const handleResearch = async () => {
        if (!researchQuery.trim()) return;
        setIsResearching(true);
        setResearchResults([]);

        // Search through existing articles for related content
        const query = researchQuery.toLowerCase();
        const matchedArticles = intelArticles
            .filter(a =>
                a.title.toLowerCase().includes(query) ||
                a.description.toLowerCase().includes(query) ||
                (a.ontologyTags || []).some(t => t.toLowerCase().includes(query))
            )
            .slice(0, 5);

        // Also search ontology objects
        const matchedObjects = objects
            .filter(o =>
                o.title.toLowerCase().includes(query) ||
                o.description.toLowerCase().includes(query) ||
                o.type.toLowerCase().includes(query)
            )
            .slice(0, 3);

        const results: string[] = [];

        if (matchedArticles.length > 0) {
            results.push(`📰 **관련 뉴스 ${matchedArticles.length}건 발견:**`);
            matchedArticles.forEach(a => {
                results.push(`• ${a.title} — ${a.source} ${a.riskLevel ? `[${a.riskLevel}]` : ''}`);
            });
        }

        if (matchedObjects.length > 0) {
            results.push(`\n🔗 **연관 온톨로지 ${matchedObjects.length}건:**`);
            matchedObjects.forEach(o => {
                results.push(`• [${o.type}] ${o.title}`);
            });
        }

        if (results.length === 0) {
            results.push(`🔍 "${researchQuery}"에 대한 결과가 없습니다. 다른 키워드로 검색해보세요.`);
        }

        // Simulate slight delay for UX
        await new Promise(r => setTimeout(r, 600));
        setResearchResults(results);
        setIsResearching(false);
    };

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
                                <p className="text-[10px] text-slate-500">Maritime OSINT · 공식 지침 · AI 시그널 분석</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            {/* Live badge */}
                            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-rose-500/10 border border-rose-500/20">
                                <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                                <span className="text-[10px] text-rose-400 font-bold tracking-widest uppercase">Live</span>
                            </div>
                            {/* Countdown */}
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/50 border border-slate-700/40">
                                <Timer size={13} className="text-amber-400" />
                                <span className="text-[10px] text-slate-400 font-mono">다음 배치:</span>
                                <span className="text-sm font-mono font-bold text-amber-300 tracking-widest tabular-nums">
                                    {formatCountdown(countdownSeconds)}
                                </span>
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
                        <button
                            onClick={() => setActiveTab('osint')}
                            className={cn(
                                "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all",
                                activeTab === 'osint'
                                    ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shadow-lg shadow-cyan-900/10"
                                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent"
                            )}
                        >
                            <Globe size={14} />
                            매크로 뉴스
                        </button>
                        <button
                            onClick={() => setActiveTab('official')}
                            className={cn(
                                "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all",
                                activeTab === 'official'
                                    ? "bg-rose-500/15 text-rose-300 border border-rose-500/30 shadow-lg shadow-rose-900/10"
                                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent"
                            )}
                        >
                            <Landmark size={14} />
                            공식 지침 & 경보
                        </button>
                    </div>

                    {/* FinOps stats bar */}
                    <div className="mt-2 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-950/15 border border-emerald-800/15">
                        <Shield size={12} className="text-emerald-500 shrink-0" />
                        <span className="text-[9px] text-emerald-400/80 font-mono leading-tight truncate">
                            FinOps Shield: {finOpsStats.droppedByLocalFilter + finOpsStats.droppedByDedup} filtered → {finOpsStats.sentToAIP} via AIP ({finOpsStats.apiCallCount} calls, ~{finOpsStats.costSavingsPercent}% saved)
                        </span>
                    </div>
                </div>

                {/* News feed body */}
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <div className="max-w-4xl mx-auto px-4 py-3">
                        <GlobalNewsWidget
                            onTagClick={handleTagClick}
                            onStatsUpdate={setFinOpsStats}
                            activeTab={activeTab}
                            onCountdownUpdate={handleCountdownUpdate}
                            onScrap={handleScrap}
                        />
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
                                뉴스 카드의 ★ 버튼을 눌러<br />중요 뉴스를 스크랩하세요
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
                                                <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700/50">
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
                                                    setResearchQuery(scrap.title.slice(0, 40));
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
                            <MessageSquare size={13} className="text-violet-400" />
                            <span className="text-xs font-bold text-slate-200">이어서 조사</span>
                            <span className="text-[9px] text-slate-600 ml-auto">Perplexity-style Research</span>
                        </div>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={researchQuery}
                                onChange={e => setResearchQuery(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleResearch()}
                                placeholder="관련 키워드 입력... (예: 호르무즈 해협)"
                                className="flex-1 bg-slate-800/60 border border-slate-700/50 rounded-lg px-3 py-2 text-xs text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/20 transition-all"
                            />
                            <button
                                onClick={handleResearch}
                                disabled={isResearching || !researchQuery.trim()}
                                className="px-3 py-2 rounded-lg bg-violet-600/80 hover:bg-violet-500 text-white text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                            >
                                {isResearching ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                            </button>
                        </div>

                        {/* Research results */}
                        {researchResults.length > 0 && (
                            <div className="mt-3 p-3 rounded-lg bg-violet-950/20 border border-violet-800/20 max-h-48 overflow-y-auto custom-scrollbar">
                                {researchResults.map((line, i) => (
                                    <p key={i} className="text-[11px] text-slate-300 leading-relaxed mb-1 last:mb-0">
                                        {line}
                                    </p>
                                ))}
                            </div>
                        )}

                        {/* Quick research suggestions */}
                        {researchResults.length === 0 && !isResearching && (
                            <div className="mt-2 flex flex-wrap gap-1">
                                {['호르무즈 해협', 'VLCC', '유가 변동', '해적', 'P&I 보험'].map(keyword => (
                                    <button
                                        key={keyword}
                                        onClick={() => { setResearchQuery(keyword); }}
                                        className="text-[9px] px-2 py-1 rounded-full bg-slate-800/60 text-slate-400 border border-slate-700/40 hover:bg-violet-500/10 hover:text-violet-300 hover:border-violet-500/30 transition-all"
                                    >
                                        {keyword}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Batch cycle footer */}
                    <div className="px-3 pb-3">
                        <div className="p-2.5 rounded-lg border border-amber-900/20 bg-amber-950/10 text-[9px] text-amber-200/70 leading-relaxed">
                            <AlertTriangle size={10} className="text-amber-500 inline-block mr-1" />
                            10분 배치 사이클: Tier 1 키워드 필터 → Tier 2 중복 제거 → Tier 3 AI 분석 → 시그널 표시
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
