/**
 * MacroIntelligenceBoard — Collapsible bottom panel with tabbed macro data views.
 * Consolidates: BEVI, Market Quotes, FX Rates, News Intel, Geopolitical Risk.
 */
import React, { useState } from 'react';
import {
    ChevronDown, ChevronUp, Activity, TrendingUp, DollarSign,
    Newspaper, Shield, BarChart3,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useOntologyStore } from '../../store/ontologyStore';

type MacroTab = 'bevi' | 'market' | 'fx' | 'intel' | 'geo';

const TABS: { id: MacroTab; label: string; icon: React.ReactNode }[] = [
    { id: 'bevi', label: 'BEVI', icon: <Activity size={13} /> },
    { id: 'market', label: 'Market', icon: <TrendingUp size={13} /> },
    { id: 'fx', label: 'FX', icon: <DollarSign size={13} /> },
    { id: 'intel', label: 'Intel', icon: <Newspaper size={13} /> },
    { id: 'geo', label: 'Geo Risk', icon: <Shield size={13} /> },
];

interface MacroIntelligenceBoardProps {
    expanded: boolean;
    onToggle: () => void;
}

export default function MacroIntelligenceBoard({ expanded, onToggle }: MacroIntelligenceBoardProps) {
    const [activeTab, setActiveTab] = useState<MacroTab>('bevi');

    return (
        <div className={cn(
            "border-t border-slate-800/60 bg-slate-950/80 backdrop-blur-sm transition-all duration-300",
            expanded ? "h-[260px]" : "h-[36px]"
        )}>
            {/* Tab Bar / Header */}
            <div className="flex items-center h-[36px] px-3 gap-1 border-b border-slate-800/40">
                <button
                    onClick={onToggle}
                    className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold text-slate-400 hover:text-slate-200 transition-colors uppercase tracking-widest mr-2"
                >
                    <BarChart3 size={12} />
                    Macro Intelligence
                    {expanded ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
                </button>
                {expanded && (
                    <div className="flex items-center gap-0.5">
                        {TABS.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={cn(
                                    "flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-medium transition-all",
                                    activeTab === tab.id
                                        ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30"
                                        : "text-slate-500 hover:text-slate-300 border border-transparent"
                                )}
                            >
                                {tab.icon}
                                {tab.label}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Content */}
            {expanded && (
                <div className="h-[calc(100%-36px)] overflow-y-auto custom-scrollbar p-3">
                    {activeTab === 'bevi' && <BEVITab />}
                    {activeTab === 'market' && <MarketTab />}
                    {activeTab === 'fx' && <FXTab />}
                    {activeTab === 'intel' && <IntelTab />}
                    {activeTab === 'geo' && <GeoRiskTab />}
                </div>
            )}
        </div>
    );
}

// ============================================================
// TAB: BEVI
// ============================================================
function BEVITab() {
    const bevi = useOntologyStore(s => s.bevi);

    const trendIcon = bevi.trend === 'up' ? '📈' : bevi.trend === 'down' ? '📉' : '➡️';
    const trendColor = bevi.trend === 'up' ? 'text-rose-400' : bevi.trend === 'down' ? 'text-emerald-400' : 'text-slate-400';
    const valueColor = bevi.value >= 70 ? 'text-rose-400' : bevi.value >= 40 ? 'text-amber-400' : 'text-emerald-400';

    return (
        <div className="flex gap-6">
            {/* Main gauge */}
            <div className="flex flex-col items-center gap-2 min-w-[120px]">
                <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">BEVI Index</span>
                <span className={cn("text-4xl font-black font-mono", valueColor)}>{bevi.value}</span>
                <span className={cn("text-xs font-mono font-bold flex items-center gap-1", trendColor)}>
                    {trendIcon} {bevi.delta > 0 ? '+' : ''}{bevi.delta}
                </span>
                <span className="text-[9px] text-slate-600 text-center">{bevi.topFactor}</span>
            </div>

            {/* Components */}
            <div className="flex-1 grid grid-cols-3 gap-3">
                <ComponentCard label="Macro Risk" value={bevi.macroRiskAvg} color="rose" weight="40%" />
                <ComponentCard label="Asset Risk" value={bevi.assetRiskAvg} color="amber" weight="30%" />
                <ComponentCard label="Intel Shock" value={bevi.intelShockAvg} color="cyan" weight="30%" />
            </div>

            {/* Sparkline (history) */}
            <div className="min-w-[200px] flex flex-col gap-1">
                <span className="text-[9px] text-slate-500 uppercase tracking-wider font-bold">History</span>
                <div className="flex items-end gap-[2px] h-[80px]">
                    {bevi.history.slice(0, 30).reverse().map((h, i) => (
                        <div
                            key={i}
                            className={cn("w-[5px] rounded-t transition-all",
                                h.value >= 70 ? 'bg-rose-500' : h.value >= 40 ? 'bg-amber-500' : 'bg-emerald-500'
                            )}
                            style={{ height: `${Math.max(4, h.value)}%` }}
                        />
                    ))}
                </div>
                <span className="text-[9px] text-slate-600 font-mono">
                    last calc: {bevi.lastCalculatedAt?.split('T')[1]?.slice(0, 8) || '-'}
                </span>
            </div>
        </div>
    );
}

function ComponentCard({ label, value, color, weight }: { label: string; value: number; color: string; weight: string }) {
    const bg = color === 'rose' ? 'bg-rose-500' : color === 'amber' ? 'bg-amber-500' : 'bg-cyan-500';
    return (
        <div className="bg-slate-900/50 border border-slate-800/50 rounded-lg p-3">
            <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] text-slate-500 uppercase tracking-wider">{label}</span>
                <span className="text-[9px] text-slate-600 font-mono">{weight}</span>
            </div>
            <span className="text-lg font-bold font-mono text-slate-200">{Math.round(value)}</span>
            <div className="mt-1.5 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div className={cn("h-full rounded-full", bg)} style={{ width: `${Math.min(100, value)}%` }} />
            </div>
        </div>
    );
}

// ============================================================
// TAB: MARKET QUOTES
// ============================================================
function MarketTab() {
    const quotes = useOntologyStore(s => s.lsegMarketQuotes);
    const source = useOntologyStore(s => s.lsegDataSource);
    const quantMetrics = useOntologyStore(s => s.lsegQuantMetrics);

    if (quotes.length === 0) {
        return <div className="text-xs text-slate-600 text-center py-6">No market data available. Waiting for sync...</div>;
    }

    return (
        <div>
            <div className="flex items-center gap-2 mb-2">
                <span className="text-[9px] text-slate-500 uppercase tracking-wider font-bold">Live Quotes</span>
                <span className={cn("text-[9px] px-1.5 py-0.5 rounded font-bold",
                    source === 'live' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-700/50 text-slate-400'
                )}>
                    {source === 'live' ? '● LIVE' : '○ DEMO'}
                </span>
            </div>
            <div className="grid grid-cols-4 xl:grid-cols-6 gap-2">
                {quotes.map((q, i) => {
                    const metric = quantMetrics[q.symbol];
                    const isAlert = metric?.riskAlert;
                    return (
                        <div key={i} className={cn(
                            "bg-slate-900/60 border rounded-lg px-3 py-2",
                            isAlert ? "border-rose-500/40 bg-rose-950/20" : "border-slate-800/50"
                        )}>
                            <div className="text-[9px] text-slate-500 font-mono truncate">{q.symbol}</div>
                            <div className="text-sm font-bold font-mono text-slate-200">{q.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                            <div className={cn("text-[10px] font-mono font-bold",
                                q.change >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            )}>
                                {q.change >= 0 ? '+' : ''}{q.changePercent?.toFixed(2) || q.change?.toFixed(2)}%
                            </div>
                            {metric && (
                                <div className="text-[8px] text-slate-600 font-mono mt-0.5">
                                    Z={metric.zScore.toFixed(1)} {metric.trend}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ============================================================
// TAB: FX RATES
// ============================================================
function FXTab() {
    const objects = useOntologyStore(s => s.objects);
    const currencies = objects.filter(o => o.type === 'MarketIndicator' && o.properties.code != null);
    const simulationParams = useOntologyStore(s => s.simulationParams);

    return (
        <div className="flex gap-4">
            <div className="bg-slate-900/50 border border-slate-800/50 rounded-lg p-4 min-w-[160px]">
                <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">USD/KRW</div>
                <div className="text-2xl font-black font-mono text-slate-200">
                    {(simulationParams as any).usdKrw?.toLocaleString() || '1,350'}
                </div>
                <div className="text-[10px] text-slate-500 mt-1">Korean Won</div>
            </div>
            {currencies.map(c => (
                <div key={c.id} className="bg-slate-900/50 border border-slate-800/50 rounded-lg p-4 min-w-[140px]">
                    <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">{c.title}</div>
                    <div className="text-xl font-bold font-mono text-slate-200">
                        {Number(c.properties.baseRate || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">{`${c.description || ''}`}</div>
                </div>
            ))}
            <div className="bg-slate-900/50 border border-slate-800/50 rounded-lg p-4 min-w-[160px]">
                <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">VLSFO</div>
                <div className="text-2xl font-black font-mono text-amber-400">
                    ${simulationParams.vlsfoPrice}
                </div>
                <div className="text-[10px] text-slate-500 mt-1">$/mt Bunker Price</div>
            </div>
        </div>
    );
}

// ============================================================
// TAB: INTEL (NEWS)
// ============================================================
function IntelTab() {
    const articles = useOntologyStore(s => s.intelArticles);
    const recent = articles.slice(0, 12);

    if (recent.length === 0) {
        return <div className="text-xs text-slate-600 text-center py-6">No intel articles. Waiting for OSINT pipeline...</div>;
    }

    return (
        <div className="grid grid-cols-2 xl:grid-cols-3 gap-2">
            {recent.map(a => (
                <div key={a.id} className="bg-slate-900/50 border border-slate-800/50 rounded-lg px-3 py-2 hover:border-slate-700/60 transition-colors">
                    <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-[9px]">{a.sourceBadge || '📰'}</span>
                        <span className="text-[9px] text-slate-500 truncate">{a.source}</span>
                        <span className={cn("ml-auto text-[8px] px-1 py-0.5 rounded font-bold",
                            a.riskLevel === 'Critical' ? 'bg-rose-500/15 text-rose-400' :
                                a.riskLevel === 'High' ? 'bg-amber-500/15 text-amber-400' :
                                    'bg-slate-700/50 text-slate-400'
                        )}>{a.riskLevel}</span>
                    </div>
                    <div className="text-[11px] text-slate-300 font-medium line-clamp-2 leading-tight">{a.title}</div>
                    <div className="text-[9px] text-slate-600 mt-1 font-mono">
                        {new Date(a.publishedAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                </div>
            ))}
        </div>
    );
}

// ============================================================
// TAB: GEO RISK
// ============================================================
function GeoRiskTab() {
    const objects = useOntologyStore(s => s.objects);
    const riskFactors = objects.filter(o =>
        o.type === 'RiskEvent'
    ).sort((a, b) => (Number(b.properties.riskScore) || 0) - (Number(a.properties.riskScore) || 0));

    return (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
            {riskFactors.map(rf => {
                const score = Number(rf.properties.riskScore || 0);
                const color = score >= 80 ? 'rose' : score >= 50 ? 'amber' : 'emerald';
                return (
                    <div key={rf.id} className="bg-slate-900/50 border border-slate-800/50 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[10px] text-slate-300 font-medium truncate">{rf.title}</span>
                            <span className={cn("text-xs font-bold font-mono",
                                color === 'rose' ? 'text-rose-400' : color === 'amber' ? 'text-amber-400' : 'text-emerald-400'
                            )}>{score}</span>
                        </div>
                        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div className={cn("h-full rounded-full",
                                color === 'rose' ? 'bg-rose-500' : color === 'amber' ? 'bg-amber-500' : 'bg-emerald-500'
                            )} style={{ width: `${Math.min(100, score)}%` }} />
                        </div>
                        <div className="text-[9px] text-slate-600 mt-1 truncate">{rf.description || `${rf.properties.category || '-'}`}</div>
                    </div>
                );
            })}
        </div>
    );
}
