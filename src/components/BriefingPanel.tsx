/**
 * BriefingPanel — AIP Executive Briefing Manager
 * Left: File tree of saved briefings from Firestore
 * Right: Viewer + generate button for current scenario
 * Full inline panel (replaces the old BriefingModal for ScenarioBuilder)
 */
import { useState, useEffect, useCallback } from 'react';
import {
    X, FolderOpen, FileText, ChevronRight, ChevronDown,
    Sparkles, Loader2, Trash2, Clock, Brain, Download,
    Copy, Check, ArrowLeft,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useOntologyStore } from '../store/ontologyStore';
import { useToastStore } from '../hooks/useToast';
import {
    saveBriefing,
    loadBriefings,
    deleteBriefing as deleteBriefingFirestore,
    type BriefingDoc,
} from '../services/firestoreService';
import type { AIPExecutiveBriefing, OntologyObject } from '../types';

// === BADGE COLORS (same as BriefingModal) ===
const BADGE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    Vessel: { bg: 'bg-cyan-500/15', text: 'text-cyan-300', border: 'border-cyan-500/30' },
    Port: { bg: 'bg-amber-500/15', text: 'text-amber-300', border: 'border-amber-500/30' },
    RiskEvent: { bg: 'bg-rose-500/15', text: 'text-rose-300', border: 'border-rose-500/30' },
    MarketIndicator: { bg: 'bg-emerald-500/15', text: 'text-emerald-300', border: 'border-emerald-500/30' },
    Route: { bg: 'bg-blue-500/15', text: 'text-blue-300', border: 'border-blue-500/30' },
};

interface BriefingPanelProps {
    onClose: () => void;
    scenarioName: string;
}

export default function BriefingPanel({ onClose, scenarioName }: BriefingPanelProps) {
    const [savedBriefings, setSavedBriefings] = useState<BriefingDoc[]>([]);
    const [selectedBriefingId, setSelectedBriefingId] = useState<string | null>(null);
    const [isTreeOpen, setIsTreeOpen] = useState(true);
    const [copied, setCopied] = useState(false);

    // Store
    const requestExecutiveBriefing = useOntologyStore(s => s.requestExecutiveBriefing);
    const executiveBriefing = useOntologyStore(s => s.executiveBriefing);
    const isLoading = useOntologyStore(s => s.isExecutiveBriefingLoading);
    const addToast = useToastStore(s => s.addToast);

    // Load saved briefings from Firestore
    useEffect(() => {
        loadBriefings().then(items => {
            setSavedBriefings(items);
        });
    }, []);

    // When a new briefing is generated, auto-save to Firestore
    useEffect(() => {
        if (executiveBriefing && !isLoading) {
            const docId = `briefing-${Date.now()}`;
            const doc: BriefingDoc = {
                id: docId,
                title: `AIP 브리핑 — ${scenarioName}`,
                scenarioName,
                date: new Date().toISOString(),
                briefingData: executiveBriefing as unknown as Record<string, unknown>,
            };
            saveBriefing(doc).then(() => {
                setSavedBriefings(prev => [doc, ...prev]);
                setSelectedBriefingId(docId);
                addToast(`✅ AIP 브리핑 생성 완료 (${scenarioName})`, 'success');
            });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [executiveBriefing, isLoading]);

    const handleGenerate = useCallback(() => {
        requestExecutiveBriefing();
    }, [requestExecutiveBriefing]);

    const handleDelete = async (id: string) => {
        await deleteBriefingFirestore(id);
        setSavedBriefings(prev => prev.filter(b => b.id !== id));
        if (selectedBriefingId === id) setSelectedBriefingId(null);
        addToast('브리핑 삭제됨', 'info');
    };

    // Get the currently viewed briefing data
    const viewedBriefing: AIPExecutiveBriefing | null = (() => {
        if (selectedBriefingId) {
            const doc = savedBriefings.find(b => b.id === selectedBriefingId);
            return doc?.briefingData as unknown as AIPExecutiveBriefing || null;
        }
        return executiveBriefing;
    })();

    const handleCopy = async () => {
        if (!viewedBriefing) return;
        try {
            await navigator.clipboard.writeText(JSON.stringify(viewedBriefing, null, 2));
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch { /* ignore */ }
    };

    const formatDate = (iso: string) => {
        try {
            const d = new Date(iso);
            return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        } catch { return iso; }
    };

    // ============================
    // EXECUTIVE BRIEFING RENDERER
    // ============================
    const renderBriefing = (briefing: AIPExecutiveBriefing) => {
        const trendColors: Record<string, string> = {
            up: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
            down: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
            stable: 'text-slate-300 bg-slate-700/30 border-slate-600/30',
            critical: 'text-red-400 bg-red-500/15 border-red-500/40 animate-pulse',
        };
        const trendIcons: Record<string, string> = { up: '📈', down: '📉', stable: '➡️', critical: '🔴' };
        const priorityStyles: Record<string, { color: string; bg: string; border: string; label: string }> = {
            IMMEDIATE: { color: 'text-rose-300', bg: 'bg-rose-500/10', border: 'border-rose-500/40', label: '즉시 실행' },
            SHORT_TERM: { color: 'text-amber-300', bg: 'bg-amber-500/10', border: 'border-amber-500/30', label: '단기 (1-4주)' },
            MEDIUM_TERM: { color: 'text-cyan-300', bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', label: '중기 (1-3개월)' },
        };

        return (
            <div className="space-y-8">
                {/* Market Outlook */}
                <div>
                    <div className="report-section-bar rounded-r-lg py-3 pr-4 mb-5">
                        <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-200 to-slate-100 flex items-center gap-2">
                            📊 Market Outlook — 시장 위기 평가
                        </h2>
                    </div>
                    <p className="text-slate-300 text-sm leading-relaxed mb-5">{briefing.marketOutlook.summary}</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {briefing.marketOutlook.keyMetrics.map((m, i) => (
                            <div key={i} className={cn('rounded-xl border p-4 transition-all', trendColors[m.trend])}>
                                <div className="text-[10px] uppercase tracking-wider opacity-70 mb-1">{m.label}</div>
                                <div className="text-lg font-black font-mono">{m.value}</div>
                                <div className="text-[10px] mt-1 flex items-center gap-1">
                                    <span>{trendIcons[m.trend]}</span>
                                    <span className="uppercase font-bold">{m.trend}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Financial Impact & VaR */}
                <div>
                    <div className="report-section-bar rounded-r-lg py-3 pr-4 mb-5">
                        <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-rose-200 flex items-center gap-2">
                            💰 Financial Impact & VaR
                        </h2>
                    </div>
                    <div className="bg-rose-500/5 border border-rose-500/20 rounded-xl p-5 mb-5" style={{ boxShadow: '0 0 30px rgba(239, 68, 68, 0.08)' }}>
                        <div className="text-[10px] uppercase tracking-wider text-rose-400/70 mb-1">Total Value-at-Risk (95% CI)</div>
                        <div className="text-3xl font-black text-rose-300 font-mono" style={{ textShadow: '0 0 20px rgba(239, 68, 68, 0.3)' }}>{briefing.financialImpactVaR.totalVaR}</div>
                    </div>
                    {briefing.financialImpactVaR.breakdown.length > 0 && (
                        <div className="overflow-x-auto rounded-xl border border-slate-700/50 mb-5">
                            <table className="report-table">
                                <thead><tr><th>항목</th><th>예상 금액</th><th>발생 확률</th></tr></thead>
                                <tbody>
                                    {briefing.financialImpactVaR.breakdown.map((b, i) => (
                                        <tr key={i}>
                                            <td className="font-medium">{b.item}</td>
                                            <td className="font-mono text-amber-300">{b.amount}</td>
                                            <td className="text-slate-400">{b.probability}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <p className="text-slate-400 text-sm leading-relaxed">{briefing.financialImpactVaR.assessment}</p>
                </div>

                {/* Hedging Strategies */}
                <div>
                    <div className="report-section-bar rounded-r-lg py-3 pr-4 mb-5">
                        <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-200 to-cyan-200 flex items-center gap-2">
                            🛡 Hedging Strategies — 파생상품 헤지 전략
                        </h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {briefing.hedgingStrategies.map((h, i) => (
                            <div key={i} className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-5 hover:border-emerald-500/40 transition-colors">
                                <div className="text-sm font-bold text-emerald-300 mb-2">{h.strategy}</div>
                                <div className="space-y-2 text-[11px]">
                                    <div className="flex items-start gap-2"><span className="text-slate-500 shrink-0 w-16">상품:</span><span className="text-slate-200 font-mono">{h.instrument}</span></div>
                                    <div className="flex items-start gap-2"><span className="text-slate-500 shrink-0 w-16">비율:</span><span className="text-amber-300 font-bold">{h.ratio}</span></div>
                                    <div className="flex items-start gap-2"><span className="text-slate-500 shrink-0 w-16">근거:</span><span className="text-slate-400">{h.rationale}</span></div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Operational Directives */}
                <div>
                    <div className="report-section-bar rounded-r-lg py-3 pr-4 mb-5">
                        <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-violet-200 to-rose-200 flex items-center gap-2">
                            ⚡ Operational Directives — 운영 지시사항
                        </h2>
                    </div>
                    <div className="space-y-3">
                        {briefing.operationalDirectives.map((d, i) => {
                            const ps = priorityStyles[d.priority] || priorityStyles.SHORT_TERM;
                            return (
                                <div key={i} className={cn('rounded-xl border p-5', ps.bg, ps.border)}>
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className={cn('text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border', ps.color, ps.bg, ps.border)}>{ps.label}</span>
                                        <span className="text-[10px] text-slate-500 font-mono">→ {d.responsible}</span>
                                    </div>
                                    <div className={cn('text-sm font-semibold mb-1.5', ps.color)}>{d.directive}</div>
                                    <div className="text-[11px] text-slate-400">기대 효과: {d.impact}</div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Timestamp */}
                <div className="text-[10px] text-slate-600 text-right font-mono pt-4 border-t border-slate-800/50">
                    Generated: {briefing.generatedAt} · AI Quant Strategist · Gemini Pro
                </div>
            </div>
        );
    };

    return (
        <div className="flex h-full bg-slate-950 animate-fade-in">
            {/* ======== LEFT: FILE TREE ======== */}
            <div className="w-72 shrink-0 border-r border-slate-800/50 flex flex-col bg-slate-900/50">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800/50">
                    <div className="flex items-center gap-2">
                        <Brain size={14} className="text-pink-400" />
                        <span className="text-xs font-bold text-slate-200">AIP 브리핑 보관함</span>
                    </div>
                    <button onClick={onClose} className="p-1 rounded hover:bg-slate-800 text-slate-500 hover:text-white transition-colors">
                        <X size={14} />
                    </button>
                </div>

                {/* Tree */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
                    {/* Folder node */}
                    <button
                        onClick={() => setIsTreeOpen(!isTreeOpen)}
                        className="flex items-center gap-1.5 w-full px-2 py-1.5 text-xs text-slate-300 hover:bg-slate-800/50 rounded transition-colors"
                    >
                        {isTreeOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        <FolderOpen size={13} className="text-amber-400" />
                        <span className="font-medium">📂 AIP 브리핑</span>
                        <span className="ml-auto text-[10px] text-slate-600">{savedBriefings.length}</span>
                    </button>

                    {isTreeOpen && (
                        <div className="ml-4 space-y-0.5 mt-0.5">
                            {savedBriefings.length === 0 ? (
                                <div className="text-[10px] text-slate-600 px-2 py-3">저장된 브리핑 없음</div>
                            ) : (
                                savedBriefings.map(b => (
                                    <div
                                        key={b.id}
                                        onClick={() => setSelectedBriefingId(b.id)}
                                        className={cn(
                                            'group flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-all text-xs',
                                            selectedBriefingId === b.id
                                                ? 'bg-pink-500/10 text-pink-300 border border-pink-500/20'
                                                : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 border border-transparent',
                                        )}
                                    >
                                        <FileText size={12} className={selectedBriefingId === b.id ? 'text-pink-400' : 'text-slate-600'} />
                                        <div className="flex-1 min-w-0">
                                            <div className="truncate text-[11px] font-medium">{b.scenarioName || b.title}</div>
                                            <div className="text-[9px] text-slate-600 flex items-center gap-1">
                                                <Clock size={8} />
                                                {formatDate(b.date)}
                                            </div>
                                        </div>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDelete(b.id); }}
                                            className="hidden group-hover:block p-0.5 text-slate-600 hover:text-rose-400 transition-colors"
                                        >
                                            <Trash2 size={11} />
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* ======== RIGHT: VIEWER ======== */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Top bar */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800/50 shrink-0">
                    <div className="flex items-center gap-3">
                        <Brain size={16} className="text-pink-400" />
                        <span className="text-sm font-bold text-slate-200">🧠 퀀트 전략가 브리핑</span>
                        {selectedBriefingId && (
                            <span className="text-[10px] text-slate-500 px-2 py-0.5 bg-slate-800 rounded-full">
                                {savedBriefings.find(b => b.id === selectedBriefingId)?.scenarioName || ''}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleCopy}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-medium text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-800 rounded-lg transition-colors"
                        >
                            {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                            {copied ? '복사됨' : '복사'}
                        </button>
                        <button
                            onClick={handleGenerate}
                            disabled={isLoading}
                            className={cn(
                                'flex items-center gap-1.5 px-4 py-1.5 text-[10px] font-bold rounded-lg transition-all',
                                isLoading
                                    ? 'bg-pink-500/10 text-pink-400 border border-pink-500/20 cursor-wait'
                                    : 'bg-gradient-to-r from-pink-600 to-violet-600 hover:from-pink-500 hover:to-violet-500 text-white shadow-md shadow-pink-900/30'
                            )}
                        >
                            {isLoading ? (
                                <><Loader2 size={12} className="animate-spin" /> 생성 중...</>
                            ) : (
                                <><Sparkles size={12} /> 현재 시나리오로 브리핑 생성</>
                            )}
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                    {isLoading && !viewedBriefing ? (
                        /* Skeleton Loader */
                        <div className="flex flex-col items-center justify-center h-full gap-4 animate-fade-in">
                            <div className="w-16 h-16 rounded-2xl bg-pink-500/10 flex items-center justify-center">
                                <Brain size={28} className="text-pink-400 animate-pulse" />
                            </div>
                            <p className="text-sm text-slate-400">AIP 퀀트 엔진이 온톨로지 변수를 연산 중입니다...</p>
                            <p className="text-[10px] text-slate-600">Gemini Pro · Temperature 0.2 · Strict JSON</p>
                            {/* Skeleton bars */}
                            <div className="w-full max-w-lg space-y-3 mt-4">
                                {[1, 2, 3, 4, 5].map(i => (
                                    <div key={i} className="flex items-center gap-3">
                                        <div className="w-2 h-2 rounded-full bg-cyan-500/20" />
                                        <div className="h-3 rounded-full bg-slate-800/60" style={{ width: `${60 + Math.random() * 30}%` }} />
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : viewedBriefing ? (
                        /* Render briefing */
                        <div className="max-w-3xl mx-auto animate-fade-in">
                            {/* Header */}
                            <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-800/50">
                                <div>
                                    <div className="text-[10px] uppercase tracking-widest text-pink-400 font-bold mb-1">AI QUANT STRATEGIST</div>
                                    <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-200 to-pink-200">AIP Executive Briefing</h1>
                                </div>
                                <div className="text-right">
                                    <div className="text-[10px] text-rose-400 font-bold flex items-center gap-1 justify-end">○ CONFIDENTIAL</div>
                                    <div className="text-[10px] text-slate-500 font-mono">
                                        {viewedBriefing.generatedAt ? new Date(viewedBriefing.generatedAt).toLocaleDateString('ko-KR') : ''}
                                    </div>
                                    <div className="text-[9px] text-slate-600 font-mono">Gemini Pro · T=0.2</div>
                                </div>
                            </div>
                            {renderBriefing(viewedBriefing)}
                        </div>
                    ) : (
                        /* Empty state */
                        <div className="flex flex-col items-center justify-center h-full gap-4 text-center animate-fade-in">
                            <div className="w-20 h-20 rounded-2xl bg-slate-800/50 flex items-center justify-center border border-slate-700/30">
                                <Brain size={32} className="text-slate-600" />
                            </div>
                            <div>
                                <p className="text-sm text-slate-400 mb-2">AIP 퀀트 브리핑을 선택하거나 생성하세요</p>
                                <p className="text-[10px] text-slate-600">
                                    왼쪽 파일 트리에서 기존 브리핑을 클릭하거나,<br />
                                    상단 버튼으로 현재 시나리오 기반 브리핑을 생성합니다.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
