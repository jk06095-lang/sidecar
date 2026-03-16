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
import type { SimulationParams, FleetVessel, OntologyObject, OntologyObjectType } from '../types';
import { useOntologyStore } from '../store/ontologyStore';

// Widgets
import FleetMapWidget from './widgets/FleetMapWidget';
import Object360Panel from './widgets/Object360Panel';
import MacroIntelligenceBoard from './widgets/MacroIntelligenceBoard';



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
    dynamicFleetData: FleetVessel[];
    onNavigateTab?: (tab: string) => void;
}

// ============================================================
// COMPONENT
// ============================================================

export default function DashboardGrid({ simulationParams, dynamicFleetData, onNavigateTab }: DashboardGridProps) {
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
        return () => clearInterval(interval);
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
            <div className="flex flex-1 min-h-0">
                {/* ════════════════════════════════════════════
                    LEFT PANEL — Object Explorer
                   ════════════════════════════════════════════ */}
                <div className="w-[280px] shrink-0 flex flex-col border-r border-slate-800/50 bg-slate-950/50">
                    {/* Search */}
                    <div className="p-2 border-b border-slate-800/40">
                        <div className="relative">
                            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                            <input
                                type="text"
                                placeholder="Search objects..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="w-full bg-slate-900/60 border border-slate-800/50 rounded-lg pl-8 pr-8 py-1.5 text-[11px] text-slate-300 placeholder-slate-600 focus:border-cyan-500/40 focus:outline-none transition-colors"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                                >
                                    <X size={12} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Type Filter Chips */}
                    <div className="px-2 py-1.5 border-b border-slate-800/40 flex flex-wrap gap-1">
                        <button
                            onClick={() => setTypeFilter('all')}
                            className={cn(
                                "px-2 py-0.5 rounded text-[9px] font-bold transition-all uppercase tracking-wider",
                                typeFilter === 'all'
                                    ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                                    : 'text-slate-500 hover:text-slate-300 border border-transparent'
                            )}
                        >
                            All ({objects.filter(o => o.metadata.status === 'active').length})
                        </button>
                        {TYPE_FILTERS.map(t => {
                            const count = objects.filter(o => o.type === t && o.metadata.status === 'active').length;
                            if (count === 0) return null;
                            return (
                                <button
                                    key={t}
                                    onClick={() => setTypeFilter(typeFilter === t ? 'all' : t)}
                                    className={cn(
                                        "flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium transition-all",
                                        typeFilter === t
                                            ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                                            : 'text-slate-500 hover:text-slate-300 border border-transparent'
                                    )}
                                >
                                    {TYPE_ICONS[t]}
                                    {count}
                                </button>
                            );
                        })}
                    </div>

                    {/* Object List */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        {filteredObjects.map(obj => {
                            const riskScore = Number(obj.properties.riskScore || 0);
                            const isSelected = obj.id === selectedObjectId;
                            const riskColor = riskScore >= 80 ? 'bg-rose-500' : riskScore >= 50 ? 'bg-amber-500' : riskScore >= 30 ? 'bg-cyan-500' : 'bg-emerald-500';

                            return (
                                <button
                                    key={obj.id}
                                    onClick={() => handleObjectSelect(obj.id)}
                                    className={cn(
                                        "w-full flex items-center gap-2 px-3 py-2 text-left transition-all border-b border-slate-800/20",
                                        isSelected
                                            ? "bg-cyan-500/10 border-l-2 border-l-cyan-400"
                                            : "hover:bg-slate-800/30 border-l-2 border-l-transparent"
                                    )}
                                >
                                    <div className="shrink-0">{TYPE_ICONS[obj.type] || <FileText size={13} className="text-slate-400" />}</div>
                                    <div className="flex-1 min-w-0">
                                        <div className={cn("text-[11px] font-medium truncate", isSelected ? 'text-cyan-300' : 'text-slate-300')}>
                                            {obj.title}
                                        </div>
                                        <div className="text-[9px] text-slate-600 truncate">
                                            {obj.type} · {`${obj.properties.location || obj.properties.region || obj.description || ''}`?.slice(0, 30)}
                                        </div>
                                    </div>
                                    {/* Risk score badge */}
                                    <div className="shrink-0 flex items-center gap-1">
                                        <div className={cn("w-1.5 h-1.5 rounded-full", riskColor)} />
                                        <span className="text-[10px] font-mono text-slate-500">{riskScore}</span>
                                    </div>
                                    <ChevronRight size={12} className={cn("shrink-0 transition-transform", isSelected ? 'text-cyan-400 rotate-90' : 'text-slate-700')} />
                                </button>
                            );
                        })}
                        {filteredObjects.length === 0 && (
                            <div className="text-center py-8 text-xs text-slate-600">No objects found</div>
                        )}
                    </div>

                    {/* Object count footer */}
                    <div className="px-3 py-1.5 border-t border-slate-800/40 text-[9px] text-slate-600 font-mono">
                        {filteredObjects.length} objects · sorted by risk
                    </div>
                </div>

                {/* ════════════════════════════════════════════
                    CENTER PANEL — Map / Graph
                   ════════════════════════════════════════════ */}
                <div className="flex-1 flex flex-col min-w-0">
                    {/* Content — Full height map (header is inside FleetMapWidget overlay) */}
                    <div className="flex-1 relative min-h-0">
                        <FleetMapWidget
                            vessels={dynamicFleetData}
                            aisPositions={aisPositions}
                            ontologyObjects={objects}
                            ontologyLinks={links}
                            onSelectVessel={handleMapVesselClick}
                            onRefresh={refreshAISPositions}
                            isRefreshing={isAisRefreshing}
                        />
                    </div>
                </div>

                {/* ════════════════════════════════════════════
                    RIGHT PANEL — Object 360 (conditional)
                   ════════════════════════════════════════════ */}
                {selectedObjectId && (
                    <Object360Panel
                        objectId={selectedObjectId}
                        onClose={handleObject360Close}
                        onNavigate={handleObject360Navigate}
                    />
                )}
            </div>

            {/* ════════════════════════════════════════════
                BOTTOM PANEL — Macro Intelligence Board
               ════════════════════════════════════════════ */}
            <MacroIntelligenceBoard
                expanded={macroExpanded}
                onToggle={() => setMacroExpanded(!macroExpanded)}
            />
        </div>
    );
}
