/**
 * DashboardGrid — COP (Common Operational Picture)
 *
 * Map-centric layout:
 *   Full-bleed FleetMap with floating search overlay
 *   Right slide-in Object360Panel on object select
 *   Compact bottom status bar (BEVI + fleet counts + data source)
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Search, Ship, Navigation, AlertTriangle,
    Filter, X, Activity, Zap, TrendingUp,
    Route as RouteIcon, BarChart3, Radio,
} from 'lucide-react';
import { cn } from '../lib/utils';
import type { SimulationParams, FleetVessel, OntologyObject, OntologyObjectType } from '../types';
import { useOntologyStore } from '../store/ontologyStore';

// Widgets
import FleetMapWidget from './widgets/FleetMapWidget';
import Object360Panel from './widgets/Object360Panel';

// ============================================================
// CONSTANTS
// ============================================================

const LSEG_POLL_INTERVAL_MS = 60_000;

const TYPE_ICONS: Record<string, React.ReactNode> = {
    Vessel: <Ship size={11} className="text-cyan-400" />,
    Port: <Navigation size={11} className="text-purple-400" />,
    Route: <RouteIcon size={11} className="text-sky-400" />,
    MarketIndicator: <TrendingUp size={11} className="text-emerald-400" />,
    RiskEvent: <AlertTriangle size={11} className="text-rose-400" />,
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
    const [searchQuery, setSearchQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState<OntologyObjectType | 'all'>('all');
    const [showSearch, setShowSearch] = useState(false);

    // Store
    const objects = useOntologyStore(s => s.objects);
    const bevi = useOntologyStore(s => s.bevi);
    const lsegDataSource = useOntologyStore(s => s.lsegDataSource);
    const fetchAndBindMarketData = useOntologyStore(s => s.fetchAndBindMarketData);

    // ---- LSEG Data Fetch on Mount + Polling ----
    useEffect(() => {
        fetchAndBindMarketData();
        const interval = setInterval(() => fetchAndBindMarketData(), LSEG_POLL_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [fetchAndBindMarketData]);

    // ---- Filtered object list for overlay search ----
    const filteredObjects = useMemo(() => {
        let list = objects.filter(o => o.metadata.status === 'active');
        if (typeFilter !== 'all') list = list.filter(o => o.type === typeFilter);
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            list = list.filter(o =>
                o.title.toLowerCase().includes(q) ||
                o.description?.toLowerCase().includes(q) ||
                o.type.toLowerCase().includes(q)
            );
        }
        list.sort((a, b) => (Number(b.properties.riskScore) || 0) - (Number(a.properties.riskScore) || 0));
        return list;
    }, [objects, typeFilter, searchQuery]);

    // ---- Handlers ----
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

    const handleOverlaySelect = useCallback((id: string) => {
        setSelectedObjectId(id);
        setShowSearch(false);
        setSearchQuery('');
    }, []);

    // ---- Fleet stats ----
    const criticalCount = dynamicFleetData.filter(v => v.riskLevel === 'Critical').length;
    const highCount = dynamicFleetData.filter(v => v.riskLevel === 'High' || v.riskLevel === 'Medium').length;
    const vesselCount = dynamicFleetData.length;
    const riskEventCount = objects.filter(o => o.type === 'RiskEvent' && o.metadata.status === 'active').length;

    // BEVI styling
    const beviColor = bevi.value >= 70 ? 'text-rose-400' : bevi.value >= 40 ? 'text-amber-400' : 'text-emerald-400';
    const beviBarColor = bevi.value >= 70 ? 'bg-rose-500' : bevi.value >= 40 ? 'bg-amber-500' : 'bg-emerald-500';

    return (
        <div className="flex flex-col h-full relative">
            {/* ════════════════════════════════════════════
                MAIN AREA: Full FleetMap + optional Object360
               ════════════════════════════════════════════ */}
            <div className="flex flex-1 min-h-0">
                {/* ── Full-Bleed Fleet Map ── */}
                <div className="flex-1 relative min-w-0">
                    <FleetMapWidget
                        vessels={dynamicFleetData}
                        onSelectVessel={handleMapVesselClick}
                    />

                    {/* ───── Floating Search Overlay ───── */}
                    <div className="absolute top-14 left-4 z-[500] flex flex-col gap-2" style={{ maxWidth: 320 }}>
                        {/* Search Trigger / Bar */}
                        {!showSearch ? (
                            <button
                                onClick={() => setShowSearch(true)}
                                className="flex items-center gap-2 px-3 py-2 bg-slate-900/85 backdrop-blur-md border border-slate-700/50 rounded-xl text-[11px] text-slate-400 hover:text-slate-200 hover:border-slate-600/60 transition-all shadow-xl"
                            >
                                <Search size={13} className="text-slate-500" />
                                <span>Search objects…</span>
                                <kbd className="ml-auto text-[9px] text-slate-600 bg-slate-800/60 px-1.5 py-0.5 rounded border border-slate-700/40 font-mono">/</kbd>
                            </button>
                        ) : (
                            <div className="bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 rounded-xl shadow-2xl overflow-hidden">
                                {/* Search Input */}
                                <div className="relative border-b border-slate-800/50">
                                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                    <input
                                        type="text"
                                        placeholder="Search objects…"
                                        autoFocus
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                        className="w-full bg-transparent pl-9 pr-9 py-2.5 text-[11px] text-slate-200 placeholder-slate-600 focus:outline-none"
                                    />
                                    <button
                                        onClick={() => { setShowSearch(false); setSearchQuery(''); setTypeFilter('all'); }}
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                                    >
                                        <X size={13} />
                                    </button>
                                </div>

                                {/* Type Filter Chips */}
                                <div className="px-2.5 py-1.5 border-b border-slate-800/40 flex flex-wrap gap-1">
                                    <button
                                        onClick={() => setTypeFilter('all')}
                                        className={cn(
                                            "px-2 py-0.5 rounded text-[9px] font-bold transition-all uppercase tracking-wider",
                                            typeFilter === 'all'
                                                ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                                                : 'text-slate-500 hover:text-slate-300 border border-transparent'
                                        )}
                                    >
                                        All
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
                                                <span>{count}</span>
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Search Results */}
                                <div className="max-h-[280px] overflow-y-auto custom-scrollbar">
                                    {filteredObjects.slice(0, 20).map(obj => {
                                        const riskScore = Number(obj.properties.riskScore || 0);
                                        const riskColor = riskScore >= 80 ? 'bg-rose-500' : riskScore >= 50 ? 'bg-amber-500' : riskScore >= 30 ? 'bg-cyan-500' : 'bg-emerald-500';
                                        return (
                                            <button
                                                key={obj.id}
                                                onClick={() => handleOverlaySelect(obj.id)}
                                                className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-all hover:bg-slate-800/50 border-b border-slate-800/20"
                                            >
                                                <div className="shrink-0">{TYPE_ICONS[obj.type] || <Filter size={11} className="text-slate-400" />}</div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-[11px] font-medium text-slate-300 truncate">{obj.title}</div>
                                                    <div className="text-[9px] text-slate-600 truncate">
                                                        {obj.type} · {`${obj.properties.location || obj.properties.region || obj.description || ''}`?.slice(0, 30)}
                                                    </div>
                                                </div>
                                                <div className="shrink-0 flex items-center gap-1">
                                                    <div className={cn("w-1.5 h-1.5 rounded-full", riskColor)} />
                                                    <span className="text-[10px] font-mono text-slate-500">{riskScore}</span>
                                                </div>
                                            </button>
                                        );
                                    })}
                                    {filteredObjects.length === 0 && (
                                        <div className="text-center py-6 text-xs text-slate-600">No objects found</div>
                                    )}
                                    {filteredObjects.length > 20 && (
                                        <div className="text-center py-2 text-[9px] text-slate-600">
                                            +{filteredObjects.length - 20} more results
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Right Panel — Object 360 (conditional slide-in) ── */}
                {selectedObjectId && (
                    <Object360Panel
                        objectId={selectedObjectId}
                        onClose={handleObject360Close}
                        onNavigate={handleObject360Navigate}
                    />
                )}
            </div>

            {/* ════════════════════════════════════════════
                BOTTOM STATUS BAR — Compact 36px
               ════════════════════════════════════════════ */}
            <div className="shrink-0 h-[36px] border-t border-slate-800/60 bg-slate-950/90 backdrop-blur-sm flex items-center px-4 gap-4">
                {/* BEVI */}
                <div className="flex items-center gap-2">
                    <Activity size={12} className={beviColor} />
                    <span className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">BEVI</span>
                    <span className={cn("text-sm font-black font-mono", beviColor)}>{bevi.value}</span>
                    <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div className={cn("h-full rounded-full transition-all duration-700", beviBarColor)} style={{ width: `${Math.min(100, bevi.value)}%` }} />
                    </div>
                    {bevi.delta !== 0 && (
                        <span className={cn("text-[9px] font-mono font-bold",
                            bevi.trend === 'up' ? 'text-rose-400' : bevi.trend === 'down' ? 'text-emerald-400' : 'text-slate-500'
                        )}>
                            {bevi.trend === 'up' ? '▲' : bevi.trend === 'down' ? '▼' : '—'} {bevi.delta > 0 ? '+' : ''}{bevi.delta}
                        </span>
                    )}
                </div>

                <div className="w-px h-4 bg-slate-800" />

                {/* Fleet */}
                <div className="flex items-center gap-1.5">
                    <Ship size={11} className="text-cyan-400" />
                    <span className="text-[10px] font-mono text-slate-300 font-bold">{vesselCount}</span>
                    <span className="text-[9px] text-slate-600">vessels</span>
                </div>

                {criticalCount > 0 && (
                    <div className="flex items-center gap-1 px-1.5 py-0.5 bg-rose-500/10 border border-rose-500/20 rounded text-[9px] font-bold text-rose-400">
                        <AlertTriangle size={9} />
                        {criticalCount} Critical
                    </div>
                )}

                {highCount > 0 && (
                    <div className="flex items-center gap-1 text-[9px] text-amber-400 font-mono">
                        <Zap size={9} /> {highCount} elevated
                    </div>
                )}

                <div className="w-px h-4 bg-slate-800" />

                {/* Risk Events */}
                <div className="flex items-center gap-1.5">
                    <AlertTriangle size={10} className="text-rose-400" />
                    <span className="text-[10px] font-mono text-slate-300">{riskEventCount}</span>
                    <span className="text-[9px] text-slate-600">risk events</span>
                </div>

                {/* Data Source */}
                <div className="ml-auto flex items-center gap-2">
                    <div className={cn(
                        "flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider",
                        lsegDataSource === 'live'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-slate-800/50 text-slate-500 border border-slate-700/30'
                    )}>
                        <Radio size={8} />
                        {lsegDataSource === 'live' ? 'LIVE' : 'DEMO'}
                    </div>
                    <span className="text-[8px] text-slate-700 font-mono">
                        {objects.filter(o => o.metadata.status === 'active').length} nodes
                    </span>
                </div>
            </div>
        </div>
    );
}
