import React, { useState, useMemo, useCallback } from 'react';
import {
    TrendingUp, Plus, X, BarChart3, LineChart, Hash, Table2, Filter as FilterIcon,
    Calculator, Save, Trash2, ChevronDown, Sparkles, ArrowRight, GripVertical, Eye,
    GitBranch, TrendingDown, AlertTriangle, Zap, CandlestickChart
} from 'lucide-react';
import { cn, computeObjectDeltas, computeBranchMetrics } from '../lib/utils';
import type { SimulationParams, ChartDataPoint, FleetVessel } from '../types';
import { useOntologyStore } from '../store/ontologyStore';
import TradingViewWidget from './widgets/TradingViewWidget';

// ============================================================
// TYPES
// ============================================================
type CardType = 'kpi' | 'timeseries' | 'bar' | 'table' | 'filter' | 'formula';

interface AnalysisCard {
    id: string;
    type: CardType;
    title: string;
    config: Record<string, any>;
    inputCardId?: string; // Chain from another card
}

interface CustomWidget {
    id: string;
    title: string;
    type: 'kpi' | 'line' | 'bar' | 'table';
    dataSource: string;
    config: Record<string, any>;
}

// ============================================================
// STATISTICAL HELPERS
// ============================================================
function mean(arr: number[]): number {
    if (arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdDev(arr: number[]): number {
    if (arr.length < 2) return 0;
    const m = mean(arr);
    return Math.sqrt(arr.reduce((sum, v) => sum + (v - m) ** 2, 0) / (arr.length - 1));
}

function movingAverage(arr: number[], window: number): number[] {
    return arr.map((_, i) => {
        const start = Math.max(0, i - window + 1);
        const slice = arr.slice(start, i + 1);
        return mean(slice);
    });
}

function correlation(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length < 2) return 0;
    const ma = mean(a), mb = mean(b);
    const sa = stdDev(a), sb = stdDev(b);
    if (sa === 0 || sb === 0) return 0;
    const cov = a.reduce((sum, v, i) => sum + (v - ma) * (b[i] - mb), 0) / (a.length - 1);
    return +(cov / (sa * sb)).toFixed(4);
}

function bollingerBands(arr: number[], window: number = 20, k: number = 2): { upper: number[]; lower: number[]; mid: number[] } {
    const mid = movingAverage(arr, window);
    const upper: number[] = [];
    const lower: number[] = [];
    arr.forEach((_, i) => {
        const start = Math.max(0, i - window + 1);
        const slice = arr.slice(start, i + 1);
        const sd = stdDev(slice);
        upper.push(+(mid[i] + k * sd).toFixed(2));
        lower.push(+(mid[i] - k * sd).toFixed(2));
    });
    return { upper, lower, mid: mid.map(v => +v.toFixed(2)) };
}

// ============================================================
// COMPONENT
// ============================================================
interface DataAnalysisProps {
    simulationParams: SimulationParams;
    dynamicChartData: ChartDataPoint[];
    dynamicFleetData: FleetVessel[];
}

const CARD_TYPE_META: Record<CardType, { icon: React.ReactNode; label: string; color: string }> = {
    kpi: { icon: <Hash size={14} />, label: 'KPI 숫자', color: 'text-amber-400' },
    timeseries: { icon: <LineChart size={14} />, label: '시계열 차트', color: 'text-cyan-400' },
    bar: { icon: <BarChart3 size={14} />, label: '바 차트', color: 'text-emerald-400' },
    table: { icon: <Table2 size={14} />, label: '테이블', color: 'text-violet-400' },
    filter: { icon: <FilterIcon size={14} />, label: '필터', color: 'text-rose-400' },
    formula: { icon: <Calculator size={14} />, label: '수식', color: 'text-blue-400' },
};

export default function DataAnalysis({ simulationParams, dynamicChartData, dynamicFleetData }: DataAnalysisProps) {
    const objects = useOntologyStore((s) => s.objects);
    const scenarioBranch = useOntologyStore((s) => s.scenarioBranch);
    const clearScenarioBranch = useOntologyStore((s) => s.clearScenarioBranch);
    const [cards, setCards] = useState<AnalysisCard[]>(() => {
        try {
            const saved = localStorage.getItem('sidecar_analysis_cards');
            if (saved) return JSON.parse(saved);
        } catch { /* ignore */ }
        // Default starter cards
        return [
            { id: 'card_vol_kpi', type: 'kpi' as CardType, title: '경영환경 변동성 지수 (현재)', config: { metric: 'compositeVolatility' } },
            { id: 'card_spread', type: 'kpi' as CardType, title: '평균 Spread (WS_High-Low)', config: { metric: 'avgSpread' } },
            { id: 'card_ts', type: 'timeseries' as CardType, title: '변동성 시계열 + 볼린저밴드', config: { series: 'News_Sentiment_Score', showBollinger: true, window: 5 } },
            { id: 'card_bar', type: 'bar' as CardType, title: 'Fleet Risk Distribution', config: { groupBy: 'riskLevel' } },
            { id: 'card_corr', type: 'formula' as CardType, title: '변동성↔Spread 상관계수', config: { seriesA: 'News_Sentiment_Score', seriesB: 'Spread' } },
            { id: 'card_table', type: 'table' as CardType, title: '선대 오브젝트 테이블', config: { source: 'fleet' } },
        ];
    });

    const [showAddMenu, setShowAddMenu] = useState(false);
    const [activeTab, setActiveTab] = useState<'analytics' | 'market'>('analytics');

    const saveCards = useCallback((newCards: AnalysisCard[]) => {
        setCards(newCards);
        localStorage.setItem('sidecar_analysis_cards', JSON.stringify(newCards));
    }, []);

    const addCard = (type: CardType) => {
        const newCard: AnalysisCard = {
            id: `card_${Date.now()}`,
            type,
            title: `새 ${CARD_TYPE_META[type].label}`,
            config: type === 'kpi' ? { metric: 'compositeVolatility' } :
                type === 'timeseries' ? { series: 'Base_WS', showBollinger: false, window: 5 } :
                    type === 'bar' ? { groupBy: 'riskLevel' } :
                        type === 'formula' ? { seriesA: 'News_Sentiment_Score', seriesB: 'Spread' } :
                            type === 'table' ? { source: 'fleet' } :
                                {}
        };
        saveCards([...cards, newCard]);
        setShowAddMenu(false);
    };

    const removeCard = (id: string) => saveCards(cards.filter(c => c.id !== id));

    const saveAsWidget = (card: AnalysisCard) => {
        try {
            const existing = JSON.parse(localStorage.getItem('sidecar_custom_widgets') || '[]');
            const widget: CustomWidget = {
                id: `widget_${Date.now()}`,
                title: card.title,
                type: card.type === 'timeseries' ? 'line' : card.type === 'formula' ? 'kpi' : card.type as any,
                dataSource: card.config.metric || card.config.series || 'fleet',
                config: card.config,
            };
            localStorage.setItem('sidecar_custom_widgets', JSON.stringify([...existing, widget]));
            alert(`✅ "${card.title}" 위젯이 대시보드에 추가되었습니다!`);
        } catch { /* ignore */ }
    };

    // ============================================================
    // COMPUTED DATA
    // ============================================================
    const computedStats = useMemo(() => {
        const sentiments = dynamicChartData.map(d => d.News_Sentiment_Score);
        const spreads = dynamicChartData.map(d => d.Spread);
        const baseWS = dynamicChartData.map(d => d.Base_WS);

        const supplyChain = (simulationParams.supplyChainStress as number) || 10;
        const cyber = (simulationParams.cyberThreatLevel as number) || 5;
        const disaster = (simulationParams.naturalDisasterIndex as number) || 0;
        const pandemic = (simulationParams.pandemicRisk as number) || 0;
        const tradeWar = (simulationParams.tradeWarIntensity as number) || 5;
        const energy = (simulationParams.energyCrisisLevel as number) || 10;

        const compositeVolatility = +(
            simulationParams.newsSentimentScore * 0.20 +
            supplyChain * 0.15 +
            energy * 0.15 +
            tradeWar * 0.12 +
            cyber * 0.10 +
            pandemic * 0.10 +
            disaster * 0.08 +
            Math.min(100, (simulationParams.vlsfoPrice / 15)) * 0.05 +
            Math.min(100, simulationParams.awrpRate * 400) * 0.05
        ).toFixed(1);

        const sentimentBollinger = bollingerBands(sentiments, 5);
        const spreadBollinger = bollingerBands(spreads, 5);

        const riskDistribution = dynamicFleetData.reduce((acc, v) => {
            acc[v.riskLevel] = (acc[v.riskLevel] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        return {
            compositeVolatility: +compositeVolatility,
            avgSpread: spreads.length > 0 ? +mean(spreads).toFixed(1) : 0,
            spreadStdDev: spreads.length > 0 ? +stdDev(spreads).toFixed(2) : 0,
            sentimentCorrelation: correlation(sentiments, spreads),
            sentimentBollinger,
            spreadBollinger,
            sentiments,
            spreads,
            baseWS,
            riskDistribution,
            fleetCount: dynamicFleetData.length,
            highRiskCount: dynamicFleetData.filter(v => v.riskLevel === 'High' || v.riskLevel === 'Critical').length,
        };
    }, [dynamicChartData, dynamicFleetData, simulationParams]);

    // ============================================================
    // CARD RENDERERS
    // ============================================================
    const renderKPI = (card: AnalysisCard) => {
        const metric = card.config.metric;
        let value: number | string = '-';
        let unit = '';
        let trend = '';
        let color = 'text-cyan-400';

        if (metric === 'compositeVolatility') {
            value = computedStats.compositeVolatility;
            unit = '/100';
            const numVal = value as number;
            color = numVal > 60 ? 'text-rose-400' : numVal > 35 ? 'text-amber-400' : 'text-emerald-400';
            trend = numVal > 50 ? '▲ HIGH RISK' : numVal > 30 ? '— MODERATE' : '▼ STABLE';
        } else if (metric === 'avgSpread') {
            value = computedStats.avgSpread;
            unit = 'WS pts';
            trend = `σ = ${computedStats.spreadStdDev}`;
        } else if (metric === 'fleetCount') {
            value = computedStats.fleetCount;
            unit = '척';
            trend = `위험 ${computedStats.highRiskCount}척`;
            color = computedStats.highRiskCount > 2 ? 'text-rose-400' : 'text-emerald-400';
        }

        return (
            <div className="flex flex-col items-center justify-center h-full py-4">
                <div className={cn("text-4xl font-black tracking-tight", color)}>{value}<span className="text-lg text-slate-500 ml-1">{unit}</span></div>
                <div className="text-xs text-slate-500 mt-2 font-medium">{trend}</div>
            </div>
        );
    };

    const renderTimeSeries = (card: AnalysisCard) => {
        const seriesKey = card.config.series || 'News_Sentiment_Score';
        const data = dynamicChartData.map((d: any) => d[seriesKey] as number);
        const dates = dynamicChartData.map(d => d.date);
        const showBollinger = card.config.showBollinger;
        const window = card.config.window || 5;

        if (data.length === 0) return <div className="text-slate-500 text-sm p-4">데이터 없음</div>;

        const bb = showBollinger ? bollingerBands(data, window) : null;
        const maxVal = Math.max(...data, ...(bb?.upper || []));
        const minVal = Math.min(...data, ...(bb?.lower || []));
        const range = maxVal - minVal || 1;
        const h = 140;
        const w = 100; // percentage

        const toY = (v: number) => h - ((v - minVal) / range) * (h - 10) - 5;

        const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${toY(v)}`).join(' ');
        const bbUpper = bb ? bb.upper.map((v, i) => `${(i / (data.length - 1)) * w},${toY(v)}`).join(' ') : '';
        const bbLower = bb ? bb.lower.map((v, i) => `${(i / (data.length - 1)) * w},${toY(v)}`).join(' ') : '';

        return (
            <div className="px-3 py-2">
                <div className="flex items-center gap-3 mb-2 text-[10px]">
                    <span className="text-slate-500">Series: <span className="text-slate-300 font-bold">{seriesKey}</span></span>
                    <span className="text-slate-500">Mean: <span className="text-cyan-400 font-bold">{mean(data).toFixed(1)}</span></span>
                    <span className="text-slate-500">σ: <span className="text-amber-400 font-bold">{stdDev(data).toFixed(2)}</span></span>
                </div>
                <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: `${h}px` }} preserveAspectRatio="none">
                    {bb && (
                        <>
                            <polyline points={bbUpper} fill="none" stroke="#f59e0b" strokeWidth="0.3" strokeDasharray="2,2" opacity="0.5" />
                            <polyline points={bbLower} fill="none" stroke="#f59e0b" strokeWidth="0.3" strokeDasharray="2,2" opacity="0.5" />
                            {/* Fill area between bands */}
                            <polygon
                                points={`${bbUpper},${bb.lower.map((v, i) => `${((data.length - 1 - i) / (data.length - 1)) * w},${toY(v)}`).join(',')}`}
                                fill="#f59e0b" opacity="0.05"
                            />
                        </>
                    )}
                    <polyline points={points} fill="none" stroke="#06b6d4" strokeWidth="0.5" />
                    {/* Latest point */}
                    {data.length > 0 && (
                        <circle cx={`${w}`} cy={`${toY(data[data.length - 1])}`} r="1.5" fill="#06b6d4" />
                    )}
                </svg>
                <div className="flex justify-between text-[9px] text-slate-600 mt-1">
                    <span>{dates[0]}</span>
                    <span>{dates[dates.length - 1]}</span>
                </div>
            </div>
        );
    };

    const renderBar = (card: AnalysisCard) => {
        const dist = computedStats.riskDistribution;
        const entries: [string, number][] = Object.entries(dist) as [string, number][];
        const maxCount = Math.max(...entries.map(([, v]) => v), 1);
        const colors: Record<string, string> = { Low: '#10b981', Medium: '#f59e0b', High: '#ef4444', Critical: '#dc2626' };

        return (
            <div className="px-4 py-3 space-y-2.5">
                {entries.map(([level, count]) => (
                    <div key={level} className="flex items-center gap-3">
                        <span className="text-xs text-slate-400 w-16 shrink-0">{level}</span>
                        <div className="flex-1 bg-slate-800 rounded-full h-5 overflow-hidden">
                            <div
                                className="h-full rounded-full flex items-center justify-end px-2 transition-all duration-700"
                                style={{ width: `${(count / maxCount) * 100}%`, backgroundColor: colors[level] || '#64748b' }}
                            >
                                <span className="text-[10px] text-white font-bold">{count}</span>
                            </div>
                        </div>
                    </div>
                ))}
                <div className="text-[10px] text-slate-500 mt-2">
                    총 {computedStats.fleetCount}척 | 고위험 {computedStats.highRiskCount}척 ({((computedStats.highRiskCount / Math.max(computedStats.fleetCount, 1)) * 100).toFixed(0)}%)
                </div>
            </div>
        );
    };

    const renderFormula = (card: AnalysisCard) => {
        const corrVal = computedStats.sentimentCorrelation;
        const strength = Math.abs(corrVal) > 0.7 ? '강한' : Math.abs(corrVal) > 0.4 ? '보통' : '약한';
        const direction = corrVal > 0 ? '양(+)' : '음(-)';

        return (
            <div className="flex flex-col items-center justify-center h-full py-4">
                <div className="text-xs text-slate-500 mb-1">Pearson Correlation (ρ)</div>
                <div className={cn("text-3xl font-black", Math.abs(corrVal) > 0.5 ? 'text-amber-400' : 'text-slate-300')}>
                    {corrVal}
                </div>
                <div className="text-xs text-slate-400 mt-2">
                    {strength} {direction}의 상관관계
                </div>
                <div className="text-[10px] text-slate-600 mt-1">
                    {card.config.seriesA} ↔ {card.config.seriesB}
                </div>
            </div>
        );
    };

    const renderTable = (card: AnalysisCard) => {
        const rows = dynamicFleetData.slice(0, 10);
        return (
            <div className="overflow-x-auto">
                <table className="w-full text-xs">
                    <thead>
                        <tr className="border-b border-slate-800">
                            <th className="text-left p-2 text-slate-400 font-medium">선명</th>
                            <th className="text-left p-2 text-slate-400 font-medium">선종</th>
                            <th className="text-left p-2 text-slate-400 font-medium">위치</th>
                            <th className="text-left p-2 text-slate-400 font-medium">Risk</th>
                            <th className="text-right p-2 text-slate-400 font-medium">F.O. ROB</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((v, i) => (
                            <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                                <td className="p-2 text-slate-200 font-medium">{v.vessel_name}</td>
                                <td className="p-2 text-slate-400">{v.vessel_type}</td>
                                <td className="p-2 text-slate-400 max-w-[120px] truncate">{v.location}</td>
                                <td className="p-2">
                                    <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-bold",
                                        v.riskLevel === 'Low' ? 'bg-emerald-500/20 text-emerald-400' :
                                            v.riskLevel === 'Medium' ? 'bg-amber-500/20 text-amber-400' :
                                                v.riskLevel === 'High' ? 'bg-rose-500/20 text-rose-400' :
                                                    'bg-red-500/20 text-red-400'
                                    )}>{v.riskLevel}</span>
                                </td>
                                <td className="p-2 text-right text-slate-300 font-mono">{v.consumption_and_rob.fo_rob.toLocaleString()} mt</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    const renderCardContent = (card: AnalysisCard) => {
        switch (card.type) {
            case 'kpi': return renderKPI(card);
            case 'timeseries': return renderTimeSeries(card);
            case 'bar': return renderBar(card);
            case 'formula': return renderFormula(card);
            case 'table': return renderTable(card);
            case 'filter': return <div className="p-4 text-sm text-slate-500">필터 카드 — 상위 카드 출력을 필터링합니다.</div>;
            default: return null;
        }
    };

    // ============================================================
    // RENDER
    // ============================================================
    return (
        <div className="h-full flex flex-col bg-slate-950 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-slate-800/50 bg-slate-900/50 shrink-0">
                <div className="flex items-center gap-6">
                    <h1 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                        <TrendingUp className="text-cyan-400" size={18} />
                        데이터 분석
                    </h1>
                    {/* Tab nav */}
                    <div className="flex items-center gap-1 bg-zinc-800/60 rounded-lg p-0.5">
                        <button
                            onClick={() => setActiveTab('analytics')}
                            title="분석 캐버스"
                            className={cn(
                                'px-3 py-1.5 text-xs font-bold rounded-md transition-all',
                                activeTab === 'analytics'
                                    ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                                    : 'text-slate-400 hover:text-slate-200'
                            )}
                        >
                            <Calculator size={12} className="inline mr-1" /> Analytics
                        </button>
                        <button
                            onClick={() => setActiveTab('market')}
                            title="마켓 터미널"
                            className={cn(
                                'px-3 py-1.5 text-xs font-bold rounded-md transition-all',
                                activeTab === 'market'
                                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                    : 'text-slate-400 hover:text-slate-200'
                            )}
                        >
                            <CandlestickChart size={12} className="inline mr-1" /> Market
                        </button>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {/* Branch indicator */}
                    {scenarioBranch && (
                        <div className="flex items-center gap-2 bg-purple-950/30 border border-purple-800/40 rounded-lg px-3 py-2 text-xs">
                            <GitBranch size={14} className="text-purple-400" />
                            <span className="text-purple-300 font-medium">{scenarioBranch.name}</span>
                            <button onClick={clearScenarioBranch} className="text-slate-500 hover:text-rose-400 ml-1 transition-colors">
                                <X size={12} />
                            </button>
                        </div>
                    )}
                    {/* Live indicator */}
                    <div className="flex items-center gap-2 bg-slate-800/80 border border-slate-700 rounded-lg px-3 py-2 text-xs">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-slate-300">파라미터 실시간 반영 중</span>
                    </div>
                    <div className="relative">
                        <button
                            onClick={() => setShowAddMenu(!showAddMenu)}
                            className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2.5 rounded-lg text-sm font-bold transition-colors shadow-lg shadow-cyan-900/20"
                        >
                            <Plus size={16} /> Add Card
                        </button>
                        {showAddMenu && (
                            <div className="absolute right-0 top-full mt-2 w-52 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                                {Object.entries(CARD_TYPE_META).map(([type, meta]) => (
                                    <button
                                        key={type}
                                        onClick={() => addCard(type as CardType)}
                                        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-300 hover:bg-slate-800 transition-colors"
                                    >
                                        <span className={meta.color}>{meta.icon}</span>
                                        {meta.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* TAB: Market Terminal */}
            {activeTab === 'market' ? (
                <TradingViewWidget className="flex-1" />
            ) : (
                /* TAB: Analysis Canvas */
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                    {/* Scenario Branch Comparison Dashboard */}
                    {scenarioBranch && <BranchComparisonDashboard baseObjects={scenarioBranch.baseObjects} branch={scenarioBranch} />}

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                        {cards.map(card => {
                            const meta = CARD_TYPE_META[card.type];
                            return (
                                <div
                                    key={card.id}
                                    className={cn(
                                        "bg-slate-900/70 border border-slate-800/80 rounded-2xl overflow-hidden hover:border-slate-700 transition-all shadow-lg",
                                        card.type === 'table' && 'md:col-span-2',
                                        card.type === 'timeseries' && 'md:col-span-2'
                                    )}
                                >
                                    {/* Card Header */}
                                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800/50 bg-slate-800/20">
                                        <div className="flex items-center gap-2.5">
                                            <GripVertical size={12} className="text-slate-600" />
                                            <span className={cn("shrink-0", meta.color)}>{meta.icon}</span>
                                            <h3 className="text-sm font-semibold text-slate-200 truncate max-w-[200px]">{card.title}</h3>
                                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-500 uppercase tracking-wider font-bold">{meta.label}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <button
                                                onClick={() => saveAsWidget(card)}
                                                title="대시보드에 위젯으로 저장"
                                                className="p-1.5 text-slate-500 hover:text-cyan-400 rounded-md hover:bg-slate-800 transition-colors"
                                            >
                                                <Save size={13} />
                                            </button>
                                            <button
                                                onClick={() => removeCard(card.id)}
                                                className="p-1.5 text-slate-500 hover:text-rose-400 rounded-md hover:bg-slate-800 transition-colors"
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Card Content */}
                                    <div className="min-h-[120px]">
                                        {renderCardContent(card)}
                                    </div>
                                </div>
                            );
                        })}

                        {/* Empty state / Add card prompt */}
                        {cards.length === 0 && (
                            <div className="col-span-full flex items-center justify-center py-20">
                                <div className="text-center">
                                    <Sparkles className="text-cyan-400 mx-auto mb-4" size={40} />
                                    <h3 className="text-lg font-bold text-slate-300">분석 캔버스가 비어있습니다</h3>
                                    <p className="text-sm text-slate-500 mt-2">상단의 "Add Card"를 클릭하여 분석 카드를 추가하세요.</p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Statistics Summary Panel */}
                    <div className="mt-8 bg-slate-900/50 border border-slate-800/50 rounded-2xl p-6">
                        <h3 className="text-sm font-bold text-slate-300 mb-4 flex items-center gap-2 uppercase tracking-wider">
                            <Calculator size={14} className="text-cyan-400" /> 실시간 통계 요약
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-4">
                            {[
                                { label: '변동성 지수', value: computedStats.compositeVolatility, unit: '/100', color: computedStats.compositeVolatility > 50 ? 'text-rose-400' : 'text-emerald-400' },
                                { label: '평균 Spread', value: computedStats.avgSpread, unit: 'WS', color: 'text-cyan-400' },
                                { label: 'Spread σ', value: computedStats.spreadStdDev, unit: '', color: 'text-amber-400' },
                                { label: 'ρ (감성↔Spread)', value: computedStats.sentimentCorrelation, unit: '', color: 'text-violet-400' },
                                { label: '선대 규모', value: computedStats.fleetCount, unit: '척', color: 'text-slate-200' },
                                { label: '고위험 선박', value: computedStats.highRiskCount, unit: '척', color: computedStats.highRiskCount > 2 ? 'text-rose-400' : 'text-emerald-400' },
                            ].map((stat, i) => (
                                <div key={i} className="bg-slate-800/50 rounded-xl p-3 text-center">
                                    <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">{stat.label}</div>
                                    <div className={cn("text-xl font-black", stat.color)}>{stat.value}<span className="text-xs text-slate-600 ml-0.5">{stat.unit}</span></div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ============================================================
// BRANCH COMPARISON DASHBOARD
// ============================================================

interface BranchComparisonProps {
    baseObjects: import('../types').OntologyObject[];
    branch: {
        name: string;
        baseParams: SimulationParams;
        branchParams: SimulationParams;
        branchObjects: import('../types').OntologyObject[];
    };
}

function BranchComparisonDashboard({ baseObjects, branch }: BranchComparisonProps) {
    const deltas = useMemo(() => computeObjectDeltas(baseObjects, branch.branchObjects), [baseObjects, branch.branchObjects]);
    const baseMetrics = useMemo(() => computeBranchMetrics(baseObjects), [baseObjects]);
    const branchMetrics = useMemo(() => computeBranchMetrics(branch.branchObjects), [branch.branchObjects]);

    const TYPE_COLORS: Record<string, string> = {
        Vessel: '#06b6d4', Port: '#f59e0b', Commodity: '#a855f7', MacroEvent: '#ef4444',
        Insurance: '#3b82f6', Market: '#64748b', RiskFactor: '#ec4899', Currency: '#10b981',
    };
    const TYPE_LABELS: Record<string, string> = {
        Vessel: '선박', Port: '항구', Commodity: '원자재', MacroEvent: '매크로이벤트',
        Insurance: '보험', Market: '시장', RiskFactor: '리스크팩터', Currency: '통화',
    };

    // Param changes summary
    const paramChanges = useMemo(() => {
        const PARAM_LABELS: Record<string, string> = {
            vlsfoPrice: 'VLSFO 유가', newsSentimentScore: '뉴스 불안지수', awrpRate: 'AWRP 보험률',
            interestRate: '기준금리', supplyChainStress: '공급망 스트레스', cyberThreatLevel: '사이버 위협',
            naturalDisasterIndex: '천재지변', pandemicRisk: '팬데믹', tradeWarIntensity: '무역전쟁',
            energyCrisisLevel: '에너지 위기',
        };
        const changes: { key: string; label: string; base: number; scenario: number; delta: number }[] = [];
        Object.keys(PARAM_LABELS).forEach(key => {
            const base = (branch.baseParams[key] as number) ?? 0;
            const scenario = (branch.branchParams[key] as number) ?? 0;
            const delta = scenario - base;
            if (Math.abs(delta) > 0.001) {
                changes.push({ key, label: PARAM_LABELS[key], base, scenario, delta });
            }
        });
        return changes;
    }, [branch.baseParams, branch.branchParams]);

    const allTypes = useMemo(() => {
        const types = new Set<string>();
        Object.keys(baseMetrics.riskByType).forEach(t => types.add(t));
        Object.keys(branchMetrics.riskByType).forEach(t => types.add(t));
        return Array.from(types);
    }, [baseMetrics, branchMetrics]);

    return (
        <div className="mb-8 space-y-5">
            {/* Header */}
            <div className="bg-gradient-to-r from-purple-950/40 to-slate-900/60 border border-purple-800/30 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-purple-600/20 border border-purple-500/30 rounded-xl flex items-center justify-center">
                            <GitBranch size={20} className="text-purple-400" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-100">시뮬레이션 분기 비교</h2>
                            <p className="text-xs text-slate-400 mt-0.5">
                                <span className="text-cyan-400 font-medium">Base (현재 상태)</span>
                                {' vs '}
                                <span className="text-purple-400 font-medium">{branch.name}</span>
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Zap size={12} className="text-amber-400" />
                        Ripple Effect 적용
                    </div>
                </div>

                {/* Param Changes Pills */}
                {paramChanges.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                        {paramChanges.map(pc => (
                            <div key={pc.key} className="bg-slate-800/60 border border-slate-700/50 rounded-lg px-2.5 py-1.5 text-[10px]">
                                <span className="text-slate-400">{pc.label}: </span>
                                <span className="text-slate-300">{typeof pc.base === 'number' && pc.base % 1 !== 0 ? pc.base.toFixed(2) : pc.base}</span>
                                <span className="text-slate-600 mx-1">→</span>
                                <span className={pc.delta > 0 ? 'text-rose-400' : 'text-emerald-400'}>
                                    {typeof pc.scenario === 'number' && pc.scenario % 1 !== 0 ? pc.scenario.toFixed(2) : pc.scenario}
                                </span>
                                <span className={cn("ml-1 font-bold", pc.delta > 0 ? 'text-rose-400' : 'text-emerald-400')}>
                                    ({pc.delta > 0 ? '+' : ''}{typeof pc.delta === 'number' && pc.delta % 1 !== 0 ? pc.delta.toFixed(2) : pc.delta})
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* KPI Comparison Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: '평균 리스크', base: baseMetrics.avgRisk, branch: branchMetrics.avgRisk, unit: '' },
                    { label: '최대 리스크', base: baseMetrics.maxRisk, branch: branchMetrics.maxRisk, unit: '' },
                    { label: 'Critical 객체', base: baseMetrics.criticalCount, branch: branchMetrics.criticalCount, unit: '개' },
                    { label: 'High+ 객체', base: baseMetrics.highCount, branch: branchMetrics.highCount, unit: '개' },
                ].map((kpi, idx) => {
                    const delta = kpi.branch - kpi.base;
                    return (
                        <div key={idx} className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-5 hover:border-purple-800/40 transition-colors">
                            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-3 font-bold">{kpi.label}</div>
                            <div className="flex items-end justify-between">
                                <div>
                                    <div className="text-xs text-slate-500 mb-0.5">Base</div>
                                    <div className="text-2xl font-black text-cyan-400">{kpi.base}<span className="text-xs text-slate-600 ml-0.5">{kpi.unit}</span></div>
                                </div>
                                <div className="text-center px-2">
                                    <ArrowRight size={14} className="text-slate-600 mx-auto" />
                                    <div className={cn(
                                        "text-xs font-bold mt-1",
                                        delta > 0 ? 'text-rose-400' : delta < 0 ? 'text-emerald-400' : 'text-slate-500'
                                    )}>
                                        {delta > 0 ? '+' : ''}{delta}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-xs text-slate-500 mb-0.5">Branch</div>
                                    <div className="text-2xl font-black text-purple-400">{kpi.branch}<span className="text-xs text-slate-600 ml-0.5">{kpi.unit}</span></div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Risk by Type Bar Chart */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                <div className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-5">
                    <h3 className="text-sm font-bold text-slate-200 mb-4 flex items-center gap-2">
                        <BarChart3 size={14} className="text-purple-400" />
                        유형별 평균 리스크 비교
                    </h3>
                    <div className="space-y-3">
                        {allTypes.map(type => {
                            const baseVal = baseMetrics.riskByType[type] || 0;
                            const branchVal = branchMetrics.riskByType[type] || 0;
                            const maxVal = Math.max(baseVal, branchVal, 1);
                            return (
                                <div key={type} className="space-y-1">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="text-slate-300 font-medium">{TYPE_LABELS[type] || type}</span>
                                        <span className="text-slate-500">
                                            <span className="text-cyan-400">{baseVal}</span>
                                            {' → '}
                                            <span className="text-purple-400">{branchVal}</span>
                                            {branchVal !== baseVal && (
                                                <span className={cn("ml-1 font-bold", branchVal > baseVal ? 'text-rose-400' : 'text-emerald-400')}>
                                                    ({branchVal > baseVal ? '+' : ''}{branchVal - baseVal})
                                                </span>
                                            )}
                                        </span>
                                    </div>
                                    <div className="flex gap-1 h-4">
                                        <div className="flex-1 bg-slate-800 rounded-l overflow-hidden">
                                            <div
                                                className="h-full rounded-l transition-all duration-500"
                                                style={{
                                                    width: `${(baseVal / maxVal) * 100}%`,
                                                    backgroundColor: TYPE_COLORS[type] || '#64748b',
                                                    opacity: 0.6,
                                                }}
                                            />
                                        </div>
                                        <div className="flex-1 bg-slate-800 rounded-r overflow-hidden">
                                            <div
                                                className="h-full rounded-r transition-all duration-500"
                                                style={{
                                                    width: `${(branchVal / maxVal) * 100}%`,
                                                    backgroundColor: '#a855f7',
                                                    opacity: 0.8,
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        <div className="flex items-center gap-4 mt-3 text-[10px] text-slate-500 justify-end">
                            <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-cyan-400/60" /> Base</span>
                            <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-purple-400/80" /> Branch</span>
                        </div>
                    </div>
                </div>

                {/* Most Impacted Objects */}
                <div className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-5">
                    <h3 className="text-sm font-bold text-slate-200 mb-4 flex items-center gap-2">
                        <AlertTriangle size={14} className="text-rose-400" />
                        주요 타격 객체 ({deltas.length})
                    </h3>
                    <div className="space-y-2.5 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
                        {deltas.slice(0, 15).map((d) => (
                            <div key={d.id} className="bg-slate-800/40 border border-slate-700/30 rounded-xl px-3.5 py-2.5 hover:border-purple-800/30 transition-colors">
                                <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider"
                                            style={{ backgroundColor: `${TYPE_COLORS[d.type] || '#64748b'}20`, color: TYPE_COLORS[d.type] || '#64748b' }}>
                                            {d.type}
                                        </span>
                                        <span className="text-xs text-slate-200 font-medium">{d.title}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs">
                                        <span className="text-cyan-400 font-mono">{d.baseRisk}</span>
                                        <ArrowRight size={10} className="text-slate-600" />
                                        <span className="text-purple-400 font-mono font-bold">{d.branchRisk}</span>
                                        <span className={cn(
                                            "font-bold text-[10px] px-1.5 py-0.5 rounded",
                                            d.riskDelta > 0 ? 'bg-rose-500/10 text-rose-400' : 'bg-emerald-500/10 text-emerald-400'
                                        )}>
                                            {d.riskDelta > 0 ? '+' : ''}{d.riskDelta}
                                        </span>
                                    </div>
                                </div>
                                {d.propertyChanges.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                                        {d.propertyChanges.slice(0, 3).map(pc => (
                                            <span key={pc.key} className="text-[9px] text-slate-500 bg-slate-800 rounded px-1.5 py-0.5">
                                                {pc.key}: {pc.delta > 0 ? '+' : ''}{pc.delta}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                        {deltas.length === 0 && (
                            <div className="text-center py-8 text-sm text-slate-500">변동 없음</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
