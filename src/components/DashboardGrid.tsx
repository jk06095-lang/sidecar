/**
 * DashboardGrid — Commercial Deal Execution Terminal
 *
 * Logical broker workflow:
 *   ① Market Check  → Bottom Macro Bar (VLSFO, FX, Sentiment)
 *   ② Earnings Calc → Left Panel Tab A: Live Earnings Sensitivity
 *   ③ Risk Check    → Left Panel Tab B: Demurrage Risk Radar
 *   ④ Route/Vessel  → Center: Fleet Map (click → Object360)
 *   ⑤ Tonnage Match → Right Panel: Cargo-Tonnage Matching
 *   ⑥ AI Strategy   → Right Panel Top: Compact AI Broker Pitch
 */
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    Ship, Navigation, Fuel, DollarSign,
    AlertTriangle, ChevronRight, TrendingUp,
    X, Route as RouteIcon, RefreshCw, Loader2, Sparkles,
} from 'lucide-react';
import { cn } from '../lib/utils';
import type { SimulationParams, ChartDataPoint, FleetVessel, OntologyObject, OntologyObjectType } from '../types';
import { useOntologyStore } from '../store/ontologyStore';
import { generateBrokerPitch } from '../services/geminiService';

// Widgets
import FleetMapWidget from './widgets/FleetMapWidget';
import Object360Panel from './widgets/Object360Panel';
import MacroIntelligenceBoard from './widgets/MacroIntelligenceBoard';
import LiveTCEMarginCalculator from './widgets/LiveTCEMarginCalculator';
import DemurrageRiskRadar from './widgets/DemurrageRiskRadar';
import CargoTonnageMatcher from './widgets/CargoTonnageMatcher';

// ============================================================
// CONSTANTS
// ============================================================
const LSEG_POLL_INTERVAL_MS = 60_000;

type LeftTab = 'earnings' | 'risk';

// ============================================================
// PROPS
// ============================================================
interface DashboardGridProps {
    simulationParams: SimulationParams;
    dynamicChartData: ChartDataPoint[];
    dynamicFleetData: FleetVessel[];
    onNavigateTab?: (tab: string) => void;
}

// ============================================================
// COMPONENT
// ============================================================
export default function DashboardGrid({ simulationParams, dynamicChartData, dynamicFleetData, onNavigateTab }: DashboardGridProps) {
    const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
    const [macroExpanded, setMacroExpanded] = useState(false);
    const [leftTab, setLeftTab] = useState<LeftTab>('earnings');

    // AI Broker Pitch state — manual refresh only
    const [brokerPitch, setBrokerPitch] = useState<string | null>(null);
    const [pitchLoading, setPitchLoading] = useState(false);
    const pitchFetchedRef = useRef(false);

    // Store
    const objects = useOntologyStore(s => s.objects);
    const links = useOntologyStore(s => s.links);
    const fetchAndBindMarketData = useOntologyStore(s => s.fetchAndBindMarketData);

    // ---- AIS Position Tracking ----
    const [aisPositions, setAisPositions] = useState<import('../services/aisService').AISPosition[]>([]);
    const [isAisRefreshing, setIsAisRefreshing] = useState(false);

    const refreshAISPositions = useCallback(async () => {
        setIsAisRefreshing(true);
        try {
            const mmsiList = dynamicFleetData
                .map(v => v.mmsi ? Number(v.mmsi) : 0)
                .filter(m => m > 0);
            if (mmsiList.length === 0) {
                setIsAisRefreshing(false);
                return;
            }
            const vesselNames: Record<number, string> = {};
            dynamicFleetData.forEach(v => {
                if (v.mmsi) vesselNames[Number(v.mmsi)] = v.vessel_name;
            });
            const { fetchAndPersistAISPositions } = await import('../services/aisService');
            const positions = await fetchAndPersistAISPositions(mmsiList, vesselNames);
            if (positions.length > 0) setAisPositions(positions);
        } catch (err) {
            console.warn('[DashboardGrid] AIS refresh failed:', err);
        } finally {
            setIsAisRefreshing(false);
        }
    }, [dynamicFleetData]);

    // ---- Broker Pitch: fetch once on mount ----
    const fetchBrokerPitch = useCallback(async () => {
        setPitchLoading(true);
        try {
            const delays = [
                { port: 'Singapore', waitDays: 3.2 },
                { port: 'Fujairah', waitDays: 2.5 },
            ];
            const pitch = await generateBrokerPitch(
                simulationParams.vlsfoPrice || 620,
                delays,
                simulationParams.newsSentimentScore || 50,
            );
            setBrokerPitch(pitch);
        } catch {
            setBrokerPitch('AI 인사이트를 불러올 수 없습니다.');
        } finally {
            setPitchLoading(false);
        }
    }, [simulationParams]);

    // ---- Auto-fetch on mount only (once) ----
    useEffect(() => {
        fetchAndBindMarketData();
        refreshAISPositions();
        const interval = setInterval(() => fetchAndBindMarketData(), LSEG_POLL_INTERVAL_MS);

        // Broker pitch: one-time fetch
        if (!pitchFetchedRef.current) {
            pitchFetchedRef.current = true;
            fetchBrokerPitch();
        }

        let pausedInterval: ReturnType<typeof setInterval> | null = null;
        const handleVisibility = () => {
            if (document.hidden) {
                clearInterval(interval);
            } else {
                if (pausedInterval) clearInterval(pausedInterval);
                pausedInterval = setInterval(() => fetchAndBindMarketData(), LSEG_POLL_INTERVAL_MS);
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);

        return () => {
            clearInterval(interval);
            if (pausedInterval) clearInterval(pausedInterval);
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, [fetchAndBindMarketData, refreshAISPositions, fetchBrokerPitch]);

    // ---- Handlers ----
    const handleObjectSelect = useCallback((id: string) => {
        setSelectedObjectId(prev => prev === id ? null : id);
    }, []);

    const handleMapVesselClick = useCallback((vessel: FleetVessel) => {
        const match = objects.find(o =>
            o.type === 'Vessel' && o.title === vessel.vessel_name
        );
        if (match) setSelectedObjectId(match.id);
    }, [objects]);

    const handleObject360Navigate = useCallback((id: string) => {
        setSelectedObjectId(id);
    }, []);

    const handleObject360Close = useCallback(() => {
        setSelectedObjectId(null);
    }, []);

    return (
        <div className="flex flex-col h-full">
            {/* ---- Main 3-Column Area ---- */}
            <div className="flex flex-1 min-h-0 bg-[#05080c]">

                {/* ════════════════════════════════════════════
                    LEFT PANEL — Tabbed: Earnings ↔ Risk
                   ════════════════════════════════════════════ */}
                <div className="w-[360px] shrink-0 flex flex-col border-r border-slate-800/60 bg-[#070b10]">
                    {/* Tab Switcher */}
                    <div className="flex border-b border-slate-800/60 shrink-0">
                        <button
                            onClick={() => setLeftTab('earnings')}
                            className={cn(
                                "flex-1 py-2.5 text-[10px] font-bold uppercase tracking-widest transition-all border-b-2",
                                leftTab === 'earnings'
                                    ? "text-cyan-400 border-cyan-500 bg-cyan-500/5"
                                    : "text-slate-500 border-transparent hover:text-slate-300 hover:bg-slate-800/30"
                            )}
                            title="TCE 수익 감도분석"
                        >
                            <span className="flex items-center justify-center gap-1.5">
                                <DollarSign size={11} />
                                Earnings
                            </span>
                        </button>
                        <button
                            onClick={() => setLeftTab('risk')}
                            className={cn(
                                "flex-1 py-2.5 text-[10px] font-bold uppercase tracking-widest transition-all border-b-2",
                                leftTab === 'risk'
                                    ? "text-rose-400 border-rose-500 bg-rose-500/5"
                                    : "text-slate-500 border-transparent hover:text-slate-300 hover:bg-slate-800/30"
                            )}
                            title="Demurrage 리스크 레이더"
                        >
                            <span className="flex items-center justify-center gap-1.5">
                                <AlertTriangle size={11} />
                                Risk
                            </span>
                        </button>
                    </div>

                    {/* Tab Content — Full Height */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
                        {leftTab === 'earnings' ? (
                            <LiveTCEMarginCalculator simulationParams={simulationParams} />
                        ) : (
                            <DemurrageRiskRadar simulationParams={simulationParams} />
                        )}
                    </div>
                </div>

                {/* ════════════════════════════════════════════
                    CENTER PANEL — Fleet Map
                   ════════════════════════════════════════════ */}
                <div className="flex-1 flex flex-col min-w-0 border-r border-slate-800/60">
                    <div className="flex-1 relative min-h-0">
                        <FleetMapWidget
                            vessels={dynamicFleetData}
                            aisPositions={aisPositions}
                            ontologyObjects={objects}
                            ontologyLinks={links}
                            onSelectVessel={handleMapVesselClick}
                            onSelectRoute={handleObjectSelect}
                            onRefresh={refreshAISPositions}
                            isRefreshing={isAisRefreshing}
                        />
                    </div>
                </div>

                {/* ════════════════════════════════════════════
                    RIGHT PANEL — AI Pitch + Cargo Matching / Object360
                   ════════════════════════════════════════════ */}
                {selectedObjectId ? (
                    <div className="w-[380px] shrink-0 flex flex-col bg-[#070b10]">
                        <Object360Panel
                            objectId={selectedObjectId}
                            onClose={handleObject360Close}
                            onNavigate={handleObject360Navigate}
                        />
                    </div>
                ) : (
                    <div className="w-[380px] shrink-0 flex flex-col bg-[#070b10] overflow-hidden">
                        {/* Compact AI Broker Pitch Card */}
                        <div className="shrink-0 border-b border-slate-800/60 p-3">
                            <div className="rounded-lg border border-cyan-500/20 bg-gradient-to-r from-[#0a1018] to-[#0c1620] p-3 relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-0.5 h-full bg-cyan-500/60" />
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-1.5 text-cyan-400">
                                        <Sparkles size={12} />
                                        <span className="text-[9px] font-bold uppercase tracking-widest">AI Broker Strategy</span>
                                    </div>
                                    <button
                                        onClick={fetchBrokerPitch}
                                        disabled={pitchLoading}
                                        className="flex items-center gap-1 text-[9px] text-slate-500 hover:text-cyan-400 transition-colors px-1.5 py-0.5 rounded hover:bg-slate-800/50"
                                        title="AI 전략 새로고침"
                                    >
                                        {pitchLoading
                                            ? <Loader2 size={10} className="animate-spin text-cyan-500" />
                                            : <RefreshCw size={10} />
                                        }
                                        {!pitchLoading && <span>Refresh</span>}
                                    </button>
                                </div>
                                <div className="text-[11px] text-slate-300 leading-relaxed line-clamp-4 min-h-[44px]">
                                    {pitchLoading
                                        ? <span className="text-slate-500 font-mono text-[10px]">리스크 엔진에서 최적 전략 도출 중...</span>
                                        : (brokerPitch || 'AI 인사이트를 불러올 수 없습니다.')
                                    }
                                </div>
                            </div>
                        </div>

                        {/* Cargo-Tonnage Matching — Full Remaining Height */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
                            <CargoTonnageMatcher simulationParams={simulationParams} />
                        </div>
                    </div>
                )}
            </div>

            {/* ════════════════════════════════════════════
                BOTTOM PANEL — Macro Intelligence Board
               ════════════════════════════════════════════ */}
            <MacroIntelligenceBoard
                expanded={macroExpanded}
                onToggle={() => setMacroExpanded(!macroExpanded)}
                simulationParams={simulationParams}
                dynamicChartData={dynamicChartData}
                dynamicFleetData={dynamicFleetData}
            />
        </div>
    );
}
