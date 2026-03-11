/**
 * DataSourceBadge — Shows live/demo status indicator on widgets.
 *
 * - Live:  🟢 실시간 연동 중  (emerald glow)
 * - Demo:  ⚠️ Demo Mode (Mock)  (amber)
 *
 * Positioned absolute top-right within widget header.
 */

import { cn } from '../../lib/utils';

export type DataSourceStatus = 'live' | 'demo';

interface DataSourceBadgeProps {
    source: DataSourceStatus;
    className?: string;
}

export default function DataSourceBadge({ source, className }: DataSourceBadgeProps) {
    if (source === 'live') {
        return (
            <span
                className={cn(
                    'inline-flex items-center gap-1 px-1.5 py-0.5 rounded',
                    'text-[8px] font-semibold tracking-wide',
                    'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
                    'shadow-[0_0_6px_rgba(16,185,129,0.2)]',
                    'transition-all duration-300',
                    className,
                )}
            >
                🟢 실시간 연동 중
            </span>
        );
    }

    return (
        <span
            className={cn(
                'inline-flex items-center gap-1 px-1.5 py-0.5 rounded',
                'text-[8px] font-semibold tracking-wide',
                'bg-amber-500/15 text-amber-400 border border-amber-500/30',
                'transition-all duration-300',
                className,
            )}
        >
            ⚠️ Demo Mode (Mock)
        </span>
    );
}
