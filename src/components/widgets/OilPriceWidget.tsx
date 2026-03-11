import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Fuel, TrendingUp } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { SimulationParams } from '../../types';
import { useOntologyStore } from '../../store/ontologyStore';
import SkeletonLoader from './SkeletonLoader';
import DataSourceBadge from './DataSourceBadge';

interface OilPriceWidgetProps {
    simulationParams: SimulationParams;
}

export default function OilPriceWidget({ simulationParams }: OilPriceWidgetProps) {
    const { vlsfoPrice, newsSentimentScore } = simulationParams;
    const lsegIsLoading = useOntologyStore(s => s.lsegIsLoading);
    const lsegDataSource = useOntologyStore(s => s.lsegDataSource);
    const lsegQuotes = useOntologyStore(s => s.lsegMarketQuotes);

    // Use real LSEG data for Brent if available
    const brentQuote = useMemo(() =>
        lsegQuotes.find(q => q.symbol === 'LCOc1' || q.symbol === 'BZ=F'),
        [lsegQuotes]
    );

    // Generate oil price history — use real data baseline when available
    const priceData = useMemo(() => {
        const basePrice = 550;
        const realBrent = brentQuote?.price;
        const trend = (vlsfoPrice - basePrice) / 30;
        const volatility = 1 + (newsSentimentScore / 100) * 2;

        return Array.from({ length: 30 }, (_, i) => {
            const date = new Date(2026, 1, 9 + i);
            const dayLabel = `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
            const noise = (Math.sin(i * 1.7) * 15 + Math.cos(i * 0.8) * 10) * volatility;
            // If real Brent data is available, use it as anchor for recent days
            const brentBase = realBrent
                ? realBrent * (1 - (30 - i) * 0.003) + (Math.sin(i * 0.5) * 2)
                : 75 + trend * i * 0.08 + noise * 0.3;
            const brent = Math.round(brentBase * 10) / 10;
            const vlsfo = Math.round((basePrice + trend * i + noise) * 10) / 10;
            return { date: dayLabel, VLSFO: vlsfo, Brent: brent };
        });
    }, [vlsfoPrice, newsSentimentScore, brentQuote]);

    const currentVLSFO = priceData[priceData.length - 1]?.VLSFO || vlsfoPrice;
    const prevVLSFO = priceData[priceData.length - 2]?.VLSFO || vlsfoPrice;
    const change = currentVLSFO - prevVLSFO;

    if (lsegIsLoading) {
        return (
            <div className="flex flex-col h-full bg-slate-900/40 rounded-lg border border-slate-700/30 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700/50 bg-slate-800/20">
                    <Fuel size={14} className="text-amber-400" />
                    <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-widest">Bunker Price Tracker</h4>
                </div>
                <SkeletonLoader variant="chart" />
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-slate-900/40 rounded-lg border border-slate-700/30 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700/50 bg-slate-800/20">
                <Fuel size={14} className="text-amber-400" />
                <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-widest">Bunker Price Tracker</h4>
                <div className="ml-auto flex items-center gap-2">
                    <DataSourceBadge source={lsegDataSource} />
                    <div className="text-right">
                        <div className="text-sm font-mono font-bold text-slate-100">${currentVLSFO.toFixed(0)}</div>
                        <div className={cn(
                            'text-[10px] font-mono flex items-center gap-0.5',
                            change >= 0 ? 'text-rose-400' : 'text-emerald-400'
                        )}>
                            {change >= 0 ? <TrendingUp size={10} /> : <TrendingUp size={10} className="rotate-180" />}
                            {change >= 0 ? '+' : ''}{change.toFixed(1)}
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex-1 px-2 py-1" style={{ minHeight: 160 }}>
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={priceData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.3} />
                        <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 9, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={40} />
                        <YAxis yAxisId="vlsfo" tick={{ fill: '#64748b', fontSize: 9, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
                        <YAxis yAxisId="brent" orientation="right" tick={{ fill: '#64748b', fontSize: 9, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
                        <Tooltip
                            contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', fontSize: '11px', borderRadius: '8px' }}
                            itemStyle={{ color: '#bae6fd' }}
                        />
                        <ReferenceLine yAxisId="vlsfo" y={vlsfoPrice} stroke="#f59e0b" strokeDasharray="4 4" strokeOpacity={0.5} />
                        <Line yAxisId="vlsfo" type="monotone" dataKey="VLSFO" stroke="#f59e0b" strokeWidth={2} dot={false} name="VLSFO ($/mt)" animationDuration={600} />
                        <Line yAxisId="brent" type="monotone" dataKey="Brent" stroke="#06b6d4" strokeWidth={1} dot={false} strokeDasharray="3 3" name="Brent ($/bbl)" animationDuration={600} />
                    </LineChart>
                </ResponsiveContainer>
            </div>

            <div className="px-4 py-2 border-t border-slate-800/50 flex items-center gap-4 text-[10px] text-slate-500">
                <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-amber-400 rounded" /> VLSFO</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-cyan-400 rounded" /> Brent</span>
                <span className="ml-auto font-mono">
                    {brentQuote ? `실시간 Brent $${brentQuote.price} · 30일 추이` : '시뮬레이션 유가 기반 · 30일 추이'}
                </span>
            </div>
        </div>
    );
}
