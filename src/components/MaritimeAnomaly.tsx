import React, { useEffect, useState, useMemo } from 'react';
import { useOntologyStore } from '../store/ontologyStore';
import { generateAnomalies, analyzeAnomalyWithAI, integrateAnomalyToOntology } from '../services/anomalyService';
import type { MaritimeAnomaly, OntologyObject } from '../types';
import {
    Radar, AlertTriangle, ShieldAlert, Activity, Filter, MapPin, Anchor,
    ChevronDown, Cpu, ChevronRight, Hash, Clock, PieChart as PieChartIcon
} from 'lucide-react';
import {
    LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, AreaChart, Area
} from 'recharts';

const ANOMALY_COLORS: Record<string, string> = {
    'Dark Activity': '#f43f5e', // rose-500
    'Identity Tampering': '#a855f7', // purple-500
    'Loitering': '#eab308', // yellow-500
    'Port Congestion': '#3b82f6', // blue-500
    'Deviated Route': '#14b8a6', // teal-500
};

const RISK_COLORS: Record<string, string> = {
    'CRITICAL': 'text-rose-400 bg-rose-500/10 border-rose-500/30',
    'HIGH': 'text-purple-400 bg-purple-500/10 border-purple-500/30',
    'MEDIUM': 'text-amber-400 bg-amber-500/10 border-amber-500/30',
    'LOW': 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
};

export default function MaritimeAnomaly() {
    const store = useOntologyStore();
    const [isInjecting, setIsInjecting] = useState(false);
    const [progress, setProgress] = useState({ current: 0, total: 0 });

    useEffect(() => {
        let isMounted = true;
        const initializeAnomalies = async () => {
            // Check if anomalies already exist in store
            const objects = useOntologyStore.getState().objects;
            const existingAnomalies = objects.filter(o => o.type === 'Anomaly');

            if (existingAnomalies.length > 0) return;

            setIsInjecting(true);
            const vessels = objects.filter(o => o.type === 'Vessel');
            const vesselIds = vessels.map(v => v.id);

            const rawAnomalies = generateAnomalies(vesselIds);
            if (!isMounted) return;

            setProgress({ current: 0, total: rawAnomalies.length });

            const analyzedAnomalies: MaritimeAnomaly[] = [];
            for (let i = 0; i < rawAnomalies.length; i++) {
                const analyzed = await analyzeAnomalyWithAI(rawAnomalies[i]);
                analyzedAnomalies.push(analyzed);
                if (!isMounted) return;
                setProgress({ current: i + 1, total: rawAnomalies.length });
            }

            await integrateAnomalyToOntology(analyzedAnomalies);
            if (isMounted) setIsInjecting(false);
        };

        initializeAnomalies();

        return () => { isMounted = false; };
    }, []);

    const anomalyNodes = store.objects.filter(o => o.type === 'Anomaly');
    const vesselNodes = store.objects.filter(o => o.type === 'Vessel');

    // Create mapping of vessel ID to node for easy lookup
    const vesselMap = useMemo(() => {
        const map = new Map<string, OntologyObject>();
        vesselNodes.forEach(v => map.set(v.id, v));
        return map;
    }, [vesselNodes]);

    // Use links to identify which vessel each anomaly is connected to
    const getAssociatedVesselId = (anomalyId: string) => {
        const link = store.links.find(l => l.targetId === anomalyId && l.relationType === 'HAS_ANOMALY');
        return link ? link.sourceId : null;
    };

    // --- Chart Data Preparation ---
    const typeCountData = useMemo(() => {
        const counts: Record<string, number> = {};
        Object.keys(ANOMALY_COLORS).forEach(k => counts[k] = 0);

        anomalyNodes.forEach(node => {
            const t = String(node.properties.anomalyType || 'Unknown');
            if (counts[t] !== undefined) counts[t]++;
            else counts[t] = 1;
        });

        return Object.entries(counts).map(([name, value]) => ({ name, value })).filter(d => d.value > 0);
    }, [anomalyNodes]);

    // Mock past 7 days trend data (base noise + actual generated data representation)
    const trendData = useMemo(() => {
        const days = ['D-6', 'D-5', 'D-4', 'D-3', 'D-2', 'Yest', 'Today'];
        return days.map((day, idx) => ({
            name: day,
            'Dark Activity': Math.floor(Math.random() * 10) + (idx === 6 ? anomalyNodes.filter(n => n.properties.anomalyType === 'Dark Activity').length : 0),
            'Deviated Route': Math.floor(Math.random() * 8) + (idx === 6 ? anomalyNodes.filter(n => n.properties.anomalyType === 'Deviated Route').length : 0),
            'Others': Math.floor(Math.random() * 12) + (idx === 6 ? anomalyNodes.filter(n => n.properties.anomalyType !== 'Dark Activity' && n.properties.anomalyType !== 'Deviated Route').length : 0),
        }));
    }, [anomalyNodes]);

    const highRiskVessels = useMemo(() => {
        const map = new Map<string, { vessel: OntologyObject; riskScore: number; anomalies: OntologyObject[] }>();

        anomalyNodes.forEach(anomaly => {
            const vid = getAssociatedVesselId(anomaly.id);
            if (vid && vesselMap.has(vid)) {
                if (!map.has(vid)) {
                    map.set(vid, { vessel: vesselMap.get(vid)!, riskScore: 0, anomalies: [] });
                }
                const entry = map.get(vid)!;
                entry.anomalies.push(anomaly);
                entry.riskScore += Number(anomaly.properties.riskScore || 0);
            }
        });

        return Array.from(map.values()).sort((a, b) => b.riskScore - a.riskScore).slice(0, 5);
    }, [anomalyNodes, vesselMap, getAssociatedVesselId]);

    return (
        <div className="h-full w-full bg-slate-950 flex flex-col p-4 overflow-y-auto custom-scrollbar font-sans text-slate-200">
            {/* Header */}
            <div className="flex items-center justify-between mb-4 shrink-0">
                <div>
                    <h1 className="text-xl font-bold text-white flex items-center gap-2">
                        <Radar className="text-cyan-400" size={24} />
                        Maritime Anomaly Detector
                    </h1>
                    <p className="text-sm text-slate-400 mt-1">Real-time planetary-scale vessel behavioral analysis</p>
                </div>

                {isInjecting ? (
                    <div className="flex items-center gap-3 bg-cyan-950/40 border border-cyan-500/30 px-4 py-2 rounded-lg">
                        <Cpu className="text-cyan-400 animate-pulse" size={18} />
                        <div className="flex flex-col">
                            <span className="text-xs text-cyan-300 font-medium">AI Agent Analyzing Network...</span>
                            <div className="w-48 h-1 bg-slate-800 rounded-full mt-1.5 overflow-hidden">
                                <div
                                    className="h-full bg-cyan-400 transition-all duration-300 ease-out"
                                    style={{ width: `${(progress.current / (progress.total || 1)) * 100}%` }}
                                />
                            </div>
                        </div>
                        <span className="text-xs text-cyan-500 font-mono">{progress.current}/{progress.total}</span>
                    </div>
                ) : (
                    <div className="flex gap-2">
                        <button className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 border border-slate-700 hover:bg-slate-800 rounded text-xs font-medium text-slate-300 transition-colors">
                            <Filter size={14} /> Filter
                        </button>
                        <button className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-900/60 border border-cyan-500/40 hover:bg-cyan-800/60 rounded text-xs font-medium text-cyan-300 transition-colors">
                            <Activity size={14} /> Live Sync
                        </button>
                    </div>
                )}
            </div>

            {/* Grid Layout */}
            <div className="grid grid-cols-12 gap-4 flex-1 min-h-[600px]">

                {/* LEFT COLUMN: Unique Anomalies Feed (1/3) */}
                <div className="col-span-12 xl:col-span-4 flex flex-col gap-4">
                    <div className="bg-slate-900/50 border border-slate-800/80 rounded-xl flex flex-col overflow-hidden h-full shadow-lg shadow-black/20">
                        <div className="px-4 py-3 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/80">
                            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                                <AlertTriangle className="text-rose-400" size={16} />
                                Unique Anomalies
                            </h3>
                            <span className="px-2 py-0.5 bg-slate-800 text-slate-400 text-xs rounded-full">{anomalyNodes.length} Active</span>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3">
                            {anomalyNodes.length === 0 && !isInjecting ? (
                                <div className="h-full flex flex-col items-center justify-center text-slate-500">
                                    <ShieldAlert size={32} className="mb-2 opacity-50" />
                                    <p className="text-sm">No anomalies currently detected.</p>
                                </div>
                            ) : (
                                anomalyNodes.slice().reverse().map((node) => {
                                    const props = node.properties;
                                    const riskClass = RISK_COLORS[String(props.riskLevel)] || RISK_COLORS['MEDIUM'];
                                    const vesselId = getAssociatedVesselId(node.id);
                                    const vessel = vesselId ? vesselMap.get(vesselId) : null;

                                    return (
                                        <div key={node.id} className={`p-3 rounded-lg border bg-gradient-to-br from-slate-900 to-slate-900/50 shadow-sm ${riskClass.split(' ')[2]}`}>
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="flex items-center gap-2">
                                                    <div className={`w-2 h-2 rounded-full shadow-[0_0_8px_currentColor] ${riskClass.split(' ')[0]}`} />
                                                    <span className="text-xs font-bold uppercase tracking-wider text-slate-200">{String(props.anomalyType)}</span>
                                                </div>
                                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${riskClass}`}>
                                                    {String(props.riskLevel)}
                                                </span>
                                            </div>

                                            <div className="mb-3 text-xs text-slate-400">
                                                {vessel ? (
                                                    <div className="flex items-center gap-1.5 text-cyan-300 mb-1">
                                                        <Anchor size={12} /> <span className="font-medium">{vessel.title}</span>
                                                    </div>
                                                ) : null}
                                                <div className="flex items-center gap-1.5 opacity-70">
                                                    <Clock size={10} /> {new Date(String(props.timestamp)).toLocaleString()}
                                                </div>
                                            </div>

                                            <div className="relative p-2 rounded bg-slate-950/50 border border-slate-800/50 text-[11px] leading-relaxed text-slate-300">
                                                <div className="absolute top-0 left-0 w-0.5 h-full bg-cyan-500 rounded-l" />
                                                <strong className="text-cyan-400 font-medium block mb-0.5">AI Analysis:</strong>
                                                {String(props.aiExplanation || props.description).replace('AI Analysis: ', '')}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>

                {/* MIDDLE COLUMN: Charts (1/3) */}
                <div className="col-span-12 lg:col-span-6 xl:col-span-4 flex flex-col gap-4">

                    {/* Categorical Breakdown */}
                    <div className="bg-slate-900/50 border border-slate-800/80 rounded-xl p-4 flex-1 min-h-[250px] shadow-lg shadow-black/20">
                        <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2 mb-4">
                            <PieChartIcon className="text-purple-400" size={16} />
                            Categorical Breakdown
                        </h3>
                        <div className="h-[200px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <RechartsTooltip
                                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }}
                                        itemStyle={{ color: '#e2e8f0' }}
                                    />
                                    <Pie
                                        data={typeCountData}
                                        cx="50%" cy="50%"
                                        innerRadius={60} outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                        stroke="transparent"
                                    >
                                        {typeCountData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={ANOMALY_COLORS[entry.name] || '#64748b'} />
                                        ))}
                                    </Pie>
                                </PieChart>
                            </ResponsiveContainer>
                        </div>

                        {/* Custom Legend */}
                        <div className="flex flex-wrap gap-2 justify-center mt-2">
                            {typeCountData.map(entry => (
                                <div key={entry.name} className="flex items-center gap-1.5 text-[10px] text-slate-400">
                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: ANOMALY_COLORS[entry.name] || '#64748b' }} />
                                    {entry.name} <span className="font-mono ml-0.5 text-slate-300">{entry.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Daily Trends */}
                    <div className="bg-slate-900/50 border border-slate-800/80 rounded-xl p-4 flex-1 min-h-[250px] shadow-lg shadow-black/20">
                        <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2 mb-4">
                            <Activity className="text-emerald-400" size={16} />
                            7-Day Anomaly Trends
                        </h3>
                        <div className="h-[200px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorDark" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor={ANOMALY_COLORS['Dark Activity']} stopOpacity={0.8} />
                                            <stop offset="95%" stopColor={ANOMALY_COLORS['Dark Activity']} stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="colorDev" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor={ANOMALY_COLORS['Deviated Route']} stopOpacity={0.8} />
                                            <stop offset="95%" stopColor={ANOMALY_COLORS['Deviated Route']} stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                                    <XAxis dataKey="name" stroke="#475569" fontSize={10} tickLine={false} axisLine={false} />
                                    <YAxis stroke="#475569" fontSize={10} tickLine={false} axisLine={false} />
                                    <RechartsTooltip
                                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }}
                                    />
                                    <Area type="monotone" dataKey="Dark Activity" stackId="1" stroke={ANOMALY_COLORS['Dark Activity']} fill="url(#colorDark)" />
                                    <Area type="monotone" dataKey="Deviated Route" stackId="1" stroke={ANOMALY_COLORS['Deviated Route']} fill="url(#colorDev)" />
                                    <Area type="monotone" dataKey="Others" stackId="1" stroke="#64748b" fill="#334155" opacity={0.5} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                </div>

                {/* RIGHT COLUMN: Vessel Risk Assessment (1/3) */}
                <div className="col-span-12 lg:col-span-6 xl:col-span-4 flex flex-col gap-4">
                    <div className="bg-slate-900/50 border border-slate-800/80 rounded-xl flex flex-col overflow-hidden h-full shadow-lg shadow-black/20">
                        <div className="px-4 py-3 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/80">
                            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                                <ShieldAlert className="text-amber-400" size={16} />
                                Vessel Risk Assessment
                            </h3>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3">
                            {highRiskVessels.length === 0 && !isInjecting ? (
                                <div className="h-full flex flex-col items-center justify-center text-slate-500">
                                    <Anchor size={32} className="mb-2 opacity-50" />
                                    <p className="text-sm">No high-risk vessels identified.</p>
                                </div>
                            ) : (
                                highRiskVessels.map(({ vessel, riskScore, anomalies }, i) => (
                                    <div key={vessel.id} className="relative bg-slate-900 border border-slate-800 p-3 rounded-lg overflow-hidden group hover:border-slate-700 transition-colors">
                                        {/* Rank indicator */}
                                        <div className="absolute top-0 right-0 w-8 h-8 flex items-start justify-end p-1">
                                            <span className="text-[10px] font-mono text-slate-600">#{i + 1}</span>
                                        </div>

                                        <div className="flex items-start gap-3">
                                            <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center shrink-0 border border-slate-700">
                                                <Anchor size={18} className={riskScore > 100 ? 'text-rose-400' : 'text-amber-400'} />
                                            </div>
                                            <div className="flex-1 pr-4">
                                                <h4 className="text-sm font-bold text-white mb-0.5">{vessel.title}</h4>
                                                <div className="flex items-center gap-3 text-[10px] text-slate-400 mb-2">
                                                    <span className="flex items-center gap-1"><Hash size={10} /> IMO: {String(vessel.properties.imo || 'Unknown')}</span>
                                                    <span className="flex items-center gap-1"><MapPin size={10} /> {String(vessel.properties.location || 'Unknown')}</span>
                                                </div>

                                                <div className="flex flex-wrap gap-1.5 mt-2">
                                                    {anomalies.map(a => (
                                                        <span key={a.id} className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[9px] text-slate-300">
                                                            {String(a.properties.anomalyType)}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        <div className="p-3 border-t border-slate-800/80 bg-slate-950/80">
                            <button className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded transition-colors">
                                View Full Vessel Registry <ChevronRight size={14} />
                            </button>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
