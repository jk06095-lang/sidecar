/**
 * DashboardGrid — COP (Common Operational Picture) Layout
 *
 * Replaces the 12-widget react-grid-layout with a fixed 3-panel + bottom-bar
 * Palantir Workshop-style layout:
 *   Left   (280px)  : Object list (search / type filter / risk-sorted)
 *   Center (flex-1)  : FleetMapWidget ↔ OntologyGraph toggle
 *   Right  (400px)  : Object360Panel (slides in on object select)
 *   Bottom (260px)  : MacroIntelligenceBoard (collapsible)
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Search, Ship, Anchor, Navigation, Fuel, Zap, Shield, DollarSign,
    AlertTriangle, FileText, ChevronRight, TrendingUp,
    Filter, X, Loader2, Route as RouteIcon,
} from 'lucide-react';
import { cn } from '../lib/utils';
import type { SimulationParams, ChartDataPoint, FleetVessel, OntologyObject, OntologyObjectType } from '../types';
import { useOntologyStore } from '../store/ontologyStore';

// Widgets
import FleetMapWidget from './widgets/FleetMapWidget';
import Object360Panel from './widgets/Object360Panel';
import MacroIntelligenceBoard from './widgets/MacroIntelligenceBoard';
import LiveTCEMarginCalculator from './widgets/LiveTCEMarginCalculator';
import DemurrageRiskRadar from './widgets/DemurrageRiskRadar';
import CargoTonnageMatcher from './widgets/CargoTonnageMatcher';
import StrategicActionPanel from './widgets/StrategicActionPanel';



// ============================================================
// CONSTANTS
// ============================================================

const LSEG_POLL_INTERVAL_MS = 60_000;

const TYPE_ICONS: Record<string, React.ReactNode> = {
    Vessel: <Ship size={13} className="text-cyan-400" />,
    Port: <Navigation size={13} className="text-purple-400" />,
    Route: <RouteIcon size={13} className="text-sky-400" />,
    MarketIndicator: <TrendingUp size={13} className="text-emerald-400" />,
    RiskEvent: <AlertTriangle size={13} className="text-rose-400" />,
};

const TYPE_FILTERS: OntologyObjectType[] = ['Vessel', 'Port', 'Route', 'MarketIndicator', 'RiskEvent'];

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
    const [searchQuery, setSearchQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState<OntologyObjectType | 'all'>('all');

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

    // ---- Auto-fetch AIS on mount + LSEG Data Fetch + Polling ----
    useEffect(() => {
        fetchAndBindMarketData();
        refreshAISPositions();
        const interval = setInterval(() => fetchAndBindMarketData(), LSEG_POLL_INTERVAL_MS);

        // Visibility-gating: pause polling when tab is hidden
        let pausedInterval: ReturnType<typeof setInterval> | null = null;
        const handleVisibility = () => {
            if (document.hidden) {
                clearInterval(interval);
            } else {
                // Avoid duplicate intervals
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
    }, [fetchAndBindMarketData, refreshAISPositions]);

    // ---- Filtered & sorted object list ----
    const filteredObjects = useMemo(() => {
        let list = objects.filter(o => o.metadata.status === 'active');

        if (typeFilter !== 'all') {
            list = list.filter(o => o.type === typeFilter);
        }

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            list = list.filter(o =>
                o.title.toLowerCase().includes(q) ||
                o.description?.toLowerCase().includes(q) ||
                o.type.toLowerCase().includes(q)
            );
        }

        // Sort by risk score descending
        list.sort((a, b) => (Number(b.properties.riskScore) || 0) - (Number(a.properties.riskScore) || 0));

        return list;
    }, [objects, typeFilter, searchQuery]);

    // ---- Handlers ----
    const handleObjectSelect = useCallback((id: string) => {
        setSelectedObjectId(prev => prev === id ? null : id);
    }, []);

    const handleMapVesselClick = useCallback((vessel: FleetVessel) => {
        // Find the ontology object matching this vessel
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
                    LEFT PANEL — Deal Execution & Margin Setup
                   ════════════════════════════════════════════ */}
                <div className="w-[400px] shrink-0 flex flex-col border-r border-slate-800/80 bg-[#070b10] overflow-y-auto custom-scrollbar p-3 space-y-4">
                    <div className="min-h-[340px]">
                        <LiveTCEMarginCalculator simulationParams={simulationParams} />
                    </div>
                    <div className="min-h-[380px]">
                        <DemurrageRiskRadar simulationParams={simulationParams} />
                    </div>
                </div>

                {/* ════════════════════════════════════════════
                    CENTER PANEL — Map / Graph
                   ════════════════════════════════════════════ */}
                <div className="flex-1 flex flex-col min-w-0 border-r border-slate-800/80">
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
                    RIGHT PANEL — Object 360 & Tonnage Matcher
                   ════════════════════════════════════════════ */}
                {selectedObjectId ? (
                    <div className="w-[450px] shrink-0 flex flex-col bg-[#070b10]">
                        <Object360Panel
                            objectId={selectedObjectId}
                            onClose={handleObject360Close}
                            onNavigate={handleObject360Navigate}
                        />
                    </div>
                ) : (
                    <div className="w-[450px] shrink-0 flex flex-col bg-[#070b10] overflow-y-auto custom-scrollbar p-3 space-y-4">
                        <div className="flex-1 min-h-[400px]">
                            <CargoTonnageMatcher simulationParams={simulationParams} />
                        </div>
                        <div className="flex-1">
                            {/* Empty briefing because we only want the Live AI Broker Alert and existing actions */}
                            <StrategicActionPanel 
                                briefing={{ hedgingStrategies: [], operationalDirectives: [], generatedAt: new Date().toISOString(), marketOutlook: {summary:'', keyMetrics:[]}, financialImpactVaR: {totalVaR:'', breakdown:[], assessment:''} }} 
                                scenarioName="Live Market Evaluation" 
                            />
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
