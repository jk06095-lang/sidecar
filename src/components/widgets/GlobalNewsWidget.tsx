import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Radio, AlertCircle, Bookmark, Loader2, Zap, Shield } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { IntelArticle, AppSettings } from '../../types';
import { fetchAndProcess, setBatchEvaluationHandler, getFinOpsStats, type FinOpsStats } from '../../services/newsService';
import { evaluateNewsSignals } from '../../services/geminiService';

const RISK_COLORS: Record<string, string> = {
    Critical: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    High: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    Medium: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
    Low: 'bg-slate-700/50 text-slate-400 border-slate-600',
};

interface GlobalNewsWidgetProps {
    onTagClick?: (tag: string) => void;
    onStatsUpdate?: (stats: FinOpsStats) => void;
}

export default function GlobalNewsWidget({ onTagClick, onStatsUpdate }: GlobalNewsWidgetProps) {
    const [articles, setArticles] = useState<IntelArticle[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [stats, setStats] = useState<FinOpsStats>(getFinOpsStats());
    const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
    const initialized = useRef(false);

    // Read settings
    const getSettings = (): AppSettings => {
        try {
            return JSON.parse(localStorage.getItem('sidecar_settings') || '{}');
        } catch { return { apiKey: '', theme: 'dark', language: 'ko', osintSources: [], osintKeywords: [] }; }
    };

    // ============================================================
    // TIER 3 HANDLER: Called by newsService when batch is ready
    // Performs the actual LLM API call via gemini-flash
    // ============================================================
    const handleBatchEvaluation = useCallback(async (batch: IntelArticle[]) => {
        const settings = getSettings();
        if (!settings.apiKey || batch.length === 0) return;

        try {
            const evaluations = await evaluateNewsSignals(
                settings.apiKey,
                batch.map(a => ({ id: a.id, title: a.title, description: a.description, source: a.source }))
            );

            // Apply evaluations to articles
            setArticles(prev => prev.map(article => {
                const evaluation = evaluations.find(e => e.articleId === article.id);
                if (!evaluation) return article;
                return {
                    ...article,
                    impactScore: evaluation.impactScore,
                    riskLevel: evaluation.riskLevel,
                    aiInsight: evaluation.insight,
                    ontologyTags: evaluation.ontologyTags,
                    evaluated: true,
                    dropped: evaluation.dropped,
                };
            }));

            // Update stats
            const newStats = getFinOpsStats();
            setStats(newStats);
            onStatsUpdate?.(newStats);
        } catch (err) {
            console.warn('[GlobalNewsWidget] Batch evaluation error:', err);
        }
    }, [onStatsUpdate]);

    // Register batch handler with newsService
    useEffect(() => {
        setBatchEvaluationHandler(handleBatchEvaluation);
    }, [handleBatchEvaluation]);

    // Fetch and merge new articles
    const fetchAndMerge = useCallback(async () => {
        try {
            const settings = getSettings();
            const { passed } = await fetchAndProcess(settings.osintSources, settings.osintKeywords);

            if (passed.length > 0) {
                setArticles(prev => {
                    const existing = new Set(prev.map(a => a.id));
                    const truly_new = passed.filter(a => !existing.has(a.id));
                    if (truly_new.length === 0) return prev;
                    return [...truly_new, ...prev].slice(0, 50);
                });
            }

            // Update stats
            const newStats = getFinOpsStats();
            setStats(newStats);
            onStatsUpdate?.(newStats);

            setLoading(false);
            setError(false);
        } catch (err) {
            console.error('[GlobalNewsWidget] Fetch error:', err);
            setError(true);
            setLoading(false);
        }
    }, [onStatsUpdate]);

    useEffect(() => {
        if (initialized.current) return;
        initialized.current = true;

        // Initial fetch
        fetchAndMerge();

        // Poll every 60 seconds
        pollTimer.current = setInterval(fetchAndMerge, 60000);

        return () => {
            if (pollTimer.current) clearInterval(pollTimer.current);
        };
    }, [fetchAndMerge]);

    // Filter out dropped articles
    const visibleArticles = articles.filter(a => !a.dropped);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-cyan-500 gap-3 py-10 min-h-[200px]">
                <Loader2 className="animate-spin" size={24} />
                <span className="text-xs font-mono">Syncing OSINT Intelligence Feed...</span>
            </div>
        );
    }

    if (error && visibleArticles.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-rose-500 gap-2 py-10 min-h-[200px]">
                <AlertCircle size={24} />
                <span className="text-xs font-mono">Intel Feed Offline — Retrying...</span>
            </div>
        );
    }

    const handleBookmark = (e: React.MouseEvent, article: IntelArticle) => {
        e.stopPropagation();
        const currentOntology = JSON.parse(localStorage.getItem('sidecar_ontology') || '[]');
        const newEntry = {
            id: `news_${Date.now()}`,
            title: `[스크랩 뉴스] ${article.title}`,
            content: `${article.description}\n\nSource: ${article.source}\nURL: ${article.url}${article.aiInsight ? `\nAI Insight: ${article.aiInsight}` : ''}`,
            category: 'market',
            isActive: true,
            dateAdded: new Date().toISOString().split('T')[0],
        };
        localStorage.setItem('sidecar_ontology', JSON.stringify([newEntry, ...currentOntology]));

        const btn = e.currentTarget;
        btn.classList.add('text-amber-400', 'scale-125');
        setTimeout(() => btn.classList.remove('text-amber-400', 'scale-125'), 1000);
    };

    return (
        <div className="flex flex-col h-full bg-slate-900/40 rounded-lg border border-slate-700/30 overflow-hidden group">
            {/* Header with FinOps stats */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700/50 bg-slate-800/20">
                <Radio size={14} className="text-amber-400 animate-pulse" />
                <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-widest">OSINT Intelligence Feed</h4>
                <span className="ml-auto flex items-center gap-1.5">
                    <span className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-900/30 text-emerald-400 font-mono border border-emerald-700/30">
                        {visibleArticles.filter(a => a.evaluated).length}/{visibleArticles.length} evaluated
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] bg-slate-800 text-slate-400 font-mono">LIVE</span>
                </span>
            </div>

            {/* FinOps Shield Banner */}
            <div className="px-3 py-1.5 border-b border-slate-800/30 bg-emerald-950/10 flex items-center gap-1.5 shrink-0">
                <Shield size={10} className="text-emerald-500 shrink-0" />
                <span className="text-[9px] text-emerald-400/80 font-mono leading-tight truncate">
                    ⚡ FinOps Shield Active: {stats.droppedByLocalFilter + stats.droppedByDedup} filtered locally ➔ {stats.sentToAIP} signals via AIP ({stats.apiCallCount} calls, ~{stats.costSavingsPercent}% cost saved)
                </span>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-0 relative">
                <div className="sticky top-0 h-4 bg-gradient-to-b from-slate-900/80 to-transparent z-10 w-full pointer-events-none" />

                <div className="flex flex-col flex-1 pb-4">
                    {visibleArticles.length === 0 && !loading && (
                        <div className="text-center text-xs text-slate-500 py-10 font-mono">
                            수집 중... 잠시 후 피드가 표시됩니다.
                        </div>
                    )}

                    {visibleArticles.map((article, i) => (
                        <div
                            key={article.id || i}
                            className="group/card relative flex items-start gap-3 p-4 hover:bg-slate-800/30 transition-all border-b border-slate-800/50 last:border-0 cursor-pointer animate-slide-down"
                            onClick={() => window.open(article.url, '_blank')}
                        >
                            {/* Bookmark button */}
                            <button
                                onClick={(e) => handleBookmark(e, article)}
                                className="absolute right-3 top-3 opacity-100 p-1.5 text-slate-500 hover:text-amber-400 hover:bg-slate-800 rounded transition-all z-20"
                                title="온톨로지(AI 지식베이스)에 추가하기"
                            >
                                <Bookmark size={12} />
                            </button>

                            {/* Indicator dot */}
                            <div className="shrink-0 mt-1.5">
                                <div className={cn(
                                    "w-2 h-2 rounded-full",
                                    article.riskLevel === 'Critical' ? 'bg-rose-500 animate-pulse' :
                                        article.riskLevel === 'High' ? 'bg-amber-500 animate-pulse' :
                                            article.evaluated ? 'bg-cyan-400/50 border border-cyan-400' :
                                                'bg-slate-600 border border-slate-500 animate-pulse'
                                )} />
                            </div>

                            <div className="min-w-0 flex-1">
                                {/* Source + badges row */}
                                <div className="flex items-center gap-1.5 mb-1.5 flex-wrap pr-6">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-800 px-1.5 py-0.5 rounded shrink-0">
                                        {article.sourceBadge} {article.source}
                                    </span>
                                    {article.evaluated && article.riskLevel && (
                                        <span className={cn(
                                            "text-[9px] px-1.5 py-0.5 rounded-full border font-bold uppercase tracking-wider shrink-0",
                                            RISK_COLORS[article.riskLevel] || RISK_COLORS.Low
                                        )}>
                                            {article.riskLevel}
                                        </span>
                                    )}
                                    {article.evaluated && article.impactScore !== undefined && (
                                        <span className={cn(
                                            "text-[9px] px-1.5 py-0.5 rounded font-mono font-bold shrink-0",
                                            article.impactScore >= 80 ? 'bg-rose-500/20 text-rose-300' :
                                                article.impactScore >= 60 ? 'bg-amber-500/20 text-amber-300' :
                                                    'bg-slate-700/50 text-slate-400'
                                        )}>
                                            ⚡{article.impactScore}
                                        </span>
                                    )}
                                    {!article.evaluated && (
                                        <span className="text-[9px] text-slate-600 font-mono flex items-center gap-1">
                                            <Loader2 size={8} className="animate-spin" /> evaluating
                                        </span>
                                    )}
                                    <span className="text-[10px] text-slate-600 ml-auto shrink-0">
                                        {formatTimeAgo(article.publishedAt)}
                                    </span>
                                </div>

                                {/* Title */}
                                <h4 className="text-sm font-medium text-slate-200 hover:text-cyan-400 transition-colors leading-snug pr-6 mb-1">
                                    {article.title}
                                </h4>

                                {/* Description */}
                                <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                                    {article.description}
                                </p>

                                {/* AI Insight */}
                                {article.aiInsight && (
                                    <div className="mt-2 flex items-start gap-1.5 bg-cyan-950/20 border border-cyan-800/20 rounded-lg px-3 py-2">
                                        <Zap size={11} className="text-cyan-400 mt-0.5 shrink-0" />
                                        <span className="text-[11px] text-cyan-300/90 leading-relaxed">{article.aiInsight}</span>
                                    </div>
                                )}

                                {/* Ontology Tags */}
                                {article.ontologyTags && article.ontologyTags.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-2">
                                        {article.ontologyTags.map(tag => (
                                            <button
                                                key={tag}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onTagClick?.(tag);
                                                }}
                                                className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800/80 text-slate-300 border border-slate-700/50 hover:bg-cyan-500/15 hover:text-cyan-300 hover:border-cyan-500/30 transition-all font-medium"
                                            >
                                                #{tag}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function formatTimeAgo(dateStr: string): string {
    try {
        const date = new Date(dateStr);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'Just now';
        if (mins < 60) return `${mins}m ago`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        return `${days}d ago`;
    } catch {
        return 'Recently';
    }
}
