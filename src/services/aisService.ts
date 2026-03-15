/**
 * AIS Service — Real-time Vessel Position Tracking
 *
 * Uses the Finnish Transport Agency's Digitraffic Marine API (free, no auth).
 * Endpoint: https://meri.digitraffic.fi/api/ais/v1/locations
 *
 * Data pipeline:
 *   1. Poll Digitraffic REST API for vessel locations by MMSI
 *   2. Cache in memory with 30s TTL
 *   3. Persist to Firestore `fleet_telemetry` collection
 *   4. Expose positions to FleetMapWidget via store
 *
 * Fallback: If Digitraffic is unavailable, use ontology property coords.
 */

import { writeFleetTelemetryPosition, type FleetTelemetryEntry } from './firestoreService';

// ============================================================
// 1. TYPES
// ============================================================

export interface AISPosition {
    mmsi: number;
    lat: number;
    lng: number;
    sog: number;     // Speed over ground (knots)
    cog: number;     // Course over ground (degrees)
    heading: number;
    navStat: number;  // Navigation status
    timestamp: number; // Unix epoch seconds
    vesselName?: string;
}

// ============================================================
// 2. DIGITRAFFIC API — Free, no auth, real AIS data
// ============================================================

const DIGITRAFFIC_BASE = 'https://meri.digitraffic.fi/api/ais/v1';
const CORS_PROXY = 'https://api.allorigins.win/raw?url=';

// In-memory cache
const _positionCache = new Map<number, { position: AISPosition; cachedAt: number }>();
const CACHE_TTL_MS = 30_000; // 30 seconds

/**
 * Fetch a single vessel's AIS position by MMSI.
 * Uses CORS proxy for browser compatibility.
 */
async function fetchSingleVesselPosition(mmsi: number): Promise<AISPosition | null> {
    // Check cache first
    const cached = _positionCache.get(mmsi);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
        return cached.position;
    }

    try {
        const url = `${DIGITRAFFIC_BASE}/locations/${mmsi}`;
        const proxyUrl = `${CORS_PROXY}${encodeURIComponent(url)}`;

        const res = await fetch(proxyUrl, {
            signal: AbortSignal.timeout(8000),
            headers: { 'Digitraffic-User': 'SIDECAR-Maritime-COP' },
        });

        if (!res.ok) return null;
        const data = await res.json();

        // Digitraffic returns { type: "Feature", geometry: { coordinates: [lng, lat] }, properties: { ... } }
        const feature = data?.features?.[0] ?? data;
        if (!feature?.geometry?.coordinates) return null;

        const [lng, lat] = feature.geometry.coordinates;
        const props = feature.properties || {};

        const position: AISPosition = {
            mmsi: props.mmsi || mmsi,
            lat,
            lng,
            sog: props.sog ?? 0,
            cog: props.cog ?? 0,
            heading: props.heading ?? props.cog ?? 0,
            navStat: props.navStat ?? 0,
            timestamp: props.timestampExternal ?? Date.now() / 1000,
        };

        // Update cache
        _positionCache.set(mmsi, { position, cachedAt: Date.now() });

        return position;
    } catch (err) {
        console.warn(`[AIS] Failed to fetch position for MMSI ${mmsi}:`, err);
        return null;
    }
}

/**
 * Fetch ALL vessel locations from the Digitraffic bulk endpoint.
 * Returns positions within a geographic bounding box.
 * Default: Global (Middle East + Asia shipping lanes).
 */
async function fetchBulkAISPositions(): Promise<AISPosition[]> {
    try {
        const url = `${DIGITRAFFIC_BASE}/locations`;
        const proxyUrl = `${CORS_PROXY}${encodeURIComponent(url)}`;

        const res = await fetch(proxyUrl, {
            signal: AbortSignal.timeout(15000),
            headers: { 'Digitraffic-User': 'SIDECAR-Maritime-COP' },
        });

        if (!res.ok) return [];
        const data = await res.json();

        const features = data?.features || [];
        const positions: AISPosition[] = [];

        for (const feature of features) {
            if (!feature?.geometry?.coordinates) continue;
            const [lng, lat] = feature.geometry.coordinates;
            const props = feature.properties || {};

            positions.push({
                mmsi: props.mmsi || 0,
                lat,
                lng,
                sog: props.sog ?? 0,
                cog: props.cog ?? 0,
                heading: props.heading ?? props.cog ?? 0,
                navStat: props.navStat ?? 0,
                timestamp: props.timestampExternal ?? Date.now() / 1000,
            });
        }

        // Update cache for all received positions
        const now = Date.now();
        for (const pos of positions) {
            _positionCache.set(pos.mmsi, { position: pos, cachedAt: now });
        }

        console.info(`[AIS] Bulk fetch: ${positions.length} vessel positions received`);
        return positions;
    } catch (err) {
        console.warn('[AIS] Bulk fetch failed:', err);
        return [];
    }
}

// ============================================================
// 3. PUBLIC API — Fetch + Persist
// ============================================================

/**
 * Fetch positions for a list of MMSI numbers.
 * Tries individual lookups first, falls back to cached data.
 */
export async function fetchAISPositions(mmsiList: number[]): Promise<AISPosition[]> {
    if (mmsiList.length === 0) return [];

    const promises = mmsiList.map(mmsi => fetchSingleVesselPosition(mmsi));
    const results = await Promise.allSettled(promises);

    const positions: AISPosition[] = [];
    for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
            positions.push(result.value);
        }
    }

    return positions;
}

/**
 * Fetch positions and persist to Firestore fleet_telemetry collection.
 */
export async function fetchAndPersistAISPositions(
    mmsiList: number[],
    vesselNames?: Record<number, string>,
): Promise<AISPosition[]> {
    const positions = await fetchAISPositions(mmsiList);

    // Persist to Firestore (fire-and-forget)
    for (const pos of positions) {
        const entry: FleetTelemetryEntry = {
            mmsi: String(pos.mmsi),
            lat: pos.lat,
            lng: pos.lng,
            speed: pos.sog,
            heading: pos.heading,
            vesselName: vesselNames?.[pos.mmsi],
            timestamp: new Date(pos.timestamp * 1000).toISOString(),
        };
        writeFleetTelemetryPosition(entry).catch(() => { /* non-critical */ });
    }

    return positions;
}

// ============================================================
// 4. POLLING — Continuous AIS position updates
// ============================================================

let _pollingTimer: ReturnType<typeof setInterval> | null = null;
let _isPolling = false;

export type AISCallback = (positions: AISPosition[]) => void;

/**
 * Start periodic AIS polling for given MMSI list.
 * Default interval: 60 seconds (Digitraffic rate limit friendly).
 */
export function startAISPolling(
    mmsiList: number[],
    callback: AISCallback,
    intervalMs: number = 60_000,
    vesselNames?: Record<number, string>,
): void {
    stopAISPolling();
    _isPolling = true;

    // Initial fetch
    fetchAndPersistAISPositions(mmsiList, vesselNames)
        .then(positions => { if (_isPolling && positions.length > 0) callback(positions); })
        .catch(err => console.warn('[AIS] Initial polling fetch failed:', err));

    _pollingTimer = setInterval(async () => {
        if (!_isPolling) return;
        try {
            const positions = await fetchAndPersistAISPositions(mmsiList, vesselNames);
            if (positions.length > 0) callback(positions);
        } catch (err) {
            console.warn('[AIS] Polling cycle failed:', err);
        }
    }, intervalMs);

    console.info(`[AIS] 📡 Polling started for ${mmsiList.length} vessels (${intervalMs / 1000}s interval)`);
}

export function stopAISPolling(): void {
    _isPolling = false;
    if (_pollingTimer) {
        clearInterval(_pollingTimer);
        _pollingTimer = null;
    }
}

/**
 * Get all cached positions (useful for static fallback display).
 */
export function getCachedAISPositions(): AISPosition[] {
    const now = Date.now();
    const positions: AISPosition[] = [];
    for (const [, entry] of _positionCache) {
        // Include even slightly stale entries for display
        if (now - entry.cachedAt < CACHE_TTL_MS * 10) {
            positions.push(entry.position);
        }
    }
    return positions;
}

// Re-export for convenience
export { fetchBulkAISPositions };
