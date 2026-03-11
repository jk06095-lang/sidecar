/**
 * DashboardGrid — 12-column draggable/resizable widget grid.
 * Uses react-grid-layout v2 with localStorage persistence.
 * Edit mode toggle controls drag/resize ability.
 */
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
    Responsive,
    verticalCompactor,
    type LayoutItem,
    type Layout,
    type ResponsiveLayouts,
} from 'react-grid-layout';
import { Lock, Unlock, GripVertical } from 'lucide-react';
import { cn } from '../lib/utils';
import type { SimulationParams, FleetVessel } from '../types';
import { useOntologyStore } from '../store/ontologyStore';

// Widget imports
import FleetMapWidget from './widgets/FleetMapWidget';
import FleetStatusWidget from './widgets/FleetStatusWidget';
import GlobalNewsWidget from './widgets/GlobalNewsWidget';
import CurrencyWidget from './widgets/CurrencyWidget';
import OilPriceWidget from './widgets/OilPriceWidget';
import GeopoliticalRiskWidget from './widgets/GeopoliticalRiskWidget';
import PortCongestionWidget from './widgets/PortCongestionWidget';
import MarineTelemetryWidget from './widgets/MarineTelemetryWidget';
import VolatilityIndexWidget from './widgets/VolatilityIndexWidget';

// CSS for react-grid-layout
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

// ============================================================
// WIDTH PROVIDER (manual ResizeObserver — avoids WidthProvider HOC issues)
// ============================================================

function useContainerWidth(ref: React.RefObject<HTMLDivElement | null>) {
    const [width, setWidth] = useState(1200);
    useEffect(() => {
        if (!ref.current) return;
        const ro = new ResizeObserver(entries => {
            for (const e of entries) setWidth(e.contentRect.width);
        });
        ro.observe(ref.current);
        setWidth(ref.current.clientWidth);
        return () => ro.disconnect();
    }, [ref]);
    return width;
}

// ============================================================
// LAYOUT DEFAULTS
// ============================================================

const STORAGE_KEY = 'sidecar_grid_layout';
const COLS: Record<string, number> = { xxl: 16, xl: 14, lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 };
const ROW_HEIGHT = 60;
const BREAKPOINTS: Record<string, number> = { xxl: 1800, xl: 1400, lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 };

/** Default layout for xxl breakpoint (16 columns — ultrawide / multi-monitor) */
const DEFAULT_LAYOUT_XXL: LayoutItem[] = [
    { i: 'bevi', x: 0, y: 0, w: 4, h: 4, minW: 2, minH: 2 },
    { i: 'fleetMap', x: 4, y: 0, w: 12, h: 6, minW: 4, minH: 4 },
    { i: 'fleet', x: 0, y: 4, w: 4, h: 5, minW: 3, minH: 3 },
    { i: 'hormuzWeather', x: 0, y: 9, w: 4, h: 5, minW: 3, minH: 3 },
    { i: 'singaporeWeather', x: 4, y: 6, w: 4, h: 5, minW: 3, minH: 3 },
    { i: 'busanWeather', x: 8, y: 6, w: 4, h: 5, minW: 3, minH: 3 },
    { i: 'suezWeather', x: 12, y: 6, w: 4, h: 5, minW: 3, minH: 3 },
    { i: 'globalNews', x: 0, y: 14, w: 10, h: 6, minW: 4, minH: 4 },
    { i: 'currency', x: 10, y: 11, w: 6, h: 6, minW: 3, minH: 3 },
    { i: 'oilPrice', x: 0, y: 20, w: 4, h: 5, minW: 3, minH: 3 },
    { i: 'geopoliticalRisk', x: 4, y: 20, w: 4, h: 6, minW: 3, minH: 3 },
    { i: 'portCongestion', x: 8, y: 17, w: 4, h: 5, minW: 3, minH: 3 },
];

/** Default layout for xl breakpoint (14 columns — large PC monitor) */
const DEFAULT_LAYOUT_XL: LayoutItem[] = [
    { i: 'bevi', x: 0, y: 0, w: 4, h: 4, minW: 2, minH: 2 },
    { i: 'fleetMap', x: 4, y: 0, w: 10, h: 6, minW: 4, minH: 4 },
    { i: 'fleet', x: 0, y: 4, w: 4, h: 5, minW: 3, minH: 3 },
    { i: 'hormuzWeather', x: 0, y: 9, w: 4, h: 5, minW: 3, minH: 3 },
    { i: 'singaporeWeather', x: 4, y: 6, w: 5, h: 5, minW: 3, minH: 3 },
    { i: 'busanWeather', x: 9, y: 6, w: 5, h: 5, minW: 3, minH: 3 },
    { i: 'suezWeather', x: 4, y: 11, w: 5, h: 5, minW: 3, minH: 3 },
    { i: 'globalNews', x: 0, y: 14, w: 9, h: 6, minW: 4, minH: 4 },
    { i: 'currency', x: 9, y: 11, w: 5, h: 6, minW: 3, minH: 3 },
    { i: 'oilPrice', x: 0, y: 20, w: 5, h: 5, minW: 3, minH: 3 },
    { i: 'geopoliticalRisk', x: 5, y: 20, w: 4, h: 6, minW: 3, minH: 3 },
    { i: 'portCongestion', x: 9, y: 17, w: 5, h: 5, minW: 3, minH: 3 },
];

/** Default layout for lg breakpoint (12 columns — standard PC / laptop) */
const DEFAULT_LAYOUT_LG: LayoutItem[] = [
    { i: 'bevi', x: 0, y: 0, w: 4, h: 4, minW: 2, minH: 2 },
    { i: 'fleetMap', x: 4, y: 0, w: 8, h: 6, minW: 4, minH: 4 },
    { i: 'fleet', x: 0, y: 4, w: 4, h: 5, minW: 3, minH: 3 },
    { i: 'hormuzWeather', x: 0, y: 9, w: 4, h: 5, minW: 3, minH: 3 },
    { i: 'singaporeWeather', x: 4, y: 6, w: 4, h: 5, minW: 3, minH: 3 },
    { i: 'busanWeather', x: 8, y: 6, w: 4, h: 5, minW: 3, minH: 3 },
    { i: 'globalNews', x: 0, y: 14, w: 8, h: 6, minW: 4, minH: 4 },
    { i: 'currency', x: 8, y: 11, w: 4, h: 6, minW: 3, minH: 3 },
    { i: 'oilPrice', x: 0, y: 20, w: 4, h: 5, minW: 3, minH: 3 },
    { i: 'geopoliticalRisk', x: 4, y: 20, w: 4, h: 6, minW: 3, minH: 3 },
    { i: 'portCongestion', x: 8, y: 17, w: 4, h: 5, minW: 3, minH: 3 },
    { i: 'suezWeather', x: 0, y: 25, w: 4, h: 5, minW: 3, minH: 3 },
];

/** All default layouts keyed by breakpoint */
const DEFAULT_LAYOUTS: ResponsiveLayouts = {
    xxl: DEFAULT_LAYOUT_XXL,
    xl: DEFAULT_LAYOUT_XL,
    lg: DEFAULT_LAYOUT_LG,
};

// ============================================================
// LSEG MARKET DATA POLLING INTERVAL (60s)
// ============================================================
const LSEG_POLL_INTERVAL_MS = 60_000;

// ============================================================
// PROPS
// ============================================================

interface DashboardGridProps {
    widgetVisibility: Record<string, boolean>;
    simulationParams: SimulationParams;
    dynamicFleetData: FleetVessel[];
    onNavigateTab?: (tab: string) => void;
}

// ============================================================
// COMPONENT
// ============================================================

export default function DashboardGrid({ widgetVisibility, simulationParams, dynamicFleetData, onNavigateTab }: DashboardGridProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const containerWidth = useContainerWidth(containerRef);
    const [editMode, setEditMode] = useState(false);
    const fetchAndBindMarketData = useOntologyStore(s => s.fetchAndBindMarketData);

    // ---- LSEG Data Fetch on Mount + Polling ----
    useEffect(() => {
        // Initial fetch
        fetchAndBindMarketData();

        // Poll every 60s
        const interval = setInterval(() => {
            fetchAndBindMarketData();
        }, LSEG_POLL_INTERVAL_MS);

        return () => clearInterval(interval);
    }, [fetchAndBindMarketData]);

    // ---- Layout persistence ----
    const [layouts, setLayouts] = useState<ResponsiveLayouts>(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved) as ResponsiveLayouts;
                // Merge missing widgets into each breakpoint
                const merged: ResponsiveLayouts = { ...DEFAULT_LAYOUTS };
                for (const bp of Object.keys(DEFAULT_LAYOUTS) as string[]) {
                    const savedBp: LayoutItem[] = [...(parsed[bp] || DEFAULT_LAYOUTS[bp] || [])];
                    const defaultBp = DEFAULT_LAYOUTS[bp] || [];
                    const savedIds = new Set(savedBp.map((l) => l.i));
                    const missing = defaultBp.filter(d => !savedIds.has(d.i));
                    merged[bp] = [...savedBp, ...missing];
                }
                return merged;
            }
        } catch { /* ignore */ }
        return { ...DEFAULT_LAYOUTS };
    });

    const handleLayoutChange = useCallback((layout: Layout, allLayouts: ResponsiveLayouts) => {
        setLayouts(allLayouts);
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(allLayouts));
        } catch { /* ignore */ }
    }, []);

    // Filter layouts by visibility for all breakpoints
    const visibleLayouts = useMemo((): ResponsiveLayouts => {
        const result: ResponsiveLayouts = {};
        for (const bp of Object.keys(COLS)) {
            const bpLayout = layouts[bp] || DEFAULT_LAYOUTS[bp] || DEFAULT_LAYOUT_LG;
            result[bp] = bpLayout.filter(l => widgetVisibility[l.i] !== false);
        }
        return result;
    }, [layouts, widgetVisibility]);

    // Primary visible layout for rendering children (use the largest available)
    const visibleLayout = useMemo((): LayoutItem[] => {
        const source = visibleLayouts.xxl || visibleLayouts.lg || DEFAULT_LAYOUT_LG;
        return [...source] as LayoutItem[];
    }, [visibleLayouts]);

    // ---- Widget renderer ----
    const renderWidget = (widgetId: string) => {
        switch (widgetId) {
            case 'fleetMap':
                return <FleetMapWidget vessels={dynamicFleetData} onSelectVessel={() => onNavigateTab?.('ontology')} />;
            case 'fleet':
                return <FleetStatusWidget fleetData={dynamicFleetData} />;
            case 'hormuzWeather':
                return <MarineTelemetryWidget portName="Hormuz" lat={26.56} lon={56.25} label="Strait of Hormuz Telemetry" />;
            case 'singaporeWeather':
                return <MarineTelemetryWidget portName="Singapore" lat={1.26} lon={103.75} label="Singapore Strait Telemetry" />;
            case 'busanWeather':
                return <MarineTelemetryWidget portName="Busan" lat={35.08} lon={129.04} label="Busan Port Telemetry" />;
            case 'suezWeather':
                return <MarineTelemetryWidget portName="Suez" lat={30.58} lon={32.27} label="Suez Canal Telemetry" />;
            case 'globalNews':
                return <GlobalNewsWidget />;
            case 'currency':
                return <CurrencyWidget />;
            case 'oilPrice':
                return <OilPriceWidget simulationParams={simulationParams} />;
            case 'geopoliticalRisk':
                return <GeopoliticalRiskWidget simulationParams={simulationParams} />;
            case 'portCongestion':
                return <PortCongestionWidget simulationParams={simulationParams} />;
            case 'bevi':
                return <VolatilityIndexWidget />;
            default:
                return <div className="flex items-center justify-center h-full text-slate-500 text-xs">Unknown Widget: {widgetId}</div>;
        }
    };

    return (
        <div className="relative" ref={containerRef}>
            {/* Edit Mode Toggle */}
            <div className="flex items-center justify-end mb-3">
                <button
                    onClick={() => setEditMode(!editMode)}
                    className={cn(
                        'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border',
                        editMode
                            ? 'bg-amber-500/15 text-amber-400 border-amber-500/30 shadow-[0_0_12px_rgba(245,158,11,0.15)]'
                            : 'bg-slate-800/60 text-slate-400 border-slate-700/50 hover:bg-slate-700/50 hover:text-slate-200'
                    )}
                >
                    {editMode ? <Unlock size={13} /> : <Lock size={13} />}
                    {editMode ? ' 편집 모드' : ' 레이아웃 고정'}
                </button>
            </div>

            {/* Grid Background (edit mode) */}
            <div className={cn(
                "relative rounded-xl transition-all duration-300",
                editMode && "bg-[radial-gradient(circle,#334155_1px,transparent_1px)] bg-[size:20px_20px] ring-1 ring-amber-500/20 p-2"
            )}>
                {containerWidth > 0 && (
                    <Responsive
                        className="dashboard-grid"
                        width={containerWidth}
                        layouts={visibleLayouts}
                        breakpoints={BREAKPOINTS}
                        cols={COLS}
                        rowHeight={ROW_HEIGHT}
                        dragConfig={{
                            enabled: editMode,
                            handle: '.grid-drag-handle',
                            bounded: false,
                            threshold: 3,
                        }}
                        resizeConfig={{
                            enabled: editMode,
                            handles: ['se'],
                        }}
                        compactor={verticalCompactor}
                        margin={[12, 12] as [number, number]}
                        containerPadding={[0, 0] as [number, number]}
                        onLayoutChange={handleLayoutChange}
                    >
                        {visibleLayout.map(item => (
                            <div
                                key={item.i}
                                className={cn(
                                    "relative rounded-xl overflow-visible transition-shadow",
                                    editMode && "ring-1 ring-slate-600/50 hover:ring-cyan-500/40 shadow-lg"
                                )}
                            >
                                {/* Drag Handle (edit mode only) */}
                                {editMode && (
                                    <div className="grid-drag-handle absolute top-0 left-0 right-0 z-30 flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/90 border-b border-slate-700/50 cursor-grab active:cursor-grabbing select-none backdrop-blur-sm rounded-t-xl">
                                        <GripVertical size={14} className="text-slate-500" />
                                        <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider truncate">{item.i.replace(/([A-Z])/g, ' $1').trim()}</span>
                                    </div>
                                )}
                                {/* Widget Content */}
                                <div className={cn("h-full w-full overflow-hidden", editMode && "pt-7")}>
                                    {renderWidget(item.i)}
                                </div>
                            </div>
                        ))}
                    </Responsive>
                )}
            </div>
        </div>
    );
}
