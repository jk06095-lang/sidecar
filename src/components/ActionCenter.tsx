/**
 * ActionCenter — Pillar 4: Unified 결재/보고 Hub
 * 
 * 5-Tab composite merging:
 *  Tab 1: 결재 대기 (Draft + Pending Approval actions)
 *  Tab 2: 실행 완료 (Executed actions with audit trail)
 *  Tab 3: AI 보고서 (Reports generation + list)
 *  Tab 4: 문서 에디터 (IntegratedEditor)
 *  Tab 5: Data Lineage (DataLineagePanel)
 */
import { useState, useMemo } from 'react';
import {
    FileCheck, CheckCircle2, FileText, Edit3, GitBranch,
    Gavel, Clock, ArrowRight, Shield, Sparkles,
    TrendingDown, Anchor, DollarSign, AlertTriangle,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useActionStore } from '../store/actionStore';
import Reports from './Reports';
import IntegratedEditor from './IntegratedEditor';
import DataLineagePanel from './DataLineagePanel';

// ============================================================
// ACTION CENTER TABS
// ============================================================
const TABS = [
    { id: 'pending', label: '결재 대기', icon: FileCheck, accent: 'amber' },
    { id: 'executed', label: '실행 완료', icon: CheckCircle2, accent: 'emerald' },
    { id: 'reports', label: 'AI 보고서', icon: FileText, accent: 'cyan' },
    { id: 'editor', label: '문서 에디터', icon: Edit3, accent: 'violet' },
    { id: 'lineage', label: 'Data Lineage', icon: GitBranch, accent: 'blue' },
] as const;

type TabId = typeof TABS[number]['id'];

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function ActionCenter() {
    const [activeTab, setActiveTab] = useState<TabId>('pending');

    const draftActions = useActionStore(s => s.draftActions);
    const pendingApproval = useActionStore(s => s.pendingApproval);
    const executedActions = useActionStore(s => s.executedActions);
    const submitForApproval = useActionStore(s => s.submitForApproval);
    const approveAndExecute = useActionStore(s => s.approveAndExecute);
    const rejectAction = useActionStore(s => s.rejectAction);

    const pendingCount = draftActions.length + pendingApproval.length;

    // ============================================================
    // TAB: 결재 대기
    // ============================================================
    const renderPendingTab = () => {
        const allPending = [...draftActions, ...pendingApproval];

        if (allPending.length === 0) {
            return (
                <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                    <FileCheck size={48} className="text-slate-700 mb-4" />
                    <p className="text-sm font-medium">결재 대기 중인 전략이 없습니다</p>
                    <p className="text-xs text-slate-600 mt-1">AIP Scenario에서 브리핑을 생성하면 AI 전략이 여기에 표시됩니다</p>
                </div>
            );
        }

        return (
            <div className="space-y-3 p-6">
                {/* Summary Bar */}
                <div className="flex items-center gap-4 p-4 bg-slate-900/50 border border-slate-800/60 rounded-xl mb-2">
                    <div className="flex items-center gap-2 text-xs text-amber-400">
                        <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                        <span className="font-bold">{draftActions.length}건 초안</span>
                    </div>
                    <div className="w-px h-4 bg-slate-700" />
                    <div className="flex items-center gap-2 text-xs text-orange-400">
                        <div className="w-2 h-2 rounded-full bg-orange-500" />
                        <span className="font-bold">{pendingApproval.length}건 결재중</span>
                    </div>
                </div>

                {/* Action Cards */}
                {allPending.map(action => {
                    const isDraft = action.status === 'DRAFT';
                    const isHedging = action.actionType === 'HEDGING';
                    return (
                        <div
                            key={action.id}
                            className={cn(
                                'rounded-xl border p-4 transition-all',
                                isDraft
                                    ? 'bg-slate-900/50 border-slate-700/50 hover:border-amber-500/30'
                                    : 'bg-amber-950/10 border-amber-500/30'
                            )}
                        >
                            {/* Status + Type */}
                            <div className="flex items-center gap-2 mb-2">
                                <span className={cn(
                                    'text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border',
                                    isDraft
                                        ? 'bg-slate-700/50 text-slate-400 border-slate-600/50'
                                        : 'bg-amber-500/15 text-amber-400 border-amber-500/30 animate-pulse'
                                )}>
                                    {isDraft ? '초안' : '결재중'}
                                </span>
                                <span className={cn(
                                    'text-[9px] flex items-center gap-1 font-mono',
                                    isHedging ? 'text-emerald-500' : 'text-violet-500'
                                )}>
                                    {isHedging ? <TrendingDown size={9} /> : <Anchor size={9} />}
                                    {isHedging ? 'HEDGING' : 'OPERATIONAL'}
                                </span>
                                {action.confidence && (
                                    <span className={cn(
                                        'text-[8px] font-bold px-1.5 py-0.5 rounded-full border ml-auto',
                                        action.confidence >= 0.8 ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                            : action.confidence >= 0.5 ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                                                : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                                    )}>
                                        <Sparkles size={7} className="inline mr-0.5" />
                                        AI {Math.round(action.confidence * 100)}%
                                    </span>
                                )}
                            </div>

                            {/* Content */}
                            <h4 className="text-sm font-semibold text-slate-200 mb-1">{action.description}</h4>
                            <p className="text-[10px] text-slate-500 mb-3">
                                {action.targetDepartment} · {new Date(action.timestamp).toLocaleString('ko-KR')}
                            </p>

                            {/* Financial Impact */}
                            {action.estimatedImpactUsd !== undefined && action.estimatedImpactUsd !== 0 && (
                                <div className="flex items-center gap-1 text-[10px] font-mono font-bold mb-3">
                                    <DollarSign size={10} />
                                    <span className={action.estimatedImpactUsd >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                        {action.estimatedImpactUsd >= 0 ? '+' : '-'}
                                        ${Math.abs(action.estimatedImpactUsd).toLocaleString()}
                                    </span>
                                </div>
                            )}

                            {/* Action Buttons */}
                            <div className="flex items-center gap-2">
                                {isDraft && (
                                    <button
                                        onClick={() => submitForApproval(action.id)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold rounded-lg bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white shadow-lg transition-all"
                                        title="결재 요청"
                                    >
                                        <ArrowRight size={10} /> 결재 요청
                                    </button>
                                )}
                                {!isDraft && (
                                    <>
                                        <button
                                            onClick={() => approveAndExecute(action.id, 'Commander', '임원 결재 승인')}
                                            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold rounded-lg bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white shadow-lg transition-all"
                                            title="승인 및 실행"
                                        >
                                            <CheckCircle2 size={10} /> 승인 실행
                                        </button>
                                        <button
                                            onClick={() => rejectAction(action.id, 'Commander')}
                                            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold rounded-lg bg-slate-700/50 text-rose-400 hover:bg-rose-900/30 border border-rose-900/30 transition-all"
                                            title="반려"
                                        >
                                            <AlertTriangle size={10} /> 반려
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    // ============================================================
    // TAB: 실행 완료
    // ============================================================
    const renderExecutedTab = () => {
        if (executedActions.length === 0) {
            return (
                <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                    <CheckCircle2 size={48} className="text-slate-700 mb-4" />
                    <p className="text-sm font-medium">실행된 전략이 없습니다</p>
                    <p className="text-xs text-slate-600 mt-1">결재 승인된 전략이 여기에 기록됩니다</p>
                </div>
            );
        }

        return (
            <div className="space-y-3 p-6">
                {/* Summary */}
                <div className="flex items-center gap-3 p-4 bg-emerald-950/20 border border-emerald-900/30 rounded-xl mb-2">
                    <Shield size={16} className="text-emerald-400" />
                    <span className="text-xs text-emerald-300 font-bold">{executedActions.length}건 실행 완료</span>
                    <span className="text-[10px] text-slate-500 ml-auto">Firestore 감사 로그 기록됨</span>
                </div>

                {executedActions.map(action => (
                    <div
                        key={action.id}
                        className="rounded-xl border bg-emerald-500/5 border-emerald-500/20 p-4"
                    >
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                ✅ 실행됨
                            </span>
                            <span className={cn(
                                'text-[9px] flex items-center gap-1 font-mono',
                                action.actionType === 'HEDGING' ? 'text-emerald-500' : 'text-violet-500'
                            )}>
                                {action.actionType === 'HEDGING' ? <TrendingDown size={9} /> : <Anchor size={9} />}
                                {action.actionType === 'HEDGING' ? 'HEDGING' : 'OPERATIONAL'}
                            </span>
                            <span className="text-[9px] text-slate-600 ml-auto font-mono">
                                {action.executedAt ? new Date(action.executedAt).toLocaleString('ko-KR') : ''}
                            </span>
                        </div>
                        <h4 className="text-sm font-semibold text-emerald-300 mb-1">{action.description}</h4>
                        <p className="text-[10px] text-slate-500">
                            승인: {action.approvedBy} · {action.targetDepartment}
                        </p>
                        {action.estimatedImpactUsd !== undefined && action.estimatedImpactUsd !== 0 && (
                            <div className="flex items-center gap-1 text-[10px] font-mono font-bold mt-2">
                                <DollarSign size={10} />
                                <span className={action.estimatedImpactUsd >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                    {action.estimatedImpactUsd >= 0 ? '+' : '-'}${Math.abs(action.estimatedImpactUsd).toLocaleString()}
                                </span>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        );
    };

    // ============================================================
    // RENDER
    // ============================================================
    const activeTabDef = TABS.find(t => t.id === activeTab)!;

    return (
        <div className="flex flex-col h-full bg-slate-950">
            {/* ═══ Header ═══ */}
            <div className="px-6 pt-5 pb-4 border-b border-slate-800/60">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-900/30">
                        <Gavel size={20} className="text-white" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-slate-100">Action Center</h1>
                        <p className="text-[11px] text-slate-500">전략 결재 · AI 보고서 · 문서 편집 · 데이터 리니지</p>
                    </div>
                </div>

                {/* ═══ Tab Bar ═══ */}
                <div className="flex items-center gap-1 bg-slate-900/50 p-1 rounded-xl border border-slate-800/50">
                    {TABS.map(tab => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        const badge = tab.id === 'pending' ? pendingCount
                            : tab.id === 'executed' ? executedActions.length
                                : 0;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={cn(
                                    'flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[11px] font-semibold transition-all',
                                    isActive
                                        ? `bg-${tab.accent}-500/15 text-${tab.accent}-400 border border-${tab.accent}-500/30 shadow-sm`
                                        : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50 border border-transparent'
                                )}
                                title={tab.label}
                            >
                                <Icon size={13} />
                                <span className="hidden sm:inline">{tab.label}</span>
                                {badge > 0 && (
                                    <span className={cn(
                                        'text-[8px] font-bold min-w-[16px] h-4 rounded-full flex items-center justify-center px-1',
                                        isActive
                                            ? `bg-${tab.accent}-500/25 text-${tab.accent}-300`
                                            : 'bg-slate-700/50 text-slate-400'
                                    )}>
                                        {badge}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ═══ Tab Content ═══ */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {activeTab === 'pending' && renderPendingTab()}
                {activeTab === 'executed' && renderExecutedTab()}
                {activeTab === 'reports' && <Reports />}
                {activeTab === 'editor' && <IntegratedEditor />}
                {activeTab === 'lineage' && <DataLineagePanel />}
            </div>
        </div>
    );
}
