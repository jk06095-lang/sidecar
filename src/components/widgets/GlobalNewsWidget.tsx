import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Radio, AlertCircle, Bookmark, Loader2, Zap, Shield, CheckCircle2, Sparkles, Clock, RefreshCw, ShieldAlert, FileWarning } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { IntelArticle, AppSettings, SuggestedAction } from '../../types';
import { fetchAndProcess, setBatchEvaluationHandler, getFinOpsStats, fetchOfficialSources, bootstrapHistoricalData, type FinOpsStats } from '../../services/newsService';
import { evaluateNewsSignals, triageWithFlash, escalateWithPro } from '../../services/geminiService';
import { subscribeIntelFeed, appendIntelArticles, persistIntelArticles } from '../../services/firestoreService';
import { useOntologyStore } from '../../store/ontologyStore';

// ============================================================
// CONSTANTS
// ============================================================
const POLL_INTERVAL_MS = 600_000; // 10-minute batch cycle

/** Read scrapped article URLs from localStorage — used to protect them from TTL pruning */
function getScrappedUrls(): Set<string> {
    try {
        const scraps = JSON.parse(localStorage.getItem('sidecar_scraps') || '[]');
        return new Set(scraps.map((s: { url?: string }) => s.url).filter(Boolean));
    } catch { return new Set(); }
}

const RISK_COLORS: Record<string, string> = {
    Critical: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    High: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    Medium: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
    Low: 'bg-slate-700/50 text-slate-400 border-slate-600',
};

interface GlobalNewsWidgetProps {
    onTagClick?: (tag: string) => void;
    onStatsUpdate?: (stats: FinOpsStats) => void;
    activeTab?: 'osint' | 'official';
    onCountdownUpdate?: (secondsRemaining: number) => void;
    onScrap?: (article: IntelArticle) => void;
}

export default function GlobalNewsWidget({ onTagClick, onStatsUpdate, activeTab = 'osint', onCountdownUpdate, onScrap }: GlobalNewsWidgetProps) {
    const [articles, setArticles] = useState<IntelArticle[]>([]);
    const [officialArticles, setOfficialArticles] = useState<IntelArticle[]>([]);
    const [loading, setLoading] = useState(true);
    const [officialLoading, setOfficialLoading] = useState(false);
    const [backfilling, setBackfilling] = useState(false);
    const [error, setError] = useState(false);
    const [stats, setStats] = useState<FinOpsStats>(getFinOpsStats());
    const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
    const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null);
    const initialized = useRef(false);
    const nextFetchTimeRef = useRef<number>(Date.now() + POLL_INTERVAL_MS);

    // Cloud-first feed: track new articles for "NEW" badge
    const [newArticleIds, setNewArticleIds] = useState<Set<string>>(new Set());
    const prevCountRef = useRef<number>(0);
    const feedScrollRef = useRef<HTMLDivElement>(null);

    // Ontology store for write-back
    const updateObjectProperty = useOntologyStore(s => s.updateObjectProperty);
    const triggerRippleEffect = useOntologyStore(s => s.triggerRippleEffect);
    const addIntelArticles = useOntologyStore(s => s.addIntelArticles);

    // Stable refs for callbacks — prevents useEffect re-fires on reference changes
    const addIntelArticlesRef = useRef(addIntelArticles);
    addIntelArticlesRef.current = addIntelArticles;

    // Read settings
    const getSettings = (): AppSettings => {
        try {
            return JSON.parse(localStorage.getItem('sidecar_settings') || '{}');
        } catch { return { apiKey: '', theme: 'dark', language: 'ko', osintSources: [], osintKeywords: [], persistenceThresholdMinutes: 30, persistenceMinArticles: 3, crisisKeywords: [], pollingIntervalMinutes: 10 }; }
    };

    // ============================================================
    // TIER 3 HANDLER: Called by newsService when batch is ready
    // ============================================================
    // TWO-GATE ESCALATION PIPELINE
    // Gate 1: Flash triage (ultra-low cost) → Gate 2: Pro (only if critical)
    // ============================================================
    const ontologyObjects = useOntologyStore(s => s.objects);
    const ontologyLinks = useOntologyStore(s => s.links);

    const handleBatchEvaluation = useCallback(async (batch: IntelArticle[]) => {
        if (batch.length === 0) return;

        try {
            // ── GATE 1: Flash Triage ──
            console.log(`[Gate1] 🔍 Flash triage: ${batch.length} articles`);
            const triageResult = await triageWithFlash(
                batch.map(a => ({
                    title: a.title,
                    description: a.description,
                    source: a.source,
                    publishedAt: a.publishedAt,
                }))
            );

            console.log(`[Gate1] Summary: ${triageResult.summary}`);
            console.log(`[Gate1] isCritical: ${triageResult.isCritical}`);

            // Mark all batch articles as evaluated with Flash summary
            setArticles(prev => prev.map(article => {
                if (!batch.find(b => b.id === article.id)) return article;
                return {
                    ...article,
                    aiInsight: triageResult.summary,
                    evaluated: true,
                    riskLevel: triageResult.isCritical ? 'Critical' : 'Medium',
                    impactScore: triageResult.isCritical ? 90 : 60,
                };
            }));
            // Push evaluated articles to global store for BEVI
            addIntelArticles(batch.map(a => ({
                ...a,
                evaluated: true,
                impactScore: triageResult.isCritical ? 90 : 60,
            })));

            // ── GATE 2: Pro Escalation (only if critical) ──
            if (triageResult.isCritical) {
                // Trigger scenario update on critical/high-risk feed detection
                console.info('[Gate1] 🚨 Critical feed detected → triggering scenario update');
                window.dispatchEvent(new CustomEvent('scenario_update_trigger'));

                console.log('[Gate2] 🚨 CRITICAL → Escalating to Pro for ontology update');

                const proResult = await escalateWithPro(
                    triageResult.summary,
                    { objects: ontologyObjects, links: ontologyLinks },
                );

                console.log(`[Gate2] Pro briefing received (${proResult.briefingText.length} chars)`);
                console.log(`[Gate2] Ontology updates: ${proResult.ontologyUpdates.length} nodes`);
                console.log(`[Gate2] Risk level: ${proResult.riskLevel}`);

                // Write ontology updates to store
                for (const update of proResult.ontologyUpdates) {
                    try {
                        updateObjectProperty(update.nodeId, update.propertyKey, update.newValue as string | number | boolean);
                        console.log(`  ✅ ${update.nodeTitle}: ${update.propertyKey} → ${update.newValue} (${update.reason})`);
                    } catch (err) {
                        console.warn(`  ❌ Failed to update ${update.nodeId}.${update.propertyKey}:`, err);
                    }
                }

                // Store briefing text for scenario panel
                localStorage.setItem('sidecar_crisis_briefing', JSON.stringify({
                    text: proResult.briefingText,
                    riskLevel: proResult.riskLevel,
                    impactSummary: proResult.impactSummary,
                    timestamp: new Date().toISOString(),
                    updatedNodes: proResult.ontologyUpdates.length,
                }));

                // Update article risk levels from Pro
                setArticles(prev => prev.map(article => {
                    if (!batch.find(b => b.id === article.id)) return article;
                    return {
                        ...article,
                        riskLevel: proResult.riskLevel as 'Medium' | 'High' | 'Critical',
                        aiInsight: proResult.impactSummary,
                        impactScore: proResult.riskLevel === 'Critical' ? 95 : 85,
                    };
                }));
            } else {
                console.log('[Gate2] ⏸️ Not critical — skipping Pro. Cost saved.');
            }

            const newStats = getFinOpsStats();
            setStats(newStats);
            onStatsUpdate?.(newStats);
        } catch (err) {
            console.warn('[GlobalNewsWidget] Two-gate evaluation error:', err);
        }
    }, [onStatsUpdate, updateObjectProperty, ontologyObjects, ontologyLinks, addIntelArticles]);

    useEffect(() => {
        setBatchEvaluationHandler(handleBatchEvaluation);
    }, [handleBatchEvaluation]);

    // ============================================================
    // COUNTDOWN TIMER — 1-second tick for parent component
    // ============================================================
    useEffect(() => {
        countdownTimer.current = setInterval(() => {
            const remaining = Math.max(0, Math.floor((nextFetchTimeRef.current - Date.now()) / 1000));
            onCountdownUpdate?.(remaining);
        }, 1000);
        return () => {
            if (countdownTimer.current) clearInterval(countdownTimer.current);
        };
    }, [onCountdownUpdate]);

    // ============================================================
    // CLOUD-FIRST: Background fetch → write to Firestore only
    // onSnapshot will push changes to UI automatically.
    // ============================================================
    const fetchAndMerge = useCallback(async () => {
        try {
            const settings = getSettings();
            const { passed } = await fetchAndProcess(settings.osintSources, settings.osintKeywords);

            if (passed.length > 0) {
                // Write to Firestore — onSnapshot will update UI
                await appendIntelArticles('osint', passed);
                // Push to global store for BEVI
                addIntelArticles(passed);
            }

            const newStats = getFinOpsStats();
            setStats(newStats);
            onStatsUpdate?.(newStats);
            setError(false);

            // Reset countdown
            nextFetchTimeRef.current = Date.now() + POLL_INTERVAL_MS;
        } catch (err) {
            console.warn('[GlobalNewsWidget] Fetch error (non-fatal):', err);
            // Only show error state if we have NO articles at all
            // Don't block existing feed with transient RSS errors
            setArticles(prev => {
                if (prev.length === 0) setError(true);
                return prev;
            });
        }
    }, [onStatsUpdate, addIntelArticles]);

    // Refresh official articles from API → write to Firestore
    const refreshOfficial = useCallback(async () => {
        setOfficialLoading(true);
        try {
            const results = await fetchOfficialSources();
            if (results.length > 0) {
                // Write to Firestore — onSnapshot will update UI
                await appendIntelArticles('official', results);
            }
        } catch (err) {
            console.warn('[GlobalNewsWidget] Official refresh error:', err);
        } finally {
            setOfficialLoading(false);
        }
    }, []);

    // ============================================================
    // CLOUD-FIRST INIT: onSnapshot subscription + background workers
    // 1. Subscribe to Firestore onSnapshot (instant cache display)
    // 2. If empty → backfill + fetch in background (writes to Firestore)
    // 3. Start 10-min polling (writes to Firestore)
    // onSnapshot handles ALL state updates — no direct setArticles from fetch.
    // ============================================================
    // Stable ref for fetchAndMerge — prevents useEffect dep instability
    const fetchAndMergeRef = useRef(fetchAndMerge);
    fetchAndMergeRef.current = fetchAndMerge;

    useEffect(() => {
        if (initialized.current) return;
        initialized.current = true;

        const scrappedUrls = getScrappedUrls();
        let hasReceivedData = false;

        // Step 0: Subscribe to OSINT feed via onSnapshot (instant Firestore cache)
        const unsubOsint = subscribeIntelFeed(
            'osint',
            (items) => {
                // Track new articles for "NEW" badge
                if (hasReceivedData && items.length > prevCountRef.current) {
                    const currentIds = new Set(items.map(a => a.id));
                    const freshIds = items.filter(a => !currentIds.has(a.id)).map(a => a.id);
                    if (freshIds.length > 0) {
                        setNewArticleIds(prev => {
                            const next = new Set(prev);
                            freshIds.forEach(id => next.add(id));
                            return next;
                        });
                        // Auto-clear "NEW" badge after 30 seconds
                        setTimeout(() => {
                            setNewArticleIds(prev => {
                                const next = new Set(prev);
                                freshIds.forEach(id => next.delete(id));
                                return next;
                            });
                        }, 30_000);
                        // Scroll to top to show new articles
                        feedScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                    }
                }

                setArticles(items);
                if (items.length > 0) addIntelArticlesRef.current(items);
                prevCountRef.current = items.length;

                // HAS DATA → show it immediately, done loading
                if (items.length > 0) {
                    setLoading(false);
                    setBackfilling(false);
                    setError(false);
                    hasReceivedData = true;
                    return;
                }

                // FIRST SNAPSHOT EMPTY → trigger backfill + first RSS fetch
                // Keep loading/backfilling active until populated
                if (!hasReceivedData) {
                    hasReceivedData = true;
                    setBackfilling(true);
                    setLoading(true);

                    (async () => {
                        try {
                            // Step A: Backfill historical data via Gemini
                            const historical = await bootstrapHistoricalData();
                            if (historical.length > 0) {
                                await appendIntelArticles('osint', historical);
                                addIntelArticlesRef.current(historical);
                                // onSnapshot will fire again with the new data
                            }
                        } catch (err) {
                            console.warn('[GlobalNewsWidget] Backfill error:', err);
                        }

                        // Step B: First RSS fetch
                        try {
                            await fetchAndMergeRef.current();
                        } catch (err) {
                            console.warn('[GlobalNewsWidget] First fetch error:', err);
                        }

                        // Step C: If still no articles after all attempts, stop loading
                        setBackfilling(false);
                        setLoading(false);
                    })();
                }
            },
            (err) => {
                console.error('[GlobalNewsWidget] OSINT onSnapshot error:', err);
                setError(true);
                setLoading(false);
            },
            scrappedUrls,
        );

        // Step 1: Start 10-minute background polling (writes to Firestore only)
        nextFetchTimeRef.current = Date.now() + POLL_INTERVAL_MS;
        pollTimer.current = setInterval(() => fetchAndMergeRef.current(), POLL_INTERVAL_MS);

        // Visibility-based pause: stop polling when tab is hidden (onSnapshot stays active)
        const handleVisibilityChange = () => {
            if (document.hidden) {
                if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null; }
            } else {
                // Resume polling (onSnapshot already handled real-time updates)
                fetchAndMergeRef.current();
                nextFetchTimeRef.current = Date.now() + POLL_INTERVAL_MS;
                pollTimer.current = setInterval(() => fetchAndMergeRef.current(), POLL_INTERVAL_MS);
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            unsubOsint();
            if (pollTimer.current) clearInterval(pollTimer.current);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Stable ref for refreshOfficial — prevents useEffect dep instability
    const refreshOfficialRef = useRef(refreshOfficial);
    refreshOfficialRef.current = refreshOfficial;

    // Subscribe to official feed via onSnapshot when tab switches
    useEffect(() => {
        if (activeTab !== 'official') return;

        const scrappedUrls = getScrappedUrls();
        let hasReceivedOfficial = false;
        setOfficialLoading(true);

        const unsub = subscribeIntelFeed(
            'official',
            (items) => {
                setOfficialArticles(items);

                // HAS DATA → done loading
                if (items.length > 0) {
                    setOfficialLoading(false);
                    hasReceivedOfficial = true;
                    return;
                }

                // FIRST SNAPSHOT EMPTY → fetch from API to populate Firestore
                if (!hasReceivedOfficial) {
                    hasReceivedOfficial = true;
                    console.info('[GlobalNewsWidget] 📡 Official cache empty → fetching from API...');
                    // Keep officialLoading=true while fetching
                    refreshOfficialRef.current();
                } else {
                    setOfficialLoading(false);
                }
            },
            (err) => {
                console.warn('[GlobalNewsWidget] Official onSnapshot error:', err);
                setOfficialLoading(false);
            },
            scrappedUrls,
        );

        return () => unsub();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab]);

    // ============================================================
    // WRITE-BACK: Apply suggested action to ontology
    // ============================================================
    const handleApplyAction = useCallback((article: IntelArticle) => {
        if (!article.suggestedAction) return;
        const action = article.suggestedAction;

        // 1. Update ontology property
        updateObjectProperty(action.targetNodeId, action.propertyKey, action.newValue as string | number | boolean);
        // 2. Write data lineage
        updateObjectProperty(action.targetNodeId, 'lastUpdatedBy', action.sourceRef);
        // 3. Trigger ripple effect on graph
        triggerRippleEffect(action.targetNodeId);

        // 4. Mark as acknowledged
        setOfficialArticles(prev => prev.map(a =>
            a.id === article.id ? { ...a, acknowledged: true } : a
        ));
    }, [updateObjectProperty, triggerRippleEffect]);

    const handleAcknowledge = useCallback((articleId: string) => {
        setOfficialArticles(prev => prev.map(a =>
            a.id === articleId ? { ...a, acknowledged: true } : a
        ));
    }, []);

    // Filter based on active tab
    const visibleArticles = activeTab === 'osint'
        ? articles.filter(a => !a.dropped)
        : officialArticles;

    const isLoading = activeTab === 'osint' ? (loading && !backfilling) : officialLoading;

    // Check if an article is "new" (arrived via onSnapshot in last 30s)
    const isNewArticle = useCallback((id: string) => newArticleIds.has(id), [newArticleIds]);

    if (backfilling && articles.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-cyan-500 gap-3 py-10 min-h-[200px]">
                <Loader2 className="animate-spin" size={24} />
                <span className="text-xs font-mono text-center leading-relaxed">
                    📡 Historical Intelligence Backfill...<br />
                    <span className="text-slate-500">2026-03-01 ~ 현재까지 데이터 수집 중</span>
                </span>
            </div>
        );
    }

    if (isLoading && visibleArticles.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-cyan-500 gap-3 py-10 min-h-[200px]">
                <Loader2 className="animate-spin" size={24} />
                <span className="text-xs font-mono">
                    {activeTab === 'osint' ? 'Syncing OSINT Intelligence Feed...' : '공식 기관 데이터 수집 중 (Gemini Search)...'}
                </span>
            </div>
        );
    }

    if (error && visibleArticles.length === 0 && activeTab === 'osint') {
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

        // Notify parent about the scrap
        onScrap?.(article);

        // Trigger scenario update on user scrap action
        console.info('[Scrap] 📌 User scraped article → triggering scenario update');
        window.dispatchEvent(new CustomEvent('scenario_update_trigger'));

        const btn = e.currentTarget;
        btn.classList.add('text-amber-400', 'scale-125');
        setTimeout(() => btn.classList.remove('text-amber-400', 'scale-125'), 1000);
    };

    return (
        <div className="flex flex-col h-full bg-slate-900/40 rounded-lg border border-slate-700/30 overflow-hidden group">
            {/* Header with FinOps stats */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700/50 bg-slate-800/20">
                <Radio size={14} className="text-amber-400 animate-pulse" />
                <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-widest">
                    {activeTab === 'osint' ? 'OSINT Intelligence Feed' : '공식 지침 & 안보 경보'}
                </h4>
                <span className="ml-auto flex items-center gap-1.5">
                    <button
                        onClick={() => {
                            if (activeTab === 'osint') {
                                fetchAndMerge();
                            } else {
                                refreshOfficial();
                            }
                            // Reset countdown
                            nextFetchTimeRef.current = Date.now() + POLL_INTERVAL_MS;
                        }}
                        disabled={isLoading}
                        className="px-2 py-1 rounded-md text-[10px] bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 hover:text-cyan-300 border border-cyan-500/30 transition-all flex items-center gap-1.5 disabled:opacity-50 font-bold"
                        title="최신화"
                    >
                        {isLoading ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
                        최신화
                    </button>
                    <span className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-900/30 text-emerald-400 font-mono border border-emerald-700/30">
                        {visibleArticles.filter(a => a.evaluated).length}/{visibleArticles.length} evaluated
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] bg-slate-800 text-slate-400 font-mono">LIVE</span>
                </span>
            </div>

            {/* FinOps Shield Banner (only for OSINT tab) */}
            {activeTab === 'osint' && (
                <div className="px-3 py-1.5 border-b border-slate-800/30 bg-emerald-950/10 flex items-center gap-1.5 shrink-0">
                    <Shield size={10} className="text-emerald-500 shrink-0" />
                    <span className="text-[9px] text-emerald-400/80 font-mono leading-tight truncate">
                        ⚡ FinOps Shield Active: {stats.droppedByLocalFilter + stats.droppedByDedup} filtered locally → {stats.sentToAIP} signals via AIP ({stats.apiCallCount} calls, ~{stats.costSavingsPercent}% cost saved)
                    </span>
                </div>
            )}

            {/* Official tab banner */}
            {activeTab === 'official' && (
                <div className="px-3 py-1.5 border-b border-rose-800/30 bg-rose-950/10 flex items-center gap-1.5 shrink-0">
                    <Sparkles size={10} className="text-rose-400 shrink-0" />
                    <span className="text-[9px] text-rose-400/80 font-mono leading-tight truncate">
                        🔒 Official Sources: KP&I 회람 + UKMTO/IMB 해양안보 경보 — Gemini Search Grounding
                    </span>
                </div>
            )}

            <div ref={feedScrollRef} className="flex-1 overflow-y-auto custom-scrollbar p-0 relative">
                <div className="sticky top-0 h-4 bg-gradient-to-b from-slate-900/80 to-transparent z-10 w-full pointer-events-none" />

                <div className="flex flex-col flex-1 pb-4">
                    {visibleArticles.length === 0 && !isLoading && !backfilling && (
                        <div className="text-center text-xs text-slate-500 py-10 font-mono">
                            {activeTab === 'osint'
                                ? '수집 중... 잠시 후 피드가 표시됩니다.'
                                : '공식 기관 데이터를 불러오는 중입니다... API Key가 설정되어 있는지 확인해주세요.'}
                        </div>
                    )}

                    {visibleArticles.map((article, i) => (
                        <React.Fragment key={article.id || i}>
                            {/* NEW badge for freshly arrived articles */}
                            {isNewArticle(article.id) && (
                                <div className="flex items-center gap-2 px-4 py-1 animate-pulse">
                                    <div className="h-px flex-1 bg-gradient-to-r from-cyan-500/50 to-transparent" />
                                    <span className="text-[9px] font-bold text-cyan-400 uppercase tracking-widest px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30">🆕 NEW</span>
                                    <div className="h-px flex-1 bg-gradient-to-l from-cyan-500/50 to-transparent" />
                                </div>
                            )}
                            {activeTab === 'official'
                                ? <OfficialCard
                                    article={article}
                                    onApply={handleApplyAction}
                                    onAcknowledge={handleAcknowledge}
                                    onBookmark={handleBookmark}
                                    onTagClick={onTagClick}
                                />
                                : <OSINTCard
                                    article={article}
                                    onBookmark={handleBookmark}
                                    onTagClick={onTagClick}
                                />
                            }
                        </React.Fragment>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ============================================================
// OSINT CARD — Standard news article card
// ============================================================
function OSINTCard({ article, onBookmark, onTagClick }: {
    article: IntelArticle;
    onBookmark: (e: React.MouseEvent, article: IntelArticle) => void;
    onTagClick?: (tag: string) => void;
}) {
    return (
        <div
            className="group/card relative flex items-start gap-3 p-4 hover:bg-slate-800/30 transition-all border-b border-slate-800/50 last:border-0 cursor-pointer animate-slide-down"
            onClick={() => window.open(article.url, '_blank')}
        >
            {/* Bookmark button */}
            <button
                onClick={(e) => onBookmark(e, article)}
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
                    <span className="text-[10px] text-slate-600 ml-auto shrink-0 font-mono">
                        {formatSmartTimestamp(article.publishedAt)}
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
    );
}

// ============================================================
// OFFICIAL CARD — Premium Glassmorphism Signal Triage Card
// ============================================================
function OfficialCard({ article, onApply, onAcknowledge, onBookmark, onTagClick }: {
    article: IntelArticle;
    onApply: (article: IntelArticle) => void;
    onAcknowledge: (articleId: string) => void;
    onBookmark: (e: React.MouseEvent, article: IntelArticle) => void;
    onTagClick?: (tag: string) => void;
}) {
    const isAlert = article.category === 'SECURITY_ALERT';
    const isAcknowledged = article.acknowledged;

    const accentFrom = isAlert ? 'from-rose-500/20' : 'from-amber-500/20';
    const accentTo = isAlert ? 'to-rose-900/5' : 'to-amber-900/5';
    const borderAccent = isAlert ? 'border-rose-500/30' : 'border-amber-500/30';
    const glowColor = isAlert ? 'shadow-rose-900/20' : 'shadow-amber-900/20';
    const textAccent = isAlert ? 'text-rose-300' : 'text-amber-300';
    const iconColor = isAlert ? 'text-rose-400' : 'text-amber-400';

    return (
        <div
            className={cn(
                "relative mx-3 my-2.5 rounded-xl transition-all duration-300 animate-slide-down",
                "bg-gradient-to-br", accentFrom, accentTo,
                "border", borderAccent,
                "shadow-lg", glowColor,
                "backdrop-blur-sm",
                "hover:shadow-xl hover:scale-[1.005]",
                isAcknowledged && "opacity-40 hover:opacity-60"
            )}
        >
            {/* Top accent bar */}
            <div className={cn(
                "h-0.5 rounded-t-xl",
                isAlert
                    ? "bg-gradient-to-r from-rose-500 via-rose-400 to-rose-600"
                    : "bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600"
            )} />

            {/* Acknowledged overlay */}
            {isAcknowledged && (
                <div className="absolute inset-0 flex items-center justify-center z-10 rounded-xl bg-slate-950/40 backdrop-blur-[2px]">
                    <span className="text-xs font-bold text-emerald-400 bg-emerald-950/70 px-4 py-2 rounded-full border border-emerald-500/30 flex items-center gap-2 shadow-lg shadow-emerald-900/20">
                        <CheckCircle2 size={14} /> 확인 완료
                    </span>
                </div>
            )}

            <div className="p-4">
                {/* Header row: badge + type + time */}
                <div className="flex items-center gap-2 mb-3">
                    {/* Type icon */}
                    <div className={cn(
                        "w-7 h-7 rounded-lg flex items-center justify-center shrink-0",
                        isAlert
                            ? "bg-rose-500/15 border border-rose-500/30"
                            : "bg-amber-500/15 border border-amber-500/30"
                    )}>
                        {isAlert
                            ? <ShieldAlert size={14} className="text-rose-400" />
                            : <FileWarning size={14} className="text-amber-400" />
                        }
                    </div>

                    {/* Ref + category */}
                    <div className="flex flex-col min-w-0">
                        <span className={cn("text-[10px] font-mono font-bold tracking-wider", textAccent)}>
                            {article.refNumber || 'REF-PENDING'}
                        </span>
                        <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">
                            {isAlert ? 'SECURITY ALERT' : 'OFFICIAL CIRCULAR'}
                        </span>
                    </div>

                    {/* Source + risk */}
                    <div className="ml-auto flex items-center gap-1.5 shrink-0">
                        <span className={cn(
                            "text-[9px] px-1.5 py-0.5 rounded-md border font-bold uppercase tracking-wider",
                            RISK_COLORS[article.riskLevel || 'High']
                        )}>
                            {article.riskLevel || 'HIGH'}
                        </span>
                        <span className="text-[9px] text-slate-500 font-mono">
                            {formatSmartTimestamp(article.publishedAt)}
                        </span>
                    </div>
                </div>

                {/* Source line */}
                <div className="flex items-center gap-1.5 mb-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-800/50 px-2 py-0.5 rounded-md shrink-0">
                        {article.sourceBadge} {article.source}
                    </span>
                </div>

                {/* Title */}
                <h4
                    className={cn(
                        "text-[13px] font-bold leading-snug mb-2 cursor-pointer transition-colors",
                        isAlert ? "text-rose-100 hover:text-rose-50" : "text-amber-100 hover:text-amber-50"
                    )}
                    onClick={() => window.open(article.url, '_blank')}
                >
                    {article.title}
                </h4>

                {/* Description */}
                <p className="text-[11px] text-slate-400 leading-relaxed mb-3 line-clamp-3">
                    {article.description}
                </p>

                {/* AI Insight */}
                {article.aiInsight && (
                    <div className={cn(
                        "mb-3 flex items-start gap-2 rounded-lg px-3 py-2.5",
                        isAlert
                            ? "bg-rose-950/30 border border-rose-700/20"
                            : "bg-amber-950/30 border border-amber-700/20"
                    )}>
                        <Sparkles size={12} className={cn("mt-0.5 shrink-0", iconColor)} />
                        <span className={cn("text-[11px] leading-relaxed", isAlert ? "text-rose-200/90" : "text-amber-200/90")}>
                            {article.aiInsight}
                        </span>
                    </div>
                )}

                {/* Ontology Tags */}
                {article.ontologyTags && article.ontologyTags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                        {article.ontologyTags.map(tag => (
                            <button
                                key={tag}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onTagClick?.(tag);
                                }}
                                className={cn(
                                    "text-[9px] px-2 py-0.5 rounded-full border transition-all font-medium",
                                    isAlert
                                        ? "bg-rose-900/20 text-rose-300/80 border-rose-700/30 hover:bg-rose-500/20 hover:text-rose-200"
                                        : "bg-amber-900/20 text-amber-300/80 border-amber-700/30 hover:bg-amber-500/20 hover:text-amber-200"
                                )}
                            >
                                #{tag}
                            </button>
                        ))}
                    </div>
                )}

                {/* Action Buttons */}
                {!isAcknowledged && (
                    <div className="flex items-center gap-2 pt-3 border-t border-slate-700/20">
                        {article.suggestedAction && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onApply(article);
                                }}
                                className={cn(
                                    "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all",
                                    "bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500",
                                    "text-white shadow-lg shadow-cyan-900/30 hover:shadow-cyan-800/40",
                                    "border border-cyan-400/20"
                                )}
                            >
                                <Zap size={12} />
                                Apply: {article.suggestedAction.displayLabel}
                            </button>
                        )}
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onAcknowledge(article.id);
                            }}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-slate-800/50 text-slate-300 hover:bg-slate-700/60 hover:text-slate-100 border border-slate-600/20 transition-all"
                        >
                            <CheckCircle2 size={12} />
                            확인
                        </button>
                        <button
                            onClick={(e) => onBookmark(e, article)}
                            className="p-2 text-slate-500 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-all border border-transparent hover:border-amber-500/20"
                            title="온톨로지(AI 지식베이스)에 추가하기"
                        >
                            <Bookmark size={12} />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

// ============================================================
// TIMESTAMP FORMATTING
// ============================================================

/**
 * Smart timestamp: shows "2026-03-01 14:30 KST" for old articles,
 * relative time ("3h ago") for recent ones.
 */
function formatSmartTimestamp(dateStr: string): string {
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return 'Recently';

        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffHours = diffMs / (1000 * 60 * 60);

        // For articles older than 24 hours: show absolute KST timestamp
        if (diffHours > 24) {
            const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000); // UTC→KST
            const year = kst.getUTCFullYear();
            const month = String(kst.getUTCMonth() + 1).padStart(2, '0');
            const day = String(kst.getUTCDate()).padStart(2, '0');
            const hours = String(kst.getUTCHours()).padStart(2, '0');
            const mins = String(kst.getUTCMinutes()).padStart(2, '0');
            return `${year}-${month}-${day} ${hours}:${mins} KST`;
        }

        // For recent articles: relative time
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        const hours = Math.floor(diffMins / 60);
        return `${hours}h ago`;
    } catch {
        return 'Recently';
    }
}
