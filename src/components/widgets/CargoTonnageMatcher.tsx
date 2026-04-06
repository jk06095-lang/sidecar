import { useMemo } from 'react';
import { Target, Ship, MapPin } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { SimulationParams } from '../../types';
import { useOntologyStore } from '../../store/ontologyStore';
import { computeTCE, computeOPEX } from '../../lib/quantEngine';

interface CargoTonnageMatcherProps {
    simulationParams: SimulationParams;
}

export default function CargoTonnageMatcher({ simulationParams }: CargoTonnageMatcherProps) {
    const dynamicFleetData = useOntologyStore(s => s.dynamicFleetData);

    // Rank ships by Projected TCE Margin using vessel-specific data
    const rankedVessels = useMemo(() => {
        if (!dynamicFleetData || dynamicFleetData.length === 0) return [];

        const results = dynamicFleetData.map(v => {
            // Incorporate vessel-specific traits into params
            const speedDiff = v.speed_and_weather_metrics?.speed_diff ?? 0;
            const avgIfo = v.consumption_and_rob?.avg_ifo ?? 65;
            
            const vParams = {
                ...simulationParams,
                speedDelta: speedDiff,
                bunkerConsumptionMt: avgIfo,
            };
            
            const tce = computeTCE(vParams);
            const opex = computeOPEX(vParams);
            
            return {
                vesselName: v.vessel_name,
                type: v.vessel_type,
                location: v.location,
                tce,
                opex,
                dailyFuelMT: avgIfo,
            };
        });

        // Sort by TCE descending
        return results.sort((a, b) => b.tce - a.tce);
    }, [simulationParams, dynamicFleetData]);

    const formatUSD = (val: number) => `$${val.toLocaleString()}`;

    return (
        <div className="flex flex-col h-full bg-[#0B0F15] rounded-lg border border-slate-800 overflow-hidden shadow-2xl min-w-0">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-emerald-900/30 bg-[#0c1311]">
                <Target size={14} className="text-emerald-400" />
                <h4 className="text-xs font-bold text-emerald-100 uppercase tracking-widest">Cargo-Tonnage Matching</h4>
                <div className="ml-auto flex items-center gap-2">
                    <span className="text-[9px] px-1.5 py-0.5 rounded text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 font-mono font-bold animate-pulse">
                        SORT: MAX MARGIN
                    </span>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
                {rankedVessels.map((v, i) => {
                    const isTop = i === 0;
                    return (
                        <div key={v.vesselName} className={cn(
                            "p-3 rounded-lg border transition-all flex items-center justify-between",
                            isTop 
                                ? "bg-emerald-950/20 border-emerald-500/40 shadow-[0_0_15px_rgba(52,211,153,0.1)] hover:bg-emerald-950/40" 
                                : "bg-[#0D131A] border-slate-800 hover:border-slate-700 hover:bg-[#111823]"
                        )}>
                            <div className="flex items-center gap-3 min-w-0">
                                <div className={cn(
                                    "w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ring-1",
                                    isTop ? "bg-emerald-500/20 text-emerald-400 ring-emerald-500/50" : "bg-slate-800 text-slate-400 ring-slate-700"
                                )}>
                                    #{i + 1}
                                </div>
                                <div className="flex flex-col gap-1 min-w-0">
                                    <div className={cn("text-xs font-bold flex items-center gap-1.5 min-w-0", isTop ? "text-emerald-300" : "text-slate-200")}>
                                        <Ship size={12} className={cn(isTop ? "text-emerald-400" : "text-slate-500", "shrink-0")} />
                                        <span className="truncate">{v.vesselName}</span>
                                        <span className="px-1 py-0.5 text-[8px] bg-slate-800 text-slate-400 rounded-sm font-mono border border-slate-700 shrink-0 whitespace-nowrap">
                                            {v.type}
                                        </span>
                                    </div>
                                    <div className="text-[10px] text-slate-500 font-mono flex items-center gap-2 min-w-0">
                                        <span className="flex items-center gap-1 truncate"><MapPin size={9} className="shrink-0" /><span className="truncate">{v.location}</span></span>
                                        <span className="whitespace-nowrap shrink-0">• OPEX: {formatUSD(v.opex)}/d</span>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="text-right flex flex-col items-end justify-center">
                                <div className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-0.5">EST. TCE</div>
                                <div className={cn(
                                    "text-base font-black font-mono",
                                    isTop ? "text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]" : "text-slate-300"
                                )}>
                                    {formatUSD(v.tce)}<span className="text-[10px] text-slate-500 font-normal ml-0.5">/day</span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
            
            <div className="px-4 py-2 border-t border-slate-800/80 text-[9px] text-slate-500 font-mono bg-[#070b10]">
                Vessels ranked by voyage projection maximizing net TCE.
            </div>
        </div>
    );
}
