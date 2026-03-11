/**
 * MarineTelemetryWidget — Reusable marine weather telemetry widget.
 * Fetches wave height & ocean current from Open-Meteo Marine API for any port.
 */
import { useEffect, useState } from 'react';
import { Wind, Navigation, Activity, Loader2, AlertTriangle } from 'lucide-react';
import { cn } from '../../lib/utils';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

interface MarineTelemetryProps {
    portName: string;
    lat: number;
    lon: number;
    label?: string;
}

interface DataPoint {
    time: string;
    wave: number;
    current: number;
}

export default function MarineTelemetryWidget({ portName, lat, lon, label }: MarineTelemetryProps) {
    const [data, setData] = useState<DataPoint[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const fetchWeather = async () => {
            try {
                const response = await fetch(
                    `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&hourly=wave_height,ocean_current_velocity&timezone=auto&past_days=1&forecast_days=1`
                );
                if (!response.ok) throw new Error('API Error');
                const json = await response.json();

                const hourly = json.hourly;
                const formattedData: DataPoint[] = hourly.time.map((t: string, i: number) => ({
                    time: new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    wave: hourly.wave_height[i] ?? 0,
                    current: hourly.ocean_current_velocity?.[i] ?? 0,
                })).filter((_: DataPoint, i: number) => i % 2 === 0).slice(0, 24);

                if (!cancelled) setData(formattedData);
            } catch (err) {
                console.error(`[MarineTelemetry] ${portName}:`, err);
                if (!cancelled) setError(true);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        fetchWeather();
        return () => { cancelled = true; };
    }, [lat, lon, portName]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-cyan-500 gap-3 py-10">
                <Loader2 className="animate-spin" size={24} />
                <span className="text-xs font-mono">Fetching Live Telemetry [{portName}]...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-rose-500 gap-2 py-10">
                <AlertTriangle size={24} />
                <span className="text-xs font-mono">Telemetry Link Failure — {portName}</span>
            </div>
        );
    }

    const currentWave = data.length > 0 ? data[Math.floor(data.length / 2)]?.wave || data[0].wave : 0;
    const isHighWave = currentWave > 1.5;

    // Unique gradient IDs per port to avoid SVG conflicts
    const gradientId = `wave-gradient-${portName.replace(/\s/g, '-').toLowerCase()}`;

    return (
        <div className="flex flex-col h-full bg-slate-900/40 rounded-lg p-4 border border-slate-700/30 relative overflow-hidden group">
            {/* Background Grid Pattern */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#3341551a_1px,transparent_1px),linear-gradient(to_bottom,#3341551a_1px,transparent_1px)] bg-[size:1rem_1rem] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />

            <div className="flex justify-between items-start z-10 mb-4">
                <div>
                    <div className="text-[10px] text-cyan-500 font-mono tracking-widest uppercase mb-1 flex items-center gap-1">
                        <Activity size={10} /> Sensor Node ACTIVE
                    </div>
                    <h4 className="text-sm font-semibold text-slate-200">{label || `${portName} Telemetry`}</h4>
                    <p className="text-xs text-slate-500 mt-0.5 font-mono">Lat: {lat.toFixed(2)}°N / Lon: {lon.toFixed(2)}°E</p>
                </div>

                <div className={cn(
                    "px-2.5 py-1 rounded bg-slate-800/80 border text-xs font-bold font-mono text-right",
                    isHighWave ? "border-rose-500/50 text-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.2)]" : "border-cyan-500/50 text-cyan-400"
                )}>
                    {currentWave.toFixed(2)}m
                    <div className="text-[9px] font-sans text-slate-500 font-normal">Wave Height</div>
                </div>
            </div>

            <div className="flex-1 w-full min-h-[120px] z-10">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                        <defs>
                            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.4} />
                                <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.4} vertical={false} />
                        <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={30} />
                        <YAxis tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} tickLine={false} />
                        <Tooltip
                            contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', fontSize: '12px', borderRadius: '8px', zIndex: 50 }}
                            itemStyle={{ color: '#bae6fd' }}
                            wrapperStyle={{ zIndex: 50 }}
                        />
                        <Area type="monotone" dataKey="wave" stroke="#0ea5e9" strokeWidth={2} fill={`url(#${gradientId})`} name="Wave Height (m)" isAnimationActive={true} />
                        <Area type="monotone" dataKey="current" stroke="#f59e0b" strokeWidth={1} fill="none" strokeDasharray="3 3" name="Ocean Current (m/s)" />
                    </AreaChart>
                </ResponsiveContainer>
            </div>

            <div className="mt-3 flex gap-4 text-[10px] text-slate-400 border-t border-slate-800/50 pt-3 z-10">
                <span className="flex items-center gap-1.5"><Wind size={12} className="text-cyan-500" /> API: Open-Meteo Marine</span>
                <span className="flex items-center gap-1.5"><Navigation size={12} className="text-amber-500" /> Surface Current Tracked</span>
            </div>
        </div>
    );
}
