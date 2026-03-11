/**
 * Maritime Intelligence Service — Real API Integrations
 *
 * APIs used:
 *   1. OpenSanctions (Free) — Vessel sanctions screening by IMO
 *   2. Future: aisstream.io (Free WebSocket) — Real-time AIS positions
 */

// ============================================================
// TYPES
// ============================================================

export interface SanctionsResult {
    status: 'CLEAR' | 'SANCTIONED' | 'PARTIAL_MATCH' | 'ERROR' | 'LOADING';
    matchCount: number;
    matches: SanctionsMatch[];
    checkedAt: string;
    source: string;
}

export interface SanctionsMatch {
    id: string;
    caption: string;
    schema: string;
    datasets: string[];
    properties: Record<string, string[]>;
    score: number;
}

export interface VesselLookupResult {
    found: boolean;
    name?: string;
    imo?: string;
    mmsi?: string;
    callSign?: string;
    flag?: string;
    vesselType?: string;
    dwt?: number;
    loa?: number;
    beam?: number;
    yearBuilt?: number;
    lat?: number;
    lng?: number;
    speed?: number;
    heading?: number;
    destination?: string;
    eta?: string;
    lastUpdate?: string;
    source: string;
}

// ============================================================
// OPENSANCTIONS — Vessel Sanctions Screening
// Free public API: https://api.opensanctions.org
// ============================================================

const OPENSANCTIONS_BASE = 'https://api.opensanctions.org';

/**
 * Screen a vessel against OpenSanctions database by name and/or IMO.
 * Free for non-commercial use — no API key required for basic search.
 */
export async function screenVesselSanctions(
    vesselName: string,
    imo?: string,
): Promise<SanctionsResult> {
    try {
        // Search by vessel name in the sanctions dataset
        const query = imo ? `${vesselName} ${imo}` : vesselName;
        const url = `${OPENSANCTIONS_BASE}/search/default?q=${encodeURIComponent(query)}&schema=Vessel&limit=5`;

        const response = await fetch(url, {
            headers: { 'Accept': 'application/json' },
        });

        if (!response.ok) {
            // Rate limited or API error — return graceful error
            if (response.status === 429) {
                return {
                    status: 'ERROR',
                    matchCount: 0,
                    matches: [],
                    checkedAt: new Date().toISOString(),
                    source: 'OpenSanctions (rate limited)',
                };
            }
            throw new Error(`OpenSanctions API returned ${response.status}`);
        }

        const data = await response.json();
        const results = data.results || [];

        const matches: SanctionsMatch[] = results.map((r: any) => ({
            id: r.id || '',
            caption: r.caption || r.name || '',
            schema: r.schema || '',
            datasets: r.datasets || [],
            properties: r.properties || {},
            score: r.score || 0,
        }));

        // Determine status based on matches
        let status: SanctionsResult['status'] = 'CLEAR';
        if (matches.length > 0) {
            // Check if any match has a high score (> 0.7) indicating likely hit
            const highConfidence = matches.some(m => m.score > 0.7);
            status = highConfidence ? 'SANCTIONED' : 'PARTIAL_MATCH';
        }

        return {
            status,
            matchCount: matches.length,
            matches,
            checkedAt: new Date().toISOString(),
            source: 'OpenSanctions',
        };
    } catch (error) {
        console.error('[MaritimeService] Sanctions screening failed:', error);
        return {
            status: 'ERROR',
            matchCount: 0,
            matches: [],
            checkedAt: new Date().toISOString(),
            source: 'OpenSanctions (error)',
        };
    }
}

// ============================================================
// VESSEL TYPE PRESETS — Used by the vessel creation form
// ============================================================

export interface VesselPreset {
    id: string;
    label: string;
    labelKo: string;
    icon: string;
    defaults: {
        vesselType: string;
        dwt: number;
        loa: number;
        beam: number;
        speedCp: number;
        avgIfo: number;
    };
}

export const VESSEL_PRESETS: VesselPreset[] = [
    {
        id: 'vlcc',
        label: 'VLCC',
        labelKo: '초대형 원유운반선',
        icon: '🛢️',
        defaults: { vesselType: 'Crude Oil Tanker (VLCC)', dwt: 300000, loa: 330, beam: 60, speedCp: 14.5, avgIfo: 52 },
    },
    {
        id: 'suezmax',
        label: 'Suezmax',
        labelKo: '수에즈맥스 유조선',
        icon: '⛽',
        defaults: { vesselType: 'Crude Oil Tanker (Suezmax)', dwt: 160000, loa: 275, beam: 48, speedCp: 14.0, avgIfo: 42 },
    },
    {
        id: 'aframax',
        label: 'Aframax',
        labelKo: '아프라막스',
        icon: '🚢',
        defaults: { vesselType: 'Crude Oil Tanker (Aframax)', dwt: 105000, loa: 244, beam: 42, speedCp: 14.0, avgIfo: 35 },
    },
    {
        id: 'bulk',
        label: 'Bulk Carrier',
        labelKo: '벌크선',
        icon: '📦',
        defaults: { vesselType: 'Bulk Carrier', dwt: 82000, loa: 229, beam: 32, speedCp: 12.5, avgIfo: 28 },
    },
    {
        id: 'container',
        label: 'Container',
        labelKo: '컨테이너선',
        icon: '📦',
        defaults: { vesselType: 'Container Ship', dwt: 120000, loa: 366, beam: 51, speedCp: 18.0, avgIfo: 180 },
    },
    {
        id: 'lng',
        label: 'LNG Carrier',
        labelKo: 'LNG 운반선',
        icon: '❄️',
        defaults: { vesselType: 'LNG Carrier', dwt: 90000, loa: 295, beam: 46, speedCp: 19.5, avgIfo: 65 },
    },
    {
        id: 'product',
        label: 'Product Tanker',
        labelKo: '석유제품 운반선',
        icon: '⛽',
        defaults: { vesselType: 'Product Tanker (MR)', dwt: 50000, loa: 183, beam: 32, speedCp: 13.5, avgIfo: 25 },
    },
];

// ============================================================
// FLAG OPTIONS — Common vessel flag states
// ============================================================

export const FLAG_OPTIONS = [
    { value: 'Republic of Korea', label: '🇰🇷 대한민국', code: 'KOR' },
    { value: 'Marshall Islands', label: '🇲🇭 마셜아일랜드', code: 'MHL' },
    { value: 'Panama', label: '🇵🇦 파나마', code: 'PAN' },
    { value: 'Liberia', label: '🇱🇷 라이베리아', code: 'LBR' },
    { value: 'Singapore', label: '🇸🇬 싱가포르', code: 'SGP' },
    { value: 'Hong Kong', label: '🇭🇰 홍콩', code: 'HKG' },
    { value: 'Bahamas', label: '🇧🇸 바하마', code: 'BHS' },
    { value: 'Malta', label: '🇲🇹 몰타', code: 'MLT' },
    { value: 'Greece', label: '🇬🇷 그리스', code: 'GRC' },
    { value: 'Norway', label: '🇳🇴 노르웨이', code: 'NOR' },
    { value: 'Japan', label: '🇯🇵 일본', code: 'JPN' },
    { value: 'China', label: '🇨🇳 중국', code: 'CHN' },
    { value: 'United Kingdom', label: '🇬🇧 영국', code: 'GBR' },
    { value: 'Cyprus', label: '🇨🇾 키프로스', code: 'CYP' },
];

// ============================================================
// SANCTIONS CACHE — Avoid redundant API calls
// ============================================================

const _sanctionsCache = new Map<string, SanctionsResult>();

export async function getCachedSanctionsCheck(
    vesselName: string,
    imo?: string,
): Promise<SanctionsResult> {
    const cacheKey = `${vesselName}|${imo || ''}`;
    const cached = _sanctionsCache.get(cacheKey);

    // Cache for 1 hour
    if (cached && new Date().getTime() - new Date(cached.checkedAt).getTime() < 3600000) {
        return cached;
    }

    const result = await screenVesselSanctions(vesselName, imo);
    _sanctionsCache.set(cacheKey, result);
    return result;
}
