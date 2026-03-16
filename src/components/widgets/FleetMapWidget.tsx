/**
 * FleetMapWidget — WorldView-style Geospatial Command Center
 *
 * ALL map layers are driven by Firebase ontology objects:
 *   Layer 1: Fleet vessel positions (from OntologyObject type='Vessel')
 *   Layer 2: RiskEvent markers (from OntologyObject type='RiskEvent')
 *   Layer 3: Route polylines (from OntologyObject type='Route' + linked Ports)
 *   Layer 4: Port / Chokepoint markers (from OntologyObject type='Port')
 *   Layer 5: Intelligence feed ticker (from RiskEvent objects)
 *
 * NO hardcoded data — everything comes from the ontology store / Firestore.
 *
 * Uses Leaflet with ESRI World Imagery satellite tiles (free, no API key).
 */
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
    MapPin, ExternalLink, Navigation, Fuel, Shield, Anchor,
    Maximize2, Minimize2, AlertTriangle, RefreshCw, Loader2,
    Layers, Ship, Crosshair, Eye, EyeOff, Zap, Radio
} from 'lucide-react';
import type { FleetVessel, OntologyObject, OntologyLink } from '../../types';
import type { AISPosition } from '../../services/aisService';

// ============================================================
// LOCATION COORDINATES (fallback resolver for vessels)
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
    'Sharjah': [25.36, 55.40],
    'Shinas': [24.74, 56.46],
    'Fujairah': [25.12, 56.33],
    'Sohar': [24.36, 56.73],
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
// MARITIME WAYPOINT GENERATOR
// Generates realistic sea-route waypoints to avoid crossing land.
// Key corridors:
//   Persian Gulf → East Asia (around India via Arabian Sea)
//   Red Sea / Suez → East Asia
//   East Africa → East Asia
// ============================================================

/** Well-known maritime corridor waypoints */
const MARITIME_CORRIDORS: Record<string, [number, number][]> = {
    // Persian Gulf exit → Arabian Sea → south India → Malacca
    pgToEasia: [
        [25.5, 56.5],   // Strait of Hormuz exit
        [22.0, 60.0],   // Oman coast
        [15.0, 61.0],   // Arabian Sea (mid)
        [8.0, 76.0],    // South India / Lakshadweep Sea
        [5.5, 80.0],    // South of Sri Lanka
        [4.0, 88.0],    // Bay of Bengal (south)
        [2.5, 95.0],    // Approaching Malacca
        [1.5, 104.0],   // Singapore Strait
    ],
    // Singapore → Northeast Asia (Korea / Japan / China)
    sgToNea: [
        [1.5, 104.0],   // Singapore
        [5.0, 109.0],   // South China Sea (south)
        [12.0, 114.0],  // South China Sea (central)
        [18.0, 117.0],  // South China Sea (north)
        [22.0, 120.0],  // Taiwan Strait area
        [28.0, 125.0],  // East China Sea
    ],
    // Red Sea → Arabian Sea (Bab-el-Mandeb → Gulf of Aden)
    redSeaToArabian: [
        [12.5, 43.5],   // Bab-el-Mandeb
        [12.0, 47.0],   // Gulf of Aden
        [11.5, 52.0],   // Approaching Arabian Sea
    ],
};

/**
 * Generate realistic maritime waypoints between two coordinates.
 * Detects when a straight line would cross major landmasses and
 * injects corridor waypoints along real shipping lanes.
 */
function generateMaritimeWaypoints(
    origin: [number, number],
    destination: [number, number],
): [number, number][] {
    const [oLat, oLng] = origin;
    const [dLat, dLng] = destination;

    // Helper: check if a point is roughly in a geographic region
    const isInPersianGulf = (lat: number, lng: number) =>
        lat > 20 && lat < 32 && lng > 44 && lng < 60;
    const isInRedSea = (lat: number, lng: number) =>
        lat > 12 && lat < 32 && lng > 32 && lng < 44;
    const isInEastAsia = (_lat: number, lng: number) =>
        lng > 104;

    // Detect if straight line would cross India
    // (origin west of India, destination east of India, or vice versa)
    const wouldCrossIndia = (
        (oLng < 77 && dLng > 80 && oLat > 0 && oLat < 30 && dLat > -5 && dLat < 40) ||
        (dLng < 77 && oLng > 80 && dLat > 0 && dLat < 30 && oLat > -5 && oLat < 40)
    );

    const result: [number, number][] = [origin];

    if (wouldCrossIndia) {
        // Determine direction: west→east or east→west
        const westToEast = oLng < dLng;
        const westernPoint = westToEast ? origin : destination;
        const easternPoint = westToEast ? destination : origin;

        // Build corridor segments
        const corridorPoints: [number, number][] = [];

        // 1. If starting from Persian Gulf, add PG exit waypoints
        if (isInPersianGulf(westernPoint[0], westernPoint[1])) {
            corridorPoints.push(
                MARITIME_CORRIDORS.pgToEasia[0], // Hormuz
                MARITIME_CORRIDORS.pgToEasia[1], // Oman
            );
        }

        // 2. If starting from Red Sea, add Red Sea exit
        if (isInRedSea(westernPoint[0], westernPoint[1])) {
            corridorPoints.push(...MARITIME_CORRIDORS.redSeaToArabian);
        }

        // 3. Arabian Sea → south India → Sri Lanka (core India-avoidance)
        corridorPoints.push(
            [15.0, 61.0],   // Arabian Sea mid
            [8.0, 76.0],    // South India
            [5.5, 80.0],    // South of Sri Lanka
        );

        // 4. Bay of Bengal → Malacca Strait
        corridorPoints.push(
            [4.0, 88.0],    // Bay of Bengal south
            [2.5, 95.0],    // Approaching Malacca
        );

        // 5. Singapore if heading further east
        if (isInEastAsia(easternPoint[0], easternPoint[1])) {
            corridorPoints.push([1.5, 104.0]); // Singapore
        }

        // 6. If destination is NE Asia (Korea/Japan/China), add SCS waypoints
        if (easternPoint[0] > 20 && easternPoint[1] > 115) {
            corridorPoints.push(
                [5.0, 109.0],   // SCS south
                [12.0, 114.0],  // SCS center
                [18.0, 117.0],  // SCS north
            );
            if (easternPoint[0] > 28) {
                corridorPoints.push([25.0, 122.0]); // East China Sea approach
            }
        }

        // If east→west, reverse the corridor
        if (!westToEast) {
            corridorPoints.reverse();
        }

        // Filter out corridor points that are too close to origin or destination
        for (const wp of corridorPoints) {
            const distFromOrigin = Math.abs(wp[0] - oLat) + Math.abs(wp[1] - oLng);
            const distFromDest = Math.abs(wp[0] - dLat) + Math.abs(wp[1] - dLng);
            if (distFromOrigin > 3 && distFromDest > 3) {
                result.push(wp);
            }
        }
    } else {
        // No India crossing detected — check for other long routes
        // that might benefit from slight curvature (e.g. avoid Arabian Peninsula)
        const totalDist = Math.abs(oLat - dLat) + Math.abs(oLng - dLng);
        if (totalDist > 30) {
            // For very long routes without India crossing, add a midpoint
            // with slight offset to create a gentle arc
            const midLat = (oLat + dLat) / 2;
            const midLng = (oLng + dLng) / 2;
            // Offset perpendicular to the route line (southward bias for northern hemisphere)
            const perpOffsetLat = -(dLng - oLng) * 0.03;
            const perpOffsetLng = (dLat - oLat) * 0.03;
            result.push([midLat + perpOffsetLat, midLng + perpOffsetLng]);
        }
    }

    result.push(destination);
    return result;
}

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
// SEVERITY → VISUAL CONFIG
// ============================================================
const SEVERITY_COLORS: Record<string, { fill: string; border: string; glow: string }> = {
    critical: { fill: '#ef4444', border: '#fca5a5', glow: '#ef444480' },
    high: { fill: '#f97316', border: '#fdba74', glow: '#f9731680' },
    medium: { fill: '#eab308', border: '#fde047', glow: '#eab30860' },
    low: { fill: '#22c55e', border: '#86efac', glow: '#22c55e60' },
};

const ROUTE_STATUS_COLORS: Record<string, string> = {
    open: '#22c55e',
    restricted: '#f59e0b',
    closed: '#ef4444',
};

// ============================================================
// LAYER VISIBILITY STATE
// ============================================================
interface LayerVisibility {
    vessels: boolean;
    riskEvents: boolean;
    routes: boolean;
    ports: boolean;
}

// ============================================================
// COMPONENT
// ============================================================
interface FleetMapWidgetProps {
    vessels: FleetVessel[];
    aisPositions?: AISPosition[];
    ontologyObjects?: OntologyObject[];
    ontologyLinks?: OntologyLink[];
    onSelectVessel?: (vessel: FleetVessel) => void;
    onSelectRoute?: (routeId: string) => void;
    onRefresh?: () => void;
    isRefreshing?: boolean;
}

export default function FleetMapWidget({
    vessels,
    aisPositions = [],
    ontologyObjects = [],
    ontologyLinks = [],
    onSelectVessel,
    onSelectRoute,
    onRefresh,
    isRefreshing,
}: FleetMapWidgetProps) {
    const mapRef = useRef<HTMLDivElement>(null);
    const leafletMap = useRef<L.Map | null>(null);
    const markersRef = useRef<L.Marker[]>([]);
    const riskMarkersRef = useRef<L.Marker[]>([]);
    const portMarkersRef = useRef<L.Marker[]>([]);
    const routePolylinesRef = useRef<L.Polyline[]>([]);
    const [hoveredVessel, setHoveredVessel] = useState<FleetVessel | null>(null);
    const [hoveredRiskEvent, setHoveredRiskEvent] = useState<OntologyObject | null>(null);
    const [hoveredPort, setHoveredPort] = useState<OntologyObject | null>(null);
    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
    const [isExpanded, setIsExpanded] = useState(false);
    const [layerPanel, setLayerPanel] = useState(false);
    const [layers, setLayers] = useState<LayerVisibility>({
        vessels: true,
        riskEvents: true,
        routes: true,
        ports: true,
    });
    const [tickerPaused, setTickerPaused] = useState(false);

    // ---- Derive ontology layers from objects ----
    const riskEvents = useMemo(() =>
        ontologyObjects.filter(o => o.type === 'RiskEvent' && o.metadata.status === 'active'),
        [ontologyObjects]
    );
    const ports = useMemo(() =>
        ontologyObjects.filter(o => o.type === 'Port' && o.metadata.status === 'active'),
        [ontologyObjects]
    );
    const routes = useMemo(() =>
        ontologyObjects.filter(o => o.type === 'Route' && o.metadata.status === 'active'),
        [ontologyObjects]
    );

    // Build a quick lookup map for port coords by ID
    const portCoordsMap = useMemo(() => {
        const map = new Map<string, [number, number]>();
        for (const p of ports) {
            const lat = Number(p.properties.lat || p.properties.latitude || 0);
            const lng = Number(p.properties.lng || p.properties.longitude || 0);
            if (lat !== 0 || lng !== 0) {
                map.set(p.id, [lat, lng]);
            }
        }
        return map;
    }, [ports]);

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
            setHoveredRiskEvent(null);
            setHoveredPort(null);
        }, 300);
    }, [clearHideTimer]);

    useEffect(() => {
        return () => clearHideTimer();
    }, [clearHideTimer]);

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

        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 18,
        }).addTo(map);

        // Overlay labels
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

    // ---- LAYER: Port markers ----
    useEffect(() => {
        const map = leafletMap.current;
        if (!map) return;

        portMarkersRef.current.forEach(m => m.remove());
        portMarkersRef.current = [];

        if (!layers.ports) return;

        ports.forEach(port => {
            const lat = Number(port.properties.lat || port.properties.latitude || 0);
            const lng = Number(port.properties.lng || port.properties.longitude || 0);
            if (lat === 0 && lng === 0) return;

            const riskScore = Number(port.properties.riskScore || 0);
            const isHighRisk = riskScore >= 70;
            const portColor = isHighRisk ? '#f59e0b' : riskScore >= 40 ? '#06b6d4' : '#22c55e';
            const congestion = Number(port.properties.congestionPct || 0);
            const securityLevel = String(port.properties.securityLevel || '');

            const icon = L.divIcon({
                className: '',
                html: `
                    <div style="position:relative;cursor:pointer;" class="${isHighRisk ? 'port-pulse-risk' : ''}">
                        <div style="
                            width:18px;height:18px;
                            background:${portColor}25;
                            border:2px solid ${portColor};
                            transform:rotate(45deg);
                            box-shadow:0 0 8px ${portColor}60;
                            display:flex;align-items:center;justify-content:center;
                        ">
                            <div style="width:6px;height:6px;background:${portColor};transform:rotate(-45deg);border-radius:1px;"></div>
                        </div>
                        <div style="
                            position:absolute;top:-18px;left:50%;transform:translateX(-50%);
                            background:#0f172aCC;border:1px solid ${portColor}50;
                            color:${portColor};font-size:8px;font-weight:700;
                            padding:1px 4px;border-radius:3px;white-space:nowrap;
                            pointer-events:none;letter-spacing:0.3px;
                        ">${port.title}</div>
                        ${securityLevel ? `<div style="
                            position:absolute;bottom:-14px;left:50%;transform:translateX(-50%);
                            background:${portColor}15;border:1px solid ${portColor}40;
                            color:${portColor};font-size:6px;font-weight:800;
                            padding:0 2px;border-radius:2px;white-space:nowrap;
                            pointer-events:none;
                        ">${securityLevel}</div>` : ''}
                    </div>
                `,
                iconSize: [18, 18],
                iconAnchor: [9, 9],
            });

            const marker = L.marker([lat, lng], { icon }).addTo(map);

            marker.on('mouseover', (e: L.LeafletMouseEvent) => {
                clearHideTimer();
                setHoveredPort(port);
                setHoveredVessel(null);
                setHoveredRiskEvent(null);
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

            portMarkersRef.current.push(marker);
        });
    }, [ports, layers.ports, clearHideTimer, scheduleHide]);

    // ---- LAYER: Route polylines ----
    useEffect(() => {
        const map = leafletMap.current;
        if (!map) return;

        routePolylinesRef.current.forEach(p => p.remove());
        routePolylinesRef.current = [];

        if (!layers.routes) return;

        routes.forEach(route => {
            const originId = String(route.properties.originPortId || '');
            const destId = String(route.properties.destinationPortId || '');
            const routeLat = Number(route.properties.lat || 0);
            const routeLng = Number(route.properties.lng || 0);
            let originCoords = portCoordsMap.get(originId);
            let destCoords = portCoordsMap.get(destId);

            // Fallback: resolve coords from route title (e.g. "Sharjah — Shinas (Short-Sea Gulf)")
            // by looking up port names in LOCATION_COORDS
            if (!originCoords || !destCoords) {
                const titleParts = route.title.split(/\s*[—–\-→]\s*/);
                if (titleParts.length >= 2) {
                    if (!originCoords) {
                        const originName = titleParts[0].trim();
                        for (const [key, coords] of Object.entries(LOCATION_COORDS)) {
                            if (originName.toLowerCase().includes(key.toLowerCase()) ||
                                key.toLowerCase().includes(originName.toLowerCase())) {
                                originCoords = coords;
                                break;
                            }
                        }
                    }
                    if (!destCoords) {
                        // Take last meaningful part, strip parenthetical suffixes
                        const destName = titleParts[titleParts.length - 1].replace(/\s*\(.*\)/, '').trim();
                        for (const [key, coords] of Object.entries(LOCATION_COORDS)) {
                            if (destName.toLowerCase().includes(key.toLowerCase()) ||
                                key.toLowerCase().includes(destName.toLowerCase())) {
                                destCoords = coords;
                                break;
                            }
                        }
                    }
                }
            }

            // Build waypoints: prefer ontology waypoints → auto maritime → fallback
            let routePoints: [number, number][] = [];

            // 1. Check if the ontology route has explicit waypoints
            const ontologyWaypoints = route.properties.waypoints;
            if (Array.isArray(ontologyWaypoints) && ontologyWaypoints.length >= 2) {
                // Use ontology waypoints directly
                routePoints = (ontologyWaypoints as { lat: number; lng: number }[])
                    .filter(w => w && typeof w.lat === 'number' && typeof w.lng === 'number')
                    .map(w => [w.lat, w.lng] as [number, number]);
                // Prepend origin and append destination if not included
                if (originCoords && routePoints.length > 0) {
                    const [fLat, fLng] = routePoints[0];
                    const [oLat, oLng] = originCoords;
                    if (Math.abs(fLat - oLat) + Math.abs(fLng - oLng) > 1) {
                        routePoints.unshift(originCoords);
                    }
                }
                if (destCoords && routePoints.length > 0) {
                    const [lLat, lLng] = routePoints[routePoints.length - 1];
                    const [dLat, dLng] = destCoords;
                    if (Math.abs(lLat - dLat) + Math.abs(lLng - dLng) > 1) {
                        routePoints.push(destCoords);
                    }
                }
            }
            // 2. Auto-generate realistic maritime waypoints when both ports are known
            else if (originCoords && destCoords) {
                routePoints = generateMaritimeWaypoints(originCoords, destCoords);
            }
            // 3. Fallback: origin → (route center) → destination
            else {
                if (originCoords) routePoints.push(originCoords);
                if (routeLat !== 0 || routeLng !== 0) routePoints.push([routeLat, routeLng]);
                if (destCoords) routePoints.push(destCoords);
            }

            if (routePoints.length < 2) return; // Need at least 2 points

            const status = String(route.properties.currentStatus || route.properties.status || 'open');
            const routeColor = ROUTE_STATUS_COLORS[status] || '#06b6d4';
            const riskScore = Number(route.properties.riskScore || 0);

            // Background glow (non-interactive)
            const glowLine = L.polyline(routePoints, {
                color: routeColor,
                weight: 6,
                opacity: 0.12,
                smoothFactor: 1.5,
                interactive: false,
            }).addTo(map);

            // Main dashed line (non-interactive — hit detection via hitLine)
            const mainLine = L.polyline(routePoints, {
                color: routeColor,
                weight: 2,
                opacity: 0.6,
                dashArray: '8, 6',
                smoothFactor: 1.5,
                interactive: false,
            }).addTo(map);

            // Invisible wide hit-area line for click + hover (prevents event ping-pong)
            const hitLine = L.polyline(routePoints, {
                color: 'transparent',
                weight: 16,
                opacity: 0,
                smoothFactor: 1.5,
                interactive: true,
            }).addTo(map);

            hitLine.bindTooltip(`
                <div style="font-family:ui-monospace,monospace;font-size:10px;max-width:240px;">
                    <div style="font-weight:800;color:${routeColor};margin-bottom:2px;">
                        ▸ ${route.title}
                    </div>
                    <div style="color:#94a3b8;font-size:9px;">
                        ${route.description || ''}
                    </div>
                    <div style="margin-top:3px;display:flex;gap:8px;font-size:8px;">
                        <span style="color:${routeColor};">STATUS: ${status.toUpperCase()}</span>
                        <span style="color:#64748b;">RISK: ${riskScore}</span>
                        ${route.properties.distanceNm ? `<span style="color:#64748b;">${route.properties.distanceNm} NM</span>` : ''}
                    </div>
                    <div style="margin-top:4px;color:#64748b;font-size:7px;">클릭하여 상세보기</div>
                </div>
            `, {
                sticky: true,
                className: 'route-tooltip',
                direction: 'top',
            });

            // Click handler → open Object360Panel for this route
            hitLine.on('click', () => onSelectRoute?.(route.id));

            // Hover highlight — only on the single hitLine to avoid ping-pong
            hitLine.on('mouseover', () => {
                mainLine.setStyle({ weight: 3, opacity: 0.9 });
                glowLine.setStyle({ weight: 10, opacity: 0.2 });
                map.getContainer().style.cursor = 'pointer';
            });
            hitLine.on('mouseout', () => {
                mainLine.setStyle({ weight: 2, opacity: 0.6 });
                glowLine.setStyle({ weight: 6, opacity: 0.12 });
                map.getContainer().style.cursor = '';
            });

            routePolylinesRef.current.push(glowLine, mainLine, hitLine);
        });
    }, [routes, portCoordsMap, layers.routes, onSelectRoute]);

    // ---- LAYER: RiskEvent markers ----
    useEffect(() => {
        const map = leafletMap.current;
        if (!map) return;

        riskMarkersRef.current.forEach(m => m.remove());
        riskMarkersRef.current = [];

        if (!layers.riskEvents) return;

        riskEvents.forEach(event => {
            const lat = Number(event.properties.lat || 0);
            const lng = Number(event.properties.lng || 0);
            if (lat === 0 && lng === 0) return; // Skip events without coordinates

            const severity = String(event.properties.severity || 'medium');
            const cfg = SEVERITY_COLORS[severity] || SEVERITY_COLORS.medium;

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
                            position:absolute;bottom:-16px;left:50%;transform:translateX(-50%);
                            background:${cfg.fill}20;border:1px solid ${cfg.fill}60;
                            color:${cfg.fill};font-size:7px;font-weight:800;
                            padding:0 3px;border-radius:2px;white-space:nowrap;
                            pointer-events:none;letter-spacing:0.3px;
                        ">${String(event.properties.category || 'RISK').toUpperCase()}</div>
                    </div>
                `,
                iconSize: [22, 22],
                iconAnchor: [11, 11],
            });

            const marker = L.marker([lat, lng], { icon }).addTo(map);

            marker.on('mouseover', (e: L.LeafletMouseEvent) => {
                clearHideTimer();
                setHoveredRiskEvent(event);
                setHoveredVessel(null);
                setHoveredPort(null);
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

            riskMarkersRef.current.push(marker);
        });
    }, [riskEvents, layers.riskEvents, clearHideTimer, scheduleHide]);

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
                setHoveredRiskEvent(null);
                setHoveredPort(null);
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
        riskEvents: riskEvents.filter(e => (Number(e.properties.lat || 0) !== 0 || Number(e.properties.lng || 0) !== 0)).length,
        routes: routes.length,
        ports: ports.filter(p => (Number(p.properties.lat || p.properties.latitude || 0) !== 0 || Number(p.properties.lng || p.properties.longitude || 0) !== 0)).length,
    };

    const LAYER_META: { key: keyof LayerVisibility; label: string; icon: React.ReactNode; color: string }[] = [
        { key: 'vessels', label: 'Fleet Vessels', icon: <Ship size={11} />, color: '#06b6d4' },
        { key: 'riskEvents', label: 'Risk Events', icon: <Zap size={11} />, color: '#ef4444' },
        { key: 'routes', label: 'Shipping Routes', icon: <Navigation size={11} />, color: '#22c55e' },
        { key: 'ports', label: 'Ports / Chokepoints', icon: <Crosshair size={11} />, color: '#eab308' },
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

            {/* ═══ Layer Control Panel ═══ */}
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
            <div ref={mapRef} className="w-full flex-1" style={{ minHeight: '0' }} />

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

            {/* ═══ RiskEvent Hover Tooltip ═══ */}
            {hoveredRiskEvent && (
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
                            <span className="text-white font-bold text-[11px] flex-1">{hoveredRiskEvent.title}</span>
                        </div>
                        <div className="flex items-center gap-2 mb-2">
                            <span
                                className="text-[8px] font-bold px-1.5 py-0.5 rounded uppercase"
                                style={{
                                    background: `${(SEVERITY_COLORS[String(hoveredRiskEvent.properties.severity || 'medium')] || SEVERITY_COLORS.medium).fill}20`,
                                    color: (SEVERITY_COLORS[String(hoveredRiskEvent.properties.severity || 'medium')] || SEVERITY_COLORS.medium).fill,
                                    border: `1px solid ${(SEVERITY_COLORS[String(hoveredRiskEvent.properties.severity || 'medium')] || SEVERITY_COLORS.medium).fill}50`,
                                }}
                            >
                                {String(hoveredRiskEvent.properties.severity || 'medium')}
                            </span>
                            <span className="text-[9px] text-slate-500 font-mono">{hoveredRiskEvent.metadata.updatedAt?.split('T')[0]}</span>
                            {hoveredRiskEvent.properties.region && (
                                <>
                                    <span className="text-[9px] text-slate-500">·</span>
                                    <span className="text-[9px] text-slate-400">{String(hoveredRiskEvent.properties.region)}</span>
                                </>
                            )}
                        </div>
                        <p className="text-[10px] text-slate-400 leading-relaxed">{hoveredRiskEvent.description}</p>
                        {hoveredRiskEvent.properties.threatLevel && (
                            <div className="mt-2 pt-2 border-t border-red-900/30 flex items-center gap-1">
                                <Radio size={9} className="text-red-400" />
                                <span className="text-[8px] text-red-400 font-bold">{String(hoveredRiskEvent.properties.threatLevel)}</span>
                            </div>
                        )}
                        <div className="mt-1 flex gap-3 text-[8px] text-slate-500">
                            {hoveredRiskEvent.properties.affectedVessels && <span>Vessels: {String(hoveredRiskEvent.properties.affectedVessels)}</span>}
                            {hoveredRiskEvent.properties.riskScore && <span>Risk: {String(hoveredRiskEvent.properties.riskScore)}</span>}
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ Port Hover Tooltip ═══ */}
            {hoveredPort && (
                <div
                    className="absolute z-[1001]"
                    style={{
                        left: Math.min(tooltipPos.x + 12, (mapRef.current?.clientWidth || 600) - 260),
                        top: Math.max(tooltipPos.y - 120, 40),
                        pointerEvents: 'auto',
                    }}
                    onMouseEnter={clearHideTimer}
                    onMouseLeave={scheduleHide}
                >
                    <div className="bg-slate-950/95 border border-amber-800/40 rounded-xl p-3 shadow-2xl backdrop-blur-sm min-w-[240px]">
                        <div className="flex items-center gap-2 mb-2">
                            <Crosshair size={12} className="text-amber-400" />
                            <span className="text-white font-bold text-[11px]">{hoveredPort.title}</span>
                        </div>
                        <p className="text-[10px] text-slate-400 leading-relaxed mb-2">{hoveredPort.description}</p>
                        <div className="flex gap-3 text-[8px] text-slate-500 border-t border-slate-800/50 pt-1.5">
                            {hoveredPort.properties.congestionPct != null && (
                                <span>Congestion: <span className="text-amber-400 font-bold">{String(hoveredPort.properties.congestionPct)}%</span></span>
                            )}
                            {hoveredPort.properties.securityLevel && (
                                <span>Security: <span className="text-red-400 font-bold">{String(hoveredPort.properties.securityLevel)}</span></span>
                            )}
                            {hoveredPort.properties.queuedVessels && (
                                <span>Queue: <span className="text-cyan-400 font-bold">{String(hoveredPort.properties.queuedVessels)}</span></span>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ Bottom HUD ═══ */}
            <div className="absolute bottom-0 left-0 right-0 z-[1000] pointer-events-none">
                <div className="flex items-end justify-between px-3 pb-3 gap-2">
                    {/* Count badge */}
                    <div className="bg-slate-950/80 backdrop-blur-sm border border-slate-700/60 rounded-lg px-2.5 py-1.5 flex items-center gap-2 pointer-events-auto">
                        <Anchor size={10} className="text-cyan-400" />
                        <span className="text-[10px] text-white font-mono font-bold">{vessels.length}</span>
                        <span className="text-[9px] text-slate-400">vessels</span>
                        <span className="text-[9px] text-slate-600">·</span>
                        <span className="text-[10px] text-red-400 font-mono font-bold">{layerCounts.riskEvents}</span>
                        <span className="text-[9px] text-slate-400">risks</span>
                        <span className="text-[9px] text-slate-600">·</span>
                        <span className="text-[10px] text-amber-400 font-mono font-bold">{layerCounts.ports}</span>
                        <span className="text-[9px] text-slate-400">ports</span>
                        {criticalCount > 0 && (
                            <span className="text-[9px] text-rose-400 font-bold">· {criticalCount} ⚠</span>
                        )}
                    </div>

                    {/* Intelligence Ticker (driven by RiskEvent ontology objects) */}
                    {riskEvents.length > 0 && (
                        <div
                            className="flex-1 max-w-[500px] bg-slate-950/80 backdrop-blur-sm border border-red-900/30 rounded-lg overflow-hidden pointer-events-auto"
                            onMouseEnter={() => setTickerPaused(true)}
                            onMouseLeave={() => setTickerPaused(false)}
                        >
                            <div className="flex items-center px-2 py-0.5 border-b border-red-900/20 gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                                <span className="text-[8px] font-bold text-red-400 tracking-wider">RISK INTEL FEED</span>
                                <span className="text-[7px] text-slate-600 font-mono ml-auto">ONTOLOGY</span>
                            </div>
                            <div className="overflow-hidden h-[22px] relative">
                                <div
                                    className={`flex gap-8 whitespace-nowrap text-[9px] text-slate-400 font-mono px-2 py-1 ${tickerPaused ? '' : 'animate-ticker'
                                        }`}
                                >
                                    {riskEvents.map((evt, i) => {
                                        const sev = String(evt.properties.severity || 'medium');
                                        const color = (SEVERITY_COLORS[sev] || SEVERITY_COLORS.medium).fill;
                                        return (
                                            <span key={i} className="flex items-center gap-1.5 shrink-0">
                                                <span style={{ color }}>●</span>
                                                <span className="text-slate-500">{evt.metadata.updatedAt?.split('T')[0]}</span>
                                                <span className="text-slate-300">{evt.title}</span>
                                                {evt.properties.region && <span className="text-slate-600">— {String(evt.properties.region)}</span>}
                                            </span>
                                        );
                                    })}
                                    {/* Duplicate for seamless loop */}
                                    {riskEvents.map((evt, i) => {
                                        const sev = String(evt.properties.severity || 'medium');
                                        const color = (SEVERITY_COLORS[sev] || SEVERITY_COLORS.medium).fill;
                                        return (
                                            <span key={`dup-${i}`} className="flex items-center gap-1.5 shrink-0">
                                                <span style={{ color }}>●</span>
                                                <span className="text-slate-500">{evt.metadata.updatedAt?.split('T')[0]}</span>
                                                <span className="text-slate-300">{evt.title}</span>
                                                {evt.properties.region && <span className="text-slate-600">— {String(evt.properties.region)}</span>}
                                            </span>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}
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
                @keyframes port-risk-pulse {
                    0%, 100% { transform: scale(1) rotate(45deg); opacity: 1; }
                    50% { transform: scale(1.1) rotate(45deg); opacity: 0.8; }
                }
                .port-pulse-risk {
                    animation: port-risk-pulse 3s ease-in-out infinite;
                }
                @keyframes ticker-scroll {
                    0% { transform: translateX(0); }
                    100% { transform: translateX(-50%); }
                }
                .animate-ticker {
                    animation: ticker-scroll 60s linear infinite;
                }
                .route-tooltip {
                    background: #0f172aee !important;
                    border: 1px solid #334155 !important;
                    border-radius: 8px !important;
                    padding: 8px 10px !important;
                    box-shadow: 0 8px 32px rgba(0,0,0,0.5) !important;
                    backdrop-filter: blur(8px) !important;
                }
                .route-tooltip::before {
                    border-top-color: #334155 !important;
                }
            `}</style>
        </div>
    );
}
