/**
 * StrategicActionPanel — Module 5: C-Level Action Wizard + Live Ticker
 *
 * Renders AI-generated hedgingStrategies + operationalDirectives from
 * AIPExecutiveBriefing as actionable items with [Execute] buttons.
 * On execution, persists audit trail via actionStore → Firestore.
 *
 * Features:
 *   - PENDING actions from actionStore rendered as glassmorphism cards
 *   - Spinner loading on execute → EXECUTED state
 *   - Toast notification via actionStore
 *   - Live ticker scrolling recent executed directives
 *   - Firestore audit trail with justificationMetrics snapshot
 */

import { useState, useCallback, useEffect } from 'react';
import { Check, Loader2, Shield, TrendingDown, Anchor, ArrowRight, Zap, Clock, Send, AlertTriangle, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { AIPExecutiveBriefing, StrategicActionLog } from '../../types';
import { useOntologyStore } from '../../store/ontologyStore';
import { useActionStore } from '../../store/actionStore';

// ============================================================
// DEPARTMENT MESSAGE GENERATORS
// ============================================================

function generateHedgingMessage(strategy: AIPExecutiveBriefing['hedgingStrategies'][0]): {
    department: string;
    message: string;
} {
    const instrument = strategy.instrument.toLowerCase();

    if (instrument.includes('ffa') || instrument.includes('freight') || instrument.includes('bdi') || instrument.includes('capesize') || instrument.includes('panamax')) {
        return {
            department: '트레이딩/재무팀 (Trading Desk)',
            message: `[긴급 트레이딩 지시]\n\n전략: ${strategy.strategy}\n상품: ${strategy.instrument}\n헤지 비율: ${strategy.ratio}\n\n지시사항:\n- 상기 파생상품에 대해 지정된 비율로 매도 포지션을 즉시 개시하십시오.\n- 체결 후 CFO 직보 및 리스크 한도 대비 노출도 업데이트 필수.\n- 근거: ${strategy.rationale}\n\n결재자: CSO / 실행 타임스탬프 포함.`,
        };
    }

    if (instrument.includes('vlsfo') || instrument.includes('bunker') || instrument.includes('oil') || instrument.includes('brent') || instrument.includes('fuel')) {
        return {
            department: '트레이딩/재무팀 (Bunker Procurement)',
            message: `[벙커유 헤지 지시]\n\n전략: ${strategy.strategy}\n상품: ${strategy.instrument}\n헤지 비율: ${strategy.ratio}\n\n지시사항:\n- 벙커유 선도계약(Forward Contract)을 상기 비율로 체결하십시오.\n- 현물 대비 프리미엄/디스카운트 확인 후 최적 타이밍 실행.\n- 근거: ${strategy.rationale}\n\n결재자: CFO / 실행 타임스탬프 포함.`,
        };
    }

    return {
        department: '트레이딩/재무팀 (Risk Management)',
        message: `[리스크 헤지 지시]\n\n전략: ${strategy.strategy}\n상품: ${strategy.instrument}\n비율: ${strategy.ratio}\n근거: ${strategy.rationale}\n\n지정된 비율에 따라 포지션을 개시하고, 체결 후 리스크관리팀에 보고하십시오.`,
    };
}

function generateOperationalMessage(directive: AIPExecutiveBriefing['operationalDirectives'][0]): {
    department: string;
    message: string;
} {
    const text = directive.directive.toLowerCase();

    if (text.includes('우회') || text.includes('경로') || text.includes('항로') || text.includes('route') || text.includes('희망봉') || text.includes('cape')) {
        return {
            department: '운항팀 (Fleet Operations)',
            message: `[선박 경로 우회 지시]\n\n지시: ${directive.directive}\n우선순위: ${directive.priority}\n담당: ${directive.responsible}\n\n지시사항:\n- 해당 선박의 항로를 즉시 변경하십시오.\n- 변경 후 예상 도착일 및 추가 연료비를 산출하여 보고.\n- 선원 안전 및 화물 일정 영향 평가 필수.\n- 기대 효과: ${directive.impact}\n\n결재자: COO / 실행 즉시 AIS 모니터링 개시.`,
        };
    }

    if (text.includes('속력') || text.includes('slow') || text.includes('steaming') || text.includes('연료')) {
        return {
            department: '운항팀 (Vessel Performance)',
            message: `[운항 속도 조정 지시]\n\n지시: ${directive.directive}\n우선순위: ${directive.priority}\n담당: ${directive.responsible}\n\n지시사항:\n- 지정 선박의 운항 속도를 조정하십시오.\n- 연료 절감 효과 및 일정 영향 평가 보고.\n- 기대 효과: ${directive.impact}\n\n결재자: COO`,
        };
    }

    return {
        department: `${directive.responsible} (Operations)`,
        message: `[운영 지시]\n\n지시: ${directive.directive}\n우선순위: ${directive.priority}\n담당: ${directive.responsible}\n기대 효과: ${directive.impact}\n\n상기 지시사항을 즉시 이행하고 결과를 보고하십시오.`,
    };
}

// ============================================================
// COMPONENT PROPS
// ============================================================

interface StrategicActionPanelProps {
    briefing: AIPExecutiveBriefing;
    scenarioName?: string;
}

// ============================================================
// COMPONENT
// ============================================================

export default function StrategicActionPanel({ briefing, scenarioName = 'Current Scenario' }: StrategicActionPanelProps) {
    const [executedIds, setExecutedIds] = useState<Set<string>>(new Set());
    const [executingId, setExecutingId] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const lsegQuantMetrics = useOntologyStore((s) => s.lsegQuantMetrics);
    const dynamicFleetData = useOntologyStore((s) => s.dynamicFleetData);

    // actionStore subscriptions
    const dispatchActions = useActionStore((s) => s.dispatchActions);
    const executeAction = useActionStore((s) => s.executeAction);
    const pendingActions = useActionStore((s) => s.pendingActions);
    const executedActions = useActionStore((s) => s.executedActions);
    const toasts = useActionStore((s) => s.toasts);
    const dismissToast = useActionStore((s) => s.dismissToast);

    // Build justification metrics snapshot
    const buildJustification = useCallback(() => {
        const vlsfo = lsegQuantMetrics['VLSFO380'] || lsegQuantMetrics['LCOc1'] || lsegQuantMetrics['BZ=F'];
        const bdi = lsegQuantMetrics['BADI'] || lsegQuantMetrics['^BDIY'];
        const riskAlertCount = Object.values(lsegQuantMetrics).filter(m => m.riskAlert).length;
        const highRiskVesselCount = dynamicFleetData.filter(
            v => v.derivedRiskLevel === 'CRITICAL' || v.derivedRiskLevel === 'WARNING'
        ).length;

        return {
            scenarioName,
            vlsfoZScore: vlsfo?.zScore,
            bdiZScore: bdi?.zScore,
            volatility30d: vlsfo?.volatility30d,
            riskAlertCount,
            highRiskVesselCount,
        };
    }, [lsegQuantMetrics, dynamicFleetData, scenarioName]);

    const handleExecute = useCallback(async (
        id: string,
        type: 'HEDGING' | 'OPERATIONAL',
        title: string,
        detail: string,
        departmentMessage: string,
        targetDepartment: string,
    ) => {
        setExecutingId(id);

        // Build audit action log
        const actionLog: StrategicActionLog = {
            id: `sal-${Date.now()}-${id}`,
            actionType: type,
            description: title,
            status: 'PENDING',
            approvedBy: 'CSO (Chief Strategy Officer)',
            timestamp: new Date().toISOString(),
            justificationMetrics: buildJustification(),
            targetDepartment,
            departmentMessage,
        };

        // Dispatch to actionStore → fires Firestore audit + toast
        dispatchActions([actionLog]);
        await executeAction(actionLog.id);

        setExecutedIds(prev => new Set(prev).add(id));
        setExecutingId(null);
        setExpandedId(id);
    }, [buildJustification, dispatchActions, executeAction]);

    const priorityColors: Record<string, { badge: string; text: string }> = {
        IMMEDIATE: { badge: 'bg-rose-500/20 text-rose-300 border-rose-500/40', text: 'text-rose-300' },
        SHORT_TERM: { badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40', text: 'text-amber-300' },
        MEDIUM_TERM: { badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40', text: 'text-cyan-300' },
    };

    return (
        <div className="mt-10 pt-8 border-t-2 border-dashed border-violet-500/30 relative">
            {/* ════════════ LIVE TICKER — Recent Executed Directives  ════════════ */}
            {executedActions.length > 0 && (
                <div className="mb-6 bg-slate-950/80 border border-amber-500/20 rounded-lg overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/5 border-b border-amber-500/10">
                        <AlertTriangle size={10} className="text-amber-400 shrink-0" />
                        <span className="text-[9px] font-black text-amber-400 uppercase tracking-wider">경영진 긴급 지시 발령</span>
                    </div>
                    <div className="overflow-hidden relative h-7 flex items-center">
                        <div className="ticker-scroll flex items-center gap-8 px-3 whitespace-nowrap">
                            {executedActions.slice(0, 5).map((a) => (
                                <span key={a.id} className="text-[10px] text-slate-300 font-mono flex items-center gap-1.5 shrink-0">
                                    <span className="text-amber-400">🚨</span>
                                    <span className="text-emerald-400 font-bold">[{a.targetDepartment}]</span>
                                    <span>{a.description}</span>
                                    <span className="text-slate-500">
                                        ({new Date(a.timestamp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })})
                                    </span>
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Section Header */}
            <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500/20 to-amber-500/20 border border-rose-500/30 flex items-center justify-center">
                    <Zap size={22} className="text-rose-400" />
                </div>
                <div>
                    <h3 className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-rose-200 to-amber-200">
                        C-Level Action Wizard
                    </h3>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider">
                        AI 도출 전략 → 임원 승인 → 원클릭 지시 하달 → Firestore 감사 로그
                    </p>
                </div>
                {pendingActions.length > 0 && (
                    <span className="ml-auto text-[9px] bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold animate-pulse">
                        {pendingActions.length} PENDING
                    </span>
                )}
            </div>

            {/* Hedging Strategies Section */}
            {briefing.hedgingStrategies.length > 0 && (
                <div className="mb-8">
                    <div className="flex items-center gap-2 mb-4">
                        <TrendingDown size={14} className="text-emerald-400" />
                        <h4 className="text-sm font-bold text-emerald-300">파생상품 헤지 전략</h4>
                        <span className="text-[9px] text-slate-500 font-mono ml-1">{briefing.hedgingStrategies.length}건</span>
                    </div>
                    <div className="space-y-3">
                        {briefing.hedgingStrategies.map((h, i) => {
                            const itemId = `hedge-${i}`;
                            const isExecuted = executedIds.has(itemId);
                            const isExecuting = executingId === itemId;
                            const isExpanded = expandedId === itemId;
                            const msg = generateHedgingMessage(h);

                            return (
                                <div key={itemId} className={cn(
                                    'rounded-xl border transition-all',
                                    isExecuted
                                        ? 'bg-emerald-500/5 border-emerald-500/30'
                                        : 'bg-slate-900/50 border-slate-700/40 hover:border-emerald-500/30'
                                )}>
                                    <div className="p-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-bold text-emerald-300 mb-1">{h.strategy}</div>
                                                <div className="text-[10px] text-slate-400 space-y-0.5">
                                                    <div><span className="text-slate-500">상품:</span> <span className="font-mono text-slate-300">{h.instrument}</span></div>
                                                    <div><span className="text-slate-500">비율:</span> <span className="font-bold text-amber-300">{h.ratio}</span></div>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleExecute(itemId, 'HEDGING', h.strategy, `${h.instrument} / ${h.ratio}`, msg.message, msg.department)}
                                                disabled={isExecuted || isExecuting}
                                                title="승인 및 실행"
                                                className={cn(
                                                    'shrink-0 flex items-center gap-1.5 px-4 py-2 text-[11px] font-bold rounded-lg transition-all',
                                                    isExecuted
                                                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 cursor-default'
                                                        : isExecuting
                                                            ? 'bg-slate-700/50 text-slate-400 cursor-wait'
                                                            : 'bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white shadow-lg shadow-emerald-900/20'
                                                )}
                                            >
                                                {isExecuted ? (
                                                    <><Check size={12} /> 실행 완료</>
                                                ) : isExecuting ? (
                                                    <><Loader2 size={12} className="animate-spin" /> 저장 중...</>
                                                ) : (
                                                    <><Zap size={12} /> 승인 및 실행</>
                                                )}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Expanded: Department message */}
                                    {isExpanded && isExecuted && (
                                        <div className="mx-4 mb-4 p-3 bg-slate-950/70 rounded-lg border border-emerald-500/20 animate-fade-in">
                                            <div className="flex items-center gap-1.5 mb-2">
                                                <Shield size={10} className="text-emerald-400" />
                                                <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-wider">→ {msg.department}</span>
                                            </div>
                                            <pre className="text-[10px] text-slate-300 whitespace-pre-wrap font-mono leading-relaxed">{msg.message}</pre>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Operational Directives Section */}
            {briefing.operationalDirectives.length > 0 && (
                <div>
                    <div className="flex items-center gap-2 mb-4">
                        <Anchor size={14} className="text-violet-400" />
                        <h4 className="text-sm font-bold text-violet-300">운영 지시사항</h4>
                        <span className="text-[9px] text-slate-500 font-mono ml-1">{briefing.operationalDirectives.length}건</span>
                    </div>
                    <div className="space-y-3">
                        {briefing.operationalDirectives.map((d, i) => {
                            const itemId = `op-${i}`;
                            const isExecuted = executedIds.has(itemId);
                            const isExecuting = executingId === itemId;
                            const isExpanded = expandedId === itemId;
                            const msg = generateOperationalMessage(d);
                            const ps = priorityColors[d.priority] || priorityColors.SHORT_TERM;

                            return (
                                <div key={itemId} className={cn(
                                    'rounded-xl border transition-all',
                                    isExecuted
                                        ? 'bg-violet-500/5 border-violet-500/30'
                                        : 'bg-slate-900/50 border-slate-700/40 hover:border-violet-500/30'
                                )}>
                                    <div className="p-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1.5">
                                                    <span className={cn('text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border', ps.badge)}>
                                                        {d.priority === 'IMMEDIATE' ? '즉시' : d.priority === 'SHORT_TERM' ? '단기' : '중기'}
                                                    </span>
                                                    <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                                                        <ArrowRight size={8} /> {d.responsible}
                                                    </span>
                                                </div>
                                                <div className={cn('text-sm font-semibold mb-0.5', ps.text)}>{d.directive}</div>
                                                <div className="text-[10px] text-slate-500">기대 효과: {d.impact}</div>
                                            </div>
                                            <button
                                                onClick={() => handleExecute(itemId, 'OPERATIONAL', d.directive, d.impact, msg.message, msg.department)}
                                                disabled={isExecuted || isExecuting}
                                                title="승인 및 지시 하달"
                                                className={cn(
                                                    'shrink-0 flex items-center gap-1.5 px-4 py-2 text-[11px] font-bold rounded-lg transition-all',
                                                    isExecuted
                                                        ? 'bg-violet-500/10 text-violet-400 border border-violet-500/30 cursor-default'
                                                        : isExecuting
                                                            ? 'bg-slate-700/50 text-slate-400 cursor-wait'
                                                            : 'bg-gradient-to-r from-violet-600 to-rose-600 hover:from-violet-500 hover:to-rose-500 text-white shadow-lg shadow-violet-900/20'
                                                )}
                                            >
                                                {isExecuted ? (
                                                    <><Check size={12} /> 실행 완료</>
                                                ) : isExecuting ? (
                                                    <><Loader2 size={12} className="animate-spin" /> 저장 중...</>
                                                ) : (
                                                    <><Zap size={12} /> 승인 및 실행</>
                                                )}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Expanded: Department message */}
                                    {isExpanded && isExecuted && (
                                        <div className="mx-4 mb-4 p-3 bg-slate-950/70 rounded-lg border border-violet-500/20 animate-fade-in">
                                            <div className="flex items-center gap-1.5 mb-2">
                                                <Shield size={10} className="text-violet-400" />
                                                <span className="text-[9px] font-bold text-violet-400 uppercase tracking-wider">→ {msg.department}</span>
                                            </div>
                                            <pre className="text-[10px] text-slate-300 whitespace-pre-wrap font-mono leading-relaxed">{msg.message}</pre>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Execution Summary */}
            {executedIds.size > 0 && (
                <div className="mt-6 p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
                    <div className="flex items-center gap-2 text-[10px]">
                        <Check size={12} className="text-emerald-400" />
                        <span className="text-emerald-300 font-bold">
                            {executedIds.size}건 실행 완료
                        </span>
                        <span className="text-slate-500">· Firestore strategic_action_logs 감사 로그 저장됨</span>
                        <Clock size={10} className="text-slate-500 ml-auto" />
                        <span className="text-slate-500 font-mono">{new Date().toLocaleTimeString('ko-KR')}</span>
                    </div>
                </div>
            )}

            {/* ════════════ TOAST NOTIFICATIONS — Fixed bottom ════════════ */}
            {toasts.length > 0 && (
                <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 max-w-md">
                    {toasts.map((toast) => (
                        <div
                            key={toast.id}
                            className="bg-slate-900/95 border border-emerald-500/30 rounded-xl p-4 shadow-2xl shadow-emerald-900/20 backdrop-blur-lg animate-slide-up flex items-start gap-3"
                        >
                            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                                <Check size={16} className="text-emerald-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-[11px] text-emerald-300 font-semibold leading-relaxed">{toast.message}</p>
                                <p className="text-[9px] text-slate-500 mt-1 font-mono">
                                    {new Date(toast.timestamp).toLocaleTimeString('ko-KR')} · Firestore 감사 로그 저장 완료
                                </p>
                            </div>
                            <button
                                onClick={() => dismissToast(toast.id)}
                                className="shrink-0 text-slate-500 hover:text-slate-300 transition-colors"
                                title="닫기"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Ticker scrolling CSS */}
            <style>{`
                @keyframes ticker-scroll {
                    0% { transform: translateX(0); }
                    100% { transform: translateX(-50%); }
                }
                .ticker-scroll {
                    animation: ticker-scroll 20s linear infinite;
                }
                .ticker-scroll:hover {
                    animation-play-state: paused;
                }
            `}</style>
        </div>
    );
}
