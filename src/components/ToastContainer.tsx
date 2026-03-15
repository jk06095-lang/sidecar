/**
 * ToastContainer — Renders toast notifications in the top-right corner.
 * Auto-animated slide-in/out with type-colored styling.
 */
import { useToastStore, type Toast } from '../hooks/useToast';
import { X, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { cn } from '../lib/utils';

const TOAST_STYLES: Record<Toast['type'], { bg: string; border: string; icon: typeof Info; iconColor: string }> = {
    success: { bg: 'bg-emerald-950/90', border: 'border-emerald-500/40', icon: CheckCircle2, iconColor: 'text-emerald-400' },
    error: { bg: 'bg-rose-950/90', border: 'border-rose-500/40', icon: AlertTriangle, iconColor: 'text-rose-400' },
    info: { bg: 'bg-cyan-950/90', border: 'border-cyan-500/40', icon: Info, iconColor: 'text-cyan-400' },
};

export default function ToastContainer() {
    const toasts = useToastStore(s => s.toasts);
    const removeToast = useToastStore(s => s.removeToast);

    if (toasts.length === 0) return null;

    return (
        <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none" style={{ maxWidth: 360 }}>
            {toasts.map(toast => {
                const style = TOAST_STYLES[toast.type];
                const Icon = style.icon;
                return (
                    <div
                        key={toast.id}
                        className={cn(
                            "pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl border backdrop-blur-md shadow-lg",
                            "animate-slide-in-right",
                            style.bg, style.border,
                        )}
                    >
                        <Icon size={16} className={cn("shrink-0 mt-0.5", style.iconColor)} />
                        <p className="text-sm text-slate-200 flex-1 leading-snug">{toast.message}</p>
                        <button
                            onClick={() => removeToast(toast.id)}
                            className="shrink-0 p-0.5 text-slate-500 hover:text-white rounded transition-colors"
                        >
                            <X size={14} />
                        </button>
                    </div>
                );
            })}
        </div>
    );
}
