import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Navigation, AlertTriangle as AlertIcon, Database } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { SimulationParams } from '../../types';
import { useOntologyStore } from '../../store/ontologyStore';

interface PortCongestionWidgetProps {
    simulationParams: SimulationParams;
}

interface PortData {
    port: string;
    region: string;
    baseWaitDays: number;
    waitDays: number;
    vessels: number;
}

export default function PortCongestionWidget({ simulationParams }: PortCongestionWidgetProps) {
    // Read Port objects from Ontology Store (Firestore-sourced)
    const objects = useOntologyStore(s => s.objects);

    const portData = useMemo<PortData[]>(() => {
        const { newsSentimentScore, awrpRate } = simulationParams;
        const crisisMultiplier = 1 + (newsSentimentScore / 100) * 1.5;
        const middleEastPenalty = awrpRate > 0.1 ? 2.5 : 1;

        // Get Port-type objects from ontology
        const portObjects = objects.filter(o => o.type === 'Port');

        if (portObjects.length === 0) {
            // No ports in ontology — show empty state
            return [];
        }

        return portObjects.map(port => {
            const region = (port.properties.region as string) || '—';
            const baseWait = (port.properties.baseWaitDays as number) || 2.0;
            const congestion = (port.properties.congestionPct as number) || 50;
            const queuedVessels = (port.properties.queuedVessels as number) || 10;

            // Apply crisis multiplier (ME ports get extra penalty)
            const isME = region === 'ME';
            const adjustedWait = Math.round(
                baseWait * crisisMultiplier * (isME ? middleEastPenalty : 1) * 10
            ) / 10;
            const adjustedVessels = Math.round(queuedVessels * crisisMultiplier);

            return {
                port: port.title.length > 18 ? port.title.slice(0, 16) + '…' : port.title,
                region,
                baseWaitDays: baseWait,
                waitDays: adjustedWait,
                vessels: adjustedVessels,
            };
        }).sort((a, b) => b.waitDays - a.waitDays).slice(0, 8);
    }, [simulationParams, objects]);

    const maxWait = portData.length > 0 ? Math.max(...portData.map(p => p.waitDays)) : 0;
    const isOntologySourced = portData.length > 0;

    if (portData.length === 0) {
        return (
            <div className="flex flex-col h-full bg-slate-900/40 rounded-lg border border-slate-700/30 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700/50 bg-slate-800/20">
                    <Navigation size={14} className="text-purple-400" />
                    <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-widest">Port Congestion Index</h4>
                </div>
                <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-slate-500">
                    <Database size={28} className="text-slate-600" />
                    <p className="text-xs text-center font-mono">
                        온톨로지에 Port 객체가 없습니다.<br />
                        Add Port objects to see congestion data.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-slate-900/40 rounded-lg border border-slate-700/30 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700/50 bg-slate-800/20">
                <Navigation size={14} className="text-purple-400" />
                <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-widest">Port Congestion Index</h4>
                <span className={cn(
                    "ml-auto px-1.5 py-0.5 rounded text-[9px] font-mono",
                    isOntologySourced
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : "bg-slate-800 text-slate-400"
                )}>
                    {isOntologySourced ? 'ONTOLOGY' : 'SIM'}
                </span>
            </div>

            <div className="flex-1 px-2 py-2" style={{ minHeight: 180 }}>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={portData} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.3} horizontal={false} />
                        <XAxis type="number" tick={{ fill: '#64748b', fontSize: 9, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} unit="d" />
                        <YAxis type="category" dataKey="port" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} width={70} />
                        <Tooltip
                            contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', fontSize: '11px', borderRadius: '8px' }}
                            formatter={(value: number, name: string) => [`${value} days`, 'Avg Wait']}
                            labelStyle={{ color: '#e2e8f0' }}
                        />
                        <Bar dataKey="waitDays" radius={[0, 4, 4, 0]} animationDuration={600}>
                            {portData.map((entry, index) => (
                                <Cell
                                    key={index}
                                    fill={entry.waitDays > 5 ? '#f43f5e' : entry.waitDays > 3 ? '#f59e0b' : '#06b6d4'}
                                    fillOpacity={0.7}
                                />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>

            <div className="px-4 py-2 border-t border-slate-800/50 flex items-center justify-between text-[10px] text-slate-500">
                <span className="font-mono">Firestore 온톨로지 연동 · 시나리오 변수 대기일 가중</span>
                {maxWait > 5 && (
                    <span className="flex items-center gap-1 text-rose-400">
                        <AlertIcon size={10} /> 혼잡 경고
                    </span>
                )}
            </div>
        </div>
    );
}
