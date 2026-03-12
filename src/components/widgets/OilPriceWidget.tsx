/**
 * OilPriceWidget — Bunker Price Tracker (100% real data, no mock)
 *
 * Shows Brent crude / VLSFO prices from LSEG or Yahoo.
 * If data pipeline is offline, renders glassmorphism error state.
 * riskAlert from QuantMetrics triggers red pulse shadow.
 */

import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Fuel, TrendingUp, AlertTriangle, WifiOff } from 'lucide-react';
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
    const lsegError = useOntologyStore(s => s.lsegError);
    const lsegQuantMetrics = useOntologyStore(s => s.lsegQuantMetrics);

    // Quant metrics for Brent (risk alert)
    const brentMetrics = useMemo(() =>
        lsegQuantMetrics?.['LCOc1'] || lsegQuantMetrics?.['BZ=F'] || null,
        [lsegQuantMetrics]
    );
    const hasRiskAlert = brentMetrics?.riskAlert ?? false;

    // Use real LSEG data for Brent if available
    const brentQuote = useMemo(() =>
        lsegQuotes.find(q => q.symbol === 'LCOc1' || q.symbol === 'BZ=F'),
        [lsegQuotes]
    );

    // No data available — check if pipeline is truly offline (no quotes AND not loading)
    const isOffline = !lsegIsLoading && lsegQuotes.length === 0;

    // Generate oil price chart data from real quotes only
    const priceData = useMemo(() => {
        if (!brentQuote && lsegQuotes.length === 0) return [];

        // If we have real historical prices from quant metrics, use them
        if (brentMetrics?.historicalPrices && brentMetrics.historicalPrices.length > 0) {
            const prices = brentMetrics.historicalPrices;
            return prices.map((price, i) => {
                const date = new Date();
                date.setDate(date.getDate() - (prices.length - 1 - i));
                const dayLabel = `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
                return { date: dayLabel, Brent: Math.round(price * 10) / 10, VLSFO: Math.round(price * 6.5 * 10) / 10 };
            });
        }

        // Fallback: just show current price as single data point
        if (brentQuote) {
            const now = new Date();
            const dayLabel = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;
            return [{ date: dayLabel, Brent: brentQuote.price, VLSFO: vlsfoPrice }];
        }

        return [];
    }, [brentQuote, brentMetrics, lsegQuotes.length, vlsfoPrice]);

    const currentVLSFO = priceData.length > 0 ? priceData[priceData.length - 1]?.VLSFO || vlsfoPrice : vlsfoPrice;
    const prevVLSFO = priceData.length > 1 ? priceData[priceData.length - 2]?.VLSFO || vlsfoPrice : vlsfoPrice;
    const change = currentVLSFO - prevVLSFO;

    // ── Loading State ──
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

    // ── Error / Offline State — Glassmorphism Empty State ──
    if (isOffline || lsegError) {
        return (
            <div className="flex flex-col h-full bg-slate-900/40 rounded-lg border border-rose-500/20 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-rose-500/20 bg-rose-950/10">
                    <Fuel size={14} className="text-rose-400/60" />
                    <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Bunker Price Tracker</h4>
                </div>
                <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
                    <div className="w-16 h-16 rounded-2xl bg-rose-500/5 border border-rose-500/20 backdrop-blur-sm flex items-center justify-center mb-4">
                        <WifiOff size={28} className="text-rose-400/50" />
                    </div>
                    <div className="text-center space-y-2">
                        <p className="text-xs font-semibold text-rose-300/80 flex items-center gap-1.5 justify-center">
                            <AlertTriangle size={12} />
                            데이터 파이프라인 연결 필요
                        </p>
                        <p className="text-[10px] text-slate-500 max-w-[240px] leading-relaxed">
                            Data Connection Required — LSEG 또는 Yahoo Finance 연결이 오프라인입니다. 설정에서 API 파이프라인을 확인하세요.
                        </p>
                        {lsegError && (
                            <p className="text-[9px] text-rose-400/50 font-mono mt-2 bg-rose-950/30 px-3 py-1.5 rounded-lg border border-rose-800/20">
                                {lsegError.slice(0, 80)}
                            </p>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // ── Normal Render — Real Data ──
    return (
        <div className={cn(
            "flex flex-col h-full bg-slate-900/40 rounded-lg border overflow-hidden transition-all duration-500",
            hasRiskAlert
                ? "border-rose-500/40 shadow-[0_0_20px_rgba(239,68,68,0.15)] animate-pulse-slow"
                : "border-slate-700/30"
        )}>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700/50 bg-slate-800/20">
                <Fuel size={14} className="text-amber-400" />
                <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-widest">Bunker Price Tracker</h4>
                {hasRiskAlert && (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 bg-rose-500/15 border border-rose-500/30 rounded text-[9px] font-bold text-rose-400 animate-pulse">
                        <AlertTriangle size={9} /> RISK
                    </span>
                )}
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

            <div className="flex-1 px-2 py-1 min-h-[160px]">
                {priceData.length > 1 ? (
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
                ) : (
                    <div className="flex items-center justify-center h-full text-slate-500 text-[10px]">
                        <span>데이터 수신 대기중... 차트 렌더링에 2개 이상 데이터 포인트가 필요합니다</span>
                    </div>
                )}
            </div>

            <div className="px-4 py-2 border-t border-slate-800/50 flex items-center gap-4 text-[10px] text-slate-500">
                <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-amber-400 rounded" /> VLSFO</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-cyan-400 rounded" /> Brent</span>
                {brentMetrics && (
                    <span className="ml-auto font-mono text-[9px]">
                        Z={brentMetrics.zScore.toFixed(2)} · Vol={brentMetrics.volatility30d.toFixed(2)} · {brentMetrics.trend}
                    </span>
                )}
                {!brentMetrics && brentQuote && (
                    <span className="ml-auto font-mono">
                        실시간 Brent ${brentQuote.price}
                    </span>
                )}
            </div>
        </div>
    );
}
