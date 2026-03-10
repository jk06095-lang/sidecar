import { useEffect, useState } from 'react';
import { DollarSign, TrendingUp, TrendingDown, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { cn } from '../../lib/utils';

interface Rates {
    [key: string]: number;
}

const CURRENCY_LABELS: Record<string, string> = {
    KRW: '🇰🇷 KRW',
    EUR: '🇪🇺 EUR',
    JPY: '🇯🇵 JPY',
    CNY: '🇨🇳 CNY',
    SGD: '🇸🇬 SGD',
    GBP: '🇬🇧 GBP',
    NOK: '🇳🇴 NOK',
};

// Approximate previous rates for change display
const PREV_RATES: Record<string, number> = {
    KRW: 1385, EUR: 0.918, JPY: 149.8, CNY: 7.22, SGD: 1.345, GBP: 0.791, NOK: 10.82,
};

export default function CurrencyWidget() {
    const [rates, setRates] = useState<Rates | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [lastUpdate, setLastUpdate] = useState('');

    const fetchRates = async () => {
        try {
            setLoading(true);
            setError(false);
            const response = await fetch('https://api.frankfurter.dev/v1/latest?base=USD&symbols=KRW,EUR,JPY,CNY,SGD,GBP,NOK');
            if (!response.ok) throw new Error('API Error');
            const json = await response.json();
            setRates(json.rates);
            setLastUpdate(json.date);
        } catch (err) {
            console.error(err);
            setError(true);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchRates(); }, []);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-cyan-500 gap-3 py-10">
                <Loader2 className="animate-spin" size={24} />
                <span className="text-xs font-mono">Fetching FX Rates [Frankfurter]...</span>
            </div>
        );
    }

    if (error || !rates) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-rose-500 gap-2 py-10">
                <AlertCircle size={24} />
                <span className="text-xs font-mono">FX Data Unavailable</span>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-slate-900/40 rounded-lg border border-slate-700/30 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700/50 bg-slate-800/20">
                <DollarSign size={14} className="text-emerald-400" />
                <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-widest">FX Rates (USD Base)</h4>
                <span className="ml-auto flex items-center gap-2">
                    <span className="text-[9px] text-slate-500 font-mono">{lastUpdate}</span>
                    <button onClick={fetchRates} className="text-slate-500 hover:text-cyan-400 transition-colors">
                        <RefreshCw size={12} />
                    </button>
                    <span className="px-1.5 py-0.5 rounded text-[9px] bg-slate-800 text-slate-400 font-mono">LIVE API</span>
                </span>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-1">
                {Object.entries(rates).map(([currency, rateVal]) => {
                    const rate = rateVal as number;
                    const prev = PREV_RATES[currency] || rate;
                    const change = ((rate - prev) / prev) * 100;
                    const isUp = change > 0;

                    return (
                        <div key={currency} className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-800/30 hover:bg-slate-700/30 transition-colors">
                            <div className="flex items-center gap-2">
                                <span className="text-sm">{CURRENCY_LABELS[currency] || currency}</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-sm text-slate-200 font-mono font-semibold">
                                    {rate < 10 ? rate.toFixed(4) : rate < 100 ? rate.toFixed(2) : rate.toFixed(1)}
                                </span>
                                <span className={cn(
                                    'flex items-center gap-0.5 text-[10px] font-mono font-semibold min-w-[50px] justify-end',
                                    isUp ? 'text-rose-400' : 'text-emerald-400'
                                )}>
                                    {isUp ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                                    {isUp ? '+' : ''}{change.toFixed(2)}%
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
            <div className="px-4 py-2 border-t border-slate-800/50 text-[10px] text-slate-500 font-mono">
                API: api.frankfurter.dev · 해운업 주요 결제 통화
            </div>
        </div>
    );
}
