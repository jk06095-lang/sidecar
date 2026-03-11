/**
 * FleetMapWidget — Satellite map showing real-time fleet vessel positions
 * Uses Leaflet with ESRI World Imagery satellite tiles (free, no API key).
 * Vessel positions derived from location strings in FLEET_DATA.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, ExternalLink, Navigation, Fuel, Shield, Anchor, Maximize2, Minimize2, Search } from 'lucide-react';
import type { FleetVessel } from '../../types';

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
};

function resolveCoords(location: string): [number, number] {
    for (const [key, coords] of Object.entries(LOCATION_COORDS)) {
        if (location.toLowerCase().includes(key.toLowerCase())) {
            return coords;
        }
    }
    // Default: center of Indian Ocean
    return [15.0, 65.0];
}

const RISK_COLORS: Record<string, string> = {
    Low: '#22c55e',
    Medium: '#f59e0b',
    High: '#ef4444',
    Critical: '#dc2626',
};

interface FleetMapWidgetProps {
    vessels: FleetVessel[];
    onSelectVessel?: (vessel: FleetVessel) => void;
}

export default function FleetMapWidget({ vessels, onSelectVessel }: FleetMapWidgetProps) {
    const mapRef = useRef<HTMLDivElement>(null);
    const leafletMap = useRef<L.Map | null>(null);
    const markersRef = useRef<L.Marker[]>([]);
    const [hoveredVessel, setHoveredVessel] = useState<FleetVessel | null>(null);
    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
    const [isExpanded, setIsExpanded] = useState(false);
    const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Debounced hide: clear timeout when re-entering marker or tooltip
    const scheduleHide = useCallback(() => {
        hideTimeoutRef.current = setTimeout(() => {
            setHoveredVessel(null);
        }, 250);
    }, []);

    const cancelHide = useCallback(() => {
        if (hideTimeoutRef.current) {
            clearTimeout(hideTimeoutRef.current);
            hideTimeoutRef.current = null;
        }
    }, []);

    const handleMouseEnterTooltip = useCallback(() => {
        cancelHide();
    }, [cancelHide]);

    const handleMouseLeaveTooltip = useCallback(() => {
        scheduleHide();
    }, [scheduleHide]);

    useEffect(() => {
        if (!mapRef.current || leafletMap.current) return;

        const map = L.map(mapRef.current, {
            center: [20, 60],
            zoom: 4,
            zoomControl: false,
            attributionControl: false,
        });

        // ESRI World Imagery — free satellite tiles, no API key
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 18,
        }).addTo(map);

        // Zoom control top-right
        L.control.zoom({ position: 'topright' }).addTo(map);

        // Styles
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

        // Clear old markers
        markersRef.current.forEach(m => m.remove());
        markersRef.current = [];

        vessels.forEach((vessel) => {
            const coords = resolveCoords(vessel.location);
            const color = RISK_COLORS[vessel.riskLevel] || '#3b82f6';

            const icon = L.divIcon({
                className: '',
                html: `
                    <div style="position:relative;cursor:pointer;">
                        <div style="
                            width:32px;height:32px;border-radius:50%;
                            background:radial-gradient(circle, ${color}40, ${color}10);
                            border:2px solid ${color};
                            display:flex;align-items:center;justify-content:center;
                            box-shadow:0 0 12px ${color}80, 0 0 24px ${color}30;
                            animation: pulse-ring 2s ease-out infinite;
                        ">
                            <div style="width:10px;height:10px;border-radius:50%;background:${color};"></div>
                        </div>
                        <div style="
                            position:absolute;top:-24px;left:50%;transform:translateX(-50%);
                            background:#0f172a;border:1px solid ${color}60;
                            color:white;font-size:9px;font-weight:600;
                            padding:2px 6px;border-radius:4px;white-space:nowrap;
                            pointer-events:none;
                        ">${vessel.vessel_name}</div>
                    </div>
                `,
                iconSize: [32, 32],
                iconAnchor: [16, 16],
            });

            const marker = L.marker(coords, { icon }).addTo(map);

            marker.on('mouseover', (e: L.LeafletMouseEvent) => {
                cancelHide();
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
    }, [vessels, onSelectVessel, cancelHide, scheduleHide]);

    // Resize map when expanded/collapsed
    useEffect(() => {
        setTimeout(() => leafletMap.current?.invalidateSize(), 300);
    }, [isExpanded]);

    return (
        <div className={`relative bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden transition-all duration-300`}>
            {/* Header */}
            <div className="absolute top-0 left-0 right-0 z-[400] flex items-center justify-between px-4 py-2 bg-gradient-to-b from-slate-900/90 to-transparent pointer-events-none">
                <div className="flex items-center gap-2 pointer-events-auto">
                    <div className="w-6 h-6 rounded bg-cyan-500/20 flex items-center justify-center">
                        <Navigation size={12} className="text-cyan-400" />
                    </div>
                    <span className="text-xs font-bold text-white tracking-wide">FLEET TRACKER</span>
                    <span className="text-[9px] text-slate-400 font-mono ml-1">LIVE</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                </div>
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="pointer-events-auto p-1.5 rounded bg-slate-800/80 hover:bg-slate-700/80 text-slate-400 hover:text-white transition-colors"
                    title={isExpanded ? '축소' : '확대'}
                >
                    {isExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                </button>
            </div>

            {/* Map */}
            <div
                ref={mapRef}
                className="w-full h-full"
                style={{ minHeight: '320px' }}
            />

            {/* Hover tooltip — POINTER EVENTS ENABLED for action menu */}
            {hoveredVessel && (
                <div
                    className="absolute z-[1002] fleet-map-tooltip"
                    style={{
                        left: Math.min(tooltipPos.x + 12, (mapRef.current?.clientWidth || 600) - 270),
                        top: Math.max(tooltipPos.y - 130, 40),
                    }}
                    onMouseEnter={handleMouseEnterTooltip}
                    onMouseLeave={handleMouseLeaveTooltip}
                >
                    <div className="bg-slate-900/95 border border-slate-600 rounded-xl p-3 shadow-2xl backdrop-blur-sm min-w-[240px]">
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
                        {/* Clickable Action Button */}
                        <button
                            onClick={() => {
                                onSelectVessel?.(hoveredVessel);
                                setHoveredVessel(null);
                            }}
                            className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 rounded-lg text-[10px] text-cyan-400 font-medium transition-all hover:text-cyan-300"
                        >
                            <Search size={10} />
                            상세 조회
                        </button>
                    </div>
                </div>
            )}

            {/* Vessel count badge */}
            <div className="absolute bottom-3 left-3 z-[400] bg-slate-900/80 border border-slate-700/60 rounded-lg px-2.5 py-1 flex items-center gap-1.5">
                <Anchor size={10} className="text-cyan-400" />
                <span className="text-[10px] text-white font-mono font-bold">{vessels.length}</span>
                <span className="text-[9px] text-slate-400">vessels tracked</span>
            </div>

            {/* CSS for pulse animation */}
            <style>{`
                @keyframes pulse-ring {
                    0% { box-shadow: 0 0 12px var(--ring-color, rgba(59,130,246,0.5)), 0 0 0 0 var(--ring-color, rgba(59,130,246,0.4)); }
                    70% { box-shadow: 0 0 12px var(--ring-color, rgba(59,130,246,0.5)), 0 0 0 8px transparent; }
                    100% { box-shadow: 0 0 12px var(--ring-color, rgba(59,130,246,0.5)), 0 0 0 0 transparent; }
                }
            `}</style>
        </div>
    );
}
