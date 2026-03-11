import React, { useEffect, useRef, useState } from 'react';
import { TrendingUp, Maximize2, Minimize2, RefreshCcw } from 'lucide-react';
import { cn } from '../../lib/utils';

// ============================================================
// TradingView free embeddable widget for maritime indices
// Uses TradingView's official free widget library (no API key required)
// ============================================================

interface MarketSymbol {
    id: string;
    label: string;
    labelKo: string;
    tvSymbol: string;        // TradingView symbol ID
    description: string;
}

const MARKET_SYMBOLS: MarketSymbol[] = [
    { id: 'brent', label: 'Brent Crude', labelKo: '브렌트유', tvSymbol: 'TVC:UKOIL', description: 'ICE Brent Crude Futures' },
    { id: 'wti', label: 'WTI Crude', labelKo: 'WTI 원유', tvSymbol: 'TVC:USOIL', description: 'NYMEX WTI Crude Futures' },
    { id: 'natgas', label: 'Natural Gas', labelKo: '천연가스', tvSymbol: 'TVC:NATURALGAS', description: 'Henry Hub Natural Gas Futures' },
    { id: 'gold', label: 'Gold', labelKo: '금', tvSymbol: 'TVC:GOLD', description: 'Gold Spot (XAU/USD)' },
    { id: 'dxy', label: 'US Dollar', labelKo: '달러 인덱스', tvSymbol: 'TVC:DXY', description: 'US Dollar Index' },
    { id: 'usdkrw', label: 'USD/KRW', labelKo: '원/달러', tvSymbol: 'FX_IDC:USDKRW', description: 'US Dollar vs Korean Won' },
];

interface TradingViewWidgetProps {
    className?: string;
}

export default function TradingViewWidget({ className }: TradingViewWidgetProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [activeSymbol, setActiveSymbol] = useState(MARKET_SYMBOLS[0]);
    const [isExpanded, setIsExpanded] = useState(false);
    const [interval, setInterval_] = useState('D');

    // Embed TradingView widget via their official script
    useEffect(() => {
        if (!containerRef.current) return;
        // Clear previous widget
        containerRef.current.innerHTML = '';

        const script = document.createElement('script');
        script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
        script.async = true;
        script.innerHTML = JSON.stringify({
            autosize: true,
            symbol: activeSymbol.tvSymbol,
            interval: interval,
            timezone: 'Asia/Seoul',
            theme: 'dark',
            style: '1',
            locale: 'kr',
            backgroundColor: 'rgba(15, 23, 42, 1)',
            gridColor: 'rgba(30, 41, 59, 0.5)',
            hide_top_toolbar: false,
            hide_legend: false,
            save_image: false,
            calendar: false,
            hide_volume: false,
            support_host: 'https://www.tradingview.com',
            allow_symbol_change: true,
            withdateranges: true,
        });

        containerRef.current.appendChild(script);
    }, [activeSymbol, interval]);

    return (
        <div className={cn('flex flex-col bg-slate-950 overflow-hidden', className)}>
            {/* Header */}
            <div className="shrink-0 px-4 py-2.5 bg-zinc-900/80 border-b border-zinc-800 flex items-center gap-3">
                <TrendingUp size={14} className="text-emerald-400" />
                <span className="text-xs font-bold text-slate-200 uppercase tracking-widest">Market Terminal</span>

                {/* Symbol tabs */}
                <div className="flex items-center gap-1 ml-4">
                    {MARKET_SYMBOLS.map(sym => (
                        <button
                            key={sym.id}
                            onClick={() => setActiveSymbol(sym)}
                            title={sym.description}
                            className={cn(
                                'px-2 py-1 text-[10px] font-bold rounded transition-all border',
                                activeSymbol.id === sym.id
                                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                                    : 'bg-zinc-800/60 border-zinc-700/40 text-slate-400 hover:text-slate-200 hover:bg-zinc-700'
                            )}
                        >
                            {sym.labelKo}
                        </button>
                    ))}
                </div>

                {/* Interval selector */}
                <div className="ml-auto flex items-center gap-1">
                    {['15', '60', 'D', 'W'].map(intv => (
                        <button
                            key={intv}
                            onClick={() => setInterval_(intv)}
                            title={intv === '15' ? '15분' : intv === '60' ? '1시간' : intv === 'D' ? '1일' : '1주'}
                            className={cn(
                                'px-1.5 py-0.5 text-[9px] font-mono font-bold rounded',
                                interval === intv
                                    ? 'bg-cyan-500/15 text-cyan-400'
                                    : 'text-slate-500 hover:text-slate-300'
                            )}
                        >
                            {intv === '15' ? '15m' : intv === '60' ? '1H' : intv === 'D' ? '1D' : '1W'}
                        </button>
                    ))}
                </div>
            </div>

            {/* TradingView Chart Container */}
            <div className="flex-1 relative min-h-[300px]">
                <div ref={containerRef} className="tradingview-widget-container w-full h-full" />
            </div>
        </div>
    );
}
