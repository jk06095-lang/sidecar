/**
 * FleetMapWidget — WorldView-style Geospatial Command Center
 * 
 * Satellite map with multi-layer intelligence fusion:
 *   Layer 1: Fleet vessel positions (AIS + estimated)
 *   Layer 2: UKMTO maritime incident markers
 *   Layer 3: Major shipping route lanes (polylines)
 *   Layer 4: Chokepoint / risk zone overlays (polygons)
 *   Layer 5: Intelligence feed ticker
 *
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
import {
    MapPin, ExternalLink, Navigation, Fuel, Shield, Anchor,
    Maximize2, Minimize2, AlertTriangle, RefreshCw, Loader2,
    Layers, Ship, Crosshair, Radio, Eye, EyeOff, Zap
} from 'lucide-react';
import type { FleetVessel } from '../../types';
import type { AISPosition } from '../../services/aisService';

// ============================================================
// LOCATION COORDINATES
// ============================================================
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
    '울산': [35.50, 129.38],
    '부산': [35.10, 129.04],
    '인천': [37.46, 126.63],
    '여수': [34.74, 127.74],
    '광양': [34.93, 127.70],
    '목포': [34.79, 126.38],
    '평택': [36.97, 126.83],
    '대산': [36.95, 126.35],
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

// ============================================================
// UKMTO INCIDENT DATA (representative recent incidents)
// ============================================================
interface UKMTOIncident {
    id: string;
    lat: number;
    lng: number;
    title: string;
    description: string;
    date: string;
    type: 'attack' | 'suspicious' | 'warning' | 'boarding';
    area: string;
}

const UKMTO_INCIDENTS: UKMTOIncident[] = [
    { id: 'UK-001', lat: 13.42, lng: 42.58, title: 'Missile Attack on Bulk Carrier', description: 'Vessel struck by unidentified projectile. Crew safe, vessel taking on water.', date: '2026-03-14', type: 'attack', area: 'Red Sea - Southern' },
    { id: 'UK-002', lat: 12.80, lng: 43.30, title: 'Drone Strike Near Bab el-Mandeb', description: 'Unmanned aerial vehicle detonated near commercial vessel. Minor damage reported.', date: '2026-03-13', type: 'attack', area: 'Bab el-Mandeb Strait' },
    { id: 'UK-003', lat: 14.10, lng: 42.20, title: 'Suspicious Approach - Skiff', description: 'Two high-speed skiffs approached vessel at 25 knots. Withdrew after armed guards visible.', date: '2026-03-12', type: 'suspicious', area: 'Red Sea' },
    { id: 'UK-004', lat: 12.00, lng: 45.00, title: 'Warning - Increased Threat Level', description: 'Multiple reports of drone activity in the area. All vessels advised to maintain maximum readiness.', date: '2026-03-11', type: 'warning', area: 'Gulf of Aden - West' },
    { id: 'UK-005', lat: 15.50, lng: 41.80, title: 'Anti-Ship Ballistic Missile Launch', description: 'ASBM launched toward commercial shipping lanes. Impacted water 500m from tanker.', date: '2026-03-10', type: 'attack', area: 'Red Sea - Central' },
    { id: 'UK-006', lat: 11.80, lng: 43.90, title: 'Vessel Boarded', description: 'Armed individuals boarded container vessel. Crew retreated to citadel. Navy responding.', date: '2026-03-09', type: 'boarding', area: 'Bab el-Mandeb Strait' },
    { id: 'UK-007', lat: 22.80, lng: 59.50, title: 'Suspicious UAV Overhead', description: 'Unmanned aerial vehicle observed circling vessel for 45 minutes at low altitude.', date: '2026-03-08', type: 'suspicious', area: 'Arabian Sea - North' },
    { id: 'UK-008', lat: 26.20, lng: 56.40, title: 'GPS Jamming Detected', description: 'Multiple vessels reporting GPS interference and navigation degradation in the strait.', date: '2026-03-07', type: 'warning', area: 'Strait of Hormuz' },
    { id: 'UK-009', lat: 13.00, lng: 48.50, title: 'Rocket Attack on Tanker', description: 'RPG fired at crude oil tanker. Hit superstructure, no casualties. Fire extinguished.', date: '2026-03-06', type: 'attack', area: 'Gulf of Aden' },
    { id: 'UK-010', lat: 16.50, lng: 41.00, title: 'Naval Mine Reported', description: 'Drifting naval mine sighted by commercial vessel. Area marked for mine clearance.', date: '2026-03-05', type: 'attack', area: 'Red Sea - North' },
    { id: 'UK-011', lat: 2.00, lng: 45.00, title: 'Piracy Attempt - Skiffs', description: 'Three skiffs with armed individuals attempted boarding. Vessel increased speed to evade.', date: '2026-03-04', type: 'boarding', area: 'Somali Basin' },
    { id: 'UK-012', lat: 10.50, lng: 51.20, title: 'Suspicious Vessel Shadowing', description: 'Dhow observed following commercial vessel for 6 hours, maintaining 2nm distance.', date: '2026-03-03', type: 'suspicious', area: 'Horn of Africa' },
    { id: 'UK-013', lat: 19.50, lng: 39.00, title: 'Missile Near-Miss on LNG Carrier', description: 'Cruise missile passed within 200m of LNG carrier. No impact. Coalition forces alerted.', date: '2026-03-02', type: 'attack', area: 'Red Sea - East' },
    { id: 'UK-014', lat: 25.50, lng: 57.00, title: 'IRGCN Fast Boat Harassment', description: 'IRGCN fast boats conducted unsafe maneuvers near commercial tanker in international waters.', date: '2026-03-01', type: 'suspicious', area: 'Strait of Hormuz' },
    { id: 'UK-015', lat: 7.00, lng: 50.00, title: 'Warning - Monsoon + Piracy', description: 'Combined monsoon weather and increased piracy risk. Vessels advised to route via corridor.', date: '2026-02-28', type: 'warning', area: 'Indian Ocean - West' },
];

const INCIDENT_COLORS: Record<string, { fill: string; border: string; glow: string }> = {
    attack: { fill: '#ef4444', border: '#fca5a5', glow: '#ef444480' },
    boarding: { fill: '#f97316', border: '#fdba74', glow: '#f9731680' },
    suspicious: { fill: '#eab308', border: '#fde047', glow: '#eab30860' },
    warning: { fill: '#a855f7', border: '#c084fc', glow: '#a855f760' },
};

// ============================================================
// SHIPPING ROUTES (key waypoints for polylines)
// ============================================================
interface ShippingRoute {
    id: string;
    name: string;
    color: string;
    waypoints: [number, number][];
    cargoType: string;
}

const SHIPPING_ROUTES: ShippingRoute[] = [
    {
        id: 'route-hormuz-suez',
        name: 'Persian Gulf → Suez Canal',
        color: '#06b6d4',
        cargoType: 'Crude Oil / LNG',
        waypoints: [
            [26.56, 56.25], [25.80, 56.50], [24.50, 58.00], [22.00, 59.80],
            [18.00, 57.00], [14.00, 48.00], [12.50, 43.50], [13.50, 42.50],
            [15.00, 42.00], [20.00, 38.50], [27.00, 34.50], [30.00, 32.50],
            [30.58, 32.27],
        ],
    },
    {
        id: 'route-gulf-asia',
        name: 'Persian Gulf → East Asia (Malacca)',
        color: '#22c55e',
        cargoType: 'LNG / Crude Oil',
        waypoints: [
            [26.56, 56.25], [24.50, 58.00], [20.00, 62.00], [15.00, 68.00],
            [10.00, 75.00], [6.50, 80.00], [4.00, 90.00], [2.50, 101.80],
            [1.29, 103.85], [5.00, 110.00], [15.00, 115.00], [22.29, 114.17],
            [31.23, 121.47], [35.10, 129.04], [35.50, 129.38],
        ],
    },
    {
        id: 'route-cape',
        name: 'Persian Gulf → Cape → Europe',
        color: '#f59e0b',
        cargoType: 'Crude Oil (alternate)',
        waypoints: [
            [26.56, 56.25], [24.00, 58.00], [18.00, 57.00], [10.00, 52.00],
            [2.00, 45.00], [-4.04, 39.67], [-15.00, 35.00], [-25.00, 25.00],
            [-33.92, 18.42], [-30.00, 10.00], [-15.00, 0.00], [0.00, -5.00],
            [20.00, -10.00], [35.00, -5.00], [42.00, -5.00], [48.00, -3.00],
            [51.90, 4.48],
        ],
    },
    {
        id: 'route-med',
        name: 'Suez → Mediterranean → Europe',
        color: '#8b5cf6',
        cargoType: 'Container / Oil Products',
        waypoints: [
            [30.58, 32.27], [31.26, 32.30], [33.00, 28.00], [35.00, 24.00],
            [36.00, 18.00], [37.94, 23.63], [38.00, 12.00], [36.00, 5.00],
            [36.00, -2.00], [40.00, -5.00], [48.00, -3.00], [51.22, 4.40],
            [51.90, 4.48], [53.55, 9.99],
        ],
    },
];

// ============================================================
// CHOKEPOINT / RISK ZONES (polygon coordinates)
// ============================================================
interface ChokepointZone {
    id: string;
    name: string;
    risk: 'critical' | 'high' | 'medium';
    color: string;
    coords: [number, number][];
    description: string;
}

const CHOKEPOINT_ZONES: ChokepointZone[] = [
    {
        id: 'zone-hormuz',
        name: 'Strait of Hormuz',
        risk: 'critical',
        color: '#ef4444',
        description: '21M bbl/day oil transit · GPS jamming reported · IRGCN activity',
        coords: [
            [27.10, 56.00], [26.80, 56.80], [26.00, 56.60],
            [25.50, 56.80], [25.80, 57.20], [26.50, 57.00],
            [27.00, 56.80], [27.20, 56.40],
        ],
    },
    {
        id: 'zone-bab',
        name: 'Bab el-Mandeb',
        risk: 'critical',
        color: '#ef4444',
        description: 'Active missile / drone threat · Houthi attack zone · 6M bbl/day',
        coords: [
            [13.20, 42.80], [12.80, 43.80], [12.20, 44.00],
            [11.50, 43.50], [11.80, 42.80], [12.50, 42.30],
            [13.00, 42.40],
        ],
    },
    {
        id: 'zone-malacca',
        name: 'Malacca Strait',
        risk: 'medium',
        color: '#eab308',
        description: '16M bbl/day oil transit · Piracy risk · Heavy traffic congestion',
        coords: [
            [4.00, 100.00], [3.00, 101.00], [1.50, 103.00],
            [1.00, 104.00], [1.50, 104.50], [2.50, 103.50],
            [3.50, 102.00], [4.50, 100.50],
        ],
    },
    {
        id: 'zone-suez',
        name: 'Suez Canal Approach',
        risk: 'medium',
        color: '#eab308',
        description: '12% global trade transit · Congestion bottleneck · Grounding risk',
        coords: [
            [31.50, 31.80], [30.50, 32.00], [29.80, 32.80],
            [30.00, 33.20], [30.80, 33.00], [31.50, 32.50],
        ],
    },
    {
        id: 'zone-aden',
        name: 'Gulf of Aden',
        risk: 'high',
        color: '#f97316',
        description: 'Piracy corridor · Coalition naval patrols · Drone threat extension',
        coords: [
            [14.00, 45.00], [12.00, 45.50], [11.00, 48.00],
            [11.50, 51.00], [13.00, 51.50], [14.50, 49.00],
            [14.50, 47.00],
        ],
    },
];

// ============================================================
// RISK CONFIG (unchanged)
// ============================================================
const RISK_COLORS: Record<string, string> = {
    Low: '#22c55e',
    Medium: '#f59e0b',
    High: '#ef4444',
    Critical: '#dc2626',
};

const DERIVED_RISK_CONFIG: Record<string, { color: string; pulseClass: string; badge: string }> = {
    CRITICAL: { color: '#ef4444', pulseClass: 'derived-pulse-critical', badge: '⚠ CRITICAL' },
    WARNING: { color: '#f59e0b', pulseClass: 'derived-pulse-warning', badge: '⚡ WARNING' },
    SAFE: { color: '', pulseClass: '', badge: '' },
};

// ============================================================
// LAYER VISIBILITY STATE
// ============================================================
interface LayerVisibility {
    vessels: boolean;
    incidents: boolean;
    routes: boolean;
    chokepoints: boolean;
}

// ============================================================
// COMPONENT
// ============================================================
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
    const incidentMarkersRef = useRef<L.Marker[]>([]);
    const routePolylinesRef = useRef<L.Polyline[]>([]);
    const zonePolygonsRef = useRef<L.Polygon[]>([]);
    const [hoveredVessel, setHoveredVessel] = useState<FleetVessel | null>(null);
    const [hoveredIncident, setHoveredIncident] = useState<UKMTOIncident | null>(null);
    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
    const [isExpanded, setIsExpanded] = useState(false);
    const [layerPanel, setLayerPanel] = useState(false);
    const [layers, setLayers] = useState<LayerVisibility>({
        vessels: true,
        incidents: true,
        routes: true,
        chokepoints: true,
    });
    const [tickerPaused, setTickerPaused] = useState(false);

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
            setHoveredIncident(null);
        }, 300);
    }, [clearHideTimer]);

    useEffect(() => {
        return () => clearHideTimer();
    }, [clearHideTimer]);

    // ---- Toggle a layer ----
    const toggleLayer = useCallback((key: keyof LayerVisibility) => {
        setLayers(prev => ({ ...prev, [key]: !prev[key] }));
    }, []);

    // ---- Initialize map ----
    useEffect(() => {
        if (!mapRef.current || leafletMap.current) return;

        const map = L.map(mapRef.current, {
            center: [20, 55],
            zoom: 4,
            zoomControl: false,
            attributionControl: false,
        });

        // Dark-toned satellite base
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 18,
        }).addTo(map);

        // Overlay labels (semi-transparent boundaries & names)
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png', {
            maxZoom: 18,
            opacity: 0.7,
        }).addTo(map);

        L.control.zoom({ position: 'topright' }).addTo(map);
        L.control.attribution({ position: 'bottomright', prefix: '' }).addTo(map);

        leafletMap.current = map;

        return () => {
            map.remove();
            leafletMap.current = null;
        };
    }, []);

    // ---- LAYER: Chokepoint Zones ----
    useEffect(() => {
        const map = leafletMap.current;
        if (!map) return;

        // Clear existing zones
        zonePolygonsRef.current.forEach(p => p.remove());
        zonePolygonsRef.current = [];

        if (!layers.chokepoints) return;

        CHOKEPOINT_ZONES.forEach(zone => {
            const polygon = L.polygon(zone.coords, {
                color: zone.color,
                weight: 2,
                opacity: 0.7,
                fillColor: zone.color,
                fillOpacity: 0.12,
                dashArray: zone.risk === 'critical' ? '8, 4' : '4, 4',
                className: zone.risk === 'critical' ? 'zone-pulse-critical' : '',
            }).addTo(map);

            polygon.bindTooltip(`
                <div style="font-family:ui-monospace,monospace;font-size:10px;max-width:220px;">
                    <div style="font-weight:800;color:${zone.color};margin-bottom:3px;font-size:11px;">
                        ⬡ ${zone.name}
                    </div>
                    <div style="color:#94a3b8;font-size:9px;margin-bottom:4px;">
                        RISK: <span style="color:${zone.color};font-weight:700;">${zone.risk.toUpperCase()}</span>
                    </div>
                    <div style="color:#cbd5e1;font-size:9px;line-height:1.4;">
                        ${zone.description}
                    </div>
                </div>
            `, {
                sticky: true,
                className: 'zone-tooltip',
                direction: 'top',
            });

            zonePolygonsRef.current.push(polygon);
        });
    }, [layers.chokepoints]);

    // ---- LAYER: Shipping Routes ----
    useEffect(() => {
        const map = leafletMap.current;
        if (!map) return;

        routePolylinesRef.current.forEach(p => p.remove());
        routePolylinesRef.current = [];

        if (!layers.routes) return;

        SHIPPING_ROUTES.forEach(route => {
            // Background glow line
            const glowLine = L.polyline(route.waypoints, {
                color: route.color,
                weight: 6,
                opacity: 0.15,
                smoothFactor: 1.5,
            }).addTo(map);

            // Main dashed line
            const mainLine = L.polyline(route.waypoints, {
                color: route.color,
                weight: 2,
                opacity: 0.6,
                dashArray: '8, 6',
                smoothFactor: 1.5,
            }).addTo(map);

            mainLine.bindTooltip(`
                <div style="font-family:ui-monospace,monospace;font-size:10px;">
                    <div style="font-weight:800;color:${route.color};margin-bottom:2px;">
                        ▸ ${route.name}
                    </div>
                    <div style="color:#94a3b8;font-size:9px;">
                        ${route.cargoType}
                    </div>
                </div>
            `, {
                sticky: true,
                className: 'route-tooltip',
                direction: 'top',
            });

            routePolylinesRef.current.push(glowLine, mainLine);
        });
    }, [layers.routes]);

    // ---- LAYER: UKMTO Incidents ----
    useEffect(() => {
        const map = leafletMap.current;
        if (!map) return;

        incidentMarkersRef.current.forEach(m => m.remove());
        incidentMarkersRef.current = [];

        if (!layers.incidents) return;

        UKMTO_INCIDENTS.forEach(incident => {
            const cfg = INCIDENT_COLORS[incident.type];
            const icon = L.divIcon({
                className: '',
                html: `
                    <div style="position:relative;cursor:pointer;" class="incident-pulse">
                        <div style="
                            width:22px;height:22px;border-radius:50%;
                            background:radial-gradient(circle, ${cfg.fill}50, ${cfg.fill}10);
                            border:2px solid ${cfg.border};
                            display:flex;align-items:center;justify-content:center;
                            box-shadow:0 0 12px ${cfg.glow}, 0 0 24px ${cfg.glow};
                        ">
                            <span style="font-size:10px;">⚠</span>
                        </div>
                        <div style="
                            position:absolute;bottom:-14px;left:50%;transform:translateX(-50%);
                            background:${cfg.fill}20;border:1px solid ${cfg.fill}60;
                            color:${cfg.fill};font-size:7px;font-weight:800;
                            padding:0 3px;border-radius:2px;white-space:nowrap;
                            pointer-events:none;letter-spacing:0.3px;
                        ">UKMTO</div>
                    </div>
                `,
                iconSize: [22, 22],
                iconAnchor: [11, 11],
            });

            const marker = L.marker([incident.lat, incident.lng], { icon }).addTo(map);

            marker.on('mouseover', (e: L.LeafletMouseEvent) => {
                clearHideTimer();
                setHoveredIncident(incident);
                setHoveredVessel(null);
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

            incidentMarkersRef.current.push(marker);
        });
    }, [layers.incidents, clearHideTimer, scheduleHide]);

    // ---- LAYER: Vessel markers (unchanged logic) ----
    useEffect(() => {
        const map = leafletMap.current;
        if (!map) return;

        markersRef.current.forEach(m => m.remove());
        markersRef.current = [];

        if (!layers.vessels) return;

        vessels.forEach((vessel) => {
            const mmsiStr = String(vessel.mmsi || (vessel as any).mmsi || '');
            const aisMatch = mmsiStr ? aisPositions.find(p => String(p.mmsi) === mmsiStr) : null;
            const isLiveAIS = !!aisMatch;
            const coords: [number, number] = aisMatch
                ? [aisMatch.lat, aisMatch.lng]
                : (vessel.lat && vessel.lng && (vessel.lat !== 0 || vessel.lng !== 0))
                    ? [vessel.lat, vessel.lng]
                    : resolveCoords(vessel.location);
            const baseColor = RISK_COLORS[vessel.riskLevel] || '#3b82f6';

            const derivedCfg = DERIVED_RISK_CONFIG[vessel.derivedRiskLevel || 'SAFE'];
            const markerColor = derivedCfg.color || baseColor;
            const isCritical = vessel.derivedRiskLevel === 'CRITICAL';
            const isWarning = vessel.derivedRiskLevel === 'WARNING';
            const hasDerivedRisk = isCritical || isWarning;

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
                setHoveredIncident(null);
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
    }, [vessels, aisPositions, layers.vessels, onSelectVessel, clearHideTimer, scheduleHide]);

    // Resize map when expanded/collapsed
    useEffect(() => {
        setTimeout(() => leafletMap.current?.invalidateSize(), 300);
    }, [isExpanded]);

    // Count derived risk vessels
    const criticalCount = vessels.filter(v => v.derivedRiskLevel === 'CRITICAL').length;
    const warningCount = vessels.filter(v => v.derivedRiskLevel === 'WARNING').length;

    const layerCounts = {
        vessels: vessels.length,
        incidents: UKMTO_INCIDENTS.length,
        routes: SHIPPING_ROUTES.length,
        chokepoints: CHOKEPOINT_ZONES.length,
    };

    const LAYER_META: { key: keyof LayerVisibility; label: string; icon: React.ReactNode; color: string }[] = [
        { key: 'vessels', label: 'Fleet Vessels', icon: <Ship size={11} />, color: '#06b6d4' },
        { key: 'incidents', label: 'UKMTO Incidents', icon: <Zap size={11} />, color: '#ef4444' },
        { key: 'routes', label: 'Shipping Lanes', icon: <Navigation size={11} />, color: '#22c55e' },
        { key: 'chokepoints', label: 'Chokepoints', icon: <Crosshair size={11} />, color: '#eab308' },
    ];

    return (
        <div className={`relative bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden transition-all duration-300 h-full flex flex-col ${isExpanded ? 'col-span-2 row-span-2' : ''}`}>
            {/* ═══ Header ═══ */}
            <div className="absolute top-0 left-0 right-0 z-[1000] flex items-center justify-between px-4 py-2 bg-gradient-to-b from-slate-900/95 via-slate-900/70 to-transparent pointer-events-none">
                <div className="flex items-center gap-2 pointer-events-auto">
                    <div className="w-6 h-6 rounded bg-cyan-500/20 flex items-center justify-center">
                        <Navigation size={12} className="text-cyan-400" />
                    </div>
                    <span className="text-xs font-bold text-white tracking-wide">FLEET TRACKER</span>
                    <span className="text-[9px] text-emerald-400 font-mono ml-1 px-1.5 py-0.5 bg-emerald-500/10 border border-emerald-500/30 rounded">WORLDVIEW</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    {aisPositions.length > 0 && (
                        <span className="text-[8px] text-cyan-400 font-mono ml-1 px-1 py-0.5 bg-cyan-500/10 border border-cyan-500/30 rounded">
                            📡 {aisPositions.length} AIS
                        </span>
                    )}
                    {(criticalCount > 0 || warningCount > 0) && (
                        <div className="flex items-center gap-1 ml-2 px-1.5 py-0.5 bg-rose-500/10 border border-rose-500/30 rounded text-[8px] font-bold text-rose-400">
                            <AlertTriangle size={8} />
                            {criticalCount > 0 && <span>{criticalCount} CRITICAL</span>}
                            {warningCount > 0 && <span className="text-amber-400">{warningCount} WARNING</span>}
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-1 pointer-events-auto">
                    {/* Layer toggle button */}
                    <button
                        onClick={() => setLayerPanel(!layerPanel)}
                        className={`p-1.5 rounded border transition-colors flex items-center gap-1 ${layerPanel
                                ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
                                : 'bg-slate-800/80 border-slate-700/50 text-slate-400 hover:text-white hover:bg-slate-700/80'
                            }`}
                        title="레이어 관리"
                    >
                        <Layers size={12} />
                        <span className="text-[9px] font-bold">LAYERS</span>
                    </button>
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

            {/* ═══ Layer Control Panel (Glassmorphism) ═══ */}
            {layerPanel && (
                <div className="absolute top-12 right-3 z-[1001] w-[200px] bg-slate-950/80 backdrop-blur-xl border border-slate-700/60 rounded-xl shadow-2xl overflow-hidden">
                    <div className="px-3 py-2 border-b border-slate-800/60 flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-300 tracking-wider uppercase">Intelligence Layers</span>
                        <span className="text-[8px] text-slate-500 font-mono">{Object.values(layers).filter(Boolean).length}/{Object.keys(layers).length} ON</span>
                    </div>
                    <div className="p-1.5 space-y-0.5">
                        {LAYER_META.map(({ key, label, icon, color }) => (
                            <button
                                key={key}
                                onClick={() => toggleLayer(key)}
                                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition-all ${layers[key]
                                        ? 'bg-slate-800/60 hover:bg-slate-800/80'
                                        : 'opacity-40 hover:opacity-60'
                                    }`}
                            >
                                <div
                                    className="w-5 h-5 rounded flex items-center justify-center shrink-0"
                                    style={{ background: `${color}20`, color }}
                                >
                                    {icon}
                                </div>
                                <span className="text-[10px] font-medium text-slate-300 flex-1">{label}</span>
                                <span
                                    className="text-[8px] font-mono font-bold px-1.5 py-0.5 rounded"
                                    style={{
                                        background: layers[key] ? `${color}15` : 'transparent',
                                        color: layers[key] ? color : '#475569',
                                        border: `1px solid ${layers[key] ? `${color}40` : '#334155'}`,
                                    }}
                                >
                                    {layerCounts[key]}
                                </span>
                                {layers[key] ? (
                                    <Eye size={10} style={{ color }} className="shrink-0" />
                                ) : (
                                    <EyeOff size={10} className="text-slate-600 shrink-0" />
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* ═══ Map ═══ */}
            <div
                ref={mapRef}
                className="w-full flex-1"
                style={{ minHeight: '0' }}
            />

            {/* ═══ Vessel Hover Tooltip ═══ */}
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

                        {/* Derived Risk Factors */}
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

            {/* ═══ UKMTO Incident Hover Tooltip ═══ */}
            {hoveredIncident && (
                <div
                    className="absolute z-[1001]"
                    style={{
                        left: Math.min(tooltipPos.x + 12, (mapRef.current?.clientWidth || 600) - 280),
                        top: Math.max(tooltipPos.y - 140, 40),
                        pointerEvents: 'auto',
                    }}
                    onMouseEnter={clearHideTimer}
                    onMouseLeave={scheduleHide}
                >
                    <div className="bg-slate-950/95 border border-red-800/50 rounded-xl p-3 shadow-2xl backdrop-blur-sm min-w-[260px]">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="w-5 h-5 rounded bg-red-500/20 flex items-center justify-center">
                                <AlertTriangle size={11} className="text-red-400" />
                            </div>
                            <span className="text-white font-bold text-[11px] flex-1">{hoveredIncident.title}</span>
                        </div>
                        <div className="flex items-center gap-2 mb-2">
                            <span
                                className="text-[8px] font-bold px-1.5 py-0.5 rounded uppercase"
                                style={{
                                    background: `${INCIDENT_COLORS[hoveredIncident.type].fill}20`,
                                    color: INCIDENT_COLORS[hoveredIncident.type].fill,
                                    border: `1px solid ${INCIDENT_COLORS[hoveredIncident.type].fill}50`,
                                }}
                            >
                                {hoveredIncident.type}
                            </span>
                            <span className="text-[9px] text-slate-500 font-mono">{hoveredIncident.date}</span>
                            <span className="text-[9px] text-slate-500">·</span>
                            <span className="text-[9px] text-slate-400">{hoveredIncident.area}</span>
                        </div>
                        <p className="text-[10px] text-slate-400 leading-relaxed">{hoveredIncident.description}</p>
                        <div className="mt-2 pt-2 border-t border-red-900/30 flex items-center gap-1">
                            <Radio size={9} className="text-red-400" />
                            <span className="text-[8px] text-red-400 font-bold">UKMTO INCIDENT REPORT</span>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ Bottom HUD — Intelligence Summary Bar ═══ */}
            <div className="absolute bottom-0 left-0 right-0 z-[1000] pointer-events-none">
                <div className="flex items-end justify-between px-3 pb-3 gap-2">
                    {/* Vessel count badge */}
                    <div className="bg-slate-950/80 backdrop-blur-sm border border-slate-700/60 rounded-lg px-2.5 py-1.5 flex items-center gap-2 pointer-events-auto">
                        <Anchor size={10} className="text-cyan-400" />
                        <span className="text-[10px] text-white font-mono font-bold">{vessels.length}</span>
                        <span className="text-[9px] text-slate-400">vessels</span>
                        <span className="text-[9px] text-slate-600">·</span>
                        <span className="text-[10px] text-red-400 font-mono font-bold">{UKMTO_INCIDENTS.length}</span>
                        <span className="text-[9px] text-slate-400">incidents</span>
                        {criticalCount > 0 && (
                            <span className="text-[9px] text-rose-400 font-bold">· {criticalCount} ⚠</span>
                        )}
                    </div>

                    {/* Intelligence Ticker */}
                    <div
                        className="flex-1 max-w-[500px] bg-slate-950/80 backdrop-blur-sm border border-red-900/30 rounded-lg overflow-hidden pointer-events-auto"
                        onMouseEnter={() => setTickerPaused(true)}
                        onMouseLeave={() => setTickerPaused(false)}
                    >
                        <div className="flex items-center px-2 py-0.5 border-b border-red-900/20 gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                            <span className="text-[8px] font-bold text-red-400 tracking-wider">UKMTO LIVE FEED</span>
                        </div>
                        <div className="overflow-hidden h-[22px] relative">
                            <div
                                className={`flex gap-8 whitespace-nowrap text-[9px] text-slate-400 font-mono px-2 py-1 ${tickerPaused ? '' : 'animate-ticker'
                                    }`}
                            >
                                {UKMTO_INCIDENTS.slice(0, 8).map((inc, i) => (
                                    <span key={i} className="flex items-center gap-1.5 shrink-0">
                                        <span style={{ color: INCIDENT_COLORS[inc.type].fill }}>●</span>
                                        <span className="text-slate-500">{inc.date}</span>
                                        <span className="text-slate-300">{inc.title}</span>
                                        <span className="text-slate-600">— {inc.area}</span>
                                    </span>
                                ))}
                                {/* Duplicate for seamless loop */}
                                {UKMTO_INCIDENTS.slice(0, 8).map((inc, i) => (
                                    <span key={`dup-${i}`} className="flex items-center gap-1.5 shrink-0">
                                        <span style={{ color: INCIDENT_COLORS[inc.type].fill }}>●</span>
                                        <span className="text-slate-500">{inc.date}</span>
                                        <span className="text-slate-300">{inc.title}</span>
                                        <span className="text-slate-600">— {inc.area}</span>
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══ CSS Animations ═══ */}
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
                @keyframes incident-glow {
                    0%, 100% { transform: scale(1); opacity: 1; }
                    50% { transform: scale(1.15); opacity: 0.7; }
                }
                .incident-pulse {
                    animation: incident-glow 2.5s ease-in-out infinite;
                }
                @keyframes ticker-scroll {
                    0% { transform: translateX(0); }
                    100% { transform: translateX(-50%); }
                }
                .animate-ticker {
                    animation: ticker-scroll 60s linear infinite;
                }
                .zone-tooltip .leaflet-tooltip-content,
                .route-tooltip .leaflet-tooltip-content {
                    background: transparent !important;
                    border: none !important;
                    box-shadow: none !important;
                    padding: 0 !important;
                    margin: 0 !important;
                }
                .zone-tooltip,
                .route-tooltip {
                    background: #0f172aee !important;
                    border: 1px solid #334155 !important;
                    border-radius: 8px !important;
                    padding: 8px 10px !important;
                    box-shadow: 0 8px 32px rgba(0,0,0,0.5) !important;
                    backdrop-filter: blur(8px) !important;
                }
                .zone-tooltip::before,
                .route-tooltip::before {
                    border-top-color: #334155 !important;
                }
                @keyframes zone-border-pulse {
                    0%, 100% { opacity: 0.7; }
                    50% { opacity: 0.3; }
                }
                .zone-pulse-critical {
                    animation: zone-border-pulse 3s ease-in-out infinite;
                }
            `}</style>
        </div>
    );
}
