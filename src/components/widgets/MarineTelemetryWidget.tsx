/**
 * MarineTelemetryWidget — Generic marine weather telemetry for any port/strait
 * Uses Open-Meteo Marine API (free, no key).
 */
import { useEffect, useState } from 'react';
import { Wind, Navigation, Activity, Loader2, AlertTriangle } from 'lucide-react';
import { cn } from '../../lib/utils';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

interface MarineTelemetryWidgetProps {
    portName: string;
    latitude: number;
    longitude: number;
    accentColor?: string;
}

interface DataPoint {
    time: string;
    wave: number;
    current: number;
}

const CustomTelemetryTooltip = ({ active, payload, label, accentColor }: any) => {
    if (!active || !payload || !payload.length) return null;
    return (
        <div className="bg-slate-800/95 backdrop-blur border border-slate-700 rounded-lg px-3 py-2 shadow-xl z-[99999]">
            <p className="text-[10px] text-slate-400 font-mono mb-1">{label}</p>
            {payload.map((p: any, i: number) => (
                <div key={i} className="flex items-center gap-2 text-[10px]">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: p.color }} />
                    <span className="text-slate-400">{p.name}:</span>
                    <span className="text-slate-100 font-mono font-medium">
                        {typeof p.value === 'number' ? p.value.toFixed(2) : p.value}
                    </span>
                </div>
            ))}
        </div>
    );
};

export default function MarineTelemetryWidget({
    portName,
    latitude,
    longitude,
    accentColor = '#0ea5e9',
}: MarineTelemetryWidgetProps) {
    const [data, setData] = useState<DataPoint[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        const fetchWeather = async () => {
            try {
                const response = await fetch(
                    `https://marine-api.open-meteo.com/v1/marine?latitude=${latitude}&longitude=${longitude}&hourly=wave_height,ocean_current_velocity&timezone=auto&past_days=1&forecast_days=1`
                );
                if (!response.ok) throw new Error('API Error');
                const json = await response.json();

                const hourly = json.hourly;
                const formattedData: DataPoint[] = hourly.time.map((t: string, i: number) => ({
                    time: new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    wave: hourly.wave_height[i],
                    current: hourly.ocean_current_velocity?.[i] ?? 0,
                })).filter((_: any, i: number) => i % 2 === 0).slice(0, 24);

                setData(formattedData);
            } catch (err) {
                console.error(`[MarineTelemetry:${portName}]`, err);
                setError(true);
            } finally {
                setLoading(false);
            }
        };
        fetchWeather();
    }, [latitude, longitude, portName]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-3 py-10" style={{ color: accentColor }}>
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

    const currentWave = data.length > 0 ? data[Math.min(12, data.length - 1)]?.wave || data[0].wave : 0;
    const isHighWave = currentWave > 1.5;

    // Unique gradient IDs to avoid conflicts between multiple instances
    const gradientId = `waveGrad_${portName.replace(/\s/g, '_')}`;

    return (
        <div className="flex flex-col h-full bg-slate-900/40 rounded-lg p-4 border border-slate-700/30 relative overflow-hidden group">
            {/* Background Grid Pattern */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#3341551a_1px,transparent_1px),linear-gradient(to_bottom,#3341551a_1px,transparent_1px)] bg-[size:1rem_1rem] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />

            <div className="flex justify-between items-start z-10 mb-3">
                <div>
                    <div className="text-[10px] font-mono tracking-widest uppercase mb-1 flex items-center gap-1" style={{ color: accentColor }}>
                        <Activity size={10} /> Sensor Node ACTIVE
                    </div>
                    <h4 className="text-sm font-semibold text-slate-200">{portName} Telemetry</h4>
                    <p className="text-xs text-slate-500 mt-0.5 font-mono">
                        Lat: {latitude.toFixed(2)}°{latitude >= 0 ? 'N' : 'S'} / Lon: {longitude.toFixed(2)}°{longitude >= 0 ? 'E' : 'W'}
                    </p>
                </div>

                <div className={cn(
                    "px-2.5 py-1 rounded bg-slate-800/80 border text-xs font-bold font-mono text-right",
                    isHighWave ? "border-rose-500/50 text-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.2)]" : "text-cyan-400"
                )} style={!isHighWave ? { borderColor: `${accentColor}50`, color: accentColor } : undefined}>
                    {currentWave.toFixed(2)}m
                    <div className="text-[9px] font-sans text-slate-500 font-normal">Wave Height</div>
                </div>
            </div>

            <div className="flex-1 w-full min-h-0 z-10">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                        <defs>
                            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={accentColor} stopOpacity={0.4} />
                                <stop offset="100%" stopColor={accentColor} stopOpacity={0.0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.4} vertical={false} />
                        <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={30} />
                        <YAxis tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} tickLine={false} />
                        <Tooltip
                            content={<CustomTelemetryTooltip accentColor={accentColor} />}
                            wrapperStyle={{ zIndex: 99999 }}
                        />
                        <Area type="monotone" dataKey="wave" stroke={accentColor} strokeWidth={2} fill={`url(#${gradientId})`} name="Wave Height (m)" isAnimationActive={true} />
                        <Area type="monotone" dataKey="current" stroke="#f59e0b" strokeWidth={1} fill="none" strokeDasharray="3 3" name="Ocean Current (m/s)" />
                    </AreaChart>
                </ResponsiveContainer>
            </div>

            <div className="mt-2 flex gap-4 text-[10px] text-slate-400 border-t border-slate-800/50 pt-2 z-10">
                <span className="flex items-center gap-1.5"><Wind size={12} style={{ color: accentColor }} /> Open-Meteo Marine</span>
                <span className="flex items-center gap-1.5"><Navigation size={12} className="text-amber-500" /> Surface Current</span>
            </div>
        </div>
    );
}
