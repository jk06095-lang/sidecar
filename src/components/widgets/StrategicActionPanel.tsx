/**
 * StrategicActionPanel — Phase 4: AI Strategy Cards + Approval Pipeline
 *
 * Renders AI-proposed strategies with:
 *   - Confidence badge (AI 신뢰도)
 *   - Financial impact indicator (USD delta)
 *   - 3-state lifecycle stepper (DRAFT → PENDING_APPROVAL → EXECUTED)
 *   - "결재 요청" / "결재 승인" action buttons
 *   - Live ticker for executed directives
 *   - Toast notifications
 */

import { useState, useCallback } from 'react';
import {
    Check, Loader2, Shield, TrendingDown, Anchor, ArrowRight, Zap, Clock,
    AlertTriangle, X, DollarSign, Target, Sparkles, ChevronDown, ChevronUp,
    FileCheck, Send, Ban, Ship,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import type { AIPExecutiveBriefing, StrategicActionLog } from '../../types';
import { useOntologyStore } from '../../store/ontologyStore';
import { useActionStore } from '../../store/actionStore';

// ============================================================
// SUB: Confidence Badge
// ============================================================
function ConfidenceBadge({ confidence }: { confidence: number }) {
    const level = confidence >= 0.8 ? 'HIGH' : confidence >= 0.5 ? 'MEDIUM' : 'LOW';
    const colors = {
        HIGH: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
        MEDIUM: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
        LOW: 'bg-rose-500/15 text-rose-300 border-rose-500/40',
    };
    return (
        <span className={cn('text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border flex items-center gap-1', colors[level])}>
            <Sparkles size={8} />
            AI {level} {Math.round(confidence * 100)}%
        </span>
    );
}

// ============================================================
// SUB: Financial Impact Indicator
// ============================================================
function FinancialImpact({ amount }: { amount: number }) {
    const isPositive = amount >= 0;
    const formatted = Math.abs(amount) >= 1000
        ? `$${(Math.abs(amount) / 1000).toFixed(1)}k`
        : `$${Math.abs(amount).toLocaleString()}`;
    return (
        <span className={cn('text-[10px] font-mono font-bold flex items-center gap-0.5', isPositive ? 'text-emerald-400' : 'text-rose-400')}>
            <DollarSign size={10} />
            {isPositive ? '+' : '-'}{formatted}
        </span>
    );
}

// ============================================================
// SUB: Status Stepper
// ============================================================
function StatusStepper({ status, progress }: { status: string; progress?: number }) {
    const steps = ['DRAFT', 'PENDING_APPROVAL', 'EXECUTED'];
    const currentIdx = steps.indexOf(status);
    return (
        <div className="flex items-center gap-1">
            {steps.map((step, i) => {
                const isComplete = i < currentIdx || (i === currentIdx && status === 'EXECUTED');
                const isCurrent = i === currentIdx && status !== 'EXECUTED';
                const label = step === 'DRAFT' ? '초안' : step === 'PENDING_APPROVAL' ? '결재중' : '실행됨';
                return (
                    <div key={step} className="flex items-center gap-1">
                        {i > 0 && <div className={cn('w-3 h-px', isComplete ? 'bg-emerald-500' : 'bg-slate-700')} />}
                        <div className="flex items-center gap-0.5">
                            <div className={cn(
                                'w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-bold',
                                isComplete ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                                    : isCurrent ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 animate-pulse'
                                        : 'bg-slate-800 text-slate-600 border border-slate-700'
                            )}>
                                {isComplete ? <Check size={8} /> : (i + 1)}
                            </div>
                            <span className={cn('text-[7px] uppercase tracking-wider font-bold',
                                isComplete ? 'text-emerald-400' : isCurrent ? 'text-amber-400' : 'text-slate-600'
                            )}>{label}</span>
                        </div>
                    </div>
                );
            })}
            {status === 'PENDING_APPROVAL' && progress !== undefined && progress > 0 && progress < 100 && (
                <div className="ml-2 w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
                </div>
            )}
        </div>
    );
}

// ============================================================
// DEPARTMENT MESSAGE GENERATORS (kept from original)
// ============================================================

function generateHedgingMessage(strategy: AIPExecutiveBriefing['hedgingStrategies'][0]): { department: string; message: string } {
    const instrument = strategy.instrument.toLowerCase();
    if (instrument.includes('ffa') || instrument.includes('freight') || instrument.includes('bdi')) {
        return {
            department: '트레이딩/재무팀 (Trading Desk)',
            message: `[긴급 트레이딩 지시]\n\n전략: ${strategy.strategy}\n상품: ${strategy.instrument}\n헤지 비율: ${strategy.ratio}\n\n지시사항:\n- 상기 파생상품에 대해 지정된 비율로 매도 포지션을 즉시 개시하십시오.\n- 체결 후 CFO 직보 및 리스크 한도 대비 노출도 업데이트 필수.\n- 근거: ${strategy.rationale}\n\n결재자: CSO / 실행 타임스탬프 포함.`,
        };
    }
    if (instrument.includes('vlsfo') || instrument.includes('bunker') || instrument.includes('oil') || instrument.includes('brent')) {
        return {
            department: '트레이딩/재무팀 (Bunker Procurement)',
            message: `[벙커유 헤지 지시]\n\n전략: ${strategy.strategy}\n상품: ${strategy.instrument}\n헤지 비율: ${strategy.ratio}\n\n지시사항:\n- 벙커유 선도계약(Forward Contract)을 상기 비율로 체결하십시오.\n- 근거: ${strategy.rationale}\n\n결재자: CFO`,
        };
    }
    return {
        department: '트레이딩/재무팀 (Risk Management)',
        message: `[리스크 헤지 지시]\n\n전략: ${strategy.strategy}\n상품: ${strategy.instrument}\n비율: ${strategy.ratio}\n근거: ${strategy.rationale}`,
    };
}

function generateOperationalMessage(directive: AIPExecutiveBriefing['operationalDirectives'][0]): { department: string; message: string } {
    const text = directive.directive.toLowerCase();
    if (text.includes('우회') || text.includes('경로') || text.includes('항로') || text.includes('희망봉')) {
        return {
            department: '운항팀 (Fleet Operations)',
            message: `[선박 경로 우회 지시]\n\n지시: ${directive.directive}\n우선순위: ${directive.priority}\n담당: ${directive.responsible}\n기대 효과: ${directive.impact}\n\n결재자: COO`,
        };
    }
    if (text.includes('속력') || text.includes('slow') || text.includes('steaming')) {
        return {
            department: '운항팀 (Vessel Performance)',
            message: `[운항 속도 조정 지시]\n\n지시: ${directive.directive}\n우선순위: ${directive.priority}\n담당: ${directive.responsible}\n기대 효과: ${directive.impact}\n\n결재자: COO`,
        };
    }
    return {
        department: `${directive.responsible} (Operations)`,
        message: `[운영 지시]\n\n지시: ${directive.directive}\n우선순위: ${directive.priority}\n담당: ${directive.responsible}\n기대 효과: ${directive.impact}`,
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
// MAIN COMPONENT
// ============================================================

export default function StrategicActionPanel({ briefing, scenarioName = 'Current Scenario' }: StrategicActionPanelProps) {
    const [executingId, setExecutingId] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [approvalWizardId, setApprovalWizardId] = useState<string | null>(null);
    const [approverName, setApproverName] = useState('CSO (Chief Strategy Officer)');

    const lsegQuantMetrics = useOntologyStore(s => s.lsegQuantMetrics);
    const dynamicFleetData = useOntologyStore(s => s.dynamicFleetData);

    // actionStore
    const dispatchActions = useActionStore(s => s.dispatchActions);
    const submitForApproval = useActionStore(s => s.submitForApproval);
    const approveAndExecute = useActionStore(s => s.approveAndExecute);
    const rejectAction = useActionStore(s => s.rejectAction);
    const draftActions = useActionStore(s => s.draftActions);
    const pendingApproval = useActionStore(s => s.pendingApproval);
    const executedActions = useActionStore(s => s.executedActions);
    const toasts = useActionStore(s => s.toasts);
    const dismissToast = useActionStore(s => s.dismissToast);

    const allPending = [...draftActions, ...pendingApproval];

    const buildJustification = useCallback(() => {
        const vlsfo = lsegQuantMetrics['VLSFO380'] || lsegQuantMetrics['LCOc1'] || lsegQuantMetrics['BZ=F'];
        const bdi = lsegQuantMetrics['BADI'] || lsegQuantMetrics['^BDIY'];
        const riskAlertCount = Object.values(lsegQuantMetrics).filter(m => m.riskAlert).length;
        const highRiskVesselCount = dynamicFleetData.filter(
            v => v.derivedRiskLevel === 'CRITICAL' || v.derivedRiskLevel === 'WARNING'
        ).length;
        return { scenarioName, vlsfoZScore: vlsfo?.zScore, bdiZScore: bdi?.zScore, volatility30d: vlsfo?.volatility30d, riskAlertCount, highRiskVesselCount };
    }, [lsegQuantMetrics, dynamicFleetData, scenarioName]);

    // Dispatch a briefing action as DRAFT
    const handleDispatchDraft = useCallback((
        id: string, type: 'HEDGING' | 'OPERATIONAL', title: string, detail: string,
        departmentMessage: string, targetDepartment: string, confidence?: number, impactUsd?: number,
    ) => {
        const actionLog: StrategicActionLog = {
            id: `sal-${Date.now()}-${id}`,
            actionType: type,
            description: title,
            status: 'DRAFT',
            approvedBy: '',
            timestamp: new Date().toISOString(),
            justificationMetrics: buildJustification(),
            targetDepartment,
            departmentMessage,
            confidence: confidence ?? 0.7,
            estimatedImpactUsd: impactUsd ?? 0,
            approvalProgress: 0,
        };
        dispatchActions([actionLog]);
    }, [buildJustification, dispatchActions]);

    // Handle 3-step approval
    const handleApprove = useCallback(async (id: string) => {
        setExecutingId(id);
        await approveAndExecute(id, approverName);
        setExecutingId(null);
        setApprovalWizardId(null);
        setExpandedId(id);
    }, [approveAndExecute, approverName]);

    const priorityColors: Record<string, { badge: string; text: string }> = {
        IMMEDIATE: { badge: 'bg-rose-500/20 text-rose-300 border-rose-500/40', text: 'text-rose-300' },
        SHORT_TERM: { badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40', text: 'text-amber-300' },
        MEDIUM_TERM: { badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40', text: 'text-cyan-300' },
    };

    // Render an action card (works for both hedging and operational)
    const renderActionCard = (
        itemId: string, type: 'HEDGING' | 'OPERATIONAL',
        title: string, subtitle: string, priority: string,
        msg: { department: string; message: string },
        confidence?: number, impactUsd?: number,
    ) => {
        // Check if already in store
        const storeAction = [...draftActions, ...pendingApproval, ...executedActions].find(
            a => a.description === title || a.id.includes(itemId)
        );
        const status = storeAction?.status || 'NEW';
        const isExecuted = status === 'EXECUTED';
        const isPending = status === 'PENDING_APPROVAL';
        const isDraft = status === 'DRAFT';
        const isExecuting = executingId === (storeAction?.id || itemId);
        const isExpanded = expandedId === (storeAction?.id || itemId);
        const isApprovalWizard = approvalWizardId === (storeAction?.id || itemId);
        const accentColor = type === 'HEDGING' ? 'emerald' : 'violet';
        const ps = priorityColors[priority] || priorityColors.SHORT_TERM;
        const conf = storeAction?.confidence ?? confidence ?? 0.7;
        const impact = storeAction?.estimatedImpactUsd ?? impactUsd ?? 0;

        return (
            <div key={itemId} className={cn(
                'rounded-xl border transition-all',
                isExecuted ? `bg-${accentColor}-500/5 border-${accentColor}-500/30`
                    : isPending ? 'bg-amber-950/10 border-amber-500/30'
                        : `bg-slate-900/50 border-slate-700/40 hover:border-${accentColor}-500/30`
            )}>
                <div className="p-4">
                    {/* Top: Status stepper + Confidence */}
                    <div className="flex items-center justify-between mb-2">
                        <StatusStepper status={status === 'NEW' ? 'DRAFT' : status} progress={storeAction?.approvalProgress} />
                        <div className="flex items-center gap-2">
                            <ConfidenceBadge confidence={conf} />
                            {impact !== 0 && <FinancialImpact amount={impact} />}
                        </div>
                    </div>

                    {/* Title row */}
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                                {priority && (
                                    <span className={cn('text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border', ps.badge)}>
                                        {priority === 'IMMEDIATE' ? '즉시' : priority === 'SHORT_TERM' ? '단기' : '중기'}
                                    </span>
                                )}
                                <span className={cn('text-[10px] text-slate-500 font-mono flex items-center gap-1')}>
                                    {type === 'HEDGING' ? <TrendingDown size={8} /> : <Anchor size={8} />}
                                    {type === 'HEDGING' ? '헤지' : '운영'}
                                </span>
                            </div>
                            <div className={cn('text-sm font-semibold mb-0.5', isExecuted ? `text-${accentColor}-300` : ps.text)}>{title}</div>
                            <div className="text-[10px] text-slate-500">{subtitle}</div>
                        </div>

                        {/* Action Buttons — depends on status */}
                        <div className="shrink-0 flex flex-col gap-1.5">
                            {status === 'NEW' && (
                                <button
                                    onClick={() => handleDispatchDraft(itemId, type, title, subtitle, msg.message, msg.department, conf, impact)}
                                    title="초안 작성"
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold rounded-lg bg-slate-700/50 text-slate-300 hover:bg-slate-600/50 transition-colors"
                                >
                                    <FileCheck size={10} /> 초안 추가
                                </button>
                            )}
                            {isDraft && storeAction && (
                                <button
                                    onClick={() => { submitForApproval(storeAction.id); setApprovalWizardId(storeAction.id); }}
                                    title="결재 요청"
                                    className={cn('flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold rounded-lg transition-colors',
                                        `bg-gradient-to-r from-${accentColor}-600 to-cyan-600 hover:from-${accentColor}-500 hover:to-cyan-500 text-white shadow-lg`
                                    )}
                                >
                                    <Send size={10} /> 결재 요청
                                </button>
                            )}
                            {isPending && storeAction && !isApprovalWizard && (
                                <button
                                    onClick={() => setApprovalWizardId(storeAction.id)}
                                    title="결재 승인"
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold rounded-lg bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white shadow-lg animate-pulse"
                                >
                                    <Zap size={10} /> 결재 승인
                                </button>
                            )}
                            {isExecuted && (
                                <span className="flex items-center gap-1 px-3 py-1.5 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
                                    <Check size={10} /> 실행 완료
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Approval Wizard Inline */}
                {isApprovalWizard && isPending && storeAction && (
                    <div className="mx-4 mb-4 p-4 bg-slate-950/80 rounded-xl border border-amber-500/20 animate-fade-in space-y-3">
                        <div className="flex items-center gap-2 text-[10px] font-bold text-amber-400 uppercase tracking-wider">
                            <Shield size={12} /> 결재 승인 프로세스
                        </div>
                        <div className="space-y-2">
                            <label className="block text-[9px] text-slate-500 uppercase tracking-widest">결재자</label>
                            <input
                                type="text"
                                value={approverName}
                                onChange={e => setApproverName(e.target.value)}
                                className="w-full bg-slate-800/80 border border-slate-700/60 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                            />
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => handleApprove(storeAction.id)}
                                disabled={isExecuting}
                                className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-bold rounded-lg bg-gradient-to-r from-emerald-600 to-cyan-600 text-white hover:from-emerald-500 disabled:opacity-50"
                            >
                                {isExecuting ? <><Loader2 size={12} className="animate-spin" /> 실행 중...</> : <><Check size={12} /> 승인 및 실행</>}
                            </button>
                            <button
                                onClick={() => { rejectAction(storeAction.id, approverName); setApprovalWizardId(null); }}
                                className="px-4 py-2 text-[11px] font-bold rounded-lg bg-rose-900/30 text-rose-400 border border-rose-700/30 hover:bg-rose-900/50"
                            >
                                <Ban size={12} />
                            </button>
                        </div>
                        {storeAction.approvalProgress !== undefined && storeAction.approvalProgress > 0 && (
                            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                                <div className="h-full bg-gradient-to-r from-amber-500 to-emerald-500 rounded-full transition-all duration-100" style={{ width: `${storeAction.approvalProgress}%` }} />
                            </div>
                        )}
                    </div>
                )}

                {/* Expanded department message */}
                {isExpanded && isExecuted && (
                    <div className="mx-4 mb-4 p-3 bg-slate-950/70 rounded-lg border border-emerald-500/20 animate-fade-in">
                        <div className="flex items-center gap-1.5 mb-2">
                            <Shield size={10} className="text-emerald-400" />
                            <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-wider">→ {msg.department}</span>
                        </div>
                        <pre className="text-[10px] text-slate-300 whitespace-pre-wrap font-mono leading-relaxed">{msg.message}</pre>
                    </div>
                )}

                {/* Toggle expand */}
                {isExecuted && (
                    <button
                        onClick={() => setExpandedId(isExpanded ? null : (storeAction?.id || itemId))}
                        className="w-full py-1.5 text-[9px] text-slate-500 hover:text-slate-400 flex items-center justify-center gap-1 transition-colors border-t border-slate-800/30"
                        title={isExpanded ? '접기' : '지시사항 보기'}
                    >
                        {isExpanded ? <><ChevronUp size={10} /> 접기</> : <><ChevronDown size={10} /> 지시사항 보기</>}
                    </button>
                )}
            </div>
        );
    };

    return (
        <div className="mt-10 pt-8 border-t-2 border-dashed border-violet-500/30 relative">
            {/* ════════════ LIVE TICKER ════════════ */}
            {executedActions.length > 0 && (
                <div className="mb-6 bg-slate-950/80 border border-amber-500/20 rounded-lg overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/5 border-b border-amber-500/10">
                        <AlertTriangle size={10} className="text-amber-400 shrink-0" />
                        <span className="text-[9px] font-black text-amber-400 uppercase tracking-wider">경영진 긴급 지시 발령</span>
                    </div>
                    <div className="overflow-hidden relative h-7 flex items-center">
                        <div className="ticker-scroll flex items-center gap-8 px-3 whitespace-nowrap">
                            {executedActions.slice(0, 5).map(a => (
                                <span key={a.id} className="text-[10px] text-slate-300 font-mono flex items-center gap-1.5 shrink-0">
                                    <span className="text-amber-400">🚨</span>
                                    <span className="text-emerald-400 font-bold">[{a.targetDepartment}]</span>
                                    <span>{a.description}</span>
                                    <span className="text-slate-500">({new Date(a.timestamp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })})</span>
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
                        C-Level Action Pipeline
                    </h3>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider">
                        AI 전략 도출 → 초안 → 결재 요청 → 승인/실행 → Firestore 감사 로그
                    </p>
                </div>
                {allPending.length > 0 && (
                    <span className="ml-auto text-[9px] bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold animate-pulse">
                        {allPending.length} PENDING
                    </span>
                )}
            </div>

            {/* Hedging Strategies */}
            {briefing.hedgingStrategies.length > 0 && (
                <div className="mb-8">
                    <div className="flex items-center gap-2 mb-4">
                        <TrendingDown size={14} className="text-emerald-400" />
                        <h4 className="text-sm font-bold text-emerald-300">파생상품 헤지 전략</h4>
                        <span className="text-[9px] text-slate-500 font-mono ml-1">{briefing.hedgingStrategies.length}건</span>
                    </div>
                    <div className="space-y-3">
                        {briefing.hedgingStrategies.map((h, i) => {
                            const msg = generateHedgingMessage(h);
                            return renderActionCard(
                                `hedge-${i}`, 'HEDGING', h.strategy,
                                `${h.instrument} / ${h.ratio}`, 'IMMEDIATE', msg,
                                0.75, -15000,
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Operational Directives */}
            {briefing.operationalDirectives.length > 0 && (
                <div>
                    <div className="flex items-center gap-2 mb-4">
                        <Ship size={14} className="text-violet-400" />
                        <h4 className="text-sm font-bold text-violet-300">운영 지시사항</h4>
                        <span className="text-[9px] text-slate-500 font-mono ml-1">{briefing.operationalDirectives.length}건</span>
                    </div>
                    <div className="space-y-3">
                        {briefing.operationalDirectives.map((d, i) => {
                            const msg = generateOperationalMessage(d);
                            const ps = priorityColors[d.priority] || priorityColors.SHORT_TERM;
                            return renderActionCard(
                                `op-${i}`, 'OPERATIONAL', d.directive,
                                `기대 효과: ${d.impact}`, d.priority, msg,
                                0.65, 25000,
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Execution Summary */}
            {executedActions.length > 0 && (
                <div className="mt-6 p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
                    <div className="flex items-center gap-2 text-[10px]">
                        <Check size={12} className="text-emerald-400" />
                        <span className="text-emerald-300 font-bold">{executedActions.length}건 실행 완료</span>
                        <span className="text-slate-500">· Firestore strategic_action_logs 감사 로그 저장됨</span>
                        <Clock size={10} className="text-slate-500 ml-auto" />
                        <span className="text-slate-500 font-mono">{new Date().toLocaleTimeString('ko-KR')}</span>
                    </div>
                </div>
            )}

            {/* Toast Notifications */}
            {toasts.length > 0 && (
                <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 max-w-md">
                    {toasts.map(toast => (
                        <div key={toast.id} className={cn(
                            'rounded-xl p-4 shadow-2xl backdrop-blur-lg animate-slide-up flex items-start gap-3',
                            toast.type === 'warning'
                                ? 'bg-amber-950/95 border border-amber-500/30 shadow-amber-900/20'
                                : 'bg-slate-900/95 border border-emerald-500/30 shadow-emerald-900/20'
                        )}>
                            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                                toast.type === 'warning' ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-emerald-500/10 border border-emerald-500/20'
                            )}>
                                {toast.type === 'warning' ? <AlertTriangle size={16} className="text-amber-400" /> : <Check size={16} className="text-emerald-400" />}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className={cn('text-[11px] font-semibold leading-relaxed', toast.type === 'warning' ? 'text-amber-300' : 'text-emerald-300')}>{toast.message}</p>
                                <p className="text-[9px] text-slate-500 mt-1 font-mono">
                                    {new Date(toast.timestamp).toLocaleTimeString('ko-KR')} · Firestore 감사 로그
                                </p>
                            </div>
                            <button onClick={() => dismissToast(toast.id)} className="shrink-0 text-slate-500 hover:text-slate-300 transition-colors" title="닫기">
                                <X size={14} />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Ticker CSS */}
            <style>{`
                @keyframes ticker-scroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
                .ticker-scroll { animation: ticker-scroll 20s linear infinite; }
                .ticker-scroll:hover { animation-play-state: paused; }
            `}</style>
        </div>
    );
}
