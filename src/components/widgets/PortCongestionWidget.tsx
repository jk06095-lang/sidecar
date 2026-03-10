import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Navigation, Loader2, AlertTriangle as AlertIcon } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { SimulationParams } from '../../types';

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
    const portData = useMemo<PortData[]>(() => {
        const { newsSentimentScore, awrpRate } = simulationParams;
        const crisisMultiplier = 1 + (newsSentimentScore / 100) * 1.5;
        const middleEastPenalty = awrpRate > 0.1 ? 2.5 : 1;

        return [
            { port: 'Fujairah', region: 'ME', baseWaitDays: 2.5, waitDays: Math.round(2.5 * crisisMultiplier * middleEastPenalty * 10) / 10, vessels: Math.round(12 * crisisMultiplier) },
            { port: 'Ras Tanura', region: 'ME', baseWaitDays: 1.8, waitDays: Math.round(1.8 * crisisMultiplier * middleEastPenalty * 10) / 10, vessels: Math.round(8 * crisisMultiplier) },
            { port: 'Singapore', region: 'SEA', baseWaitDays: 3.2, waitDays: Math.round(3.2 * (1 + newsSentimentScore / 200) * 10) / 10, vessels: Math.round(45 * (1 + newsSentimentScore / 300)) },
            { port: 'Rotterdam', region: 'EU', baseWaitDays: 1.5, waitDays: Math.round(1.5 * (1 + newsSentimentScore / 250) * 10) / 10, vessels: Math.round(22 * (1 + newsSentimentScore / 400)) },
            { port: 'Ulsan', region: 'KR', baseWaitDays: 2.0, waitDays: Math.round(2.0 * (1 + newsSentimentScore / 200) * 10) / 10, vessels: Math.round(15 * (1 + newsSentimentScore / 350)) },
            { port: 'Ningbo', region: 'CN', baseWaitDays: 4.0, waitDays: Math.round(4.0 * (1 + newsSentimentScore / 180) * 10) / 10, vessels: Math.round(55 * (1 + newsSentimentScore / 250)) },
        ];
    }, [simulationParams]);

    const maxWait = Math.max(...portData.map(p => p.waitDays));

    return (
        <div className="flex flex-col h-full bg-slate-900/40 rounded-lg border border-slate-700/30 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700/50 bg-slate-800/20">
                <Navigation size={14} className="text-purple-400" />
                <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-widest">Port Congestion Index</h4>
                <span className="ml-auto px-1.5 py-0.5 rounded text-[9px] bg-slate-800 text-slate-400 font-mono">SIM</span>
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
                <span className="font-mono">시뮬레이션 변수 연동 · 대기일수 동적 산정</span>
                {maxWait > 5 && (
                    <span className="flex items-center gap-1 text-rose-400">
                        <AlertIcon size={10} /> 혼잡 경고
                    </span>
                )}
            </div>
        </div>
    );
}
