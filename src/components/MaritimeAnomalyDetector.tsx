/**
 * MaritimeAnomalyDetector — Windward-style Maritime Anomaly Dashboard
 *
 * Left panel:  Analytics (filters, charts, stats)
 * Right panel: Interactive Leaflet map with clustered anomaly markers
 *
 * Fully integrated with the ontology registration pipeline.
 */
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
    Radar, ChevronDown, ChevronUp, Check,
    AlertTriangle, Loader2, Database,
    Ship,
} from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import type { AnomalyType, MaritimeAnomaly } from '../types';
import { useOntologyStore } from '../store/ontologyStore';
import {
    generateSyntheticAnomalyData,
    clusterAnomalies,
    computeAnomalyStats,
    runAnomalyPipeline,
    ANOMALY_TYPE_LABELS,
    ANOMALY_TYPE_COLORS,
    RISK_CATEGORY_LABELS,
    VESSEL_TYPE_LABELS,
} from '../services/maritimeAnomalyService';

// ============================================================
// FLAG EMOJI MAP
// ============================================================
const FLAG_EMOJI: Record<string, string> = {
    IR: '🇮🇷', CN: '🇨🇳', RU: '🇷🇺', KP: '🇰🇵', PA: '🇵🇦',
    LR: '🇱🇷', MH: '🇲🇭', SG: '🇸🇬', HK: '🇭🇰', GR: '🇬🇷',
    MM: '🇲🇲', VN: '🇻🇳', TW: '🇹🇼', AE: '🇦🇪', IN: '🇮🇳',
};

// ============================================================
// PIPELINE STEP LABELS
// ============================================================
const PIPELINE_STEPS = [
    { step: 1, label: '선박 온톨로지 노드 생성' },
    { step: 2, label: '인텔리전스 속성 병합' },
    { step: 3, label: 'AI 리스크 분석 → RiskEvent 노드 생성' },
    { step: 4, label: '온톨로지 엣지(관계) 연결' },
    { step: 5, label: '온톨로지 그래프 등록 완료' },
];

// ============================================================
// COMPONENT
// ============================================================
export default function MaritimeAnomalyDetector() {
    // --- Ontology & Action Store ---
    const objects = useOntologyStore(s => s.objects);
    const links = useOntologyStore(s => s.links);
    const addObject = useOntologyStore(s => s.addObject);
    const addLink = useOntologyStore(s => s.addLink);
    const simulationParams = useOntologyStore(s => s.simulationParams);
    const dynamicFleetData = useOntologyStore(s => s.dynamicFleetData);

    // --- Local State ---
    const [anomalies, setAnomalies] = useState<MaritimeAnomaly[]>([]);
    const [selectedFilters, setSelectedFilters] = useState<AnomalyType[]>([]);
    const [filterOpen, setFilterOpen] = useState(false);
    const [selectedAnomaly, setSelectedAnomaly] = useState<MaritimeAnomaly | null>(null);
    const [pipelineStep, setPipelineStep] = useState(0);
    const [pipelineMessage, setPipelineMessage] = useState('');
    const [isPipelineRunning, setIsPipelineRunning] = useState(false);

    // --- Map Refs ---
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const leafletMapRef = useRef<L.Map | null>(null);
    const markersRef = useRef<L.CircleMarker[]>([]);

    // --- Initialize anomaly data from ontology ---
    useEffect(() => {
        const data = generateSyntheticAnomalyData(objects);
        setAnomalies(data);
    }, [objects]);


    // --- Derived data ---
    const clusters = useMemo(
        () => clusterAnomalies(anomalies, selectedFilters),
        [anomalies, selectedFilters],
    );

    const stats = useMemo(
        () => computeAnomalyStats(
            selectedFilters.length > 0
                ? anomalies.filter(a => selectedFilters.includes(a.type))
                : anomalies,
        ),
        [anomalies, selectedFilters],
    );

    // --- Chart data ---
    const anomalyTypeChartData = useMemo(() => [
        { name: 'Area visits', key: 'area_visit' as AnomalyType, value: stats.byType.area_visit, color: ANOMALY_TYPE_COLORS.area_visit },
        { name: 'Sailing below\n3 knots', key: 'slow_sailing' as AnomalyType, value: stats.byType.slow_sailing, color: ANOMALY_TYPE_COLORS.slow_sailing },
        { name: 'Ship-to-ship', key: 'ship_to_ship' as AnomalyType, value: stats.byType.ship_to_ship, color: ANOMALY_TYPE_COLORS.ship_to_ship },
        { name: 'Dark activity', key: 'dark_activity' as AnomalyType, value: stats.byType.dark_activity, color: ANOMALY_TYPE_COLORS.dark_activity },
    ], [stats]);

    const vesselTypeChartData = useMemo(() =>
        (Object.entries(stats.byVesselType) as [string, number][])
            .map(([key, value]) => ({
                name: VESSEL_TYPE_LABELS[key as keyof typeof VESSEL_TYPE_LABELS] || key,
                value,
            }))
            .sort((a, b) => b.value - a.value),
        [stats],
    );

    // --- Filter toggle ---
    const toggleFilter = useCallback((type: AnomalyType) => {
        setSelectedFilters(prev =>
            prev.includes(type) ? prev.filter(f => f !== type) : [...prev, type],
        );
    }, []);

    // --- Initialize Leaflet Map ---
    useEffect(() => {
        if (!mapContainerRef.current || leafletMapRef.current) return;

        const map = L.map(mapContainerRef.current, {
            center: [20, 55],
            zoom: 3,
            zoomControl: false,
            attributionControl: false,
        });

        // Ocean-focused dark tiles
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            maxZoom: 18,
        }).addTo(map);

        L.control.zoom({ position: 'bottomright' }).addTo(map);

        leafletMapRef.current = map;

        return () => {
            map.remove();
            leafletMapRef.current = null;
        };
    }, []);

    // --- Update markers on map ---
    useEffect(() => {
        const map = leafletMapRef.current;
        if (!map) return;

        // Clear existing markers
        markersRef.current.forEach(m => m.remove());
        markersRef.current = [];

        clusters.forEach(cluster => {
            const color = ANOMALY_TYPE_COLORS[cluster.dominantType];
            const radius = Math.max(16, Math.min(32, 12 + Math.sqrt(cluster.count) * 4));

            const marker = L.circleMarker([cluster.lat, cluster.lng], {
                radius,
                fillColor: color,
                fillOpacity: 0.65,
                color: color,
                weight: 2,
                opacity: 0.9,
            }).addTo(map);

            // Number label
            const label = L.divIcon({
                className: '',
                html: `<div style="
                    display:flex;align-items:center;justify-content:center;
                    width:${radius * 2}px;height:${radius * 2}px;
                    color:white;font-weight:700;font-size:${Math.max(10, Math.min(16, radius * 0.6))}px;
                    pointer-events:none;font-family:ui-monospace,monospace;
                    text-shadow:0 1px 3px rgba(0,0,0,0.8);
                ">${cluster.count}</div>`,
                iconSize: [radius * 2, radius * 2],
                iconAnchor: [radius, radius],
            });
            const labelMarker = L.marker([cluster.lat, cluster.lng], { icon: label, interactive: false }).addTo(map);

            // Click to select first anomaly in cluster
            marker.on('click', () => {
                setSelectedAnomaly(cluster.anomalies[0]);
            });

            // Tooltip
            marker.bindTooltip(`
                <div style="font-family:ui-monospace;font-size:10px;max-width:240px;">
                    <div style="font-weight:800;margin-bottom:3px;color:${color};">
                        ${cluster.count}건의 이상 현상
                    </div>
                    <div style="color:#94a3b8;font-size:9px;">
                        주요 유형: ${ANOMALY_TYPE_LABELS[cluster.dominantType]}
                    </div>
                    <div style="margin-top:3px;color:#64748b;font-size:8px;">클릭하여 상세보기</div>
                </div>
            `, { sticky: true, direction: 'top' });

            markersRef.current.push(marker);
            markersRef.current.push(labelMarker as unknown as L.CircleMarker);
        });
    }, [clusters]);

    // --- Run 5-step pipeline ---
    const handleRunPipeline = useCallback(async () => {
        if (!selectedAnomaly || isPipelineRunning) return;

        setIsPipelineRunning(true);
        setPipelineStep(0);
        setPipelineMessage('파이프라인 시작...');

        await runAnomalyPipeline(
            selectedAnomaly,
            {
                addObject,
                addLink,
                objects,
                links,
                simulationParams,
                fleetData: dynamicFleetData,
                importProposals: () => { },
            },
            (step, message) => {
                setPipelineStep(step);
                setPipelineMessage(message);
            },
        );

        setIsPipelineRunning(false);
    }, [selectedAnomaly, isPipelineRunning, addObject, addLink, objects, links, simulationParams, dynamicFleetData]);

    // ============================================================
    // RENDER
    // ============================================================
    return (
        <div className="flex h-full w-full bg-slate-950 text-slate-200 overflow-hidden">
            {/* ═══════════════════════════════════════════════
                LEFT PANEL — Analytics & Statistics
                ═══════════════════════════════════════════════ */}
            <div className="w-[440px] min-w-[380px] border-r border-slate-800/50 flex flex-col overflow-y-auto custom-scrollbar">


                {/* Filter Dropdown */}
                <div className="px-6 py-2 flex items-center gap-2">
                    <span className="text-xs text-slate-500 font-medium">발견하기</span>
                    <div className="relative">
                        <button
                            onClick={() => setFilterOpen(!filterOpen)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-800/80 border border-slate-700/50 text-xs text-slate-300 hover:bg-slate-700/60 transition-colors"
                        >
                            {selectedFilters.length === 0 ? '모두' : `${selectedFilters.length}개 선택`}
                            {filterOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        </button>
                        {filterOpen && (
                            <div className="absolute top-full left-0 mt-1 w-56 bg-slate-900 border border-slate-700/50 rounded-lg shadow-xl z-50 py-1">
                                {(Object.entries(ANOMALY_TYPE_LABELS) as [AnomalyType, string][]).map(([key, label]) => (
                                    <button
                                        key={key}
                                        onClick={() => toggleFilter(key)}
                                        className="flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-slate-800/60 transition-colors"
                                    >
                                        <div
                                            className="w-3 h-3 rounded-full border-2 flex items-center justify-center"
                                            style={{
                                                borderColor: ANOMALY_TYPE_COLORS[key],
                                                background: selectedFilters.includes(key) ? ANOMALY_TYPE_COLORS[key] : 'transparent',
                                            }}
                                        >
                                            {selectedFilters.includes(key) && <Check size={8} className="text-white" />}
                                        </div>
                                        <div className="w-2 h-2 rounded-full" style={{ background: ANOMALY_TYPE_COLORS[key] }} />
                                        <span className="text-slate-300">{label}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Summary Metrics */}
                <div className="px-6 py-3 flex gap-6">
                    <div>
                        <div className="text-[10px] text-slate-500 uppercase tracking-widest">지난 30일 총이상</div>
                        <div className="text-3xl font-bold text-white">{stats.totalAnomalies.toLocaleString()}</div>
                    </div>
                    <div>
                        <div className="text-[10px] text-slate-500 uppercase tracking-widest">지난 30일 위치 수</div>
                        <div className="text-3xl font-bold text-white">{stats.totalLocations}</div>
                    </div>
                </div>

                {/* Anomaly Type Bar Chart */}
                <div className="px-6 py-3">
                    <div className="flex justify-between items-center mb-3">
                        <h3 className="text-sm font-bold text-white">이상 유형별 분류</h3>
                        <span className="text-[10px] text-slate-500">지난 30일</span>
                    </div>
                    <div className="h-[180px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={anomalyTypeChartData} margin={{ top: 20, right: 0, left: 0, bottom: 0 }}>
                                <XAxis
                                    dataKey="name"
                                    tick={{ fontSize: 9, fill: '#94a3b8' }}
                                    axisLine={false}
                                    tickLine={false}
                                    interval={0}
                                />
                                <YAxis
                                    tick={{ fontSize: 9, fill: '#475569' }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <Tooltip
                                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 11 }}
                                    labelStyle={{ color: '#94a3b8' }}
                                />
                                <Bar dataKey="value" radius={[4, 4, 0, 0]} label={{ position: 'top', fill: '#e2e8f0', fontSize: 11, fontWeight: 700 }}>
                                    {anomalyTypeChartData.map((entry, idx) => (
                                        <Cell key={idx} fill={entry.color} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Risk Category Progress Bars */}
                <div className="px-6 py-3">
                    <div className="flex justify-between items-center mb-3">
                        <h3 className="text-sm font-bold text-white">위험 유형별 분류</h3>
                        <span className="text-[10px] text-slate-500">지난 30일</span>
                    </div>
                    <div className="space-y-3">
                        {([
                            { key: 'sanctions_evasion' as const, color: '#eab308', label: RISK_CATEGORY_LABELS.sanctions_evasion },
                            { key: 'smuggling' as const, color: '#ef4444', label: RISK_CATEGORY_LABELS.smuggling },
                            { key: 'iuu_fishing' as const, color: '#ef4444', label: RISK_CATEGORY_LABELS.iuu_fishing },
                        ]).map(({ key, color, label }) => {
                            const count = stats.byRisk[key];
                            const maxCount = Math.max(...Object.values(stats.byRisk), 1);
                            const pct = (count / maxCount) * 100;
                            return (
                                <div key={key} className="flex items-center gap-3">
                                    <span className="text-[11px] text-slate-400 w-16 shrink-0">{label}</span>
                                    <div className="flex-1 h-3 bg-slate-800 rounded-full overflow-hidden">
                                        <div
                                            className="h-full rounded-full transition-all duration-700"
                                            style={{ width: `${pct}%`, background: color }}
                                        />
                                    </div>
                                    <span className="text-xs text-slate-300 font-mono w-10 text-right">{count}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Vessel Type Horizontal Bar Chart */}
                <div className="px-6 py-3">
                    <div className="flex justify-between items-center mb-3">
                        <h3 className="text-sm font-bold text-white">선박 유형별 분류</h3>
                        <span className="text-[10px] text-slate-500">지난 30일</span>
                    </div>
                    <div className="h-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={vesselTypeChartData} layout="vertical" margin={{ top: 0, right: 40, left: 80, bottom: 0 }}>
                                <XAxis type="number" hide />
                                <YAxis
                                    type="category"
                                    dataKey="name"
                                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                                    axisLine={false}
                                    tickLine={false}
                                    width={78}
                                />
                                <Tooltip
                                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 11 }}
                                />
                                <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={14}
                                    label={{ position: 'right', fill: '#e2e8f0', fontSize: 11, fontWeight: 700 }}
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Country Breakdown */}
                <div className="px-6 py-3 pb-6">
                    <div className="flex justify-between items-center mb-3">
                        <h3 className="text-sm font-bold text-white">국가별 분류</h3>
                        <span className="text-[10px] text-slate-500">지난 30일</span>
                    </div>
                    <div className="space-y-2">
                        {stats.byCountry.slice(0, 8).map(({ code, count }) => (
                            <div key={code} className="flex items-center gap-3">
                                <span className="text-lg">{FLAG_EMOJI[code] || '🏳️'}</span>
                                <span className="text-xs text-slate-400 flex-1">{code}</span>
                                <span className="text-xs text-slate-300 font-mono font-bold">{count}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ═══════════════════════════════════════════════
                RIGHT PANEL — Interactive Map
                ═══════════════════════════════════════════════ */}
            <div className="flex-1 relative">
                {/* Map container */}
                <div ref={mapContainerRef} className="absolute inset-0" />

                {/* Map header overlay */}
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] pointer-events-none">
                    <p className="text-xs text-slate-400 bg-slate-900/70 px-3 py-1.5 rounded-md backdrop-blur-sm">
                        자세한 내용은 위치를 클릭하세요
                    </p>
                </div>

                {/* Legend */}
                <div className="absolute bottom-4 left-4 z-[1000] flex items-center gap-4 bg-slate-900/80 backdrop-blur-sm px-4 py-2 rounded-lg border border-slate-700/40">
                    {(Object.entries(ANOMALY_TYPE_LABELS) as [AnomalyType, string][]).map(([key, label]) => (
                        <div key={key} className="flex items-center gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ background: ANOMALY_TYPE_COLORS[key] }} />
                            <span className="text-[10px] text-slate-400">{label}</span>
                        </div>
                    ))}
                </div>



                {/* Selected Anomaly Detail + Pipeline Panel */}
                {selectedAnomaly && (
                    <div className="absolute top-4 right-4 z-[1000] w-[340px] bg-slate-900/95 backdrop-blur-md border border-slate-700/50 rounded-xl shadow-2xl overflow-hidden">
                        {/* Anomaly Detail Header */}
                        <div className="p-4 border-b border-slate-700/40">
                            <div className="flex items-center gap-2 mb-2">
                                <Ship size={14} className="text-cyan-400" />
                                <h3 className="text-sm font-bold text-white truncate">{selectedAnomaly.vesselName}</h3>
                                <span className="text-lg">{FLAG_EMOJI[selectedAnomaly.flag] || '🏳️'}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-[10px]">
                                <div>
                                    <span className="text-slate-500">유형</span>
                                    <div className="flex items-center gap-1 mt-0.5">
                                        <div className="w-2 h-2 rounded-full" style={{ background: ANOMALY_TYPE_COLORS[selectedAnomaly.type] }} />
                                        <span className="text-slate-300">{ANOMALY_TYPE_LABELS[selectedAnomaly.type]}</span>
                                    </div>
                                </div>
                                <div>
                                    <span className="text-slate-500">심각도</span>
                                    <div className={`mt-0.5 font-bold uppercase ${selectedAnomaly.severity === 'critical' ? 'text-red-400' :
                                        selectedAnomaly.severity === 'high' ? 'text-orange-400' :
                                            selectedAnomaly.severity === 'medium' ? 'text-amber-400' : 'text-green-400'
                                        }`}>
                                        {selectedAnomaly.severity}
                                    </div>
                                </div>
                                <div>
                                    <span className="text-slate-500">선박 유형</span>
                                    <div className="text-slate-300 mt-0.5">
                                        {VESSEL_TYPE_LABELS[selectedAnomaly.vesselType]}
                                    </div>
                                </div>
                                {selectedAnomaly.speedKnots !== undefined && (
                                    <div>
                                        <span className="text-slate-500">속도</span>
                                        <div className="text-slate-300 mt-0.5">{selectedAnomaly.speedKnots} knots</div>
                                    </div>
                                )}
                            </div>
                            {selectedAnomaly.riskCategory && (
                                <div className="mt-2 px-2 py-1 bg-red-500/10 border border-red-500/20 rounded text-[10px] text-red-400">
                                    <AlertTriangle size={10} className="inline mr-1" />
                                    {RISK_CATEGORY_LABELS[selectedAnomaly.riskCategory]}
                                </div>
                            )}
                        </div>

                        {/* Pipeline Trigger */}
                        <div className="p-4">
                            <button
                                onClick={handleRunPipeline}
                                disabled={isPipelineRunning}
                                className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-bold text-xs transition-all duration-300 ${isPipelineRunning
                                    ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                                    : 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white hover:from-cyan-500 hover:to-blue-500 shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/40'
                                    }`}
                            >
                                {isPipelineRunning ? (
                                    <Loader2 size={14} className="animate-spin" />
                                ) : (
                                    <Database size={14} />
                                )}
                                {isPipelineRunning ? '온톨로지 등록 중...' : '이상 데이터 온톨로지화'}
                            </button>

                            {/* Pipeline Progress Steps */}
                            {(pipelineStep > 0 || isPipelineRunning) && (
                                <div className="mt-3 space-y-1.5">
                                    {PIPELINE_STEPS.map(({ step, label }) => {
                                        const isActive = step === pipelineStep;
                                        const isDone = step < pipelineStep || (step === pipelineStep && !isPipelineRunning && pipelineStep === 5);
                                        return (
                                            <div key={step} className="flex items-center gap-2">
                                                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold border-2 transition-all ${isDone ? 'bg-emerald-500 border-emerald-500 text-white' :
                                                    isActive ? 'bg-cyan-500/20 border-cyan-400 text-cyan-400 animate-pulse' :
                                                        'bg-slate-800 border-slate-700 text-slate-600'
                                                    }`}>
                                                    {isDone ? <Check size={10} /> : step}
                                                </div>
                                                <span className={`text-[10px] ${isDone ? 'text-emerald-400' :
                                                    isActive ? 'text-cyan-400' :
                                                        'text-slate-600'
                                                    }`}>
                                                    {label}
                                                </span>
                                                {isActive && isPipelineRunning && (
                                                    <Loader2 size={10} className="text-cyan-400 animate-spin ml-auto" />
                                                )}
                                            </div>
                                        );
                                    })}
                                    {pipelineMessage && (
                                        <p className="text-[9px] text-slate-400 mt-2 pl-7">{pipelineMessage}</p>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Close button */}
                        <button
                            onClick={() => { setSelectedAnomaly(null); setPipelineStep(0); }}
                            className="absolute top-2 right-2 text-slate-500 hover:text-white p-1 transition-colors"
                        >
                            ✕
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
