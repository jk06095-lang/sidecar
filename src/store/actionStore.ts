/**
 * Action Store — Module 5: Strategic Action Workflow
 *
 * Zustand store for managing C-Level strategic actions globally.
 * Handles pending → executed lifecycle, toast notifications,
 * and Firestore audit trail persistence.
 */

import { create } from 'zustand';
import type { StrategicActionLog } from '../types';

// ============================================================
// TOAST STATE
// ============================================================

export interface ActionToast {
    id: string;
    message: string;
    department: string;
    type: 'success' | 'info';
    timestamp: number;
}

// ============================================================
// STORE STATE
// ============================================================

interface ActionStoreState {
    pendingActions: StrategicActionLog[];
    executedActions: StrategicActionLog[];
    toasts: ActionToast[];

    // ---- Actions ----
    /** Dispatch actions from AI briefing to pending queue */
    dispatchActions: (actions: StrategicActionLog[]) => void;

    /** Execute a pending action — moves to executed + fires Firestore audit */
    executeAction: (id: string) => Promise<void>;

    /** Clear a toast by id */
    dismissToast: (id: string) => void;

    /** Get the most recent executed actions (for ticker display) */
    getRecentExecuted: (limit?: number) => StrategicActionLog[];
}

// ============================================================
// ZUSTAND STORE
// ============================================================

export const useActionStore = create<ActionStoreState>((set, get) => ({
    pendingActions: [],
    executedActions: [],
    toasts: [],

    dispatchActions: (actions) => {
        set((state) => {
            // Deduplicate by id
            const existingIds = new Set([
                ...state.pendingActions.map(a => a.id),
                ...state.executedActions.map(a => a.id),
            ]);
            const newActions = actions.filter(a => !existingIds.has(a.id));
            return {
                pendingActions: [...state.pendingActions, ...newActions],
            };
        });
    },

    executeAction: async (id) => {
        const state = get();
        const action = state.pendingActions.find(a => a.id === id);
        if (!action) return;

        const executed: StrategicActionLog = {
            ...action,
            status: 'EXECUTED',
            timestamp: new Date().toISOString(),
        };

        // Optimistic UI update
        set((s) => ({
            pendingActions: s.pendingActions.filter(a => a.id !== id),
            executedActions: [executed, ...s.executedActions],
        }));

        // Firestore audit trail — import dynamically to avoid circular deps
        try {
            const { logStrategicDecision } = await import('../services/firestoreService');
            await logStrategicDecision(executed);
        } catch (err) {
            console.error('[ActionStore] Firestore audit log failed:', err);
            // App continues — UI state already updated
        }

        // Toast notification
        const toast: ActionToast = {
            id: `toast-${Date.now()}`,
            message: action.actionType === 'HEDGING'
                ? `✅ [${action.targetDepartment}] ${action.description} 지시가 하달되었습니다.`
                : `✅ [${action.targetDepartment}] ${action.description} 지시가 하달되었습니다.`,
            department: action.targetDepartment,
            type: 'success',
            timestamp: Date.now(),
        };

        set((s) => ({
            toasts: [...s.toasts, toast],
        }));

        // Auto-dismiss after 6 seconds
        setTimeout(() => {
            set((s) => ({
                toasts: s.toasts.filter(t => t.id !== toast.id),
            }));
        }, 6000);
    },

    dismissToast: (id) => {
        set((s) => ({
            toasts: s.toasts.filter(t => t.id !== id),
        }));
    },

    getRecentExecuted: (limit = 5) => {
        return get().executedActions.slice(0, limit);
    },
}));
