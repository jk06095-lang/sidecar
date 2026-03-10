import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from 'recharts';
import { Shield, AlertTriangle } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { SimulationParams } from '../../types';

interface GeopoliticalRiskWidgetProps {
    simulationParams: SimulationParams;
}

interface RiskScenario {
    name: string;
    probability: number;
    impact: number;
    color: string;
}

export default function GeopoliticalRiskWidget({ simulationParams }: GeopoliticalRiskWidgetProps) {
    const { newsSentimentScore, awrpRate, vlsfoPrice } = simulationParams;

    const riskScenarios = useMemo<RiskScenario[]>(() => {
        const sentimentFactor = newsSentimentScore / 100;
        const awrpFactor = Math.min(awrpRate / 0.5, 1);
        const priceFactor = Math.min((vlsfoPrice - 300) / 1200, 1);

        return [
            { name: '호르무즈 봉쇄', probability: Math.round(sentimentFactor * 65 + awrpFactor * 30), impact: 95, color: '#f43f5e' },
            { name: '보험료 폭등', probability: Math.round(awrpFactor * 80 + sentimentFactor * 15), impact: 75, color: '#f59e0b' },
            { name: '연료 공급 차질', probability: Math.round(priceFactor * 50 + sentimentFactor * 30), impact: 80, color: '#8b5cf6' },
            { name: '우회항로 비용↑', probability: Math.round(sentimentFactor * 55 + awrpFactor * 25), impact: 60, color: '#06b6d4' },
            { name: '용선계약 위반', probability: Math.round(sentimentFactor * 40 + priceFactor * 20), impact: 85, color: '#ec4899' },
            { name: '항만 혼잡', probability: Math.round(sentimentFactor * 35 + priceFactor * 15), impact: 50, color: '#10b981' },
            { name: '선원 교체 불가', probability: Math.round(sentimentFactor * 45 + awrpFactor * 10), impact: 40, color: '#6366f1' },
            { name: 'CII 등급 하락', probability: Math.round(priceFactor * 30 + sentimentFactor * 20), impact: 55, color: '#14b8a6' },
            { name: '자산가치 급변', probability: Math.round(sentimentFactor * 50 + priceFactor * 25), impact: 70, color: '#e11d48' },
            { name: '환율 리스크', probability: Math.round(sentimentFactor * 25 + priceFactor * 30), impact: 45, color: '#a855f7' },
        ];
    }, [newsSentimentScore, awrpRate, vlsfoPrice]);

    const radarData = useMemo(() =>
        riskScenarios.slice(0, 8).map(s => ({
            subject: s.name,
            probability: s.probability,
            impact: s.impact,
        }))
        , [riskScenarios]);

    const topRisks = useMemo(() =>
        [...riskScenarios].sort((a, b) => (b.probability * b.impact) - (a.probability * a.impact)).slice(0, 5)
        , [riskScenarios]);

    const overallRisk = useMemo(() => {
        const avg = riskScenarios.reduce((sum, s) => sum + s.probability, 0) / riskScenarios.length;
        return Math.round(avg);
    }, [riskScenarios]);

    return (
        <div className="flex flex-col h-full bg-slate-900/40 rounded-lg border border-slate-700/30 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700/50 bg-slate-800/20">
                <Shield size={14} className="text-rose-400" />
                <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-widest">Geopolitical Risk Matrix</h4>
                <span className="ml-auto flex items-center gap-2">
                    <span className={cn(
                        'px-2 py-0.5 rounded text-[10px] font-bold font-mono',
                        overallRisk > 60 ? 'bg-rose-500/20 text-rose-400' :
                            overallRisk > 35 ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'
                    )}>
                        RISK: {overallRisk}%
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] bg-slate-800 text-slate-400 font-mono">SIM</span>
                </span>
            </div>

            <div className="flex-1 flex gap-2 p-3 overflow-hidden">
                {/* Radar Chart */}
                <div className="flex-1 min-w-0" style={{ minHeight: 200 }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <RadarChart data={radarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
                            <PolarGrid stroke="#334155" strokeOpacity={0.5} />
                            <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 8 }} />
                            <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
                            <Radar name="확률" dataKey="probability" stroke="#f43f5e" fill="#f43f5e" fillOpacity={0.2} strokeWidth={2} />
                            <Radar name="영향도" dataKey="impact" stroke="#06b6d4" fill="#06b6d4" fillOpacity={0.1} strokeWidth={1} strokeDasharray="4 4" />
                        </RadarChart>
                    </ResponsiveContainer>
                </div>

                {/* Top Risks List */}
                <div className="w-48 shrink-0 space-y-1.5 overflow-y-auto custom-scrollbar">
                    <div className="text-[10px] text-slate-500 font-semibold tracking-wider uppercase mb-2">TOP RISKS</div>
                    {topRisks.map((risk, i) => {
                        const score = Math.round((risk.probability * risk.impact) / 100);
                        return (
                            <div key={i} className="bg-slate-800/40 rounded-lg px-3 py-2 border border-slate-700/20">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-[10px] text-slate-300 font-medium truncate">{risk.name}</span>
                                    <span className={cn(
                                        'text-[10px] font-mono font-bold',
                                        score > 50 ? 'text-rose-400' : score > 25 ? 'text-amber-400' : 'text-cyan-400'
                                    )}>{score}</span>
                                </div>
                                <div className="flex gap-2 text-[9px]">
                                    <span className="text-slate-500">P: <span className="text-rose-400 font-mono">{risk.probability}%</span></span>
                                    <span className="text-slate-500">I: <span className="text-cyan-400 font-mono">{risk.impact}</span></span>
                                </div>
                                <div className="mt-1 h-1 bg-slate-700 rounded-full overflow-hidden">
                                    <div
                                        className="h-full rounded-full transition-all duration-500"
                                        style={{
                                            width: `${score}%`,
                                            backgroundColor: risk.color,
                                            opacity: 0.7
                                        }}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="px-4 py-2 border-t border-slate-800/50 flex items-center gap-3 text-[10px] text-slate-500">
                <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-rose-500 rounded" /> 확률(P)</span>
                <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-cyan-500 rounded" style={{ borderTop: '1px dashed #06b6d4' }} /> 영향도(I)</span>
                <span className="ml-auto font-mono">Score = P × I / 100</span>
            </div>
        </div>
    );
}
