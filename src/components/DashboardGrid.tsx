/**
 * DashboardGrid — Commercial Deal Execution Terminal
 *
 * 12-Column CSS Grid Layout for S&P Shipbroker workflow:
 *   Row 1: Live TCE Calculator (col-span-5) + Fleet Map (col-span-7)
 *   Row 2: Demurrage Risk (col-span-3) + Cargo Matcher (col-span-5) + AI Strategy (col-span-4)
 *   Bottom: Macro Intelligence Board (full-width, collapsible)
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
        <div className="flex flex-col h-full bg-[#05080c]">
            {/* ════════ MAIN GRID ════════ */}
            <div className="dashboard-grid flex-1 min-h-0">

                {/* ─── ROW 1, LEFT: Live TCE Margin Calculator ─── */}
                <div className="widget-card grid-col-5">
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        <LiveTCEMarginCalculator simulationParams={simulationParams} />
                    </div>
                </div>

                {/* ─── ROW 1, RIGHT: Fleet Map ─── */}
                <div className="widget-card grid-col-7">
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

                {/* ─── ROW 2, LEFT: Demurrage Risk Radar ─── */}
                <div className="widget-card grid-col-3">
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        <DemurrageRiskRadar simulationParams={simulationParams} />
                    </div>
                </div>

                {/* ─── ROW 2, CENTER: Cargo-Tonnage Matcher ─── */}
                <div className="widget-card grid-col-5">
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        <CargoTonnageMatcher simulationParams={simulationParams} />
                    </div>
                </div>

                {/* ─── ROW 2, RIGHT: AI Broker Strategy / Object360 ─── */}
                {selectedObjectId ? (
                    <div className="widget-card grid-col-4">
                        <Object360Panel
                            objectId={selectedObjectId}
                            onClose={handleObject360Close}
                            onNavigate={handleObject360Navigate}
                        />
                    </div>
                ) : (
                    <div className="widget-card grid-col-4">
                        {/* Compact AI Broker Pitch Card */}
                        <div className="shrink-0 border-b border-slate-800/60 p-3">
                            <div className="rounded-lg border border-cyan-500/20 bg-gradient-to-r from-[#0a1018] to-[#0c1620] p-3 relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-0.5 h-full bg-cyan-500/60" />
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-1.5 text-cyan-400 min-w-0">
                                        <Sparkles size={12} className="shrink-0" />
                                        <span className="text-[9px] font-bold uppercase tracking-widest truncate">AI Broker Strategy</span>
                                    </div>
                                    <button
                                        onClick={fetchBrokerPitch}
                                        disabled={pitchLoading}
                                        className="flex items-center gap-1 text-[9px] text-slate-500 hover:text-cyan-400 transition-colors px-1.5 py-0.5 rounded hover:bg-slate-800/50 shrink-0"
                                        title="AI 전략 새로고침"
                                    >
                                        {pitchLoading
                                            ? <Loader2 size={10} className="animate-spin text-cyan-500" />
                                            : <RefreshCw size={10} />
                                        }
                                        {!pitchLoading && <span>Refresh</span>}
                                    </button>
                                </div>
                                <div className="text-[11px] text-slate-300 leading-relaxed line-clamp-4 min-h-[44px] break-words">
                                    {pitchLoading
                                        ? <span className="text-slate-500 font-mono text-[10px]">리스크 엔진에서 최적 전략 도출 중...</span>
                                        : (brokerPitch || 'AI 인사이트를 불러올 수 없습니다.')
                                    }
                                </div>
                            </div>
                        </div>

                        {/* Cargo Summary / placeholder for future expansion */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
                            <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-2 flex items-center gap-1.5">
                                <Ship size={11} className="text-slate-600" />
                                Quick Fleet Summary
                            </div>
                            <div className="space-y-1.5">
                                {dynamicFleetData.slice(0, 6).map((v, i) => (
                                    <div
                                        key={i}
                                        className={cn(
                                            "flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-[11px] cursor-pointer transition-all hover:bg-slate-800/50",
                                            v.riskLevel === 'Critical' ? 'border-rose-500/30 bg-rose-950/10' :
                                            v.riskLevel === 'High' ? 'border-amber-500/20 bg-amber-950/5' :
                                            'border-slate-800/50 bg-slate-900/30'
                                        )}
                                        onClick={() => handleMapVesselClick(v)}
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <Ship size={10} className={cn(
                                                v.riskLevel === 'Critical' ? 'text-rose-400' : 'text-slate-500',
                                                'shrink-0'
                                            )} />
                                            <span className="text-slate-300 font-medium truncate">{v.vessel_name}</span>
                                        </div>
                                        <span className={cn(
                                            'text-[9px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0 ml-2',
                                            v.riskLevel === 'Critical' ? 'text-rose-400 bg-rose-500/10' :
                                            v.riskLevel === 'High' ? 'text-amber-400 bg-amber-500/10' :
                                            v.riskLevel === 'Medium' ? 'text-cyan-400 bg-cyan-500/10' :
                                            'text-emerald-400 bg-emerald-500/10'
                                        )}>
                                            {v.riskLevel}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ════════ BOTTOM: Macro Intelligence Board ════════ */}
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
