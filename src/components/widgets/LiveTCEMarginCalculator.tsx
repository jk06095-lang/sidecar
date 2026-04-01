import { useState, useMemo } from 'react';
import { DollarSign, Activity, Anchor, ChevronRight, Fuel, Navigation } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { SimulationParams } from '../../types';
import { computeTCE } from '../../lib/quantEngine';

interface LiveTCEMarginCalculatorProps {
    simulationParams: SimulationParams;
}

export default function LiveTCEMarginCalculator({ simulationParams }: LiveTCEMarginCalculatorProps) {
    const [freightRateWS, setFreightRateWS] = useState<number>(simulationParams.freightRateWS ?? 55);
    const [bunkerConsumptionMt, setBunkerConsumptionMt] = useState<number>(65);

    // Compute live TCE
    const liveTCE = useMemo(() => {
        return computeTCE({
            ...simulationParams,
            freightRateWS,
            bunkerConsumptionMt,
        });
    }, [simulationParams, freightRateWS, bunkerConsumptionMt]);

    // Sensitivity Matrix (VLSFO price shifts)
    const baseVlsfo = simulationParams.vlsfoPrice ?? 620;
    const shifts = [-40, -20, 0, 20, 40];

    const matrix = useMemo(() => {
        return shifts.map(shift => {
            const shiftedVlsfo = Math.max(0, baseVlsfo + shift);
            const tce = computeTCE({
                ...simulationParams,
                vlsfoPrice: shiftedVlsfo,
                freightRateWS,
                bunkerConsumptionMt,
            });
            return {
                shift,
                vlsfo: shiftedVlsfo,
                tce,
                isBase: shift === 0
            };
        });
    }, [baseVlsfo, simulationParams, freightRateWS, bunkerConsumptionMt]);

    const formatUSD = (val: number) => `$${val.toLocaleString()}`;

    // Determine profit color (e.g. > 35000 is high profit neon green, < 15000 is red)
    const getProfitColor = (tce: number) => {
        if (tce >= 40000) return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/40 shadow-[0_0_15px_rgba(52,211,153,0.15)]';
        if (tce >= 25000) return 'text-emerald-300 bg-emerald-500/5 border-emerald-500/20';
        if (tce >= 10000) return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
        return 'text-rose-400 bg-rose-500/10 border-rose-500/40 shadow-[0_0_15px_rgba(244,63,94,0.15)]';
    };

    return (
        <div className="flex flex-col h-full bg-[#0B0F15] rounded-lg border border-slate-800 overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800 bg-[#111823]">
                <Activity size={14} className="text-cyan-400" />
                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-widest">Live Earnings Sensitivity</h4>
                <div className="ml-auto flex items-center gap-2">
                    <span className="text-[9px] px-1.5 py-0.5 rounded text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 font-mono">
                        PRICING ENGINE
                    </span>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* Left: Inputs & Primary Output */}
                <div className="w-1/2 p-4 border-r border-slate-800 flex flex-col gap-5 bg-[#0D131A]">
                    
                    <div className="space-y-4">
                        {/* Freight Rate Input */}
                        <div>
                            <div className="flex justify-between items-end mb-1.5">
                                <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                                    <Anchor size={10} className="text-cyan-500" />
                                    Freight Rate (WS)
                                </label>
                                <span className="text-xs font-mono font-bold text-cyan-400">{freightRateWS} WS</span>
                            </div>
                            <input
                                type="range"
                                min="20"
                                max="150"
                                step="1"
                                value={freightRateWS}
                                onChange={e => setFreightRateWS(Number(e.target.value))}
                                    title="Freight Rate (WS)"
                                    className="w-full accent-cyan-500 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                            />
                        </div>

                        {/* Bunker Consumption Input */}
                        <div>
                            <div className="flex justify-between items-end mb-1.5">
                                <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                                    <Fuel size={10} className="text-amber-500" />
                                    Bunker Cons. (mt/day)
                                </label>
                                <span className="text-xs font-mono font-bold text-amber-400">{bunkerConsumptionMt} MT</span>
                            </div>
                            <input
                                type="range"
                                min="40"
                                max="100"
                                step="1"
                                value={bunkerConsumptionMt}
                                onChange={e => setBunkerConsumptionMt(Number(e.target.value))}
                                    title="Bunker Consumption (mt/day)"
                                    className="w-full accent-amber-500 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                            />
                        </div>
                    </div>

                    <div className="flex-1" />

                    {/* Output Live TCE */}
                    <div className={cn("rounded-xl border p-4 transition-all duration-300 flex flex-col items-center justify-center", getProfitColor(liveTCE))}>
                        <div className="text-[10px] font-bold uppercase tracking-widest opacity-80 mb-1">Estimated TCE</div>
                        <div className="text-3xl font-black font-mono tracking-tight">
                            {formatUSD(liveTCE)}
                            <span className="text-sm font-medium opacity-60 ml-1">/ day</span>
                        </div>
                    </div>

                </div>

                {/* Right: Sensitivity Matrix */}
                <div className="w-1/2 p-4 bg-[#0a0e14] flex flex-col">
                    <div className="flex items-center gap-2 mb-3">
                        <Navigation size={12} className="text-slate-500" />
                        <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                            VLSFO Sensitivity Matrix
                        </h5>
                    </div>
                    
                    <div className="flex-1 flex flex-col justify-center gap-2">
                        {matrix.map((row, i) => (
                            <div 
                                key={i} 
                                className={cn(
                                    "flex items-center justify-between px-3 py-2 rounded-lg border transition-all text-xs",
                                    row.isBase 
                                        ? "bg-slate-800/50 border-cyan-500/40" 
                                        : "bg-slate-900/40 border-slate-800/50 hover:bg-slate-800/80"
                                )}
                            >
                                <div className="flex items-center gap-3 w-1/2">
                                    <span className={cn(
                                        "font-mono font-bold text-[10px] w-12 text-right",
                                        row.shift > 0 ? "text-rose-400" : row.shift < 0 ? "text-emerald-400" : "text-slate-400"
                                    )}>
                                        {row.shift > 0 ? '+' : ''}{row.shift === 0 ? 'MKT' : `$${row.shift}`}
                                    </span>
                                    <span className="text-slate-300 font-mono">${row.vlsfo}</span>
                                </div>
                                <div className="flex items-center justify-end w-1/2 gap-2">
                                    <ChevronRight size={10} className="text-slate-600" />
                                    <span className={cn(
                                        "font-mono font-bold text-[11px]",
                                        row.tce >= 40000 ? "text-emerald-400" : row.tce >= 25000 ? "text-emerald-300" : row.tce >= 10000 ? "text-amber-400" : "text-rose-400"
                                    )}>
                                        {formatUSD(row.tce)}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                    
                    <div className="mt-3 text-right">
                        <span className="text-[9px] text-slate-600 font-mono">BASE VLSFO: {formatUSD(baseVlsfo)}/mt • Middle East - East PE</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
