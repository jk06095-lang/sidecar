/**
 * Object360Panel — Contextual slide-in panel with tabbed data display.
 *
 * Tabs:
 *   Overview  — Risk score, properties, type-specific widget
 *   Weather   — Sea-state, wind, wave, current for vessel/port location  
 *   Intel     — Linked news articles filtered by object context
 *   Market    — Market exposure, quant metrics
 *   Network   — Connected objects in the ontology graph
 */
import React, { useState, useEffect } from 'react';
import {
    X, Ship, Anchor, Navigation, Fuel, Shield, FileText,
    TrendingUp, TrendingDown, AlertTriangle, Zap, Link2,
    Newspaper, BarChart3, Route as RouteIcon, Cloud,
    Wind, Waves, Compass, Thermometer, Eye,
    ChevronRight,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useOntologyStore } from '../../store/ontologyStore';
import ActionWizard, { getActionsForType } from './ActionWizard';
import { getCachedSanctionsCheck } from '../../services/maritimeIntegrationService';
import type { SanctionsResult } from '../../services/maritimeIntegrationService';
import type { OntologyObject, OntologyLink, OntologyActionType } from '../../types';

interface Object360PanelProps {
    objectId: string | null;
    onClose: () => void;
    onNavigate: (id: string) => void;
}

// ============================================================
// TYPE-SPECIFIC ICON MAP
// ============================================================
const TYPE_ICONS: Record<string, React.ReactNode> = {
    Vessel: <Ship size={14} className="text-cyan-400" />,
    Port: <Navigation size={14} className="text-purple-400" />,
    Route: <RouteIcon size={14} className="text-sky-400" />,
    MarketIndicator: <BarChart3 size={14} className="text-emerald-400" />,
    RiskEvent: <AlertTriangle size={14} className="text-rose-400" />,
};

const RISK_COLORS = {
    low: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30' },
    medium: { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30' },
    high: { bg: 'bg-orange-500/15', text: 'text-orange-400', border: 'border-orange-500/30' },
    critical: { bg: 'bg-rose-500/15', text: 'text-rose-400', border: 'border-rose-500/30' },
};

function getRiskTier(score: number) {
    if (score >= 80) return 'critical';
    if (score >= 55) return 'high';
    if (score >= 30) return 'medium';
    return 'low';
}

const RELATION_LABELS: Record<string, string> = {
    ROUTES_THROUGH: '항로 경유',
    CARRIES: '운송',
    AFFECTED_BY: '영향',
    SUPPLIES: '공급',
    INSURES: '보험',
    PRICED_IN: '결제 통화',
    TRIGGERS: '유발',
    LOCATED_AT: '위치',
    MONITORS: '모니터링',
    DEPENDS_ON: '의존',
    TRANSITS: '통항',
    OPERATES_ON: '운항',
    CONSUMES_FUEL: '연료 소비',
    EXPOSES_TO: '리스크 노출',
};

// ============================================================
// TAB TYPES
// ============================================================
type PanelTab = 'overview' | 'weather' | 'intel' | 'market' | 'network';

const TABS: { id: PanelTab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <Eye size={12} /> },
    { id: 'weather', label: 'Weather', icon: <Cloud size={12} /> },
    { id: 'intel', label: 'Intel', icon: <Newspaper size={12} /> },
    { id: 'market', label: 'Market', icon: <BarChart3 size={12} /> },
    { id: 'network', label: 'Network', icon: <Link2 size={12} /> },
];

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function Object360Panel({ objectId, onClose, onNavigate }: Object360PanelProps) {
    const objects = useOntologyStore((s) => s.objects);
    const links = useOntologyStore((s) => s.links);

    if (!objectId) return null;
    const obj = objects.find((o) => o.id === objectId);
    if (!obj) return null;

    return <Object360PanelInner obj={obj} objectId={objectId} objects={objects} links={links} onClose={onClose} onNavigate={onNavigate} />;
}

// Inner component with hooks
function Object360PanelInner({ obj, objectId, objects, links, onClose, onNavigate }: {
    obj: OntologyObject; objectId: string; objects: OntologyObject[]; links: any[]; onClose: () => void; onNavigate: (id: string) => void;
}) {
    const [activeTab, setActiveTab] = useState<PanelTab>('overview');
    const [activeActionType, setActiveActionType] = useState<OntologyActionType | null>(null);
    const availableActions = getActionsForType(obj.type);

    const riskScore = (obj.properties.riskScore as number) || 0;
    const riskTier = getRiskTier(riskScore);
    const riskStyle = RISK_COLORS[riskTier];

    // Reset tab when selected object changes
    useEffect(() => {
        setActiveTab('overview');
        setActiveActionType(null);
    }, [objectId]);

    // Connected objects
    const connectedLinks = links.filter((l) => l.sourceId === objectId || l.targetId === objectId);
    const connectedObjects = connectedLinks.map((link) => {
        const otherId = link.sourceId === objectId ? link.targetId : link.sourceId;
        const otherObj = objects.find((o) => o.id === otherId);
        const direction = link.sourceId === objectId ? 'outgoing' : 'incoming';
        return { link, object: otherObj, direction };
    }).filter((c) => c.object);

    return (
        <div className="w-[400px] shrink-0 bg-slate-950/98 backdrop-blur-xl border-l border-slate-800/60 flex flex-col overflow-hidden shadow-2xl">
            {/* ── Header ── */}
            <div className="px-4 pt-4 pb-3 border-b border-slate-800/50">
                <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-2">
                        {TYPE_ICONS[obj.type] || <FileText size={14} className="text-slate-400" />}
                        <span className="text-[9px] px-2 py-0.5 rounded font-bold bg-slate-800/60 text-slate-400 uppercase tracking-wider border border-slate-700/30">
                            {obj.type}
                        </span>
                    </div>
                    <button onClick={onClose} className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800/50 rounded-lg transition-colors">
                        <X size={14} />
                    </button>
                </div>
                <h2 className="text-base font-bold text-slate-100 mb-1 leading-tight">{obj.title}</h2>
                {obj.description && (
                    <p className="text-[10px] text-slate-500 leading-relaxed line-clamp-2">{obj.description}</p>
                )}

                {/* Risk Score Compact Gauge */}
                <div className="mt-2.5 flex items-center gap-3">
                    <div className="flex-1">
                        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div
                                className={cn('h-full rounded-full transition-all duration-700', {
                                    'bg-emerald-500': riskTier === 'low',
                                    'bg-amber-500': riskTier === 'medium',
                                    'bg-orange-500': riskTier === 'high',
                                    'bg-rose-500 animate-pulse': riskTier === 'critical',
                                })}
                                style={{ width: `${Math.min(100, riskScore)}%` }}
                            />
                        </div>
                    </div>
                    <span className={cn('text-xs font-bold font-mono', riskStyle.text)}>{riskScore}</span>
                    <span className={cn('px-1.5 py-0.5 rounded text-[8px] font-bold uppercase border', riskStyle.bg, riskStyle.text, riskStyle.border)}>
                        {riskTier}
                    </span>
                </div>
            </div>

            {/* ── Tab Bar ── */}
            <div className="flex items-center border-b border-slate-800/50 bg-slate-900/30">
                {TABS.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={cn(
                            "flex-1 flex items-center justify-center gap-1 py-2 text-[9px] font-bold uppercase tracking-wider transition-all border-b-2",
                            activeTab === tab.id
                                ? 'text-cyan-400 border-cyan-400 bg-cyan-500/5'
                                : 'text-slate-600 border-transparent hover:text-slate-400 hover:bg-slate-800/20'
                        )}
                    >
                        {tab.icon}
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* ── Tab Content ── */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {activeTab === 'overview' && (
                    <OverviewTab
                        obj={obj}
                        availableActions={availableActions}
                        activeActionType={activeActionType}
                        setActiveActionType={setActiveActionType}
                    />
                )}
                {activeTab === 'weather' && <WeatherTab obj={obj} />}
                {activeTab === 'intel' && <IntelTab objectId={objectId} />}
                {activeTab === 'market' && <MarketTab objectId={objectId} />}
                {activeTab === 'network' && (
                    <NetworkTab
                        objectId={objectId}
                        connectedObjects={connectedObjects}
                        onNavigate={onNavigate}
                    />
                )}
            </div>

            {/* ── Metadata Footer ── */}
            <div className="px-4 py-2 border-t border-slate-800/40 flex items-center gap-3 text-[8px] font-mono text-slate-600">
                <span>{obj.metadata.source}</span>
                <span>·</span>
                <span>{obj.metadata.status}</span>
                <span className="ml-auto">{obj.metadata.updatedAt.split('T')[0]}</span>
            </div>
        </div>
    );
}

// ============================================================
// TAB: OVERVIEW
// ============================================================
function OverviewTab({ obj, availableActions, activeActionType, setActiveActionType }: {
    obj: OntologyObject;
    availableActions: ReturnType<typeof getActionsForType>;
    activeActionType: OntologyActionType | null;
    setActiveActionType: (t: OntologyActionType | null) => void;
}) {
    return (
        <>
            {/* Type-specific widget */}
            <TypeSpecificWidget obj={obj} />

            {/* Actions */}
            {availableActions.length > 0 && (
                <div className="p-4 border-b border-slate-800/40">
                    <h3 className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-2.5 flex items-center gap-1.5">
                        <Zap size={10} /> Actions
                        <span className="text-slate-600 font-mono">({availableActions.length})</span>
                    </h3>

                    {!activeActionType && (
                        <div className="space-y-1">
                            {availableActions.map((actionDef) => {
                                const colorMap: Record<string, string> = {
                                    cyan: 'border-cyan-800/50 hover:border-cyan-500/50 text-cyan-400 hover:bg-cyan-950/30',
                                    amber: 'border-amber-800/50 hover:border-amber-500/50 text-amber-400 hover:bg-amber-950/30',
                                    rose: 'border-rose-800/50 hover:border-rose-500/50 text-rose-400 hover:bg-rose-950/30',
                                    orange: 'border-orange-800/50 hover:border-orange-500/50 text-orange-400 hover:bg-orange-950/30',
                                };
                                return (
                                    <button
                                        key={actionDef.type}
                                        onClick={() => setActiveActionType(actionDef.type)}
                                        className={cn(
                                            'w-full flex items-center gap-2 px-3 py-2 rounded-lg border bg-slate-900/30 transition-all text-left',
                                            colorMap[actionDef.color] || colorMap.cyan,
                                        )}
                                    >
                                        <span className="shrink-0">{actionDef.icon}</span>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-[10px] font-medium">{actionDef.labelKo}</div>
                                        </div>
                                        <ChevronRight size={10} className="text-slate-600 shrink-0" />
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {activeActionType && (
                        <ActionWizard
                            object={obj}
                            actionDef={availableActions.find((a) => a.type === activeActionType)!}
                            onClose={() => setActiveActionType(null)}
                        />
                    )}
                </div>
            )}

            {/* Properties */}
            <div className="p-4">
                <h3 className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-2.5">Properties</h3>
                <div className="space-y-1">
                    {Object.entries(obj.properties)
                        .filter(([key]) => key !== 'riskScore')
                        .slice(0, 12)
                        .map(([key, value]) => (
                            <div key={key} className="flex items-center justify-between px-2.5 py-1 rounded bg-slate-900/40 hover:bg-slate-800/40 transition-colors">
                                <span className="text-[10px] text-slate-500 font-mono">{key}</span>
                                <span className="text-[10px] text-slate-300 font-mono font-medium max-w-[160px] truncate text-right">
                                    {String(value)}
                                </span>
                            </div>
                        ))}
                </div>
            </div>
        </>
    );
}

// ============================================================
// TAB: WEATHER
// ============================================================
function WeatherTab({ obj }: { obj: OntologyObject }) {
    // Generate contextual weather data based on object location
    const location = String(obj.properties.location || obj.properties.region || obj.title || '');
    const lat = Number(obj.properties.latitude || 0);
    const lon = Number(obj.properties.longitude || 0);

    // Deterministic mock based on object id hash
    const hash = obj.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const windSpeed = 8 + (hash % 25);
    const windDir = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][hash % 8];
    const waveHeight = (1.2 + (hash % 30) / 10).toFixed(1);
    const swellPeriod = 6 + (hash % 8);
    const visibility = 5 + (hash % 15);
    const seaTemp = 18 + (hash % 14);
    const currentSpeed = (0.2 + (hash % 15) / 10).toFixed(1);
    const beaufort = windSpeed < 12 ? 3 : windSpeed < 20 ? 5 : windSpeed < 30 ? 7 : 9;
    const seaState = beaufort <= 3 ? 'Slight' : beaufort <= 5 ? 'Moderate' : beaufort <= 7 ? 'Rough' : 'Very Rough';
    const seaStateColor = beaufort <= 3 ? 'text-emerald-400' : beaufort <= 5 ? 'text-amber-400' : 'text-rose-400';

    return (
        <div className="p-4 space-y-4">
            {/* Location Context */}
            <div className="bg-slate-900/50 rounded-xl p-3 border border-slate-800/40">
                <div className="flex items-center gap-2 mb-2">
                    <Compass size={12} className="text-cyan-400" />
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Location</span>
                </div>
                <div className="text-xs text-slate-200 font-medium">{location || 'Unknown'}</div>
                {(lat !== 0 || lon !== 0) && (
                    <div className="text-[9px] text-slate-600 font-mono mt-0.5">{lat.toFixed(2)}°N, {lon.toFixed(2)}°E</div>
                )}
            </div>

            {/* Sea State Overview */}
            <div className="bg-slate-900/50 rounded-xl p-3 border border-slate-800/40">
                <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Sea State</span>
                    <span className={cn("text-xs font-bold", seaStateColor)}>{seaState}</span>
                </div>
                <div className="flex items-center gap-2 mb-2">
                    <span className="text-[9px] text-slate-500">Beaufort</span>
                    <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div
                            className={cn("h-full rounded-full transition-all",
                                beaufort <= 3 ? 'bg-emerald-500' : beaufort <= 5 ? 'bg-amber-500' : 'bg-rose-500'
                            )}
                            style={{ width: `${(beaufort / 12) * 100}%` }}
                        />
                    </div>
                    <span className="text-xs font-bold font-mono text-slate-300">F{beaufort}</span>
                </div>
            </div>

            {/* Weather Metrics Grid */}
            <div className="grid grid-cols-2 gap-2">
                <WeatherCard icon={<Wind size={14} />} label="Wind" value={`${windSpeed} kn`} sub={windDir} color="text-cyan-400" />
                <WeatherCard icon={<Waves size={14} />} label="Wave Ht." value={`${waveHeight} m`} sub={`${swellPeriod}s period`} color="text-sky-400" />
                <WeatherCard icon={<Eye size={14} />} label="Visibility" value={`${visibility} nm`} sub={visibility > 10 ? 'Good' : 'Reduced'} color="text-emerald-400" />
                <WeatherCard icon={<Thermometer size={14} />} label="Sea Temp" value={`${seaTemp}°C`} sub="Surface" color="text-amber-400" />
                <WeatherCard icon={<Navigation size={14} />} label="Current" value={`${currentSpeed} kn`} sub="Surface" color="text-purple-400" />
                <WeatherCard icon={<Cloud size={14} />} label="Condition" value={beaufort <= 3 ? 'Fair' : beaufort <= 5 ? 'Overcast' : 'Storm'} sub="" color={seaStateColor} />
            </div>

            {/* Navigation Advisory */}
            {beaufort >= 5 && (
                <div className={cn("rounded-xl p-3 border",
                    beaufort >= 7 ? "bg-rose-950/20 border-rose-500/30" : "bg-amber-950/20 border-amber-500/30"
                )}>
                    <div className="flex items-center gap-1.5 mb-1">
                        <AlertTriangle size={11} className={beaufort >= 7 ? 'text-rose-400' : 'text-amber-400'} />
                        <span className={cn("text-[10px] font-bold uppercase tracking-wider", beaufort >= 7 ? 'text-rose-400' : 'text-amber-400')}>
                            {beaufort >= 7 ? 'Storm Warning' : 'Weather Advisory'}
                        </span>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                        {beaufort >= 7
                            ? '항해 지연 가능. 감속 운항 및 대체 항로 검토 권고.'
                            : '해상 상태 주의. 화물 고박 상태 확인 필요.'}
                    </p>
                </div>
            )}
        </div>
    );
}

function WeatherCard({ icon, label, value, sub, color }: {
    icon: React.ReactNode; label: string; value: string; sub: string; color: string;
}) {
    return (
        <div className="bg-slate-900/50 rounded-lg p-2.5 border border-slate-800/30">
            <div className="flex items-center gap-1.5 mb-1.5">
                <span className={color}>{icon}</span>
                <span className="text-[9px] text-slate-500 uppercase tracking-wider">{label}</span>
            </div>
            <div className="text-sm font-bold font-mono text-slate-200">{value}</div>
            {sub && <div className="text-[9px] text-slate-600 mt-0.5">{sub}</div>}
        </div>
    );
}

// ============================================================
// TAB: INTEL (News)
// ============================================================
function IntelTab({ objectId }: { objectId: string }) {
    const objects = useOntologyStore(s => s.objects);
    const articles = useOntologyStore(s => s.intelArticles);

    const obj = objects.find(o => o.id === objectId);
    if (!obj) return null;

    const keywords = [
        obj.title.toLowerCase(),
        ...(obj.type === 'Vessel' ? [String(obj.properties.vesselType || '').toLowerCase()] : []),
        ...(obj.type === 'Port' ? [String(obj.properties.region || '').toLowerCase()] : []),
    ].filter(Boolean);

    const matched = articles.filter(a => {
        if (a.dropped) return false;
        const titleLower = a.title.toLowerCase();
        const descLower = (a.description || '').toLowerCase();
        return keywords.some(kw => kw.length > 2 && (titleLower.includes(kw) || descLower.includes(kw)));
    });

    // Also show recent high-impact articles even if not matched
    const recentHighImpact = articles
        .filter(a => !a.dropped && (a.riskLevel === 'Critical' || a.riskLevel === 'High') && !matched.find(m => m.id === a.id))
        .slice(0, 3);

    const allArticles = [...matched, ...recentHighImpact].slice(0, 12);

    return (
        <div className="p-4 space-y-3">
            {matched.length > 0 && (
                <div className="flex items-center gap-1.5 mb-1">
                    <Newspaper size={11} className="text-cyan-400" />
                    <span className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">
                        Linked Intel ({matched.length})
                    </span>
                </div>
            )}

            {allArticles.length > 0 ? (
                <div className="space-y-1.5">
                    {allArticles.map((a, idx) => (
                        <div
                            key={a.id}
                            className={cn("px-3 py-2.5 rounded-lg transition-colors",
                                idx < matched.length
                                    ? "bg-cyan-950/10 border border-cyan-800/20 hover:border-cyan-700/30"
                                    : "bg-slate-900/40 border border-slate-800/20 hover:bg-slate-800/40"
                            )}
                        >
                            <div className="flex items-center gap-1.5 mb-1">
                                <span className="text-[9px]">{a.sourceBadge || '📰'}</span>
                                <span className="text-[9px] text-slate-500">{a.source}</span>
                                {idx < matched.length && (
                                    <span className="text-[8px] px-1 py-0.5 rounded bg-cyan-500/10 text-cyan-400 font-bold">LINKED</span>
                                )}
                                <span className={cn("ml-auto text-[8px] px-1 py-0.5 rounded font-bold",
                                    a.riskLevel === 'Critical' ? 'bg-rose-500/15 text-rose-400' :
                                        a.riskLevel === 'High' ? 'bg-amber-500/15 text-amber-400' :
                                            'bg-slate-700/50 text-slate-400'
                                )}>{a.riskLevel}</span>
                            </div>
                            <div className="text-[10px] text-slate-300 leading-tight line-clamp-2">{a.title}</div>
                            <div className="text-[9px] text-slate-600 font-mono mt-1">
                                {new Date(a.publishedAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-center py-8">
                    <Newspaper size={20} className="mx-auto text-slate-700 mb-2" />
                    <div className="text-xs text-slate-600">No linked intel for this object</div>
                    <div className="text-[9px] text-slate-700 mt-1">OSINT pipeline will surface relevant articles</div>
                </div>
            )}
        </div>
    );
}

// ============================================================
// TAB: MARKET
// ============================================================
function MarketTab({ objectId }: { objectId: string }) {
    const objects = useOntologyStore(s => s.objects);
    const links = useOntologyStore(s => s.links);
    const quantMetrics = useOntologyStore(s => s.lsegQuantMetrics);
    const quotes = useOntologyStore(s => s.lsegMarketQuotes);
    const simulationParams = useOntologyStore(s => s.simulationParams);

    const connectedLinks = links.filter(l => l.sourceId === objectId || l.targetId === objectId);
    const linkedMarketIds = new Set<string>();
    connectedLinks.forEach(l => {
        const otherId = l.sourceId === objectId ? l.targetId : l.sourceId;
        const other = objects.find(o => o.id === otherId);
        if (other && other.type === 'MarketIndicator') {
            linkedMarketIds.add(otherId);
        }
    });

    const linkedMarkets = objects.filter(o => linkedMarketIds.has(o.id));

    return (
        <div className="p-4 space-y-4">
            {/* Key Rates */}
            <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-900/50 rounded-lg p-2.5 border border-slate-800/30">
                    <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">VLSFO</div>
                    <div className="text-sm font-bold font-mono text-amber-400">${simulationParams.vlsfoPrice}</div>
                    <div className="text-[9px] text-slate-600">$/mt Bunker</div>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-2.5 border border-slate-800/30">
                    <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">WS Rate</div>
                    <div className="text-sm font-bold font-mono text-cyan-400">{simulationParams.baseWS}</div>
                    <div className="text-[9px] text-slate-600">Worldscale</div>
                </div>
            </div>

            {/* Linked Market Indicators */}
            {linkedMarkets.length > 0 ? (
                <>
                    <h3 className="text-[9px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                        <BarChart3 size={10} /> Linked Indicators ({linkedMarkets.length})
                    </h3>
                    <div className="space-y-2">
                        {linkedMarkets.map(m => {
                            const ric = String(m.properties.ric || m.properties.symbol || '');
                            const metric = ric ? quantMetrics[ric] : undefined;
                            const quote = quotes.find(q => q.symbol === ric);
                            const isAlert = metric?.riskAlert;

                            return (
                                <div key={m.id} className={cn(
                                    "px-3 py-2.5 rounded-lg border transition-colors",
                                    isAlert ? "bg-rose-950/20 border-rose-500/30" : "bg-slate-900/40 border-slate-800/20"
                                )}>
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-[10px] text-slate-300 font-medium">{m.title}</span>
                                        {isAlert && <span className="text-[8px] px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-400 font-bold">⚠ ALERT</span>}
                                    </div>
                                    <div className="flex items-center gap-3 text-[10px] font-mono">
                                        {quote && (
                                            <>
                                                <span className="text-slate-200 font-bold">{quote.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                                                <span className={quote.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                                    {quote.change >= 0 ? '+' : ''}{quote.changePercent?.toFixed(2)}%
                                                </span>
                                            </>
                                        )}
                                        {metric && <span className="text-slate-500">Z={metric.zScore.toFixed(1)} {metric.trend}</span>}
                                        {!quote && <span className="text-slate-600">{`${m.properties.basePrice || m.properties.baseRate || '-'}`}</span>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </>
            ) : (
                <div className="text-center py-6">
                    <BarChart3 size={20} className="mx-auto text-slate-700 mb-2" />
                    <div className="text-xs text-slate-600">No directly linked market indicators</div>
                </div>
            )}

            {/* Live Quotes Summary */}
            {quotes.length > 0 && (
                <div>
                    <h3 className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                        <TrendingUp size={10} /> Market Overview
                    </h3>
                    <div className="grid grid-cols-2 gap-1.5">
                        {quotes.slice(0, 6).map((q, i) => (
                            <div key={i} className="bg-slate-900/40 rounded px-2.5 py-1.5 border border-slate-800/20">
                                <div className="text-[8px] text-slate-600 font-mono truncate">{q.symbol}</div>
                                <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] font-bold font-mono text-slate-300">{q.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                                    <span className={cn("text-[9px] font-mono font-bold", q.change >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                                        {q.change >= 0 ? '+' : ''}{q.changePercent?.toFixed(1)}%
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// ============================================================
// TAB: NETWORK
// ============================================================
function NetworkTab({ objectId, connectedObjects, onNavigate }: {
    objectId: string;
    connectedObjects: Array<{ link: any; object: OntologyObject | undefined; direction: string }>;
    onNavigate: (id: string) => void;
}) {
    return (
        <div className="p-4 space-y-3">
            <div className="flex items-center gap-1.5 mb-1">
                <Link2 size={11} className="text-cyan-400" />
                <span className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">
                    Connections ({connectedObjects.length})
                </span>
            </div>

            {connectedObjects.length > 0 ? (
                <div className="space-y-1.5">
                    {connectedObjects.map(({ link, object: linkedObj, direction }) => {
                        if (!linkedObj) return null;
                        const linkedRisk = (linkedObj.properties.riskScore as number) || 0;
                        const linkedRiskTier = getRiskTier(linkedRisk);
                        const linkedRiskStyle = RISK_COLORS[linkedRiskTier];

                        return (
                            <button
                                key={link.id}
                                onClick={() => onNavigate(linkedObj.id)}
                                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-slate-900/40 hover:bg-slate-800/50 border border-slate-800/20 hover:border-slate-700/40 transition-all group text-left"
                            >
                                <div className="shrink-0">
                                    {TYPE_ICONS[linkedObj.type] || <FileText size={12} className="text-slate-400" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-[10px] text-slate-300 font-medium truncate group-hover:text-white transition-colors">
                                        {linkedObj.title}
                                    </div>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <span className="text-[9px] text-slate-600">
                                            {direction === 'outgoing' ? '→' : '←'} {RELATION_LABELS[link.relationType] || link.relationType}
                                        </span>
                                        <span className="text-[9px] text-slate-700 font-mono">w:{link.weight.toFixed(2)}</span>
                                    </div>
                                </div>
                                <div className={cn('px-1.5 py-0.5 rounded text-[9px] font-bold font-mono', linkedRiskStyle.bg, linkedRiskStyle.text)}>
                                    {linkedRisk}
                                </div>
                            </button>
                        );
                    })}
                </div>
            ) : (
                <div className="text-center py-8">
                    <Link2 size={20} className="mx-auto text-slate-700 mb-2" />
                    <div className="text-xs text-slate-600">No connections</div>
                </div>
            )}
        </div>
    );
}

// ============================================================
// TYPE-SPECIFIC EMBEDDED WIDGETS (used in Overview tab)
// ============================================================
function TypeSpecificWidget({ obj }: { obj: OntologyObject }) {
    switch (obj.type) {
        case 'Vessel': return <VesselWidget obj={obj} />;
        case 'Port': return <PortWidget obj={obj} />;
        case 'RiskEvent': return <RiskEventWidget obj={obj} />;
        case 'MarketIndicator': return <MarketIndicatorWidget obj={obj} />;
        default: return null;
    }
}

function VesselWidget({ obj }: { obj: OntologyObject }) {
    const p = obj.properties;
    const riskScore = (p.riskScore as number) || 0;
    const riskLevel = riskScore > 80 ? 'Critical' : riskScore > 50 ? 'High' : riskScore > 30 ? 'Medium' : 'Low';

    const [sanctions, setSanctions] = useState<SanctionsResult | null>(null);

    useEffect(() => {
        const vesselName = obj.title.replace(/^[^\w]+/, '').trim();
        const imo = p.imo ? String(p.imo) : undefined;
        getCachedSanctionsCheck(vesselName, imo).then(setSanctions);
    }, [obj.title, p.imo]);

    const fuel = Number(p.fuel ?? 100);
    const speed = Number(p.speed ?? p.avgSpeed ?? 0);
    const destination = String(p.destination ?? p.destinationPort ?? '-');

    const sanctionsBadge = sanctions ? (
        sanctions.status === 'CLEAR'
            ? <span className="px-2 py-0.5 rounded-full text-[8px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">✅ CLEAR</span>
            : sanctions.status === 'SANCTIONED'
                ? <span className="px-2 py-0.5 rounded-full text-[8px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30 animate-pulse">🚫 SANCTIONED</span>
                : sanctions.status === 'PARTIAL_MATCH'
                    ? <span className="px-2 py-0.5 rounded-full text-[8px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">⚠ PARTIAL ({sanctions.matchCount})</span>
                    : <span className="px-2 py-0.5 rounded-full text-[8px] text-slate-500">⏳</span>
    ) : <span className="px-2 py-0.5 rounded-full text-[8px] text-slate-600">⏳</span>;

    return (
        <div className="p-4 border-b border-slate-800/40 space-y-3">
            <h3 className="text-[9px] font-bold text-cyan-500 uppercase tracking-widest flex items-center gap-1.5">
                <Ship size={10} /> Vessel Status
            </h3>

            {/* Sanctions */}
            <div className="flex items-center justify-between bg-slate-900/40 rounded-lg px-3 py-2 border border-slate-800/30">
                <div className="flex items-center gap-1.5">
                    <Shield size={10} className="text-amber-400" />
                    <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Sanctions</span>
                </div>
                {sanctionsBadge}
            </div>

            {/* Identity Chips */}
            {(p.imo || p.flag || p.dwt) && (
                <div className="flex flex-wrap gap-1">
                    {p.imo && <span className="px-1.5 py-0.5 rounded bg-slate-900/60 border border-slate-800/30 text-[8px] font-mono text-slate-400">IMO {String(p.imo)}</span>}
                    {p.flag && <span className="px-1.5 py-0.5 rounded bg-slate-900/60 border border-slate-800/30 text-[8px] text-slate-400">🏳️ {String(p.flag)}</span>}
                    {p.dwt && <span className="px-1.5 py-0.5 rounded bg-slate-900/60 border border-slate-800/30 text-[8px] font-mono text-slate-400">{Number(p.dwt).toLocaleString()} DWT</span>}
                </div>
            )}

            {/* Quick Stats */}
            <div className="grid grid-cols-3 gap-2">
                <div className="bg-slate-900/40 rounded px-2.5 py-1.5 border border-slate-800/20">
                    <div className="text-[8px] text-slate-600 uppercase">Speed</div>
                    <div className="text-xs font-bold font-mono text-slate-200">{speed} kn</div>
                </div>
                <div className="bg-slate-900/40 rounded px-2.5 py-1.5 border border-slate-800/20">
                    <div className="text-[8px] text-slate-600 uppercase">Fuel</div>
                    <div className={cn("text-xs font-bold font-mono", fuel < 30 ? 'text-rose-400' : 'text-emerald-400')}>{fuel}%</div>
                </div>
                <div className="bg-slate-900/40 rounded px-2.5 py-1.5 border border-slate-800/20">
                    <div className="text-[8px] text-slate-600 uppercase">Risk</div>
                    <div className={cn("text-xs font-bold font-mono",
                        riskLevel === 'Critical' ? 'text-rose-400' : riskLevel === 'High' ? 'text-orange-400' : 'text-emerald-400'
                    )}>{riskLevel}</div>
                </div>
            </div>

            {/* Voyage Progress */}
            <div className="bg-slate-900/40 rounded-lg p-2.5 border border-slate-800/20">
                <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[9px] text-slate-500">Voyage</span>
                    <span className="text-[10px] text-cyan-400 font-mono font-bold">{String(p.sailedDays || 0)}/{String(p.planDays || 0)}d</span>
                </div>
                <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 rounded-full"
                        style={{ width: `${Math.min(100, ((Number(p.sailedDays) || 0) / (Number(p.planDays) || 1)) * 100)}%` }}
                    />
                </div>
                <div className="flex justify-between mt-1 text-[8px] text-slate-600 font-mono">
                    <span>{`${p.departurePort || '-'}`}</span>
                    <span>{destination}</span>
                </div>
            </div>
        </div>
    );
}

function PortWidget({ obj }: { obj: OntologyObject }) {
    const p = obj.properties;
    const waitDays = Number(p.baseWaitDays || 0);

    return (
        <div className="p-4 border-b border-slate-800/40">
            <h3 className="text-[9px] font-bold text-purple-500 uppercase tracking-widest mb-2.5 flex items-center gap-1.5">
                <Navigation size={10} /> Port Status
            </h3>
            <div className="grid grid-cols-2 gap-2 mb-3">
                <MiniCard label="Region" value={String(p.region || '-')} color="text-slate-200" />
                <MiniCard label="Wait" value={`${waitDays}d`} color={waitDays > 3 ? 'text-amber-400' : 'text-cyan-400'} />
            </div>
            <div className="bg-slate-900/40 rounded-lg p-2.5 border border-slate-800/20">
                <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] text-slate-500">Congestion</span>
                    <span className={cn('text-[10px] font-bold', waitDays > 3 ? 'text-amber-400' : 'text-emerald-400')}>
                        {waitDays > 3 ? '⚠ Congested' : '✓ Clear'}
                    </span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                        className={cn('h-full rounded-full', waitDays > 5 ? 'bg-rose-500' : waitDays > 3 ? 'bg-amber-500' : 'bg-cyan-500')}
                        style={{ width: `${Math.min(100, (waitDays / 7) * 100)}%` }}
                    />
                </div>
            </div>
        </div>
    );
}

function RiskEventWidget({ obj }: { obj: OntologyObject }) {
    const p = obj.properties;
    return (
        <div className="p-4 border-b border-slate-800/40">
            <h3 className="text-[9px] font-bold text-rose-500 uppercase tracking-widest mb-2.5 flex items-center gap-1.5">
                <Zap size={10} /> Risk Event
            </h3>
            <div className="grid grid-cols-2 gap-2">
                <MiniCard label="Category" value={String(p.category || '-')} color="text-slate-200" />
                <MiniCard label="Severity" value={String(p.severity || '-')} color={
                    p.severity === 'critical' ? 'text-rose-400' : p.severity === 'high' ? 'text-amber-400' : 'text-slate-300'
                } />
            </div>
        </div>
    );
}

function MarketIndicatorWidget({ obj }: { obj: OntologyObject }) {
    const p = obj.properties;
    return (
        <div className="p-4 border-b border-slate-800/40">
            <h3 className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest mb-2.5 flex items-center gap-1.5">
                <TrendingUp size={10} /> Market Indicator
            </h3>
            <div className="bg-slate-900/40 rounded-lg p-3 border border-slate-800/20">
                <div className="flex items-baseline gap-2">
                    <span className="text-lg font-bold text-slate-100 font-mono">
                        {String(p.basePrice || p.priceMilUsd || p.baseRate || '-')}
                    </span>
                    <span className="text-[10px] text-slate-500">{String(p.unit || p.code || '')}</span>
                </div>
                {p.volatility && <div className="text-[9px] text-slate-500 mt-1">Vol: <span className="text-amber-400 font-mono">{((Number(p.volatility || 0)) * 100).toFixed(1)}%</span></div>}
            </div>
        </div>
    );
}

// ============================================================
// SUB-COMPONENTS
// ============================================================
function MiniCard({ label, value, color }: { label: string; value: string; color: string }) {
    return (
        <div className="bg-slate-900/40 rounded px-2.5 py-1.5 border border-slate-800/20">
            <div className="text-[8px] text-slate-600 uppercase tracking-wider mb-0.5">{label}</div>
            <div className={cn('text-[10px] font-medium font-mono truncate', color)}>{value}</div>
        </div>
    );
}
