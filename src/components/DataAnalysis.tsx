import React, { useState, useMemo, useCallback } from 'react';
import {
    TrendingUp, Plus, X, BarChart3, LineChart, Hash, Table2, Filter as FilterIcon,
    Calculator, Save, Trash2, ChevronDown, Sparkles, ArrowRight, GripVertical, Eye
} from 'lucide-react';
import { cn } from '../lib/utils';
import type { SimulationParams, ChartDataPoint, FleetVessel } from '../types';

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
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/50 bg-slate-900/50 shrink-0">
                <div>
                    <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2.5">
                        <TrendingUp className="text-cyan-400" size={20} />
                        데이터 분석 (Analysis Canvas)
                    </h1>
                    <p className="text-xs text-slate-500 mt-1">
                        카드 기반 데이터 탐색 · 통계 연산 · 시계열 분석 · 위젯 빌더
                    </p>
                </div>
                <div className="flex items-center gap-3">
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

            {/* Canvas — Card Grid */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
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
        </div>
    );
}
