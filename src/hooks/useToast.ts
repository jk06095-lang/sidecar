/**
 * Global Toast Notification Store (Zustand)
 * Manages toast notifications with auto-dismiss and animation support.
 */
import { create } from 'zustand';

export interface Toast {
    id: string;
    message: string;
    type: 'success' | 'error' | 'info';
    createdAt: number;
}

interface ToastStore {
    toasts: Toast[];
    addToast: (message: string, type?: Toast['type']) => void;
    removeToast: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
    toasts: [],
    addToast: (message, type = 'info') => {
        const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        set(state => ({ toasts: [...state.toasts, { id, message, type, createdAt: Date.now() }] }));

        // Auto-dismiss after 5 seconds
        setTimeout(() => {
            set(state => ({ toasts: state.toasts.filter(t => t.id !== id) }));
        }, 5000);
    },
    removeToast: (id) => set(state => ({ toasts: state.toasts.filter(t => t.id !== id) })),
}));
