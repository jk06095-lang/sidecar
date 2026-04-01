import { useMemo } from 'react';
import { Navigation, AlertTriangle as AlertIcon, DollarSign, TrendingDown } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { SimulationParams } from '../../types';

interface DemurrageRiskRadarProps {
    simulationParams: SimulationParams;
}

interface PortRiskData {
    port: string;
    region: string;
    baseWaitDays: number;
    waitDays: number;
    financialExposure: number;
    isCritical: boolean;
}

const DAILY_DEMURRAGE_RATE = 45000;

export default function DemurrageRiskRadar({ simulationParams }: DemurrageRiskRadarProps) {
    const portData = useMemo<PortRiskData[]>(() => {
        const { newsSentimentScore, awrpRate } = simulationParams;
        const crisisMultiplier = 1 + ((newsSentimentScore ?? 0) / 100) * 1.5;
        const middleEastPenalty = (awrpRate ?? 0) > 0.1 ? 2.5 : 1;

        const rawData = [
            { port: 'Fujairah', region: 'ME', baseWaitDays: 2.5, waitDays: Math.round(2.5 * crisisMultiplier * middleEastPenalty * 10) / 10 },
            { port: 'Ras Tanura', region: 'ME', baseWaitDays: 1.8, waitDays: Math.round(1.8 * crisisMultiplier * middleEastPenalty * 10) / 10 },
            { port: 'Singapore', region: 'SEA', baseWaitDays: 3.2, waitDays: Math.round(3.2 * (1 + (newsSentimentScore ?? 0) / 200) * 10) / 10 },
            { port: 'Rotterdam', region: 'EU', baseWaitDays: 1.5, waitDays: Math.round(1.5 * (1 + (newsSentimentScore ?? 0) / 250) * 10) / 10 },
            { port: 'Ningbo', region: 'CN', baseWaitDays: 4.0, waitDays: Math.round(4.0 * (1 + (newsSentimentScore ?? 0) / 180) * 10) / 10 },
        ];

        return rawData
            .map(p => {
                const financialExposure = Math.round(p.waitDays * DAILY_DEMURRAGE_RATE);
                return {
                    ...p,
                    financialExposure,
                    isCritical: financialExposure >= 150000
                };
            })
            .sort((a, b) => b.financialExposure - a.financialExposure);
    }, [simulationParams]);

    const totalExposure = portData.reduce((acc, curr) => acc + curr.financialExposure, 0);

    const formatUSD = (val: number) => `$${val.toLocaleString()}`;

    return (
        <div className="flex flex-col h-full bg-[#0a0e14] rounded-lg border border-slate-800/80 overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-rose-900/30 bg-[#140b0f]">
                <AlertIcon size={14} className="text-rose-500" />
                <h4 className="text-xs font-bold text-rose-100 uppercase tracking-widest">Demurrage Risk Radar</h4>
                <div className="ml-auto flex items-center gap-2">
                    <span className="text-[9px] px-1.5 py-0.5 rounded text-rose-400 bg-rose-500/10 border border-rose-500/30 font-mono font-bold animate-pulse">
                        LIVE EXPOSURE
                    </span>
                </div>
            </div>

            {/* Total Exposure Alert Box */}
            <div className="p-4 border-b border-slate-800 bg-[#0d0909]">
                <div className="flex justify-between items-end">
                    <div>
                        <h5 className="text-[10px] text-rose-500/80 font-bold uppercase tracking-widest mb-1 flex items-center gap-1.5">
                            <TrendingDown size={12} />
                            Total Demurrage Risk
                        </h5>
                        <div className="text-3xl font-black font-mono text-rose-500 tracking-tighter drop-shadow-[0_0_15px_rgba(244,63,94,0.4)]">
                            -{formatUSD(totalExposure)}
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-[9px] text-slate-500 font-mono">Assumed Rate</div>
                        <div className="text-[11px] font-mono font-bold text-rose-400">{formatUSD(DAILY_DEMURRAGE_RATE)}/day</div>
                    </div>
                </div>
            </div>

            {/* Port Breakdown List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
                {portData.map(port => (
                    <div 
                        key={port.port} 
                        className={cn(
                            "flex flex-col gap-1.5 p-3 rounded-lg border transition-all",
                            port.isCritical 
                                ? "bg-rose-950/20 border-rose-500/30 hover:bg-rose-950/40" 
                                : "bg-[#0d1219] border-slate-800 hover:bg-[#111823]"
                        )}
                    >
                        <div className="flex justify-between items-start">
                            <div className="flex items-center gap-2">
                                <Navigation size={12} className={port.isCritical ? "text-rose-400" : "text-slate-500"} />
                                <span className={cn(
                                    "text-sm font-bold", 
                                    port.isCritical ? "text-rose-200" : "text-slate-300"
                                )}>
                                    {port.port}
                                </span>
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                                    {port.region}
                                </span>
                            </div>
                            <div className={cn(
                                "text-sm font-black font-mono",
                                port.isCritical ? "text-rose-400" : "text-amber-400"
                            )}>
                                -{formatUSD(port.financialExposure)}
                            </div>
                        </div>
                        
                        <div className="flex items-center justify-between text-[11px] mt-1">
                            <div className="flex items-center gap-4">
                                <div className="flex flex-col">
                                    <span className="text-[9px] text-slate-500 font-bold uppercase">Wait Time</span>
                                    <span className="font-mono text-slate-300">{port.waitDays.toFixed(1)} Days</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[9px] text-slate-500 font-bold uppercase">Base</span>
                                    <span className="font-mono text-slate-500">{port.baseWaitDays.toFixed(1)} Days</span>
                                </div>
                            </div>
                            
                            {/* Visual delay bar */}
                            <div className="w-24 h-1.5 rounded-full bg-slate-800 overflow-hidden flex">
                                <div 
                                    className="bg-slate-600 h-full" 
                                    style={{ width: `${Math.min(100, (port.baseWaitDays / Math.max(port.waitDays, 0.1)) * 100)}%` }}
                                />
                                <div 
                                    className={port.isCritical ? "bg-rose-500" : "bg-amber-500"} 
                                    style={{ width: `${Math.max(0, 100 - (port.baseWaitDays / Math.max(port.waitDays, 0.1)) * 100)}%` }}
                                />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
            
            <div className="px-4 py-2 border-t border-slate-800/80 text-[9px] text-slate-500 font-mono bg-[#070b10]">
                Financial Exposure = Estimated Delay Days × Daily Demurrage Rate ($45k)
            </div>
        </div>
    );
}
