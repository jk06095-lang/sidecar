import React from 'react';
import { Ship, MapPin, Anchor } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { FleetVessel } from '../../types';

interface FleetStatusWidgetProps {
    fleetData: FleetVessel[];
}

export default function FleetStatusWidget({ fleetData }: FleetStatusWidgetProps) {
    return (
        <div className="flex flex-col h-full bg-slate-900/40 rounded-lg border border-slate-700/30 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700/50 bg-slate-800/20">
                <Anchor size={14} className="text-cyan-400" />
                <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-widest">Fleet Status — 선대 현황</h4>
                <span className="ml-auto px-1.5 py-0.5 rounded text-[9px] bg-slate-800 text-slate-400 font-mono">ONTOLOGY</span>
            </div>
            <div className="flex-1 overflow-x-auto overflow-y-auto custom-scrollbar">
                <table className="w-full text-xs">
                    <thead>
                        <tr className="border-b border-slate-800/50">
                            <th className="text-left px-4 py-2 text-slate-500 font-medium">선명</th>
                            <th className="text-left px-3 py-2 text-slate-500 font-medium">선종</th>
                            <th className="text-left px-3 py-2 text-slate-500 font-medium">위치</th>
                            <th className="text-left px-3 py-2 text-slate-500 font-medium">항해</th>
                            <th className="text-left px-3 py-2 text-slate-500 font-medium">CII</th>
                            <th className="text-left px-3 py-2 text-slate-500 font-medium">F.O. ROB</th>
                            <th className="text-left px-3 py-2 text-slate-500 font-medium">Risk</th>
                        </tr>
                    </thead>
                    <tbody>
                        {fleetData.map((v, i) => (
                            <tr
                                key={i}
                                className={cn(
                                    'border-b border-slate-800/30 transition-colors',
                                    v.riskLevel === 'Critical' && 'bg-rose-950/20',
                                    v.riskLevel === 'High' && 'bg-amber-950/10'
                                )}
                            >
                                <td className="px-4 py-2.5">
                                    <div className="flex items-center gap-2">
                                        <Ship size={12} className={cn(
                                            v.riskLevel === 'Critical' ? 'text-rose-400' : 'text-slate-400'
                                        )} />
                                        <span className="text-slate-200 font-medium">{v.vessel_name}</span>
                                    </div>
                                </td>
                                <td className="px-3 py-2.5 text-slate-400">{v.vessel_type}</td>
                                <td className="px-3 py-2.5">
                                    <div className="flex items-center gap-1">
                                        <MapPin size={10} className="text-slate-500" />
                                        <span className="text-slate-300 truncate max-w-[140px]">{v.location}</span>
                                    </div>
                                </td>
                                <td className="px-3 py-2.5 text-slate-400 font-mono">
                                    {v.voyage_info.sailed_days}/{v.voyage_info.plan_days}d
                                </td>
                                <td className="px-3 py-2.5">
                                    <span className={cn(
                                        'px-1.5 py-0.5 rounded text-[10px] font-semibold',
                                        v.compliance.cii_rating === 'A' ? 'bg-emerald-500/20 text-emerald-400' :
                                            v.compliance.cii_rating === 'B' ? 'bg-cyan-500/20 text-cyan-400' :
                                                v.compliance.cii_rating === 'C' ? 'bg-amber-500/20 text-amber-400' :
                                                    'bg-rose-500/20 text-rose-400'
                                    )}>
                                        {v.compliance.cii_rating}
                                    </span>
                                </td>
                                <td className="px-3 py-2.5 text-slate-300 font-mono">{v.consumption_and_rob.fo_rob.toLocaleString()} mt</td>
                                <td className="px-3 py-2.5">
                                    <span className={cn(
                                        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider',
                                        v.riskLevel === 'Low' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' :
                                            v.riskLevel === 'Medium' ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30' :
                                                v.riskLevel === 'High' ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' :
                                                    'bg-rose-500/15 text-rose-400 border-rose-500/30 animate-pulse'
                                    )}>
                                        {v.riskLevel === 'Critical' && <span className="w-1.5 h-1.5 bg-rose-500 rounded-full" />}
                                        {v.riskLevel}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
