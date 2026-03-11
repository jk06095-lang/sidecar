/**
 * VolatilityIndexWidget — BEVI (Business Environment Volatility Index) display widget.
 * Subscribes to ontologyStore for real-time BEVI value, trend, history.
 * Responsive: compact mode at small sizes, sparkline + factor at large sizes.
 */
import { useRef, useState, useEffect, useMemo } from 'react';
import { Activity, TrendingUp, TrendingDown, Minus, AlertTriangle, Zap } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useOntologyStore } from '../../store/ontologyStore';
import {
    AreaChart, Area, ResponsiveContainer, Tooltip,
} from 'recharts';

type WidgetSize = 'compact' | 'medium' | 'large';

export default function VolatilityIndexWidget() {
    const bevi = useOntologyStore(s => s.bevi);
    const containerRef = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState<WidgetSize>('medium');

    // ---- Responsive sizing via ResizeObserver ----
    useEffect(() => {
        if (!containerRef.current) return;
        const ro = new ResizeObserver(entries => {
            for (const e of entries) {
                const w = e.contentRect.width;
                const h = e.contentRect.height;
                if (w < 280 || h < 180) setSize('compact');
                else if (w >= 450 && h >= 250) setSize('large');
                else setSize('medium');
            }
        });
        ro.observe(containerRef.current);
        return () => ro.disconnect();
    }, []);

    // ---- Color theme ----
    const theme = useMemo(() => {
        const v = bevi.value;
        if (v >= 80) return {
            border: 'border-rose-500/50',
            bg: 'bg-rose-950/30',
            text: 'text-rose-400',
            glow: 'shadow-[0_0_30px_rgba(244,63,94,0.2)]',
            pulse: true,
            gradient: { start: '#f43f5e', end: '#881337' },
            label: 'CRITICAL',
            labelClass: 'bg-rose-500/20 text-rose-400 border-rose-500/40',
            sparkStroke: '#f43f5e',
            sparkFill: '#f43f5e',
        };
        if (v >= 50) return {
            border: 'border-amber-500/50',
            bg: 'bg-amber-950/20',
            text: 'text-amber-400',
            glow: 'shadow-[0_0_20px_rgba(245,158,11,0.15)]',
            pulse: false,
            gradient: { start: '#f59e0b', end: '#78350f' },
            label: 'ELEVATED',
            labelClass: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
            sparkStroke: '#f59e0b',
            sparkFill: '#f59e0b',
        };
        return {
            border: 'border-cyan-500/40',
            bg: 'bg-cyan-950/20',
            text: 'text-cyan-400',
            glow: '',
            pulse: false,
            gradient: { start: '#06b6d4', end: '#164e63' },
            label: 'STABLE',
            labelClass: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40',
            sparkStroke: '#06b6d4',
            sparkFill: '#06b6d4',
        };
    }, [bevi.value]);

    // ---- Trend icon ----
    const TrendIcon = bevi.trend === 'up' ? TrendingUp : bevi.trend === 'down' ? TrendingDown : Minus;
    const trendSign = bevi.delta > 0 ? '+' : '';
    const trendColor = bevi.trend === 'up' ? 'text-rose-400' : bevi.trend === 'down' ? 'text-emerald-400' : 'text-slate-400';

    // Sparkline data
    const sparkData = useMemo(() =>
        bevi.history.map((h, i) => ({ idx: i, value: h.value })),
        [bevi.history]);

    // Unique gradient ID
    const gradientId = 'bevi-spark-gradient';

    return (
        <div
            ref={containerRef}
            className={cn(
                "flex flex-col h-full w-full overflow-hidden rounded-lg border transition-all duration-500 relative group",
                theme.border, theme.bg, theme.glow,
                theme.pulse && 'animate-pulse-slow'
            )}
        >
            {/* Background Grid Pattern */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#3341551a_1px,transparent_1px),linear-gradient(to_bottom,#3341551a_1px,transparent_1px)] bg-[size:1.5rem_1.5rem] pointer-events-none opacity-30" />

            {/* Header — always visible */}
            <div className="flex items-center justify-between px-3 pt-2 pb-1 z-10 shrink-0">
                <div className="flex items-center gap-1.5">
                    <Activity size={12} className={theme.text} />
                    <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">BEVI</span>
                </div>
                <span className={cn(
                    'text-[8px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider',
                    theme.labelClass
                )}>
                    {theme.label}
                </span>
            </div>

            {/* ==================== COMPACT MODE ==================== */}
            {size === 'compact' && (
                <div className="flex-1 flex flex-col items-center justify-center gap-1 z-10 px-3">
                    <span className={cn("font-mono font-black text-4xl tabular-nums", theme.text)}>
                        {bevi.value}
                    </span>
                    <div className={cn("flex items-center gap-1 text-xs font-mono", trendColor)}>
                        <TrendIcon size={12} />
                        <span>{trendSign}{bevi.delta}</span>
                    </div>
                </div>
            )}

            {/* ==================== MEDIUM MODE ==================== */}
            {size === 'medium' && (
                <div className="flex-1 flex flex-col z-10 px-3 pb-2">
                    <div className="flex items-end gap-3 mb-2">
                        <span className={cn("font-mono font-black text-5xl tabular-nums leading-none", theme.text)}>
                            {bevi.value}
                        </span>
                        <div className="flex flex-col mb-1">
                            <div className={cn("flex items-center gap-1 text-sm font-mono font-bold", trendColor)}>
                                <TrendIcon size={14} />
                                <span>{trendSign}{bevi.delta}</span>
                            </div>
                            <span className="text-[9px] text-slate-500 font-mono">/100</span>
                        </div>
                    </div>
                    {/* Mini sparkline */}
                    {sparkData.length > 2 && (
                        <div className="flex-1 min-h-[40px] w-full opacity-60">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={sparkData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor={theme.sparkFill} stopOpacity={0.3} />
                                            <stop offset="100%" stopColor={theme.sparkFill} stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <Area
                                        type="monotone"
                                        dataKey="value"
                                        stroke={theme.sparkStroke}
                                        strokeWidth={1.5}
                                        fill={`url(#${gradientId})`}
                                        isAnimationActive={false}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>
            )}

            {/* ==================== LARGE MODE ==================== */}
            {size === 'large' && (
                <div className="flex-1 flex flex-col z-10 px-4 pb-3 min-h-0">
                    {/* Top row: value + sparkline */}
                    <div className="flex items-start gap-4 mb-2 flex-1 min-h-0">
                        {/* Left: big number */}
                        <div className="flex flex-col shrink-0">
                            <span className={cn("font-mono font-black text-5xl tabular-nums leading-none", theme.text)}>
                                {bevi.value}
                            </span>
                            <div className="flex items-center gap-2 mt-1">
                                <div className={cn("flex items-center gap-1 text-sm font-mono font-bold", trendColor)}>
                                    <TrendIcon size={14} />
                                    <span>{trendSign}{bevi.delta}</span>
                                </div>
                                <span className="text-[9px] text-slate-500 font-mono">/100</span>
                            </div>
                            {/* Component breakdown */}
                            <div className="mt-2 space-y-1">
                                <div className="flex items-center gap-2 text-[10px]">
                                    <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                                    <span className="text-slate-500">거시/지정학</span>
                                    <span className="text-slate-300 font-mono ml-auto">{bevi.macroRiskAvg ?? '—'}</span>
                                </div>
                                <div className="flex items-center gap-2 text-[10px]">
                                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                    <span className="text-slate-500">자산/공급망</span>
                                    <span className="text-slate-300 font-mono ml-auto">{bevi.assetRiskAvg ?? '—'}</span>
                                </div>
                                <div className="flex items-center gap-2 text-[10px]">
                                    <div className="w-1.5 h-1.5 rounded-full bg-cyan-500" />
                                    <span className="text-slate-500">인텔리전스</span>
                                    <span className="text-slate-300 font-mono ml-auto">{bevi.intelShockAvg ?? '—'}</span>
                                </div>
                            </div>
                        </div>
                        {/* Right: sparkline chart */}
                        {sparkData.length > 2 && (
                            <div className="flex-1 min-h-[80px] min-w-0">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={sparkData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id={`${gradientId}-lg`} x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor={theme.sparkFill} stopOpacity={0.35} />
                                                <stop offset="100%" stopColor={theme.sparkFill} stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', fontSize: '11px', borderRadius: '8px' }}
                                            formatter={(v: number) => [`${v}`, 'BEVI']}
                                            labelFormatter={() => ''}
                                            wrapperStyle={{ zIndex: 50 }}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="value"
                                            stroke={theme.sparkStroke}
                                            strokeWidth={2}
                                            fill={`url(#${gradientId}-lg)`}
                                            isAnimationActive={false}
                                            dot={false}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </div>

                    {/* Bottom: driving factor */}
                    <div className="flex items-center gap-2 pt-2 border-t border-slate-800/50 shrink-0">
                        <Zap size={11} className={theme.text} />
                        <span className="text-[10px] text-slate-400 truncate flex-1">
                            💡 견인 요인: {bevi.topFactor || '데이터 수집 중...'}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}
