/**
 * FleetMapWidget — Satellite map showing real-time fleet vessel positions
 * Uses Leaflet with ESRI World Imagery satellite tiles (free, no API key).
 *
 * [Part 3] derivedRiskLevel from quant engine drives:
 *   - CRITICAL → intense red pulse, double-ring animation, ⚠ badge
 *   - WARNING  → amber pulse, single-ring
 *   - SAFE     → default color
 * Tooltip shows riskFactors with root cause descriptions.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, ExternalLink, Navigation, Fuel, Shield, Anchor, Maximize2, Minimize2, AlertTriangle, RefreshCw, Loader2 } from 'lucide-react';
import type { FleetVessel } from '../../types';
import type { AISPosition } from '../../services/aisService';

// Location string → coordinates mapping
const LOCATION_COORDS: Record<string, [number, number]> = {
    'Persian Gulf': [26.56, 56.25],
    'Ras Laffan': [25.93, 51.54],
    'Arabian Sea': [20.50, 62.00],
    'Strait of Hormuz': [26.56, 56.25],
    'Ulsan': [35.50, 129.38],
    'Singapore': [1.29, 103.85],
    'Busan': [35.10, 129.04],
    'Shanghai': [31.23, 121.47],
    'Rotterdam': [51.90, 4.48],
    'Houston': [29.76, -95.36],
    'Suez Canal': [30.58, 32.27],
    'Mumbai': [19.08, 72.88],
    'Shinas': [24.74, 56.46],
    'Sharjah': [25.36, 55.39],
    'Fujairah': [25.13, 56.33],
    'Muscat': [23.61, 58.54],
    'Jeddah': [21.49, 39.19],
    'Dammam': [26.43, 50.10],
    'Incheon': [37.46, 126.63],
    'Tokyo': [35.65, 139.84],
    'Cape Town': [-33.92, 18.42],
    'Durban': [-29.87, 31.05],
    'Mombasa': [-4.04, 39.67],
    'Colombo': [6.93, 79.85],
    'Malacca Strait': [2.50, 101.80],
    'South China Sea': [15.00, 115.00],
    'Indian Ocean': [5.00, 70.00],
    // Additional Korean port names
    '울산': [35.50, 129.38],
    '부산': [35.10, 129.04],
    '인천': [37.46, 126.63],
    '여수': [34.74, 127.74],
    '광양': [34.93, 127.70],
    '목포': [34.79, 126.38],
    '평택': [36.97, 126.83],
    '대산': [36.95, 126.35],
    // Additional global ports
    'Ras Laffan → Ulsan': [30.00, 90.00],
    'Red Sea': [20.00, 38.00],
    'Gulf of Aden': [12.50, 47.00],
    'Mediterranean': [35.00, 18.00],
    'Baltic Sea': [56.00, 18.00],
    'North Sea': [56.00, 3.00],
    'Yokohama': [35.44, 139.64],
    'Hong Kong': [22.29, 114.17],
    'Kaohsiung': [22.62, 120.27],
    'Ningbo': [29.87, 121.55],
    'Guangzhou': [23.10, 113.35],
    'Tianjin': [39.08, 117.70],
    'Dalian': [38.91, 121.60],
    'Qingdao': [36.07, 120.38],
    'Dubai': [25.20, 55.27],
    'Abu Dhabi': [24.45, 54.65],
    'Kuwait': [29.38, 47.99],
    'Basra': [30.51, 47.81],
    'Yanbu': [24.09, 38.06],
    'Port Said': [31.26, 32.30],
    'Lagos': [6.45, 3.40],
    'Antwerp': [51.22, 4.40],
    'Hamburg': [53.55, 9.99],
    'Piraeus': [37.94, 23.63],
};

function resolveCoords(location: string): [number, number] {
    for (const [key, coords] of Object.entries(LOCATION_COORDS)) {
        if (location.toLowerCase().includes(key.toLowerCase())) {
            return coords;
        }
    }
    return [15.0, 65.0];
}

const RISK_COLORS: Record<string, string> = {
    Low: '#22c55e',
    Medium: '#f59e0b',
    High: '#ef4444',
    Critical: '#dc2626',
};

// Derived risk level → visual config
const DERIVED_RISK_CONFIG: Record<string, { color: string; pulseClass: string; badge: string }> = {
    CRITICAL: { color: '#ef4444', pulseClass: 'derived-pulse-critical', badge: '⚠ CRITICAL' },
    WARNING: { color: '#f59e0b', pulseClass: 'derived-pulse-warning', badge: '⚡ WARNING' },
    SAFE: { color: '', pulseClass: '', badge: '' },
};

interface FleetMapWidgetProps {
    vessels: FleetVessel[];
    aisPositions?: AISPosition[];
    onSelectVessel?: (vessel: FleetVessel) => void;
    onRefresh?: () => void;
    isRefreshing?: boolean;
}

export default function FleetMapWidget({ vessels, aisPositions = [], onSelectVessel, onRefresh, isRefreshing }: FleetMapWidgetProps) {
    const mapRef = useRef<HTMLDivElement>(null);
    const leafletMap = useRef<L.Map | null>(null);
    const markersRef = useRef<L.Marker[]>([]);
    const [hoveredVessel, setHoveredVessel] = useState<FleetVessel | null>(null);
    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
    const [isExpanded, setIsExpanded] = useState(false);

    // ---- Delayed-hide tooltip mechanism ----
    const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearHideTimer = useCallback(() => {
        if (hideTimerRef.current) {
            clearTimeout(hideTimerRef.current);
            hideTimerRef.current = null;
        }
    }, []);

    const scheduleHide = useCallback(() => {
        clearHideTimer();
        hideTimerRef.current = setTimeout(() => {
            setHoveredVessel(null);
        }, 300);
    }, [clearHideTimer]);

    useEffect(() => {
        return () => clearHideTimer();
    }, [clearHideTimer]);

    useEffect(() => {
        if (!mapRef.current || leafletMap.current) return;

        const map = L.map(mapRef.current, {
            center: [20, 60],
            zoom: 4,
            zoomControl: false,
            attributionControl: false,
        });

        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 18,
        }).addTo(map);

        L.control.zoom({ position: 'topright' }).addTo(map);
        L.control.attribution({ position: 'bottomright', prefix: '' }).addTo(map);

        leafletMap.current = map;

        return () => {
            map.remove();
            leafletMap.current = null;
        };
    }, []);

    // Update markers when vessels change
    useEffect(() => {
        const map = leafletMap.current;
        if (!map) return;

        markersRef.current.forEach(m => m.remove());
        markersRef.current = [];

        vessels.forEach((vessel) => {
            // Prefer AIS live position if available (match by MMSI from vessel properties)
            const mmsiStr = String(vessel.mmsi || (vessel as any).mmsi || '');
            const aisMatch = mmsiStr ? aisPositions.find(p => String(p.mmsi) === mmsiStr) : null;
            const isLiveAIS = !!aisMatch;
            // Priority: AIS live > vessel.lat/lng from ontology > location string resolver
            const coords: [number, number] = aisMatch
                ? [aisMatch.lat, aisMatch.lng]
                : (vessel.lat && vessel.lng && (vessel.lat !== 0 || vessel.lng !== 0))
                    ? [vessel.lat, vessel.lng]
                    : resolveCoords(vessel.location);
            const baseColor = RISK_COLORS[vessel.riskLevel] || '#3b82f6';

            // Determine visual config from derived risk
            const derivedCfg = DERIVED_RISK_CONFIG[vessel.derivedRiskLevel || 'SAFE'];
            const markerColor = derivedCfg.color || baseColor;
            const isCritical = vessel.derivedRiskLevel === 'CRITICAL';
            const isWarning = vessel.derivedRiskLevel === 'WARNING';
            const hasDerivedRisk = isCritical || isWarning;

            // Build marker HTML with derived risk visual enhancements
            const outerGlow = isCritical
                ? `box-shadow:0 0 16px ${markerColor}CC, 0 0 32px ${markerColor}60, 0 0 48px ${markerColor}30;`
                : isWarning
                    ? `box-shadow:0 0 12px ${markerColor}99, 0 0 24px ${markerColor}40;`
                    : `box-shadow:0 0 12px ${markerColor}80, 0 0 24px ${markerColor}30;`;

            const animClass = hasDerivedRisk ? derivedCfg.pulseClass : '';
            const riskBadgeHtml = hasDerivedRisk
                ? `<div style="
                    position:absolute;top:-32px;right:-12px;
                    background:${markerColor}20;border:1px solid ${markerColor}80;
                    color:${markerColor};font-size:8px;font-weight:800;
                    padding:1px 4px;border-radius:3px;white-space:nowrap;
                    pointer-events:none;letter-spacing:0.5px;
                ">${derivedCfg.badge}</div>`
                : '';

            // AIS data source badge
            const aisSourceBadge = isLiveAIS
                ? `<div style="
                    position:absolute;bottom:-18px;left:50%;transform:translateX(-50%);
                    background:#065f4620;border:1px solid #06b6d480;
                    color:#22d3ee;font-size:7px;font-weight:800;
                    padding:0px 3px;border-radius:2px;white-space:nowrap;
                    pointer-events:none;letter-spacing:0.5px;
                ">📡 LIVE AIS</div>`
                : `<div style="
                    position:absolute;bottom:-18px;left:50%;transform:translateX(-50%);
                    background:#78350f20;border:1px solid #f59e0b40;
                    color:#fbbf24;font-size:7px;font-weight:800;
                    padding:0px 3px;border-radius:2px;white-space:nowrap;
                    pointer-events:none;letter-spacing:0.5px;
                ">EST</div>`;

            const icon = L.divIcon({
                className: '',
                html: `
                    <div style="position:relative;cursor:pointer;" class="${animClass}">
                        <div style="
                            width:32px;height:32px;border-radius:50%;
                            background:radial-gradient(circle, ${markerColor}40, ${markerColor}10);
                            border:${isCritical ? '3' : '2'}px solid ${markerColor};
                            display:flex;align-items:center;justify-content:center;
                            ${outerGlow}
                            animation: pulse-ring 2s ease-out infinite;
                        ">
                            <div style="width:${isCritical ? '12' : '10'}px;height:${isCritical ? '12' : '10'}px;border-radius:50%;background:${markerColor};"></div>
                        </div>
                        <div style="
                            position:absolute;top:-24px;left:50%;transform:translateX(-50%);
                            background:#0f172a;border:1px solid ${markerColor}60;
                            color:white;font-size:9px;font-weight:600;
                            padding:2px 6px;border-radius:4px;white-space:nowrap;
                            pointer-events:none;
                        ">${vessel.vessel_name}</div>
                        ${riskBadgeHtml}
                        ${aisSourceBadge}
                    </div>
                `,
                iconSize: [32, 32],
                iconAnchor: [16, 16],
            });

            const marker = L.marker(coords, { icon }).addTo(map);

            marker.on('mouseover', (e: L.LeafletMouseEvent) => {
                clearHideTimer();
                setHoveredVessel(vessel);
                const container = mapRef.current;
                if (container) {
                    const rect = container.getBoundingClientRect();
                    setTooltipPos({
                        x: e.originalEvent.clientX - rect.left,
                        y: e.originalEvent.clientY - rect.top,
                    });
                }
            });

            marker.on('mouseout', () => scheduleHide());
            marker.on('click', () => onSelectVessel?.(vessel));

            markersRef.current.push(marker);
        });
    }, [vessels, aisPositions, onSelectVessel, clearHideTimer, scheduleHide]);

    // Resize map when expanded/collapsed
    useEffect(() => {
        setTimeout(() => leafletMap.current?.invalidateSize(), 300);
    }, [isExpanded]);

    // Count derived risk vessels
    const criticalCount = vessels.filter(v => v.derivedRiskLevel === 'CRITICAL').length;
    const warningCount = vessels.filter(v => v.derivedRiskLevel === 'WARNING').length;

    return (
        <div className={`relative bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden transition-all duration-300 h-full flex flex-col ${isExpanded ? 'col-span-2 row-span-2' : ''}`}>
            {/* Header */}
            <div className="absolute top-0 left-0 right-0 z-[1000] flex items-center justify-between px-4 py-2 bg-gradient-to-b from-slate-900/90 to-transparent pointer-events-none">
                <div className="flex items-center gap-2 pointer-events-auto">
                    <div className="w-6 h-6 rounded bg-cyan-500/20 flex items-center justify-center">
                        <Navigation size={12} className="text-cyan-400" />
                    </div>
                    <span className="text-xs font-bold text-white tracking-wide">FLEET TRACKER</span>
                    <span className="text-[9px] text-slate-400 font-mono ml-1">LIVE</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    {aisPositions.length > 0 && (
                        <span className="text-[8px] text-cyan-400 font-mono ml-1 px-1 py-0.5 bg-cyan-500/10 border border-cyan-500/30 rounded">
                            📡 {aisPositions.length} AIS
                        </span>
                    )}
                    {/* Derived Risk Summary Badge */}
                    {(criticalCount > 0 || warningCount > 0) && (
                        <div className="flex items-center gap-1 ml-2 px-1.5 py-0.5 bg-rose-500/10 border border-rose-500/30 rounded text-[8px] font-bold text-rose-400">
                            <AlertTriangle size={8} />
                            {criticalCount > 0 && <span>{criticalCount} CRITICAL</span>}
                            {warningCount > 0 && <span className="text-amber-400">{warningCount} WARNING</span>}
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-1 pointer-events-auto">
                    {onRefresh && (
                        <button
                            onClick={onRefresh}
                            disabled={isRefreshing}
                            className="p-1.5 rounded bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 hover:text-cyan-300 transition-colors disabled:opacity-50 flex items-center gap-1"
                            title="선박 위치 최신화"
                        >
                            {isRefreshing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                            <span className="text-[9px] font-bold">위치 최신화</span>
                        </button>
                    )}
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="p-1.5 rounded bg-slate-800/80 hover:bg-slate-700/80 text-slate-400 hover:text-white transition-colors"
                        title={isExpanded ? '축소' : '확대'}
                    >
                        {isExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                    </button>
                </div>
            </div>

            {/* Map */}
            <div
                ref={mapRef}
                className="w-full flex-1"
                style={{ minHeight: '0' }}
            />

            {/* Hover tooltip with riskFactors */}
            {hoveredVessel && (
                <div
                    className="absolute z-[1001]"
                    style={{
                        left: Math.min(tooltipPos.x + 12, (mapRef.current?.clientWidth || 600) - 280),
                        top: Math.max(tooltipPos.y - 160, 40),
                        pointerEvents: 'auto',
                    }}
                    onMouseEnter={clearHideTimer}
                    onMouseLeave={scheduleHide}
                >
                    <div className="bg-slate-900/95 border border-slate-600 rounded-xl p-3 shadow-2xl backdrop-blur-sm min-w-[260px]">
                        <div className="flex items-center gap-2 mb-2">
                            <Anchor size={14} className="text-cyan-400" />
                            <span className="text-white font-bold text-sm">{hoveredVessel.vessel_name}</span>
                            <span
                                className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded"
                                style={{
                                    background: `${RISK_COLORS[hoveredVessel.riskLevel]}20`,
                                    color: RISK_COLORS[hoveredVessel.riskLevel],
                                    border: `1px solid ${RISK_COLORS[hoveredVessel.riskLevel]}40`,
                                }}
                            >
                                {hoveredVessel.riskLevel}
                            </span>
                        </div>
                        <div className="space-y-1.5 text-[10px]">
                            <div className="flex items-center gap-1.5 text-slate-400">
                                <MapPin size={10} className="text-amber-400 shrink-0" />
                                <span className="truncate">{hoveredVessel.location}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-slate-400">
                                <ExternalLink size={10} className="text-emerald-400 shrink-0" />
                                <span>{hoveredVessel.voyage_info.departure_port} → {hoveredVessel.voyage_info.destination_port}</span>
                            </div>
                            <div className="flex items-center gap-4 pt-1 border-t border-slate-700/50">
                                <div className="flex items-center gap-1">
                                    <Navigation size={9} className="text-cyan-400" />
                                    <span className="text-slate-300 font-mono">{hoveredVessel.speed_and_weather_metrics.avg_speed} kn</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <Fuel size={9} className="text-amber-400" />
                                    <span className="text-slate-300 font-mono">{hoveredVessel.consumption_and_rob.fo_rob.toLocaleString()} mt</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <Shield size={9} className="text-emerald-400" />
                                    <span className="text-slate-300 font-mono">CII {hoveredVessel.compliance.cii_rating}</span>
                                </div>
                            </div>
                        </div>

                        {/* Derived Risk Factors — Part 3 */}
                        {hoveredVessel.riskFactors && hoveredVessel.riskFactors.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-rose-800/30">
                                <div className="flex items-center gap-1 mb-1">
                                    <AlertTriangle size={9} className={hoveredVessel.derivedRiskLevel === 'CRITICAL' ? 'text-rose-400' : 'text-amber-400'} />
                                    <span className={`text-[9px] font-bold ${hoveredVessel.derivedRiskLevel === 'CRITICAL' ? 'text-rose-400' : 'text-amber-400'}`}>
                                        파생 리스크: {hoveredVessel.derivedRiskLevel}
                                    </span>
                                </div>
                                <ul className="space-y-0.5">
                                    {hoveredVessel.riskFactors.map((factor, i) => (
                                        <li key={i} className="text-[9px] text-slate-400 pl-3 relative">
                                            <span className="absolute left-0 top-[5px] w-1 h-1 rounded-full bg-rose-400/60"></span>
                                            {factor}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        <button
                            onClick={() => {
                                onSelectVessel?.(hoveredVessel);
                                setHoveredVessel(null);
                            }}
                            className="mt-2 w-full py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-[10px] text-cyan-400 font-medium transition-colors text-center cursor-pointer"
                        >
                            🔍 상세 조회 →
                        </button>
                    </div>
                </div>
            )}

            {/* Vessel count badge with risk summary */}
            <div className="absolute bottom-3 left-3 z-[400] bg-slate-900/80 border border-slate-700/60 rounded-lg px-2.5 py-1 flex items-center gap-1.5">
                <Anchor size={10} className="text-cyan-400" />
                <span className="text-[10px] text-white font-mono font-bold">{vessels.length}</span>
                <span className="text-[9px] text-slate-400">vessels tracked</span>
                {criticalCount > 0 && (
                    <span className="text-[9px] text-rose-400 font-bold ml-1">· {criticalCount} ⚠</span>
                )}
            </div>

            {/* CSS for pulse animations */}
            <style>{`
                @keyframes pulse-ring {
                    0% { box-shadow: 0 0 12px var(--ring-color, rgba(59,130,246,0.5)), 0 0 0 0 var(--ring-color, rgba(59,130,246,0.4)); }
                    70% { box-shadow: 0 0 12px var(--ring-color, rgba(59,130,246,0.5)), 0 0 0 8px transparent; }
                    100% { box-shadow: 0 0 12px var(--ring-color, rgba(59,130,246,0.5)), 0 0 0 0 transparent; }
                }
                @keyframes derived-critical-pulse {
                    0%, 100% { transform: scale(1); opacity: 1; }
                    50% { transform: scale(1.12); opacity: 0.85; }
                }
                @keyframes derived-warning-pulse {
                    0%, 100% { transform: scale(1); opacity: 1; }
                    50% { transform: scale(1.06); opacity: 0.92; }
                }
                .derived-pulse-critical {
                    animation: derived-critical-pulse 1.2s ease-in-out infinite;
                }
                .derived-pulse-warning {
                    animation: derived-warning-pulse 2s ease-in-out infinite;
                }
            `}</style>
        </div>
    );
}
