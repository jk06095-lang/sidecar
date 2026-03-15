/**
 * MultiRegionWeatherWidget — Marine weather for critical maritime chokepoints
 * 
 * Fetches real-time marine weather data from Open-Meteo (free, no key).
 * Covers 4 critical regions:
 *   - Strait of Hormuz
 *   - Red Sea / Bab el-Mandeb
 *   - Suez Canal
 *   - Malacca Strait
 *
 * Displays compact cards with wave height, wind speed, and warning status.
 * Graceful fallback: shows cached data from localStorage if API fails.
 */
import { useEffect, useState, useCallback } from 'react';
import { Cloud, Waves, Wind, AlertTriangle, RefreshCw } from 'lucide-react';

interface RegionWeather {
    id: string;
    name: string;
    nameKo: string;
    lat: number;
    lng: number;
    waveHeight: number;
    windSpeed: number;
    windDirection: number;
    oceanCurrentSpeed: number;
    temperature: number;
    status: 'calm' | 'moderate' | 'rough' | 'severe';
    lastUpdated: string;
}

const REGIONS = [
    { id: 'hormuz', name: 'Strait of Hormuz', nameKo: '호르무즈 해협', lat: 26.56, lng: 56.25 },
    { id: 'redsea', name: 'Red Sea', nameKo: '홍해 (바브알만데브)', lat: 12.58, lng: 43.33 },
    { id: 'suez', name: 'Suez Canal', nameKo: '수에즈 운하', lat: 30.58, lng: 32.27 },
    { id: 'malacca', name: 'Malacca Strait', nameKo: '말라카 해협', lat: 2.50, lng: 101.80 },
];

const CACHE_KEY = 'sidecar_multi_weather';

function getStatusFromWaveHeight(wh: number): RegionWeather['status'] {
    if (wh > 4.0) return 'severe';
    if (wh > 2.5) return 'rough';
    if (wh > 1.0) return 'moderate';
    return 'calm';
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
    calm: { label: '안전', color: '#22c55e', bg: '#22c55e15', icon: '✅' },
    moderate: { label: '주의', color: '#f59e0b', bg: '#f59e0b15', icon: '⚡' },
    rough: { label: '위험', color: '#ef4444', bg: '#ef444415', icon: '⚠️' },
    severe: { label: '극심', color: '#dc2626', bg: '#dc262615', icon: '🚨' },
};

async function fetchRegionWeather(region: typeof REGIONS[0]): Promise<RegionWeather | null> {
    try {
        const url = `https://marine-api.open-meteo.com/v1/marine?latitude=${region.lat}&longitude=${region.lng}&current=wave_height,wave_direction,wave_period,wind_wave_height,ocean_current_velocity&hourly=wave_height&forecast_days=1`;
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return null;
        const data = await res.json();

        const current = data.current || {};
        const waveHeight = current.wave_height ?? 0;

        // Also fetch regular weather for wind
        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${region.lat}&longitude=${region.lng}&current=temperature_2m,wind_speed_10m,wind_direction_10m`;
        const weatherRes = await fetch(weatherUrl, { signal: AbortSignal.timeout(8000) });
        const weatherData = weatherRes.ok ? await weatherRes.json() : { current: {} };
        const weatherCurrent = weatherData.current || {};

        return {
            id: region.id,
            name: region.name,
            nameKo: region.nameKo,
            lat: region.lat,
            lng: region.lng,
            waveHeight: Math.round(waveHeight * 10) / 10,
            windSpeed: Math.round((weatherCurrent.wind_speed_10m ?? 0) * 10) / 10,
            windDirection: weatherCurrent.wind_direction_10m ?? 0,
            oceanCurrentSpeed: Math.round((current.ocean_current_velocity ?? 0) * 100) / 100,
            temperature: Math.round((weatherCurrent.temperature_2m ?? 0) * 10) / 10,
            status: getStatusFromWaveHeight(waveHeight),
            lastUpdated: new Date().toISOString(),
        };
    } catch (err) {
        console.warn(`[Weather] Failed to fetch for ${region.name}:`, err);
        return null;
    }
}

export default function MultiRegionWeatherWidget() {
    const [regions, setRegions] = useState<RegionWeather[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [lastFetch, setLastFetch] = useState<string>('');

    const fetchAll = useCallback(async () => {
        setIsLoading(true);
        const results = await Promise.all(REGIONS.map(r => fetchRegionWeather(r)));
        const valid = results.filter(Boolean) as RegionWeather[];

        if (valid.length > 0) {
            setRegions(valid);
            setLastFetch(new Date().toLocaleTimeString('ko-KR'));
            try {
                localStorage.setItem(CACHE_KEY, JSON.stringify({ regions: valid, fetchedAt: new Date().toISOString() }));
            } catch { /* ignore */ }
        } else {
            // Fallback to cache
            try {
                const cached = localStorage.getItem(CACHE_KEY);
                if (cached) {
                    const parsed = JSON.parse(cached);
                    setRegions(parsed.regions || []);
                    setLastFetch('캐시');
                }
            } catch { /* ignore */ }
        }
        setIsLoading(false);
    }, []);

    useEffect(() => {
        fetchAll();
        const interval = setInterval(fetchAll, 5 * 60 * 1000); // Refresh every 5 min
        return () => clearInterval(interval);
    }, [fetchAll]);

    const severeCount = regions.filter(r => r.status === 'severe' || r.status === 'rough').length;

    return (
        <div className="bg-slate-900/80 border border-slate-700/50 rounded-xl p-3 h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded bg-blue-500/20 flex items-center justify-center">
                        <Waves size={12} className="text-blue-400" />
                    </div>
                    <span className="text-xs font-bold text-white tracking-wide">MARINE WEATHER</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></span>
                    {severeCount > 0 && (
                        <span className="text-[8px] text-rose-400 font-mono px-1 py-0.5 bg-rose-500/10 border border-rose-500/30 rounded">
                            ⚠ {severeCount} ALERT
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {lastFetch && (
                        <span className="text-[9px] text-slate-500 font-mono">{lastFetch}</span>
                    )}
                    <button
                        onClick={fetchAll}
                        disabled={isLoading}
                        className="p-1 rounded hover:bg-slate-700/50 text-slate-500 hover:text-white transition-colors disabled:opacity-50"
                    >
                        <RefreshCw size={10} className={isLoading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {/* Region Cards */}
            <div className="grid grid-cols-2 gap-2 flex-1">
                {regions.length === 0 && isLoading ? (
                    <div className="col-span-2 flex items-center justify-center text-slate-500 text-xs">
                        <Cloud size={14} className="mr-1 animate-pulse" /> 해양 기상 데이터 로딩 중...
                    </div>
                ) : regions.map((region) => {
                    const cfg = STATUS_CONFIG[region.status];
                    return (
                        <div
                            key={region.id}
                            className="bg-slate-800/50 border border-slate-700/30 rounded-lg p-2.5 flex flex-col gap-1"
                            style={{ borderLeftColor: cfg.color, borderLeftWidth: 3 }}
                        >
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-white truncate">{region.nameKo}</span>
                                <span
                                    className="text-[8px] font-bold px-1.5 py-0.5 rounded"
                                    style={{ color: cfg.color, background: cfg.bg }}
                                >
                                    {cfg.icon} {cfg.label}
                                </span>
                            </div>
                            <div className="flex items-center gap-3 text-[9px] text-slate-400 mt-0.5">
                                <span className="flex items-center gap-0.5">
                                    <Waves size={8} className="text-blue-400" />
                                    {region.waveHeight}m
                                </span>
                                <span className="flex items-center gap-0.5">
                                    <Wind size={8} className="text-emerald-400" />
                                    {region.windSpeed} km/h
                                </span>
                                <span className="text-slate-500">
                                    {region.temperature}°C
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
