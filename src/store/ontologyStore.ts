import { create } from 'zustand';
import type {
    Scenario,
    SimulationParams,
    ChartDataPoint,
    FleetVessel,
    BrokerReport,
    InsuranceCircular,
    OntologyObject,
    OntologyLink,
    OntologyAction,
    OntologyObjectType,
    IntelArticle,
    BEVIState,
    BEVIHistoryEntry,
    QuantMetrics,
    AIPExecutiveBriefing,
} from '../types';
import { computeScenarioBranch } from '../lib/utils';
import {
    BASE_SCENARIOS,
    BASE_VULNERABILITY_DATA,
    BROKER_REPORTS,
    INSURANCE_CIRCULARS,
    ONTOLOGY_OBJECTS,
    ONTOLOGY_LINKS,
} from '../data/mockData';
import { fetchMarketDataWithFallback, mapLSEGQuotesToScenarioParams, type MarketDataSource } from '../services/lsegMarketService';
import type { MarketQuote } from '../services/marketDataService';
import { scanHeadlinesForRisk } from '../lib/sentimentScanner';
import { fetchLSEGNewsHeadlines } from '../services/newsService';

// ============================================================
// CALCULATION HELPERS (moved from App.tsx for centralization)
// ============================================================

function calculateDynamicChartData(params: SimulationParams): ChartDataPoint[] {
    const { newsSentimentScore, awrpRate, vlsfoPrice } = params;
    const supplyChain = (params.supplyChainStress as number) || 10;
    const cyber = (params.cyberThreatLevel as number) || 5;
    const disaster = (params.naturalDisasterIndex as number) || 0;
    const pandemic = (params.pandemicRisk as number) || 0;
    const tradeWar = (params.tradeWarIntensity as number) || 5;
    const energy = (params.energyCrisisLevel as number) || 10;

    const compositeVolatility =
        newsSentimentScore * 0.2 +
        supplyChain * 0.15 +
        energy * 0.15 +
        tradeWar * 0.12 +
        cyber * 0.1 +
        pandemic * 0.1 +
        disaster * 0.08 +
        Math.min(100, vlsfoPrice / 15) * 0.05 +
        Math.min(100, awrpRate * 400) * 0.05;

    const spreadMultiplier = 1 + (compositeVolatility / 100) * 4.0;

    return BASE_VULNERABILITY_DATA.map((point) => {
        const baseSpread = (point.WS_High - point.WS_Low) / 2;
        const adjustedHigh = point.Base_WS + baseSpread * spreadMultiplier;
        const adjustedLow = Math.max(point.Base_WS - baseSpread * spreadMultiplier * 0.8, 0);
        const adjustedSentiment = Math.min(
            100,
            point.News_Sentiment_Score * 0.25 + compositeVolatility * 0.75,
        );

        return {
            date: point.date,
            Base_WS: point.Base_WS + (compositeVolatility > 50 ? (compositeVolatility - 50) * 0.5 : 0),
            WS_High: Math.round(adjustedHigh * 10) / 10,
            WS_Low: Math.round(adjustedLow * 10) / 10,
            News_Sentiment_Score: Math.round(adjustedSentiment),
            Spread: Math.round((adjustedHigh - adjustedLow) * 10) / 10,
        };
    });
}

function calculateDynamicFleetData(params: SimulationParams, baseFleet: FleetVessel[]): FleetVessel[] {
    const { newsSentimentScore, awrpRate } = params;

    return baseFleet.map((vessel) => {
        const isMiddleEast =
            vessel.location.toLowerCase().includes('hormuz') ||
            vessel.location.toLowerCase().includes('middle east') ||
            vessel.location.toLowerCase().includes('persian gulf') ||
            vessel.location.toLowerCase().includes('fujairah') ||
            vessel.location.toLowerCase().includes('oman');

        let riskLevel = vessel.riskLevel;

        if (isMiddleEast) {
            if (awrpRate > 0.1 || newsSentimentScore > 80) {
                riskLevel = 'Critical';
            } else if (awrpRate > 0.05 || newsSentimentScore > 50) {
                riskLevel = 'High';
            }
        }

        if (!isMiddleEast && newsSentimentScore > 90) {
            if (riskLevel === 'Low') riskLevel = 'Medium';
        }

        return { ...vessel, riskLevel };
    });
}

// ============================================================
// BEVI CALCULATION ENGINE
// ============================================================

const BEVI_HISTORY_MAX = 50;
const BEVI_TREND_THRESHOLD = 1; // ±1 point = stable
const BEVI_UPDATE_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

/** Module-level dirty flag — set by any ontology mutation, flushed by interval */
let _beviDirty = false;
let _beviLastCalcAt = 0;

/** Macro/Geo risk types — BEVI component 1 (weight 40%) */
const MACRO_TYPES: Set<string> = new Set(['RiskFactor', 'Commodity', 'Insurance', 'MacroEvent']);
/** Asset/Supply chain types — BEVI component 2 (weight 30%) */
const ASSET_TYPES: Set<string> = new Set(['Port', 'Vessel']);

interface BEVIComponentResult {
    macroRiskAvg: number;
    assetRiskAvg: number;
    intelShockAvg: number;
    topFactor: string;
    value: number;
}

function calculateBEVIComponents(
    objects: OntologyObject[],
    intelArticles: IntelArticle[],
): BEVIComponentResult {
    // ── Component 1: Macro/Geo Risk (40%) ──
    const macroNodes = objects.filter(o =>
        o.metadata.status === 'active' && MACRO_TYPES.has(o.type),
    );
    const macroScores = macroNodes
        .map(o => Number(o.properties.riskScore) || 0)
        .filter(s => s > 0);
    const macroRiskAvg = macroScores.length > 0
        ? macroScores.reduce((a, b) => a + b, 0) / macroScores.length
        : 0;

    // ── Component 2: Asset/Supply Chain Risk (30%) ──
    const assetNodes = objects.filter(o =>
        o.metadata.status === 'active' && ASSET_TYPES.has(o.type),
    );
    const assetScores = assetNodes
        .map(o => Number(o.properties.riskScore) || 0)
        .filter(s => s > 0);
    const assetRiskAvg = assetScores.length > 0
        ? assetScores.reduce((a, b) => a + b, 0) / assetScores.length
        : 0;

    // ── Component 3: Real-time Intelligence Shock (30%) ──
    const evaluatedArticles = intelArticles.filter(
        a => a.evaluated && !a.dropped && typeof a.impactScore === 'number',
    );
    const intelScores = evaluatedArticles.map(a => a.impactScore!);
    const intelShockAvg = intelScores.length > 0
        ? intelScores.reduce((a, b) => a + b, 0) / intelScores.length
        : 0;

    // ── BEVI = Weighted Average ──
    const value = Math.round(
        macroRiskAvg * 0.4 +
        assetRiskAvg * 0.3 +
        intelShockAvg * 0.3,
    );
    const clampedValue = Math.max(0, Math.min(100, value));

    // ── Top Factor ──
    let topFactor = '데이터 수집 중...';
    const components = [
        { label: '거시/지정학 리스크', avg: macroRiskAvg },
        { label: '자산/공급망 리스크', avg: assetRiskAvg },
        { label: '실시간 인텔리전스', avg: intelShockAvg },
    ];
    const top = components.reduce((a, b) => (a.avg >= b.avg ? a : b));

    // Find the specific node/article with highest score in that pillar
    if (top.label === '거시/지정학 리스크' && macroNodes.length > 0) {
        const worst = macroNodes.reduce((a, b) =>
            (Number(a.properties.riskScore) || 0) >= (Number(b.properties.riskScore) || 0) ? a : b,
        );
        topFactor = `견인 요인: ${worst.title} (${worst.properties.riskScore}점)`;
    } else if (top.label === '자산/공급망 리스크' && assetNodes.length > 0) {
        const worst = assetNodes.reduce((a, b) =>
            (Number(a.properties.riskScore) || 0) >= (Number(b.properties.riskScore) || 0) ? a : b,
        );
        topFactor = `견인 요인: ${worst.title} (${worst.properties.riskScore}점)`;
    } else if (top.label === '실시간 인텔리전스' && evaluatedArticles.length > 0) {
        const worst = evaluatedArticles.reduce((a, b) =>
            (a.impactScore || 0) >= (b.impactScore || 0) ? a : b,
        );
        topFactor = `견인 요인: ${worst.title.slice(0, 40)}… (⚡${worst.impactScore})`;
    }

    return { macroRiskAvg: Math.round(macroRiskAvg * 10) / 10, assetRiskAvg: Math.round(assetRiskAvg * 10) / 10, intelShockAvg: Math.round(intelShockAvg * 10) / 10, topFactor, value: clampedValue };
}

function deriveNewBEVI(prev: BEVIState, objects: OntologyObject[], intelArticles: IntelArticle[]): BEVIState {
    const { macroRiskAvg, assetRiskAvg, intelShockAvg, topFactor, value } = calculateBEVIComponents(objects, intelArticles);
    const delta = value - prev.value;
    const trend: BEVIState['trend'] =
        delta > BEVI_TREND_THRESHOLD ? 'up' :
            delta < -BEVI_TREND_THRESHOLD ? 'down' : 'stable';

    const now = new Date().toISOString();
    const newEntry: BEVIHistoryEntry = { timestamp: now, value };
    const history = [...prev.history, newEntry].slice(-BEVI_HISTORY_MAX);

    return {
        value,
        previousValue: prev.value,
        trend,
        delta,
        topFactor,
        macroRiskAvg,
        assetRiskAvg,
        intelShockAvg,
        history,
        lastCalculatedAt: now,
    };
}

const INITIAL_BEVI: BEVIState = {
    value: 0,
    previousValue: 0,
    trend: 'stable',
    delta: 0,
    topFactor: '초기화 중...',
    macroRiskAvg: 0,
    assetRiskAvg: 0,
    intelShockAvg: 0,
    history: [],
    lastCalculatedAt: new Date().toISOString(),
};

// ============================================================
// ONTOLOGY → LEGACY MAPPERS (backward-compat selectors)
// ============================================================

/** Map Vessel-type OntologyObjects back to the FleetVessel interface */
function mapOntologyToFleetVessels(objects: OntologyObject[]): FleetVessel[] {
    return objects
        .filter((o) => o.type === 'Vessel' && o.metadata.status === 'active')
        .map((o) => {
            const p = o.properties;
            let riskLevel: FleetVessel['riskLevel'] = 'Low';
            const rs = (p.riskScore as number) || 0;
            if (rs > 80) riskLevel = 'Critical';
            else if (rs > 50) riskLevel = 'Medium';
            else if (rs > 30) riskLevel = 'Medium';

            return {
                vessel_name: o.title,
                vessel_type: String(p.vesselType || '-'),
                location: String(p.location || '-'),
                riskLevel,
                voyage_info: {
                    departure_port: String(p.departurePort || '-'),
                    destination_port: String(p.destinationPort || '-'),
                    sailed_days: Number(p.sailedDays || 0),
                    plan_days: Number(p.planDays || 0),
                    last_report_type: String(p.lastReportType || '-'),
                    last_report_time: String(p.lastReportTime || ''),
                    timezone: String(p.timezone || 'UTC'),
                },
                speed_and_weather_metrics: {
                    avg_speed: Number(p.avgSpeed || 0),
                    speed_cp: Number(p.speedCp || 0),
                    speed_diff: Number(p.speedDiff || 0),
                    avg_speed_good_wx: Number(p.avgSpeedGoodWx || 0),
                    still_water_avg_speed_good_wx: Number(p.stillWaterAvgSpeedGoodWx || 0),
                    avg_curf: Number(p.avgCurf || 0),
                    avg_wxf: Number(p.avgWxf || 0),
                },
                consumption_and_rob: {
                    avg_ifo: Number(p.avgIfo || 0),
                    ifo_cp: Number(p.ifoCp || 0),
                    ifo_diff: Number(p.ifoDiff || 0),
                    fo_rob: Number(p.foRob || 0),
                    lo_rob: Number(p.loRob || 0),
                    fw_rob: Number(p.fwRob || 0),
                    total_consumed: Number(p.totalConsumed || 0),
                },
                compliance: {
                    cii_rating: String(p.ciiRating || '-'),
                    cii_trend: String(p.ciiTrend || '-'),
                },
            };
        });
}

/** Map Market-type OntologyObjects back to BrokerReport interface */
function mapOntologyToBrokerReports(objects: OntologyObject[]): BrokerReport[] {
    return objects
        .filter((o) => o.type === 'Market' && o.metadata.status === 'active')
        .map((o) => ({
            source: String(o.properties.source || '-'),
            date: o.metadata.updatedAt.split('T')[0],
            asset_class: String(o.properties.assetClass || '-'),
            current_price_mil_usd: Number(o.properties.priceMilUsd || 0),
            wow_change_pct: String(Number(o.properties.wowChangePct || 0) > 0 ? `+${o.properties.wowChangePct}` : o.properties.wowChangePct),
            market_sentiment: String(o.properties.sentiment || '-'),
        }));
}

/** Map Insurance-type OntologyObjects back to InsuranceCircular interface */
function mapOntologyToInsuranceCirculars(objects: OntologyObject[]): InsuranceCircular[] {
    return objects
        .filter((o) => o.type === 'Insurance' && o.metadata.status === 'active')
        .map((o) => ({
            issuer: String(o.properties.issuer || '-'),
            date: String(o.properties.effectiveDate || o.metadata.updatedAt.split('T')[0]),
            title: o.title,
            impact: o.description || '-',
        }));
}


// ============================================================
// QUANT-ONTOLOGY DERIVED STATE ENGINE (Module 2)
// ============================================================

interface DerivedRiskUpdate {
    objectId: string;
    property: string;
    value: string | number | boolean;
}

/**
 * Cross-references LSEG QuantMetrics (market anomalies) with physical fleet data
 * to compute derived risk states:
 * - bunkerCostRisk: 'High' when VLSFO Z-Score signals anomaly AND vessel is on long voyage
 * - estimatedMargin: decreases when BDI/SCFI Z-Scores are negative (freight rate decline)
 * - riskScore: adjusted upward for vessels linked to risk-alerted market indicators
 */
function computeDerivedRiskStates(
    objects: OntologyObject[],
    quantMetrics: Record<string, QuantMetrics>,
    links: OntologyLink[],
): DerivedRiskUpdate[] {
    const updates: DerivedRiskUpdate[] = [];

    const vlsfoMetrics = quantMetrics['VLSFO380'];
    const bdiMetrics = quantMetrics['BADI'];
    const scfiMetrics = quantMetrics['SCFI'];
    const brentMetrics = quantMetrics['LCOc1'];

    // Build a linkage map: objectId → set of linked objectIds
    const linkMap = new Map<string, Set<string>>();
    for (const link of links) {
        if (!linkMap.has(link.sourceId)) linkMap.set(link.sourceId, new Set());
        if (!linkMap.has(link.targetId)) linkMap.set(link.targetId, new Set());
        linkMap.get(link.sourceId)!.add(link.targetId);
        linkMap.get(link.targetId)!.add(link.sourceId);
    }

    // Identify which market indicator ontology objects have riskAlert
    const alertedMarketIds = new Set<string>();
    for (const obj of objects) {
        if (obj.type === 'Commodity' || obj.type === 'Market') {
            // Check if any quant metric associated with this object has riskAlert
            const ric = String(obj.properties.ric || obj.properties.symbol || '');
            if (ric && quantMetrics[ric]?.riskAlert) {
                alertedMarketIds.add(obj.id);
            }
        }
    }

    const vessels = objects.filter(o => o.type === 'Vessel' && o.metadata.status === 'active');

    for (const vessel of vessels) {
        const planDays = Number(vessel.properties.planDays || 0);
        const sailedDays = Number(vessel.properties.sailedDays || 0);
        const currentRisk = Number(vessel.properties.riskScore || 0);
        const isLongVoyage = planDays > 20 || sailedDays > 15;

        // ── Bunker Cost Risk ──
        // VLSFO price anomaly + long voyage = high bunker cost exposure
        if (vlsfoMetrics?.riskAlert || brentMetrics?.riskAlert) {
            if (isLongVoyage) {
                updates.push({ objectId: vessel.id, property: 'bunkerCostRisk', value: 'High' });
                // Boost risk score for fuel-exposed vessels
                const fuelRiskBoost = Math.min(20, Math.abs(vlsfoMetrics?.zScore || brentMetrics?.zScore || 0) * 5);
                if (currentRisk + fuelRiskBoost > currentRisk) {
                    updates.push({ objectId: vessel.id, property: 'riskScore', value: Math.min(100, Math.round(currentRisk + fuelRiskBoost)) });
                }
            } else {
                updates.push({ objectId: vessel.id, property: 'bunkerCostRisk', value: 'Medium' });
            }
        } else {
            updates.push({ objectId: vessel.id, property: 'bunkerCostRisk', value: 'Low' });
        }

        // ── Estimated Margin ──
        // Freight index decline (negative Z-Score) → margin squeeze
        const freightZScore = bdiMetrics?.zScore ?? scfiMetrics?.zScore ?? 0;
        const baseMargin = Number(vessel.properties.estimatedMargin || 15); // default 15%
        let adjustedMargin = baseMargin;

        if (freightZScore < -1.0) {
            // Significant freight decline: reduce margin proportionally
            adjustedMargin = Math.max(0, baseMargin + freightZScore * 3); // each Z-unit = ~3% margin impact
        } else if (freightZScore > 1.0) {
            // Freight surge: margin improvement
            adjustedMargin = Math.min(40, baseMargin + freightZScore * 2);
        }
        updates.push({ objectId: vessel.id, property: 'estimatedMargin', value: Math.round(adjustedMargin * 10) / 10 });

        // ── Risk propagation via ontology links ──
        // If this vessel is linked to an alerted market indicator, boost its riskScore
        const linkedIds = linkMap.get(vessel.id);
        if (linkedIds) {
            const linkedAlertCount = [...linkedIds].filter(id => alertedMarketIds.has(id)).length;
            if (linkedAlertCount > 0) {
                const linkBoost = Math.min(15, linkedAlertCount * 8);
                const existingRisk = Number(vessel.properties.riskScore || 0);
                updates.push({
                    objectId: vessel.id,
                    property: 'riskScore',
                    value: Math.min(100, Math.round(existingRisk + linkBoost)),
                });
            }
        }
    }

    return updates;
}

// ============================================================
// HIGH-RISK VESSEL SELECTOR (Module 2)
// ============================================================

export interface HighRiskVesselEntry {
    vessel: OntologyObject;
    exposedRisks: {
        ric: string;
        zScore: number;
        metric: string; // e.g. 'VLSFO Price Anomaly', 'BDI Decline'
    }[];
    bunkerCostRisk: string;
    estimatedMargin: number;
}

function selectHighRiskVesselsFromState(
    objects: OntologyObject[],
    links: OntologyLink[],
    quantMetrics: Record<string, QuantMetrics>,
): HighRiskVesselEntry[] {
    const alertedRics = Object.entries(quantMetrics)
        .filter(([, m]) => m.riskAlert)
        .map(([ric, m]) => ({ ric, zScore: m.zScore }));

    if (alertedRics.length === 0) return [];

    // Map metric RIC to human-readable name
    const metricNames: Record<string, string> = {
        'LCOc1': 'Brent Crude Anomaly',
        'VLSFO380': 'VLSFO Bunker Price Anomaly',
        'BADI': 'Baltic Dry Index Anomaly',
        'SCFI': 'SCFI Container Freight Anomaly',
        'KRW=': 'USD/KRW Exchange Rate Anomaly',
    };

    // Find market/commodity objects that correspond to alerted RICs
    const alertedObjectIds = new Set<string>();
    for (const obj of objects) {
        const ric = String(obj.properties.ric || obj.properties.symbol || '');
        if (ric && quantMetrics[ric]?.riskAlert) {
            alertedObjectIds.add(obj.id);
        }
    }

    // Build linkage: find vessels connected to alerted objects
    const vesselRiskMap = new Map<string, Set<string>>(); // vesselId → set of alerted objectIds
    for (const link of links) {
        if (alertedObjectIds.has(link.sourceId)) {
            const target = objects.find(o => o.id === link.targetId);
            if (target?.type === 'Vessel') {
                if (!vesselRiskMap.has(target.id)) vesselRiskMap.set(target.id, new Set());
                vesselRiskMap.get(target.id)!.add(link.sourceId);
            }
        }
        if (alertedObjectIds.has(link.targetId)) {
            const source = objects.find(o => o.id === link.sourceId);
            if (source?.type === 'Vessel') {
                if (!vesselRiskMap.has(source.id)) vesselRiskMap.set(source.id, new Set());
                vesselRiskMap.get(source.id)!.add(link.targetId);
            }
        }
    }

    // Also include all vessels if critical market-wide alerts exist (VLSFO/BDI affect entire fleet)
    const fleetWideAlerts = alertedRics.filter(r => ['VLSFO380', 'BADI', 'SCFI'].includes(r.ric));
    if (fleetWideAlerts.length > 0) {
        const allVessels = objects.filter(o => o.type === 'Vessel' && o.metadata.status === 'active');
        for (const v of allVessels) {
            if (!vesselRiskMap.has(v.id)) vesselRiskMap.set(v.id, new Set());
        }
    }

    // Build results
    const results: HighRiskVesselEntry[] = [];
    for (const [vesselId] of vesselRiskMap) {
        const vessel = objects.find(o => o.id === vesselId);
        if (!vessel) continue;

        const exposedRisks = alertedRics.map(({ ric, zScore }) => ({
            ric,
            zScore,
            metric: metricNames[ric] || `${ric} Anomaly`,
        }));

        results.push({
            vessel,
            exposedRisks,
            bunkerCostRisk: String(vessel.properties.bunkerCostRisk || 'Unknown'),
            estimatedMargin: Number(vessel.properties.estimatedMargin || 0),
        });
    }

    // Sort by highest combined Z-score exposure
    results.sort((a, b) => {
        const aMax = Math.max(...a.exposedRisks.map(r => Math.abs(r.zScore)));
        const bMax = Math.max(...b.exposedRisks.map(r => Math.abs(r.zScore)));
        return bMax - aMax;
    });

    return results;
}

// ============================================================
// STORE INTERFACE
// ============================================================

interface OntologyState {
    // ---- Graph Data ----
    objects: OntologyObject[];
    links: OntologyLink[];
    actionLog: OntologyAction[];

    // ---- BEVI (Business Environment Volatility Index) ----
    bevi: BEVIState;
    intelArticles: IntelArticle[];

    // ---- Application State ----
    scenarios: Scenario[];
    activeScenarioId: string;
    simulationParams: SimulationParams;
    dynamicChartData: ChartDataPoint[];
    dynamicFleetData: FleetVessel[];

    // ---- LSEG Data Source State ----
    lsegDataSource: 'live' | 'demo';
    lsegIsLoading: boolean;
    lsegMarketQuotes: MarketQuote[];
    lsegQuantMetrics: Record<string, QuantMetrics>;
    newsRiskBoost: number;

    // ---- Scenario Branching ----
    scenarioBranch: {
        active: boolean;
        name: string;
        baseParams: SimulationParams;
        branchParams: SimulationParams;
        baseObjects: OntologyObject[];
        branchObjects: OntologyObject[];
    } | null;

    // ---- Ripple Effect (signal triage visual feedback) ----
    highlightedNodeIds: string[];

    // ---- Graph Actions ----
    addObject: (obj: OntologyObject) => void;
    removeObject: (id: string) => void;
    updateObjectProperty: (id: string, key: string, value: string | number | boolean) => void;
    addLink: (link: OntologyLink) => void;
    removeLink: (id: string) => void;
    executeAction: (action: OntologyAction) => void;

    // ---- BEVI Actions ----
    addIntelArticles: (articles: IntelArticle[]) => void;
    recalculateBEVI: () => void;
    forceRecalculateBEVI: () => void;
    markBEVIDirty: () => void;

    // ---- Application Actions ----
    setActiveScenario: (id: string) => void;
    setSimulationParams: (params: SimulationParams) => void;
    addScenario: (scenario: Scenario) => void;
    updateScenario: (id: string, name: string) => void;
    copyScenario: (id: string) => void;
    deleteScenario: (id: string) => void;
    updateRealtimeScenarioParams: (params: SimulationParams) => void;
    recalculate: () => void;

    // ---- LSEG Data Actions ----
    setLsegDataSource: (source: 'live' | 'demo') => void;
    setLsegIsLoading: (loading: boolean) => void;
    fetchAndBindMarketData: () => Promise<void>;
    setNewsRiskBoost: (boost: number) => void;

    // ---- Ripple Effect Actions ----
    triggerRippleEffect: (nodeId: string) => void;

    // ---- Scenario Branching Actions ----
    createScenarioBranch: (name: string, branchParams: SimulationParams) => void;
    clearScenarioBranch: () => void;

    // ---- Backward-Compatible Selectors ----
    selectFleetVessels: () => FleetVessel[];
    selectBrokerReports: () => BrokerReport[];
    selectInsuranceCirculars: () => InsuranceCircular[];
    selectObjectsByType: (type: OntologyObjectType) => OntologyObject[];
    selectLinksForObject: (objectId: string) => OntologyLink[];

    // ---- Quant-Ontology Selectors (Module 2) ----
    selectHighRiskVessels: () => HighRiskVesselEntry[];

    // ---- Module 3: Executive Briefing State ----
    executiveBriefing: AIPExecutiveBriefing | null;
    isExecutiveBriefingLoading: boolean;
    showExecutiveBriefingModal: boolean;
    requestExecutiveBriefing: () => Promise<void>;
    clearExecutiveBriefing: () => void;
}

// ============================================================
// ZUSTAND STORE
// ============================================================

const initialParams = BASE_SCENARIOS[0].params;

export const useOntologyStore = create<OntologyState>((set, get) => {
    // Fleet is built purely from ontology vessels — no legacy FLEET_DATA merge needed
    const initialMergedFleet = mapOntologyToFleetVessels(ONTOLOGY_OBJECTS);

    // Compute initial BEVI from mock ontology objects
    const initialBEVI = deriveNewBEVI(INITIAL_BEVI, ONTOLOGY_OBJECTS, []);

    return {
        // ---- Graph Data ----
        objects: [...ONTOLOGY_OBJECTS],
        links: [...ONTOLOGY_LINKS],
        actionLog: [],
        scenarioBranch: null,
        highlightedNodeIds: [],

        // ---- BEVI ----
        bevi: initialBEVI,
        intelArticles: [],

        // ---- Application State ----
        scenarios: [...BASE_SCENARIOS],
        activeScenarioId: 'realtime',
        simulationParams: { ...initialParams },
        dynamicChartData: calculateDynamicChartData(initialParams),
        dynamicFleetData: calculateDynamicFleetData(initialParams, initialMergedFleet),

        // ---- LSEG Data Source ----
        lsegDataSource: 'demo' as const,
        lsegIsLoading: false,
        lsegMarketQuotes: [],
        lsegQuantMetrics: {} as Record<string, QuantMetrics>,
        newsRiskBoost: 0,

        // ---- Module 3: Executive Briefing ----
        executiveBriefing: null as AIPExecutiveBriefing | null,
        isExecutiveBriefingLoading: false,
        showExecutiveBriefingModal: false,

        // ---- Graph Actions (with BEVI recalc) ----
        addObject: (obj) => {
            set((state) => ({ objects: [...state.objects, obj] }));
            get().markBEVIDirty();
        },

        removeObject: (id) => {
            set((state) => ({
                objects: state.objects.filter((o) => o.id !== id),
                links: state.links.filter((l) => l.sourceId !== id && l.targetId !== id),
            }));
            get().markBEVIDirty();
        },

        updateObjectProperty: (id, key, value) => {
            set((state) => ({
                objects: state.objects.map((o) =>
                    o.id === id
                        ? { ...o, properties: { ...o.properties, [key]: value }, metadata: { ...o.metadata, updatedAt: new Date().toISOString() } }
                        : o,
                ),
            }));
            // Mark BEVI dirty if risk-relevant property changed
            if (key === 'riskScore' || key === 'impactValue' || key === 'congestionPct') {
                get().markBEVIDirty();
            }
        },

        addLink: (link) =>
            set((state) => ({ links: [...state.links, link] })),

        removeLink: (id) =>
            set((state) => ({ links: state.links.filter((l) => l.id !== id) })),

        executeAction: (action) => {
            set((state) => {
                const newLog = [...state.actionLog, action];
                let newObjects = state.objects;

                // Handle specific action types
                switch (action.type) {
                    case 'UpdateRiskLevel': {
                        const newRisk = action.payload.riskScore as number;
                        newObjects = state.objects.map((o) =>
                            o.id === action.targetObjectId
                                ? { ...o, properties: { ...o.properties, riskScore: newRisk }, metadata: { ...o.metadata, updatedAt: action.timestamp } }
                                : o,
                        );
                        break;
                    }
                    case 'RerouteVessel': {
                        const newLocation = action.payload.newLocation as string;
                        newObjects = state.objects.map((o) =>
                            o.id === action.targetObjectId
                                ? { ...o, properties: { ...o.properties, location: newLocation }, metadata: { ...o.metadata, updatedAt: action.timestamp } }
                                : o,
                        );
                        break;
                    }
                    case 'UpdateCommodityPrice': {
                        const newPrice = action.payload.price as number;
                        newObjects = state.objects.map((o) =>
                            o.id === action.targetObjectId
                                ? { ...o, properties: { ...o.properties, basePrice: newPrice }, metadata: { ...o.metadata, updatedAt: action.timestamp } }
                                : o,
                        );
                        break;
                    }
                    default:
                        break;
                }

                return { actionLog: newLog, objects: newObjects };
            });
            get().markBEVIDirty();
        },

        // ---- BEVI Actions ----
        addIntelArticles: (articles) => {
            set((state) => {
                const existingIds = new Set(state.intelArticles.map(a => a.id));
                const newArticles = articles.filter(a => !existingIds.has(a.id));
                if (newArticles.length === 0) return {};
                const merged = [...newArticles, ...state.intelArticles].slice(0, 100);
                return { intelArticles: merged };
            });
            get().markBEVIDirty();
        },

        /** Mark BEVI as needing recalculation (deferred to 30-min interval) */
        markBEVIDirty: () => {
            _beviDirty = true;
        },

        /** Interval-gated recalculation — only runs if dirty AND 30 min elapsed */
        recalculateBEVI: () => {
            const now = Date.now();
            if (!_beviDirty && now - _beviLastCalcAt < BEVI_UPDATE_INTERVAL_MS) return;

            const state = get();
            const newBevi = deriveNewBEVI(state.bevi, state.objects, state.intelArticles);
            _beviDirty = false;
            _beviLastCalcAt = now;
            // Only update if value actually changed (avoids infinite loops)
            if (newBevi.value !== state.bevi.value || newBevi.topFactor !== state.bevi.topFactor) {
                console.log(`[BEVI] 📊 ${state.bevi.value} → ${newBevi.value} (Δ${newBevi.delta > 0 ? '+' : ''}${newBevi.delta}) | ${newBevi.topFactor}`);
                set({ bevi: newBevi });
            }
        },

        /** Bypass 30-min gate — used by Force Intelligence Sync */
        forceRecalculateBEVI: () => {
            const state = get();
            const newBevi = deriveNewBEVI(state.bevi, state.objects, state.intelArticles);
            _beviDirty = false;
            _beviLastCalcAt = Date.now();
            console.log(`[BEVI] ⚡ FORCE ${state.bevi.value} → ${newBevi.value} (Δ${newBevi.delta > 0 ? '+' : ''}${newBevi.delta}) | ${newBevi.topFactor}`);
            set({ bevi: newBevi });
        },

        // ---- Application Actions ----
        setActiveScenario: (id) => {
            const state = get();
            const scenario = state.scenarios.find((s) => s.id === id);
            if (scenario) {
                set({ activeScenarioId: id, simulationParams: { ...scenario.params } });
                // Trigger recalculation
                setTimeout(() => get().recalculate(), 0);
            }
        },

        setSimulationParams: (params) => {
            set({ simulationParams: params });
            setTimeout(() => get().recalculate(), 0);
        },

        addScenario: (scenario) =>
            set((state) => ({
                scenarios: [...state.scenarios, scenario],
                activeScenarioId: scenario.id,
            })),

        updateScenario: (id, name) =>
            set((state) => ({
                scenarios: state.scenarios.map((s) => (s.id === id ? { ...s, name } : s)),
            })),

        copyScenario: (id) =>
            set((state) => {
                const source = state.scenarios.find((s) => s.id === id);
                if (!source) return {};
                const copy: Scenario = {
                    ...source,
                    id: `custom-${Date.now()}`,
                    name: `${source.name} (복사본)`,
                    isCustom: true,
                };
                return { scenarios: [...state.scenarios, copy], activeScenarioId: copy.id };
            }),

        deleteScenario: (id) =>
            set((state) => {
                const filtered = state.scenarios.filter((s) => s.id !== id);
                const newActiveId = state.activeScenarioId === id ? BASE_SCENARIOS[0].id : state.activeScenarioId;
                return { scenarios: filtered, activeScenarioId: newActiveId };
            }),

        updateRealtimeScenarioParams: (params) =>
            set((state) => ({
                scenarios: state.scenarios.map((s) => (s.id === 'realtime' ? { ...s, params } : s)),
            })),

        // ---- LSEG Data Actions ----
        setLsegDataSource: (source) => set({ lsegDataSource: source }),
        setLsegIsLoading: (loading) => set({ lsegIsLoading: loading }),
        setNewsRiskBoost: (boost) => set({ newsRiskBoost: boost }),

        fetchAndBindMarketData: async () => {
            const store = get();
            if (store.lsegIsLoading) return; // Prevent concurrent fetches
            set({ lsegIsLoading: true });

            try {
                // Fetch market data (LSEG → Yahoo → Cache → Mock)
                const result = await fetchMarketDataWithFallback();
                const source: 'live' | 'demo' = result.source === 'lseg' ? 'live' : 'demo';

                // Map quotes to scenario params and update realtime scenario
                const scenarioUpdates = mapLSEGQuotesToScenarioParams(result.quotes);

                // Fetch LSEG news headlines
                let newsRiskBoost = 0;
                try {
                    const lsegNews = await fetchLSEGNewsHeadlines();
                    if (lsegNews.length > 0) {
                        // Merge into intel articles
                        store.addIntelArticles(lsegNews);
                        // Scan for risk keywords
                        const headlines = lsegNews.map(a => a.title);
                        const scanResult = scanHeadlinesForRisk(headlines);
                        newsRiskBoost = scanResult.riskBoost;
                    }
                } catch { /* LSEG news is optional */ }

                // Also scan existing intel articles for risk
                const existingHeadlines = store.intelArticles.map(a => a.title);
                if (existingHeadlines.length > 0 && newsRiskBoost === 0) {
                    const existingScan = scanHeadlinesForRisk(existingHeadlines);
                    newsRiskBoost = existingScan.riskBoost;
                }

                // Update store
                set({
                    lsegDataSource: source,
                    lsegIsLoading: false,
                    lsegMarketQuotes: result.quotes,
                    newsRiskBoost,
                });

                // Update realtime scenario params if we're in realtime mode
                if (store.activeScenarioId === 'realtime' && Object.keys(scenarioUpdates).length > 0) {
                    const currentParams = store.simulationParams;
                    const updatedParams = {
                        ...currentParams,
                        ...scenarioUpdates,
                        // Blend news risk into sentiment score
                        newsSentimentScore: Math.min(100,
                            (currentParams.newsSentimentScore || 0) * 0.5 + newsRiskBoost * 0.5
                        ),
                    };
                    store.updateRealtimeScenarioParams(updatedParams);
                    store.setSimulationParams(updatedParams);
                }

                // Update ontology commodity objects with live prices
                for (const quote of result.quotes) {
                    if (quote.symbol === 'LCOc1' || quote.symbol === 'BZ=F') {
                        store.updateObjectProperty('commodity-brent', 'basePrice', quote.price);
                    }
                    if (quote.symbol === 'KRW=' || quote.symbol === 'KRW=X') {
                        store.updateObjectProperty('currency-krw', 'baseRate', quote.price);
                    }
                }

                // ── Module 2: Bind QuantMetrics & propagate derived risk ──
                if (result.quantMetrics && Object.keys(result.quantMetrics).length > 0) {
                    set({ lsegQuantMetrics: result.quantMetrics });

                    // Compute derived risk states from quant + physical data
                    const currentObjects = get().objects;
                    const currentLinks = get().links;
                    const derivedUpdates = computeDerivedRiskStates(
                        currentObjects, result.quantMetrics, currentLinks,
                    );

                    // Apply derived risk updates to ontology objects
                    if (derivedUpdates.length > 0) {
                        set((state) => {
                            let updatedObjects = [...state.objects];
                            for (const update of derivedUpdates) {
                                updatedObjects = updatedObjects.map(o =>
                                    o.id === update.objectId
                                        ? {
                                            ...o,
                                            properties: { ...o.properties, [update.property]: update.value },
                                            metadata: { ...o.metadata, updatedAt: new Date().toISOString() },
                                        }
                                        : o,
                                );
                            }
                            return { objects: updatedObjects };
                        });
                        console.log(`[OntologyStore] 🔗 Applied ${derivedUpdates.length} derived risk updates from QuantMetrics`);
                    }
                }
            } catch (err) {
                console.error('[OntologyStore] fetchAndBindMarketData failed:', err);
                set({ lsegDataSource: 'demo', lsegIsLoading: false });
            }
        },

        recalculate: () => {
            const state = get();
            const { simulationParams, objects } = state;

            // Fleet is now purely derived from ontology objects
            const ontologyFleet = mapOntologyToFleetVessels(objects);
            let mergedFleet = [...ontologyFleet];

            // Also include localStorage ontology data (legacy compat)
            // DEDUP: only add vessels NOT already present in ontologyFleet
            try {
                const stored = localStorage.getItem('sidecar_ontology');
                if (stored) {
                    const ontologies = JSON.parse(stored);
                    const formalVesselInstances = ontologies.filter(
                        (o: any) => o.isActive && o.type === 'object_instance' && o.properties,
                    );
                    const legacyVesselItems = ontologies.filter(
                        (o: any) => o.isActive && o.type === 'factor' && o.subCategory === '자산 (Asset)' && o.vesselData,
                    );

                    const customFleet: FleetVessel[] = [
                        ...formalVesselInstances.map((v: any) => {
                            const props = v.properties || {};
                            const type = props.type || props.vesselType || props.VesselType || '-';
                            const loc = props.location || props.Location || props.lat || '-';
                            const risk = props.risk || props.riskLevel || props.riskScore || 'Low';
                            let formattedRisk: 'Low' | 'Medium' | 'High' | 'Critical' = 'Low';
                            if (String(risk).toLowerCase().includes('high')) formattedRisk = 'High';
                            if (String(risk).toLowerCase().includes('crit') || Number(risk) > 80) formattedRisk = 'Critical';
                            if (String(risk).toLowerCase().includes('med') || Number(risk) > 50) formattedRisk = 'Medium';

                            return {
                                vessel_name: v.title || props.name || 'Auto Object',
                                vessel_type: String(type),
                                location: String(loc),
                                riskLevel: formattedRisk,
                                voyage_info: { departure_port: '-', destination_port: '-', sailed_days: 0, plan_days: 0, last_report_type: 'Ontology Object', last_report_time: v.lastUpdated, timezone: 'UTC' },
                                speed_and_weather_metrics: { avg_speed: 0, speed_cp: 0, speed_diff: 0, avg_speed_good_wx: 0, still_water_avg_speed_good_wx: 0, avg_curf: 0, avg_wxf: 0 },
                                consumption_and_rob: { avg_ifo: 0, ifo_cp: 0, ifo_diff: 0, fo_rob: 0, lo_rob: 0, fw_rob: 0, total_consumed: 0 },
                                compliance: { cii_rating: '-', cii_trend: '-' },
                            };
                        }),
                        ...legacyVesselItems.map((v: any) => ({
                            vessel_name: v.title || 'Unknown Asset',
                            vessel_type: v.vesselData.vessel_type || '-',
                            location: v.vesselData.location || '-',
                            riskLevel: v.vesselData.riskLevel || 'Low',
                            voyage_info: { departure_port: '-', destination_port: '-', sailed_days: 0, plan_days: 0, last_report_type: 'Ontology Factor', last_report_time: v.lastUpdated, timezone: 'UTC' },
                            speed_and_weather_metrics: { avg_speed: 0, speed_cp: 0, speed_diff: 0, avg_speed_good_wx: 0, still_water_avg_speed_good_wx: 0, avg_curf: 0, avg_wxf: 0 },
                            consumption_and_rob: { avg_ifo: 0, ifo_cp: 0, ifo_diff: 0, fo_rob: 0, lo_rob: 0, fw_rob: 0, total_consumed: 0 },
                            compliance: { cii_rating: '-', cii_trend: '-' },
                        })),
                    ];

                    // Dedup: only add entries not already in ontologyFleet
                    // Normalize names by stripping emoji prefixes (🚢) and trimming whitespace
                    const normalize = (n: string) => n.replace(/^[^\w]+/, '').trim();
                    const existingNames = new Set(mergedFleet.map(v => normalize(v.vessel_name)));
                    customFleet.forEach(cv => {
                        if (!existingNames.has(normalize(cv.vessel_name))) {
                            mergedFleet.push(cv);
                        }
                    });
                }
            } catch (e) {
                console.error('Failed to parse ontology fleet data', e);
            }

            set({
                dynamicChartData: calculateDynamicChartData(simulationParams),
                dynamicFleetData: calculateDynamicFleetData(simulationParams, mergedFleet),
            });
        },

        // ---- Scenario Branching ----
        createScenarioBranch: (name, branchParams) => {
            const state = get();
            // Use the INITIAL (default) ontology objects as the base snapshot
            const baseObjects = ONTOLOGY_OBJECTS.map(o => ({
                ...o,
                properties: { ...o.properties },
                metadata: { ...o.metadata },
            }));
            // Compute branch objects: apply ripple effect from initial params -> branch params
            const branchObjects = computeScenarioBranch(
                baseObjects,
                state.links,
                initialParams,
                branchParams,
            );
            set({
                scenarioBranch: {
                    active: true,
                    name,
                    baseParams: { ...initialParams },
                    branchParams: { ...branchParams },
                    baseObjects,
                    branchObjects,
                },
            });
        },

        // ---- Ripple Effect ----
        triggerRippleEffect: (nodeId: string) => {
            const state = get();
            const connectedLinks = state.links.filter(l => l.sourceId === nodeId || l.targetId === nodeId);
            const connectedIds = new Set<string>([nodeId]);
            connectedLinks.forEach(l => {
                connectedIds.add(l.sourceId);
                connectedIds.add(l.targetId);
            });
            set({ highlightedNodeIds: Array.from(connectedIds) });
            // Clear after 3 seconds
            setTimeout(() => set({ highlightedNodeIds: [] }), 3000);
        },

        clearScenarioBranch: () => set({ scenarioBranch: null }),

        // ---- Backward-Compatible Selectors ----
        selectFleetVessels: () => mapOntologyToFleetVessels(get().objects),
        selectBrokerReports: () => mapOntologyToBrokerReports(get().objects),
        selectInsuranceCirculars: () => mapOntologyToInsuranceCirculars(get().objects),
        selectObjectsByType: (type) => get().objects.filter((o) => o.type === type),
        selectLinksForObject: (objectId) =>
            get().links.filter((l) => l.sourceId === objectId || l.targetId === objectId),

        // ---- Quant-Ontology Selectors (Module 2) ----
        selectHighRiskVessels: () => {
            const state = get();
            return selectHighRiskVesselsFromState(state.objects, state.links, state.lsegQuantMetrics);
        },

        // ---- Module 3: Executive Briefing Actions ----
        requestExecutiveBriefing: async () => {
            const state = get();
            if (state.isExecutiveBriefingLoading) return;

            // Read API key from settings
            let apiKey = '';
            try {
                const settings = JSON.parse(localStorage.getItem('sidecar_settings') || '{}');
                apiKey = settings.apiKey || '';
            } catch { /* ignore */ }

            if (!apiKey) {
                console.warn('[OntologyStore] Executive briefing requires API key');
                return;
            }

            set({
                isExecutiveBriefingLoading: true,
                showExecutiveBriefingModal: true,
                executiveBriefing: null,
            });

            try {
                const { generateAIPExecutiveBriefing } = await import('../services/geminiService');
                const briefing = await generateAIPExecutiveBriefing(
                    apiKey,
                    {
                        objects: state.objects,
                        links: state.links,
                        quantMetrics: state.lsegQuantMetrics,
                    },
                    state.simulationParams,
                    state.dynamicFleetData,
                );
                set({ executiveBriefing: briefing, isExecutiveBriefingLoading: false });
                console.log('[OntologyStore] 🧠 Executive briefing generated successfully');
            } catch (err) {
                console.error('[OntologyStore] Executive briefing generation failed:', err);
                set({ isExecutiveBriefingLoading: false });
            }
        },

        clearExecutiveBriefing: () => set({
            executiveBriefing: null,
            isExecutiveBriefingLoading: false,
            showExecutiveBriefingModal: false,
        }),
    };
});

// ============================================================
// 30-MINUTE BEVI INTERVAL TIMER
// Periodically flushes dirty flag and recalculates BEVI.
// ============================================================
setInterval(() => {
    if (_beviDirty) {
        useOntologyStore.getState().recalculateBEVI();
    }
}, BEVI_UPDATE_INTERVAL_MS);

