import React, { useState, useEffect } from 'react';
import { X, Ship, Anchor, Navigation, Fuel, Shield, FileText, TrendingUp, TrendingDown, AlertTriangle, Zap, DollarSign, Link2, Newspaper, BarChart3, Route as RouteIcon } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useOntologyStore } from '../../store/ontologyStore';
import ActionWizard, { getActionsForType } from './ActionWizard';
import { getCachedSanctionsCheck } from '../../services/maritimeIntegrationService';
import type { SanctionsResult } from '../../services/maritimeIntegrationService';
import type { OntologyObject, OntologyLink, OntologyActionType } from '../../types';

interface Object360PanelProps {
    objectId: string | null;
    onClose: () => void;
    onNavigate: (id: string) => void; // Navigate to a linked object in the graph
}

// ============================================================
// TYPE-SPECIFIC ICON MAP
// ============================================================
const TYPE_ICONS: Record<string, React.ReactNode> = {
    Vessel: <Ship size={16} className="text-cyan-400" />,
    Port: <Navigation size={16} className="text-purple-400" />,
    Route: <RouteIcon size={16} className="text-sky-400" />,
    Commodity: <Fuel size={16} className="text-amber-400" />,
    MacroEvent: <Zap size={16} className="text-rose-400" />,
    Market: <TrendingUp size={16} className="text-emerald-400" />,
    Insurance: <Shield size={16} className="text-orange-400" />,
    Currency: <DollarSign size={16} className="text-emerald-400" />,
    RiskFactor: <AlertTriangle size={16} className="text-rose-400" />,
    Scenario: <FileText size={16} className="text-sky-400" />,
    MarketIndicator: <BarChart3 size={16} className="text-emerald-400" />,
    RiskEvent: <AlertTriangle size={16} className="text-rose-400" />,
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
    MONITORS: '자산가치 모니터링',
    DEPENDS_ON: '의존',
    TRANSITS: '통항',
    OPERATES_ON: '운항',
    CONSUMES_FUEL: '연료 소비',
    EXPOSES_TO: '리스크 노출',
};

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

// Inner component with hooks (avoids conditional hook calls)
function Object360PanelInner({ obj, objectId, objects, links, onClose, onNavigate }: {
    obj: OntologyObject; objectId: string; objects: OntologyObject[]; links: any[]; onClose: () => void; onNavigate: (id: string) => void;
}) {
    const [activeActionType, setActiveActionType] = useState<OntologyActionType | null>(null);
    const availableActions = getActionsForType(obj.type);

    const riskScore = (obj.properties.riskScore as number) || 0;
    const riskTier = getRiskTier(riskScore);
    const riskStyle = RISK_COLORS[riskTier];

    // Get connected objects via links
    const connectedLinks = links.filter((l) => l.sourceId === objectId || l.targetId === objectId);
    const connectedObjects = connectedLinks.map((link) => {
        const otherId = link.sourceId === objectId ? link.targetId : link.sourceId;
        const otherObj = objects.find((o) => o.id === otherId);
        const direction = link.sourceId === objectId ? 'outgoing' : 'incoming';
        return { link, object: otherObj, direction };
    }).filter((c) => c.object);

    return (
        <div className="h-full w-[400px] shrink-0 bg-slate-900/95 backdrop-blur-xl border-l border-slate-700/50 flex flex-col overflow-hidden animate-slide-left shadow-2xl">
            {/* Header */}
            <div className="p-4 border-b border-slate-700/50 bg-slate-800/30">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        {TYPE_ICONS[obj.type] || <FileText size={16} className="text-slate-400" />}
                        <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-slate-700/50 text-slate-300 uppercase tracking-wider">
                            {obj.type}
                        </span>
                    </div>
                    <button onClick={onClose} className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-700/50 rounded-lg transition-colors">
                        <X size={16} />
                    </button>
                </div>
                <h2 className="text-lg font-bold text-slate-100 mb-1">{obj.title}</h2>
                {obj.description && (
                    <p className="text-xs text-slate-400 leading-relaxed">{obj.description}</p>
                )}

                {/* Risk Score Gauge */}
                <div className="mt-3 flex items-center gap-3">
                    <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Risk Score</span>
                            <span className={cn('text-xs font-bold font-mono', riskStyle.text)}>{riskScore}</span>
                        </div>
                        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
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
                    <span className={cn('px-2 py-1 rounded-lg text-[10px] font-bold uppercase border', riskStyle.bg, riskStyle.text, riskStyle.border)}>
                        {riskTier}
                    </span>
                </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {/* Type-Specific Embedded Widget */}
                <TypeSpecificWidget obj={obj} />

                {/* Actions Section */}
                {availableActions.length > 0 && (
                    <div className="p-4 border-b border-slate-800/50">
                        <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                            <Zap size={12} /> Actions
                            <span className="text-slate-600 font-mono">({availableActions.length})</span>
                        </h3>

                        {!activeActionType && (
                            <div className="space-y-1.5">
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
                                                'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg border bg-slate-800/20 transition-all text-left',
                                                colorMap[actionDef.color] || colorMap.cyan,
                                            )}
                                        >
                                            <span className="shrink-0">{actionDef.icon}</span>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-xs font-medium">{actionDef.labelKo}</div>
                                                <div className="text-[9px] text-slate-500 font-mono">{actionDef.type}</div>
                                            </div>
                                            <Zap size={12} className="text-slate-600 shrink-0" />
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
                <div className="p-4 border-b border-slate-800/50">
                    <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Properties</h3>
                    <div className="space-y-1.5">
                        {Object.entries(obj.properties)
                            .filter(([key]) => key !== 'riskScore')
                            .map(([key, value]) => (
                                <div key={key} className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-slate-800/30 hover:bg-slate-800/50 transition-colors">
                                    <span className="text-[11px] text-slate-400 font-mono">{key}</span>
                                    <span className="text-[11px] text-slate-200 font-mono font-medium max-w-[180px] truncate text-right">
                                        {String(value)}
                                    </span>
                                </div>
                            ))}
                    </div>
                </div>

                {/* Connected Objects */}
                <div className="p-4 border-b border-slate-800/50">
                    <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <Link2 size={12} /> Connections <span className="text-slate-600 font-mono">({connectedObjects.length})</span>
                    </h3>
                    <div className="space-y-2">
                        {connectedObjects.map(({ link, object: linkedObj, direction }) => {
                            if (!linkedObj) return null;
                            const linkedRisk = (linkedObj.properties.riskScore as number) || 0;
                            const linkedRiskTier = getRiskTier(linkedRisk);
                            const linkedRiskStyle = RISK_COLORS[linkedRiskTier];

                            return (
                                <button
                                    key={link.id}
                                    onClick={() => onNavigate(linkedObj.id)}
                                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-slate-800/30 hover:bg-slate-700/40 border border-slate-700/30 hover:border-slate-600/50 transition-all group text-left"
                                >
                                    <div className="shrink-0">
                                        {TYPE_ICONS[linkedObj.type] || <FileText size={14} className="text-slate-400" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-xs text-slate-200 font-medium truncate group-hover:text-white transition-colors">
                                            {linkedObj.title}
                                        </div>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <span className="text-[9px] text-slate-500">
                                                {direction === 'outgoing' ? '→' : '←'} {RELATION_LABELS[link.relationType] || link.relationType}
                                            </span>
                                            <span className="text-[9px] text-slate-600 font-mono">w:{link.weight.toFixed(2)}</span>
                                        </div>
                                    </div>
                                    <div className={cn('px-1.5 py-0.5 rounded text-[9px] font-bold font-mono', linkedRiskStyle.bg, linkedRiskStyle.text)}>
                                        {linkedRisk}
                                    </div>
                                </button>
                            );
                        })}
                        {connectedObjects.length === 0 && (
                            <div className="text-center py-4 text-xs text-slate-600 italic">연결된 객체가 없습니다</div>
                        )}
                    </div>
                </div>

                {/* Linked News */}
                <LinkedNewsSection objectId={objectId} />

                {/* Market Exposure */}
                <MarketExposureSection objectId={objectId} />

                {/* Metadata */}
                <div className="p-4">
                    <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Metadata</h3>
                    <div className="space-y-1.5 text-[10px] font-mono text-slate-500">
                        <div className="flex justify-between"><span>Source</span><span className="text-slate-400">{obj.metadata.source}</span></div>
                        <div className="flex justify-between"><span>Status</span><span className="text-slate-400">{obj.metadata.status}</span></div>
                        <div className="flex justify-between"><span>Created</span><span className="text-slate-400">{obj.metadata.createdAt.split('T')[0]}</span></div>
                        <div className="flex justify-between"><span>Updated</span><span className="text-slate-400">{obj.metadata.updatedAt.split('T')[0]}</span></div>
                    </div>
                </div>
            </div>
        </div>
    );
}


// ============================================================
// TYPE-SPECIFIC EMBEDDED WIDGETS
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

    // Sanctions check state
    const [sanctions, setSanctions] = useState<SanctionsResult | null>(null);

    useEffect(() => {
        const vesselName = obj.title.replace(/^[^\w]+/, '').trim();
        const imo = p.imo ? String(p.imo) : undefined;
        getCachedSanctionsCheck(vesselName, imo).then(setSanctions);
    }, [obj.title, p.imo]);

    // Resource levels
    const fuel = Number(p.fuel ?? 100);
    const freshWater = Number(p.freshWater ?? 100);
    const lubeOil = Number(p.lubeOil ?? 100);
    const crewCount = Number(p.crewCount ?? 0);
    const speed = Number(p.speed ?? p.avgSpeed ?? 0);
    const heading = Number(p.heading ?? 0);
    const destination = String(p.destination ?? p.destinationPort ?? '-');
    const eta = p.eta ? new Date(String(p.eta)).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';

    const getBarColor = (val: number, healthColor: string) =>
        val < 30 ? 'bg-rose-500 animate-pulse' : healthColor;

    const getTextColor = (val: number, healthColor: string) =>
        val < 30 ? 'text-rose-400' : healthColor;

    const sanctionsBadge = sanctions ? (
        sanctions.status === 'CLEAR'
            ? <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">✅ CLEAR</span>
            : sanctions.status === 'SANCTIONED'
                ? <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30 animate-pulse">🚫 SANCTIONED</span>
                : sanctions.status === 'PARTIAL_MATCH'
                    ? <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">⚠ PARTIAL ({sanctions.matchCount})</span>
                    : sanctions.status === 'ERROR'
                        ? <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-slate-500/15 text-slate-400 border border-slate-500/30">⚠ API Error</span>
                        : <span className="px-2 py-0.5 rounded-full text-[9px] text-slate-500">⏳ checking...</span>
    ) : <span className="px-2 py-0.5 rounded-full text-[9px] text-slate-500">⏳ checking...</span>;

    return (
        <div className="p-4 border-b border-slate-800/50 space-y-4">
            <h3 className="text-[10px] font-bold text-cyan-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                <Ship size={12} /> Vessel Status Dashboard
            </h3>

            {/* ── Sanctions Check Badge ── */}
            <div className="flex items-center justify-between bg-slate-800/30 rounded-lg px-3 py-2 border border-slate-700/30">
                <div className="flex items-center gap-2">
                    <Shield size={12} className="text-amber-400" />
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">OpenSanctions</span>
                </div>
                <div className="flex items-center gap-2">
                    {sanctionsBadge}
                    <button
                        onClick={async () => {
                            setSanctions(null);
                            const vesselName = obj.title.replace(/^[^\w]+/, '').trim();
                            const imo = p.imo ? String(p.imo) : undefined;
                            const result = await getCachedSanctionsCheck(vesselName, imo);
                            setSanctions(result);
                        }}
                        title="제재 재확인"
                        className="p-1 text-slate-500 hover:text-cyan-400 transition-colors"
                    >
                        🔄
                    </button>
                </div>
            </div>

            {/* ── Vessel Identity Chips (IMO / MMSI / Flag / Call Sign) ── */}
            {(p.imo || p.mmsi || p.flag || p.callSign) && (
                <div className="flex flex-wrap gap-1.5">
                    {p.imo && <span className="px-2 py-0.5 rounded bg-slate-800/60 border border-slate-700/30 text-[9px] font-mono text-slate-300">IMO {String(p.imo)}</span>}
                    {p.mmsi && <span className="px-2 py-0.5 rounded bg-slate-800/60 border border-slate-700/30 text-[9px] font-mono text-slate-300">MMSI {String(p.mmsi)}</span>}
                    {p.callSign && <span className="px-2 py-0.5 rounded bg-slate-800/60 border border-slate-700/30 text-[9px] font-mono text-slate-300">📡 {String(p.callSign)}</span>}
                    {p.flag && <span className="px-2 py-0.5 rounded bg-slate-800/60 border border-slate-700/30 text-[9px] text-slate-300">🏳️ {String(p.flag)}</span>}
                    {p.dwt && <span className="px-2 py-0.5 rounded bg-slate-800/60 border border-slate-700/30 text-[9px] font-mono text-slate-300">{Number(p.dwt).toLocaleString()} DWT</span>}
                    {p.yearBuilt && <span className="px-2 py-0.5 rounded bg-slate-800/60 border border-slate-700/30 text-[9px] font-mono text-slate-300">Built {String(p.yearBuilt)}</span>}
                </div>
            )}

            {/* ── Vessel Info Chips ── */}
            <div className="grid grid-cols-2 gap-2">
                <MiniCard label="선종" value={String(p.vesselType || '-')} color="text-slate-200" />
                <MiniCard label="Risk Level" value={riskLevel} color={
                    riskLevel === 'Critical' ? 'text-rose-400' : riskLevel === 'High' ? 'text-orange-400' : riskLevel === 'Medium' ? 'text-amber-400' : 'text-emerald-400'
                } />
                <MiniCard label="CII 등급" value={String(p.ciiRating || '-')} color={
                    p.ciiRating === 'A' ? 'text-emerald-400' : p.ciiRating === 'B' ? 'text-cyan-400' : p.ciiRating === 'C' ? 'text-amber-400' : 'text-rose-400'
                } />
                <MiniCard label="F.O. ROB" value={`${Number(p.foRob || 0).toLocaleString()} mt`} color="text-slate-200" />
            </div>

            {/* ── Resource Level Progress Bars ── */}
            <div className="space-y-3 bg-slate-800/30 rounded-xl p-3 border border-slate-700/30">
                <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                    <Fuel size={10} /> 선박 소모품 잔량 (Consumables)
                </div>

                {/* Fuel */}
                <div>
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-slate-400 flex items-center gap-1">⛽ Fuel (Bunker)</span>
                        <div className="flex items-center gap-1.5">
                            {fuel < 30 && <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-400 font-bold animate-pulse border border-rose-500/30">⚠ CRITICAL</span>}
                            <span className={cn('text-xs font-bold font-mono', getTextColor(fuel, 'text-emerald-400'))}>{fuel}%</span>
                        </div>
                    </div>
                    <div className="h-2.5 bg-slate-700 rounded-full overflow-hidden">
                        <div className={cn('h-full rounded-full transition-all duration-700', getBarColor(fuel, 'bg-emerald-500'))} style={{ width: `${fuel}%` }} />
                    </div>
                </div>

                {/* Fresh Water */}
                <div>
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-slate-400 flex items-center gap-1">💧 Fresh Water</span>
                        <div className="flex items-center gap-1.5">
                            {freshWater < 30 && <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-400 font-bold animate-pulse border border-rose-500/30">⚠ CRITICAL</span>}
                            <span className={cn('text-xs font-bold font-mono', getTextColor(freshWater, 'text-cyan-400'))}>{freshWater}%</span>
                        </div>
                    </div>
                    <div className="h-2.5 bg-slate-700 rounded-full overflow-hidden">
                        <div className={cn('h-full rounded-full transition-all duration-700', getBarColor(freshWater, 'bg-cyan-500'))} style={{ width: `${freshWater}%` }} />
                    </div>
                </div>

                {/* Lube Oil */}
                <div>
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-slate-400 flex items-center gap-1">🛢️ Lube Oil</span>
                        <div className="flex items-center gap-1.5">
                            {lubeOil < 30 && <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-400 font-bold animate-pulse border border-rose-500/30">⚠ CRITICAL</span>}
                            <span className={cn('text-xs font-bold font-mono', getTextColor(lubeOil, 'text-blue-400'))}>{lubeOil}%</span>
                        </div>
                    </div>
                    <div className="h-2.5 bg-slate-700 rounded-full overflow-hidden">
                        <div className={cn('h-full rounded-full transition-all duration-700', getBarColor(lubeOil, 'bg-blue-500'))} style={{ width: `${lubeOil}%` }} />
                    </div>
                </div>
            </div>

            {/* ── Crew / Speed / Heading Chips ── */}
            <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800/50 border border-slate-700/30">
                    <Ship size={12} className="text-cyan-400" />
                    <span className="text-[10px] text-slate-400">승선원</span>
                    <span className="text-xs font-bold text-slate-200 font-mono">{crewCount}명</span>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800/50 border border-slate-700/30">
                    <Navigation size={12} className="text-emerald-400" />
                    <span className="text-[10px] text-slate-400">속도</span>
                    <span className="text-xs font-bold text-slate-200 font-mono">{speed} kn</span>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800/50 border border-slate-700/30">
                    <Navigation size={12} className="text-amber-400" style={{ transform: `rotate(${heading}deg)` }} />
                    <span className="text-[10px] text-slate-400">기수</span>
                    <span className="text-xs font-bold text-slate-200 font-mono">{heading}°</span>
                </div>
            </div>

            {/* ── Voyage Progress ── */}
            <div className="bg-slate-800/30 rounded-xl p-3 border border-slate-700/30">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-slate-400">항해 진행</span>
                    <span className="text-xs text-cyan-400 font-mono font-bold">{String(p.sailedDays || 0)}/{String(p.planDays || 0)}d</span>
                </div>
                <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, ((Number(p.sailedDays) || 0) / (Number(p.planDays) || 1)) * 100)}%` }}
                    />
                </div>
                <div className="flex justify-between mt-1.5 text-[9px] text-slate-500 font-mono">
                    <span>{`${p.departurePort || '-'}`}</span>
                    <span>{destination}</span>
                </div>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-700/30">
                    <span className="text-[10px] text-slate-400 flex items-center gap-1"><Anchor size={10} /> ETA</span>
                    <span className="text-xs font-medium text-slate-200 font-mono">{eta}</span>
                </div>
            </div>
        </div>
    );
}

function PortWidget({ obj }: { obj: OntologyObject }) {
    const p = obj.properties;
    const waitDays = Number(p.baseWaitDays || 0);

    return (
        <div className="p-4 border-b border-slate-800/50">
            <h3 className="text-[10px] font-bold text-purple-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                <Navigation size={12} /> Port Congestion
            </h3>
            <div className="grid grid-cols-2 gap-2">
                <MiniCard label="Region" value={String(p.region || '-')} color="text-slate-200" />
                <MiniCard label="Base Wait" value={`${waitDays}d`} color={waitDays > 3 ? 'text-amber-400' : 'text-cyan-400'} />
                <MiniCard label="위도" value={String(p.latitude || '-')} color="text-slate-400" />
                <MiniCard label="경도" value={String(p.longitude || '-')} color="text-slate-400" />
            </div>
            <div className="mt-3 bg-slate-800/50 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-slate-500">혼잡도</span>
                    <span className={cn('text-xs font-bold font-mono', waitDays > 3 ? 'text-amber-400' : 'text-emerald-400')}>
                        {waitDays > 3 ? '⚠ 혼잡' : '✓ 원활'}
                    </span>
                </div>
                <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
                    <div
                        className={cn('h-full rounded-full transition-all duration-500', waitDays > 5 ? 'bg-rose-500' : waitDays > 3 ? 'bg-amber-500' : 'bg-cyan-500')}
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
        <div className="p-4 border-b border-slate-800/50">
            <h3 className="text-[10px] font-bold text-rose-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                <Zap size={12} /> Risk Event
            </h3>
            <div className="grid grid-cols-2 gap-2">
                <MiniCard label="Category" value={String(p.category || '-')} color="text-slate-200" />
                <MiniCard label="Severity" value={String(p.severity || '-')} color={
                    p.severity === 'critical' ? 'text-rose-400' : p.severity === 'high' ? 'text-amber-400' : 'text-slate-300'
                } />
                <MiniCard label="Impact" value={String(p.baseImpact || p.supplyChainImpact || 0)} color="text-amber-400" />
                <MiniCard label="Energy" value={`${p.energyImpact || 0}%`} color="text-orange-400" />
            </div>
            <div className="mt-3 space-y-2">
                <ImpactBar label="영향도" value={Number(p.baseImpact || p.supplyChainImpact || 0)} color="amber" />
                <ImpactBar label="리스크 점수" value={Number(p.riskScore || 0)} color="rose" />
            </div>
        </div>
    );
}

function MarketIndicatorWidget({ obj }: { obj: OntologyObject }) {
    const p = obj.properties;
    const change = Number(p.wowChangePct || p.weeklyChange || 0);
    return (
        <div className="p-4 border-b border-slate-800/50">
            <h3 className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                <TrendingUp size={12} /> Market Indicator
            </h3>
            <div className="bg-slate-800/50 rounded-lg p-4">
                <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-slate-100 font-mono">
                        {String(p.basePrice || p.priceMilUsd || p.baseRate || '-')}
                    </span>
                    <span className="text-sm text-slate-400">{String(p.unit || p.code || '')}</span>
                </div>
                {change !== 0 && (
                    <div className={cn('flex items-center gap-0.5 text-sm font-bold font-mono mt-1', change >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                        {change >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                        {typeof change === 'string' ? change : `${change >= 0 ? '+' : ''}${change}%`}
                    </div>
                )}
                {p.volatility && <div className="mt-2 text-xs text-slate-500">변동성: <span className="text-amber-400 font-mono">{((Number(p.volatility || 0)) * 100).toFixed(1)}%</span></div>}
                {p.issuer && <div className="mt-2 text-xs text-slate-400">발행자: {String(p.issuer)}</div>}
                {p.sentiment && <div className="text-xs text-slate-400 mt-1">{String(p.sentiment)}</div>}
            </div>
        </div>
    );
}

// ============================================================
// SUB-COMPONENTS
// ============================================================

function MiniCard({ label, value, color }: { label: string; value: string; color: string }) {
    return (
        <div className="bg-slate-800/40 rounded-lg px-3 py-2 border border-slate-700/20">
            <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-0.5">{label}</div>
            <div className={cn('text-xs font-medium font-mono truncate', color)}>{value}</div>
        </div>
    );
}

function ImpactBar({ label, value, color }: { label: string; value: number; color: string }) {
    const colorMap: Record<string, string> = {
        amber: 'bg-amber-500',
        orange: 'bg-orange-500',
        rose: 'bg-rose-500',
        cyan: 'bg-cyan-500',
        emerald: 'bg-emerald-500',
    };

    return (
        <div className="mt-2">
            <div className="flex items-center justify-between mb-0.5">
                <span className="text-[9px] text-slate-500">{label}</span>
                <span className="text-[9px] text-slate-400 font-mono">{value}%</span>
            </div>
            <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div className={cn('h-full rounded-full transition-all duration-500', colorMap[color] || 'bg-slate-500')} style={{ width: `${Math.min(100, value)}%` }} />
            </div>
        </div>
    );
}

// ============================================================
// LINKED NEWS SECTION
// ============================================================
function LinkedNewsSection({ objectId }: { objectId: string }) {
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
    }).slice(0, 5);

    if (matched.length === 0) return null;

    return (
        <div className="p-4 border-b border-slate-800/50">
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                <Newspaper size={12} /> Linked Intel <span className="text-slate-600 font-mono">({matched.length})</span>
            </h3>
            <div className="space-y-1.5">
                {matched.map(a => (
                    <div key={a.id} className="px-3 py-2 rounded-lg bg-slate-800/30 hover:bg-slate-800/50 transition-colors">
                        <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="text-[9px]">{a.sourceBadge || '📰'}</span>
                            <span className="text-[9px] text-slate-500">{a.source}</span>
                            <span className={cn("ml-auto text-[8px] px-1 py-0.5 rounded font-bold",
                                a.riskLevel === 'Critical' ? 'bg-rose-500/15 text-rose-400' :
                                    a.riskLevel === 'High' ? 'bg-amber-500/15 text-amber-400' :
                                        'bg-slate-700/50 text-slate-400'
                            )}>{a.riskLevel}</span>
                        </div>
                        <div className="text-[10px] text-slate-300 line-clamp-2 leading-tight">{a.title}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ============================================================
// MARKET EXPOSURE SECTION
// ============================================================
function MarketExposureSection({ objectId }: { objectId: string }) {
    const objects = useOntologyStore(s => s.objects);
    const links = useOntologyStore(s => s.links);
    const quantMetrics = useOntologyStore(s => s.lsegQuantMetrics);
    const quotes = useOntologyStore(s => s.lsegMarketQuotes);

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
    if (linkedMarkets.length === 0) return null;

    return (
        <div className="p-4 border-b border-slate-800/50">
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                <BarChart3 size={12} /> Market Exposure <span className="text-slate-600 font-mono">({linkedMarkets.length})</span>
            </h3>
            <div className="space-y-2">
                {linkedMarkets.map(m => {
                    const ric = String(m.properties.ric || m.properties.symbol || '');
                    const metric = ric ? quantMetrics[ric] : undefined;
                    const quote = quotes.find(q => q.symbol === ric);
                    const isAlert = metric?.riskAlert;

                    return (
                        <div key={m.id} className={cn(
                            "px-3 py-2 rounded-lg border transition-colors",
                            isAlert ? "bg-rose-950/20 border-rose-500/30" : "bg-slate-800/30 border-slate-700/20"
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
        </div>
    );
}

