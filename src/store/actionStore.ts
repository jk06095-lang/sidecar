/**
 * Action Store — Phase 4: 3-State Approval Pipeline
 *
 * Zustand store for managing strategic actions through
 * DRAFT → PENDING_APPROVAL → EXECUTED lifecycle.
 *
 * Write-back: Firestore audit trail on every state transition.
 */

import { create } from 'zustand';
import type { StrategicActionLog, AIStrategicProposal } from '../types';

// ============================================================
// TOAST STATE
// ============================================================

export interface ActionToast {
    id: string;
    message: string;
    department: string;
    type: 'success' | 'info' | 'warning';
    timestamp: number;
}

// ============================================================
// STORE STATE
// ============================================================

interface ActionStoreState {
    /** Actions in DRAFT state (AI-proposed, not yet submitted) */
    draftActions: StrategicActionLog[];
    /** Actions awaiting approval */
    pendingApproval: StrategicActionLog[];
    /** Fully executed actions */
    executedActions: StrategicActionLog[];
    /** Active toast notifications */
    toasts: ActionToast[];

    // ---- Lifecycle Actions ----

    /** Import AI proposals as DRAFT actions */
    importProposals: (proposals: AIStrategicProposal[], scenarioName: string) => void;

    /** Legacy: dispatch actions directly (backwards compat with StrategicActionPanel) */
    dispatchActions: (actions: StrategicActionLog[]) => void;

    /** DRAFT → PENDING_APPROVAL */
    submitForApproval: (id: string) => void;

    /** PENDING_APPROVAL → EXECUTED (with progress animation support) */
    approveAndExecute: (id: string, approvedBy: string, justification?: string) => Promise<void>;

    /** PENDING_APPROVAL → DRAFT (rejection) */
    rejectAction: (id: string, rejectedBy: string) => void;

    /** Legacy: execute directly (DRAFT/PENDING → EXECUTED in one step) */
    executeAction: (id: string) => Promise<void>;

    /** Update approval progress (0-100) for animation */
    setApprovalProgress: (id: string, progress: number) => void;

    /** Clear a toast by id */
    dismissToast: (id: string) => void;

    /** Get the most recent executed actions (for ticker display) */
    getRecentExecuted: (limit?: number) => StrategicActionLog[];

    /** Get all actions across all states */
    getAllActions: () => StrategicActionLog[];

    /** Internal: Firestore state transition audit */
    _logTransition: (actionId: string, from: string, to: string) => Promise<void>;
}

// ============================================================
// ZUSTAND STORE
// ============================================================

export const useActionStore = create<ActionStoreState>((set, get) => ({
    draftActions: [],
    pendingApproval: [],
    executedActions: [],
    toasts: [],

    // ─── Import AI Proposals → DRAFT ───
    importProposals: (proposals, scenarioName) => {
        const newActions: StrategicActionLog[] = proposals.map(p => ({
            id: p.id,
            actionType: p.actionType,
            description: p.title,
            status: 'DRAFT' as const,
            approvedBy: '',
            timestamp: new Date().toISOString(),
            justificationMetrics: {
                scenarioName,
                riskAlertCount: 0,
                highRiskVesselCount: p.vesselTargets?.length || 0,
            },
            targetDepartment: p.targetDepartment,
            departmentMessage: p.departmentMessage,
            confidence: p.confidence,
            estimatedImpactUsd: p.estimatedImpactUsd,
            approvalProgress: 0,
        }));

        set(state => {
            const existingIds = new Set([
                ...state.draftActions.map(a => a.id),
                ...state.pendingApproval.map(a => a.id),
                ...state.executedActions.map(a => a.id),
            ]);
            const deduped = newActions.filter(a => !existingIds.has(a.id));
            return { draftActions: [...state.draftActions, ...deduped] };
        });
    },

    // ─── Legacy dispatch (backwards compat) ───
    dispatchActions: (actions) => {
        set(state => {
            const existingIds = new Set([
                ...state.draftActions.map(a => a.id),
                ...state.pendingApproval.map(a => a.id),
                ...state.executedActions.map(a => a.id),
            ]);
            const newActions = actions
                .filter(a => !existingIds.has(a.id))
                .map(a => ({ ...a, status: 'DRAFT' as const }));
            return { draftActions: [...state.draftActions, ...newActions] };
        });
    },

    // ─── DRAFT → PENDING_APPROVAL ───
    submitForApproval: (id) => {
        set(state => {
            const action = state.draftActions.find(a => a.id === id);
            if (!action) return state;

            const updated: StrategicActionLog = {
                ...action,
                status: 'PENDING_APPROVAL',
                timestamp: new Date().toISOString(),
                approvalProgress: 0,
            };

            return {
                draftActions: state.draftActions.filter(a => a.id !== id),
                pendingApproval: [...state.pendingApproval, updated],
            };
        });

        // Firestore audit trail
        get()._logTransition(id, 'DRAFT', 'PENDING_APPROVAL');
    },

    // ─── PENDING_APPROVAL → EXECUTED (with animated progress) ───
    approveAndExecute: async (id, approvedBy, justification) => {
        const state = get();
        const action = state.pendingApproval.find(a => a.id === id)
            || state.draftActions.find(a => a.id === id);
        if (!action) return;

        // Animate progress 0→100 over 2 seconds
        const steps = 20;
        for (let i = 1; i <= steps; i++) {
            await new Promise(r => setTimeout(r, 100));
            get().setApprovalProgress(id, Math.round((i / steps) * 100));
        }

        const executed: StrategicActionLog = {
            ...action,
            status: 'EXECUTED',
            approvedBy: approvedBy || 'CSO (Chief Strategy Officer)',
            timestamp: new Date().toISOString(),
            executedAt: new Date().toISOString(),
            approvalProgress: 100,
        };

        set(s => ({
            draftActions: s.draftActions.filter(a => a.id !== id),
            pendingApproval: s.pendingApproval.filter(a => a.id !== id),
            executedActions: [executed, ...s.executedActions],
        }));

        // Firestore audit trail
        try {
            const { logStrategicDecision } = await import('../services/firestoreService');
            await logStrategicDecision(executed);
        } catch (err) {
            console.error('[ActionStore] Firestore audit log failed:', err);
        }

        // Toast
        const toast: ActionToast = {
            id: `toast-${Date.now()}`,
            message: `✅ [${action.targetDepartment}] ${action.description} — 결재 완료 및 실행됨`,
            department: action.targetDepartment,
            type: 'success',
            timestamp: Date.now(),
        };
        set(s => ({ toasts: [...s.toasts, toast] }));
        setTimeout(() => set(s => ({ toasts: s.toasts.filter(t => t.id !== toast.id) })), 6000);
    },

    // ─── PENDING_APPROVAL → DRAFT (rejection) ───
    rejectAction: (id, rejectedBy) => {
        set(state => {
            const action = state.pendingApproval.find(a => a.id === id);
            if (!action) return state;

            const rejected: StrategicActionLog = {
                ...action,
                status: 'DRAFT',
                rejectedBy,
                timestamp: new Date().toISOString(),
                approvalProgress: 0,
            };

            return {
                pendingApproval: state.pendingApproval.filter(a => a.id !== id),
                draftActions: [...state.draftActions, rejected],
            };
        });

        // Toast
        const toast: ActionToast = {
            id: `toast-rej-${Date.now()}`,
            message: `⚠️ 전략이 반려되었습니다. 수정 후 재제출하세요.`,
            department: '',
            type: 'warning',
            timestamp: Date.now(),
        };
        set(s => ({ toasts: [...s.toasts, toast] }));
        setTimeout(() => set(s => ({ toasts: s.toasts.filter(t => t.id !== toast.id) })), 5000);

        get()._logTransition(id, 'PENDING_APPROVAL', 'DRAFT');
    },

    // ─── Legacy: one-step execute (backwards compat) ───
    executeAction: async (id) => {
        const state = get();
        const action = state.draftActions.find(a => a.id === id)
            || state.pendingApproval.find(a => a.id === id);
        if (!action) return;

        const executed: StrategicActionLog = {
            ...action,
            status: 'EXECUTED',
            timestamp: new Date().toISOString(),
            executedAt: new Date().toISOString(),
            approvalProgress: 100,
        };

        set(s => ({
            draftActions: s.draftActions.filter(a => a.id !== id),
            pendingApproval: s.pendingApproval.filter(a => a.id !== id),
            executedActions: [executed, ...s.executedActions],
        }));

        try {
            const { logStrategicDecision } = await import('../services/firestoreService');
            await logStrategicDecision(executed);
        } catch (err) {
            console.error('[ActionStore] Firestore audit log failed:', err);
        }

        const toast: ActionToast = {
            id: `toast-${Date.now()}`,
            message: `✅ [${action.targetDepartment}] ${action.description} 지시가 하달되었습니다.`,
            department: action.targetDepartment,
            type: 'success',
            timestamp: Date.now(),
        };
        set(s => ({ toasts: [...s.toasts, toast] }));
        setTimeout(() => set(s => ({ toasts: s.toasts.filter(t => t.id !== toast.id) })), 6000);
    },

    // ─── Progress animation helper ───
    setApprovalProgress: (id, progress) => {
        set(state => ({
            pendingApproval: state.pendingApproval.map(a =>
                a.id === id ? { ...a, approvalProgress: progress } : a
            ),
            draftActions: state.draftActions.map(a =>
                a.id === id ? { ...a, approvalProgress: progress } : a
            ),
        }));
    },

    // ─── Toast dismiss ───
    dismissToast: (id) => {
        set(s => ({ toasts: s.toasts.filter(t => t.id !== id) }));
    },

    // ─── Queries ───
    getRecentExecuted: (limit = 5) => get().executedActions.slice(0, limit),

    getAllActions: () => [
        ...get().draftActions,
        ...get().pendingApproval,
        ...get().executedActions,
    ],

    // ─── Internal: Firestore state transition audit ───
    _logTransition: async (actionId: string, from: string, to: string) => {
        try {
            const { logApprovalEvent } = await import('../services/firestoreService');
            await logApprovalEvent(actionId, { from, to, timestamp: new Date().toISOString() });
        } catch {
            // Silently fail — not critical
        }
    },
}));
