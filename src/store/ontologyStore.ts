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
    VulnerabilityDataPoint,
} from '../types';
import { computeScenarioBranch } from '../lib/utils';
import {
    BASE_SCENARIOS,
    ONTOLOGY_OBJECTS,
    ONTOLOGY_LINKS,
} from '../data/mockData';
import {
    fullSync,
    applyMarketUpdatesToParams,
} from '../services/maritimeIntegrationService';
import type { MarketQuote } from '../services/maritimeIntegrationService';

// ============================================================
// INTERNAL: VULNERABILITY BASE DATA (for chart calculation)
// Migrated from mockData — 30-day WS time series seed
// ============================================================
const BASE_VULNERABILITY_DATA: VulnerabilityDataPoint[] = [
    { date: '02/09', Base_WS: 55, WS_High: 58, WS_Low: 52, News_Sentiment_Score: 12 },
    { date: '02/10', Base_WS: 56, WS_High: 59, WS_Low: 53, News_Sentiment_Score: 14 },
    { date: '02/11', Base_WS: 54, WS_High: 57, WS_Low: 51, News_Sentiment_Score: 11 },
    { date: '02/12', Base_WS: 57, WS_High: 61, WS_Low: 53, News_Sentiment_Score: 18 },
    { date: '02/13', Base_WS: 55, WS_High: 58, WS_Low: 52, News_Sentiment_Score: 15 },
    { date: '02/14', Base_WS: 58, WS_High: 62, WS_Low: 54, News_Sentiment_Score: 20 },
    { date: '02/15', Base_WS: 56, WS_High: 59, WS_Low: 53, News_Sentiment_Score: 16 },
    { date: '02/16', Base_WS: 59, WS_High: 63, WS_Low: 55, News_Sentiment_Score: 22 },
    { date: '02/17', Base_WS: 58, WS_High: 62, WS_Low: 54, News_Sentiment_Score: 25 },
    { date: '02/18', Base_WS: 60, WS_High: 65, WS_Low: 55, News_Sentiment_Score: 30 },
    { date: '02/19', Base_WS: 62, WS_High: 68, WS_Low: 56, News_Sentiment_Score: 35 },
    { date: '02/20', Base_WS: 61, WS_High: 67, WS_Low: 55, News_Sentiment_Score: 38 },
    { date: '02/21', Base_WS: 65, WS_High: 72, WS_Low: 58, News_Sentiment_Score: 45 },
    { date: '02/22', Base_WS: 63, WS_High: 70, WS_Low: 56, News_Sentiment_Score: 42 },
    { date: '02/23', Base_WS: 68, WS_High: 78, WS_Low: 58, News_Sentiment_Score: 55 },
    { date: '02/24', Base_WS: 66, WS_High: 74, WS_Low: 58, News_Sentiment_Score: 48 },
    { date: '02/25', Base_WS: 70, WS_High: 82, WS_Low: 58, News_Sentiment_Score: 62 },
    { date: '02/26', Base_WS: 72, WS_High: 88, WS_Low: 56, News_Sentiment_Score: 70 },
    { date: '02/27', Base_WS: 68, WS_High: 80, WS_Low: 56, News_Sentiment_Score: 58 },
    { date: '02/28', Base_WS: 75, WS_High: 95, WS_Low: 55, News_Sentiment_Score: 78 },
    { date: '03/01', Base_WS: 78, WS_High: 102, WS_Low: 54, News_Sentiment_Score: 85 },
    { date: '03/02', Base_WS: 74, WS_High: 96, WS_Low: 52, News_Sentiment_Score: 80 },
    { date: '03/03', Base_WS: 80, WS_High: 110, WS_Low: 50, News_Sentiment_Score: 92 },
    { date: '03/04', Base_WS: 76, WS_High: 100, WS_Low: 52, News_Sentiment_Score: 82 },
    { date: '03/05', Base_WS: 82, WS_High: 115, WS_Low: 49, News_Sentiment_Score: 95 },
    { date: '03/06', Base_WS: 79, WS_High: 108, WS_Low: 50, News_Sentiment_Score: 88 },
    { date: '03/07', Base_WS: 85, WS_High: 120, WS_Low: 50, News_Sentiment_Score: 96 },
    { date: '03/08', Base_WS: 83, WS_High: 115, WS_Low: 51, News_Sentiment_Score: 90 },
    { date: '03/09', Base_WS: 80, WS_High: 108, WS_Low: 52, News_Sentiment_Score: 84 },
    { date: '03/10', Base_WS: 78, WS_High: 104, WS_Low: 52, News_Sentiment_Score: 80 },
];

// ============================================================
// CALCULATION HELPERS
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

function calculateDynamicFleetData(
    params: SimulationParams,
    baseFleet: FleetVessel[],
    quantMetrics?: Record<string, QuantMetrics>,
): FleetVessel[] {
    const { newsSentimentScore, awrpRate } = params;

    const RISK_ZONES: { keywords: string[]; label: string }[] = [
        { keywords: ['hormuz', 'persian gulf', 'fujairah', 'oman', 'shinas', 'sharjah', 'muscat', 'dammam'], label: '호르무즈 해협 지정학적 위기' },
        { keywords: ['red sea', 'bab el', 'aden', 'jeddah', 'yemen', 'houthi'], label: '홍해 지정학적 위험 구역' },
        { keywords: ['suez'], label: '수에즈 운하 봉쇄 리스크' },
    ];

    const LARGE_VESSEL_TYPES = new Set(['vlcc', 'suezmax', 'aframax', 'capesize', 'lng carrier', 'lngc']);
    const BULK_TYPES = new Set(['capesize', 'panamax', 'supramax', 'handysize', 'bulk carrier', 'bulker']);

    const vlsfoMetrics = quantMetrics?.['VLSFO380'] || quantMetrics?.['LCOc1'] || quantMetrics?.['BZ=F'];
    const bdiMetrics = quantMetrics?.['BADI'] || quantMetrics?.['^BDIY'];

    return baseFleet.map((vessel) => {
        const locLower = vessel.location.toLowerCase();
        const typeLower = vessel.vessel_type.toLowerCase();
        const factors: string[] = [];
        let derivedLevel: 'SAFE' | 'WARNING' | 'CRITICAL' = 'SAFE';

        const isMiddleEast =
            locLower.includes('hormuz') ||
            locLower.includes('middle east') ||
            locLower.includes('persian gulf') ||
            locLower.includes('fujairah') ||
            locLower.includes('oman');

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

        for (const zone of RISK_ZONES) {
            if (zone.keywords.some(kw => locLower.includes(kw))) {
                if (derivedLevel === 'SAFE') derivedLevel = 'WARNING';
                if (awrpRate > 0.08 || newsSentimentScore > 70) derivedLevel = 'CRITICAL';
                factors.push(zone.label);
            }
        }

        if (vlsfoMetrics?.riskAlert) {
            const isLargeVessel = LARGE_VESSEL_TYPES.has(typeLower);
            const isLongVoyage = vessel.voyage_info.plan_days > 20 || vessel.voyage_info.sailed_days > 15;

            if (isLargeVessel || isLongVoyage) {
                derivedLevel = 'CRITICAL';
                factors.push(
                    `VLSFO 유가 급등으로 인한 연료비 악화 (Z=${vlsfoMetrics.zScore.toFixed(1)}, ` +
                    `${isLargeVessel ? '대형선박' : '장거리 항해'})`
                );
            } else {
                if (derivedLevel === 'SAFE') derivedLevel = 'WARNING';
                factors.push(`유가 변동성 경계 (Z=${vlsfoMetrics.zScore.toFixed(1)})`);
            }
        }

        if (bdiMetrics) {
            const isBulk = BULK_TYPES.has(typeLower);
            const isBallast = vessel.speed_and_weather_metrics.avg_speed < 5;

            if (bdiMetrics.trend === 'DOWN' && bdiMetrics.zScore < -2.0) {
                if (isBulk) {
                    derivedLevel = 'CRITICAL';
                    factors.push(`BDI 운임 폭락 중 (Z=${bdiMetrics.zScore.toFixed(1)}, ${isBallast ? '공선(Ballast) 상태' : '벌크선 마진 악화'})`);
                } else if (isBallast) {
                    if (derivedLevel === 'SAFE') derivedLevel = 'WARNING';
                    factors.push(`운임 하락 구간 공선 운항 (BDI Z=${bdiMetrics.zScore.toFixed(1)})`);
                }
            } else if (bdiMetrics.trend === 'DOWN' && bdiMetrics.zScore < -1.0 && isBulk) {
                if (derivedLevel === 'SAFE') derivedLevel = 'WARNING';
                factors.push(`BDI 하락 추세 주의 (Z=${bdiMetrics.zScore.toFixed(1)})`);
            }
        }

        if (factors.length >= 3 && derivedLevel === 'WARNING') {
            derivedLevel = 'CRITICAL';
            factors.push('복합 리스크 에스컬레이션');
        }

        return {
            ...vessel,
            riskLevel,
            derivedRiskLevel: derivedLevel,
            riskFactors: factors.length > 0 ? factors : undefined,
        };
    });
}

// ============================================================
// BEVI CALCULATION ENGINE
// ============================================================

const BEVI_HISTORY_MAX = 50;
const BEVI_TREND_THRESHOLD = 1;
const BEVI_UPDATE_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

let _beviDirty = false;
let _beviLastCalcAt = 0;

const MACRO_TYPES: Set<string> = new Set(['RiskEvent', 'MarketIndicator']);
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
    // Component 1: Macro Risk (40%)
    const macroObjects = objects.filter(o => MACRO_TYPES.has(o.type) && o.metadata.status === 'active');
    const macroRiskAvg = macroObjects.length > 0
        ? macroObjects.reduce((sum, o) => sum + (Number(o.properties.riskScore) || 0), 0) / macroObjects.length
        : 0;

    // Component 2: Asset Risk (30%)
    const assetObjects = objects.filter(o => ASSET_TYPES.has(o.type) && o.metadata.status === 'active');
    const assetRiskAvg = assetObjects.length > 0
        ? assetObjects.reduce((sum, o) => sum + (Number(o.properties.riskScore) || 0), 0) / assetObjects.length
        : 0;

    // Component 3: Intel Shock (30%)
    const recentArticles = intelArticles.filter(a => {
        if (!a.evaluated || a.dropped) return false;
        const age = Date.now() - new Date(a.fetchedAt).getTime();
        return age < 24 * 60 * 60 * 1000; // last 24 hours
    });
    const intelShockAvg = recentArticles.length > 0
        ? recentArticles.reduce((sum, a) => sum + (a.impactScore || 0), 0) / recentArticles.length
        : 0;

    // Composite
    const value = Math.round(macroRiskAvg * 0.4 + assetRiskAvg * 0.3 + intelShockAvg * 0.3);

    // Find top contributing factor
    let topFactor = '안정적 환경';
    let topScore = 0;
    for (const o of [...macroObjects, ...assetObjects]) {
        const score = Number(o.properties.riskScore) || 0;
        if (score > topScore) {
            topScore = score;
            topFactor = `견인 요인: ${o.title} (${score})`;
        }
    }

    return { macroRiskAvg, assetRiskAvg, intelShockAvg, topFactor, value };
}

function deriveNewBEVI(prev: BEVIState, objects: OntologyObject[], intelArticles: IntelArticle[]): BEVIState {
    const comp = calculateBEVIComponents(objects, intelArticles);
    const delta = comp.value - prev.value;
    let trend: 'up' | 'down' | 'stable' = 'stable';
    if (delta > BEVI_TREND_THRESHOLD) trend = 'up';
    else if (delta < -BEVI_TREND_THRESHOLD) trend = 'down';

    const newEntry: BEVIHistoryEntry = {
        timestamp: new Date().toISOString(),
        value: comp.value,
    };

    const history = [newEntry, ...prev.history].slice(0, BEVI_HISTORY_MAX);

    return {
        value: comp.value,
        previousValue: prev.value,
        trend,
        delta,
        topFactor: comp.topFactor,
        macroRiskAvg: comp.macroRiskAvg,
        assetRiskAvg: comp.assetRiskAvg,
        intelShockAvg: comp.intelShockAvg,
        history,
        lastCalculatedAt: new Date().toISOString(),
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
// These map OntologyObjects to deprecated FleetVessel/BrokerReport/etc.
// New code should use selectObjectsByType() directly.
// ============================================================

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

function mapOntologyToBrokerReports(objects: OntologyObject[]): BrokerReport[] {
    return objects
        .filter((o) => o.type === 'MarketIndicator' && o.metadata.status === 'active' && o.properties.priceMilUsd != null)
        .map((o) => ({
            source: String(o.properties.source || '-'),
            date: o.metadata.updatedAt.split('T')[0],
            asset_class: String(o.properties.assetClass || '-'),
            current_price_mil_usd: Number(o.properties.priceMilUsd || 0),
            wow_change_pct: String(Number(o.properties.wowChangePct || 0) > 0 ? `+${o.properties.wowChangePct}` : o.properties.wowChangePct),
            market_sentiment: String(o.properties.sentiment || '-'),
        }));
}

function mapOntologyToInsuranceCirculars(objects: OntologyObject[]): InsuranceCircular[] {
    return objects
        .filter((o) => o.type === 'MarketIndicator' && o.metadata.status === 'active' && o.properties.issuer != null)
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

    const linkMap = new Map<string, Set<string>>();
    for (const link of links) {
        if (!linkMap.has(link.sourceId)) linkMap.set(link.sourceId, new Set());
        if (!linkMap.has(link.targetId)) linkMap.set(link.targetId, new Set());
        linkMap.get(link.sourceId)!.add(link.targetId);
        linkMap.get(link.targetId)!.add(link.sourceId);
    }

    const alertedMarketIds = new Set<string>();
    for (const obj of objects) {
        if (obj.type === 'MarketIndicator') {
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

        if (vlsfoMetrics?.riskAlert || brentMetrics?.riskAlert) {
            if (isLongVoyage) {
                updates.push({ objectId: vessel.id, property: 'bunkerCostRisk', value: 'High' });
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

        const freightZScore = bdiMetrics?.zScore ?? scfiMetrics?.zScore ?? 0;
        const baseMargin = Number(vessel.properties.estimatedMargin || 15);
        let adjustedMargin = baseMargin;

        if (freightZScore < -1.0) {
            adjustedMargin = Math.max(0, baseMargin + freightZScore * 3);
        } else if (freightZScore > 1.0) {
            adjustedMargin = Math.min(40, baseMargin + freightZScore * 2);
        }
        updates.push({ objectId: vessel.id, property: 'estimatedMargin', value: Math.round(adjustedMargin * 10) / 10 });

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
        metric: string;
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

    const metricNames: Record<string, string> = {
        'LCOc1': 'Brent Crude Anomaly',
        'VLSFO380': 'VLSFO Bunker Price Anomaly',
        'BADI': 'Baltic Dry Index Anomaly',
        'SCFI': 'SCFI Container Freight Anomaly',
        'KRW=': 'USD/KRW Exchange Rate Anomaly',
    };

    const alertedObjectIds = new Set<string>();
    for (const obj of objects) {
        const ric = String(obj.properties.ric || obj.properties.symbol || '');
        if (ric && quantMetrics[ric]?.riskAlert) {
            alertedObjectIds.add(obj.id);
        }
    }

    const vesselRiskMap = new Map<string, Set<string>>();
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

    const fleetWideAlerts = alertedRics.filter(r => ['VLSFO380', 'BADI', 'SCFI'].includes(r.ric));
    if (fleetWideAlerts.length > 0) {
        const allVessels = objects.filter(o => o.type === 'Vessel' && o.metadata.status === 'active');
        for (const v of allVessels) {
            if (!vesselRiskMap.has(v.id)) vesselRiskMap.set(v.id, new Set());
        }
    }

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
    // ---- Graph Data (Single Source of Truth) ----
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
    getHighRiskVessels: () => FleetVessel[];

    // ---- Market Data Source State ----
    lsegDataSource: 'live' | 'demo';
    lsegIsLoading: boolean;
    lsegMarketQuotes: MarketQuote[];
    lsegQuantMetrics: Record<string, QuantMetrics>;
    lsegError: string | null;
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

    // ---- Ripple Effect ----
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

    // ---- Integration Layer Actions ----
    setLsegDataSource: (source: 'live' | 'demo') => void;
    setLsegIsLoading: (loading: boolean) => void;
    fetchAndBindMarketData: () => Promise<void>;
    setNewsRiskBoost: (boost: number) => void;

    // ---- Ripple Effect Actions ----
    triggerRippleEffect: (nodeId: string) => void;

    // ---- Scenario Branching Actions ----
    createScenarioBranch: (name: string, branchParams: SimulationParams) => void;
    clearScenarioBranch: () => void;

    // ---- Typed Selectors (subscribe to these from widgets) ----
    selectFleetVessels: () => FleetVessel[];
    selectBrokerReports: () => BrokerReport[];
    selectInsuranceCirculars: () => InsuranceCircular[];
    selectObjectsByType: (type: OntologyObjectType) => OntologyObject[];
    selectLinksForObject: (objectId: string) => OntologyLink[];
    selectLinkedObjects: (objectId: string) => OntologyObject[];

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
    const initialMergedFleet = mapOntologyToFleetVessels(ONTOLOGY_OBJECTS);
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

        getHighRiskVessels: () => {
            const state = get();
            return state.dynamicFleetData.filter(
                v => v.derivedRiskLevel === 'WARNING' || v.derivedRiskLevel === 'CRITICAL'
            );
        },

        // ---- Market Data Source ----
        lsegDataSource: 'demo' as const,
        lsegIsLoading: false,
        lsegMarketQuotes: [],
        lsegQuantMetrics: {} as Record<string, QuantMetrics>,
        lsegError: null as string | null,
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

        markBEVIDirty: () => {
            _beviDirty = true;
        },

        recalculateBEVI: () => {
            const now = Date.now();
            if (!_beviDirty && now - _beviLastCalcAt < BEVI_UPDATE_INTERVAL_MS) return;

            const state = get();
            const newBevi = deriveNewBEVI(state.bevi, state.objects, state.intelArticles);
            _beviDirty = false;
            _beviLastCalcAt = now;
            if (newBevi.value !== state.bevi.value || newBevi.topFactor !== state.bevi.topFactor) {
                console.log(`[BEVI] 📊 ${state.bevi.value} → ${newBevi.value} (Δ${newBevi.delta > 0 ? '+' : ''}${newBevi.delta}) | ${newBevi.topFactor}`);
                set({ bevi: newBevi });
            }
        },

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

        // ---- Integration Layer Actions ----
        setLsegDataSource: (source) => set({ lsegDataSource: source }),
        setLsegIsLoading: (loading) => set({ lsegIsLoading: loading }),
        setNewsRiskBoost: (boost) => set({ newsRiskBoost: boost }),

        fetchAndBindMarketData: async () => {
            const store = get();
            if (store.lsegIsLoading) return;
            set({ lsegIsLoading: true });

            try {
                const result = await fullSync();
                const source: 'live' | 'demo' = result.marketSource === 'lseg' ? 'live' : 'demo';

                // Merge news articles into store
                if (result.newsArticles.length > 0) {
                    store.addIntelArticles(result.newsArticles);
                }

                set({
                    lsegDataSource: source,
                    lsegIsLoading: false,
                    lsegMarketQuotes: result.marketQuotes,
                    lsegError: result.errors.length > 0 ? result.errors[0] : null,
                    newsRiskBoost: result.newsRiskBoost,
                });

                // Update realtime scenario params
                if (store.activeScenarioId === 'realtime' && Object.keys(result.scenarioParamUpdates).length > 0) {
                    const updatedParams = applyMarketUpdatesToParams(
                        store.simulationParams,
                        result.scenarioParamUpdates,
                        result.newsRiskBoost,
                    );
                    store.updateRealtimeScenarioParams(updatedParams);
                    store.setSimulationParams(updatedParams);
                }

                // Update ontology commodity objects with live prices
                for (const quote of result.marketQuotes) {
                    if (quote.symbol === 'LCOc1' || quote.symbol === 'BZ=F') {
                        store.updateObjectProperty('commodity-brent', 'basePrice', quote.price);
                    }
                    if (quote.symbol === 'KRW=' || quote.symbol === 'KRW=X') {
                        store.updateObjectProperty('currency-krw', 'baseRate', quote.price);
                    }
                }

                // Module 2: Bind QuantMetrics & propagate derived risk
                if (result.quantMetrics && Object.keys(result.quantMetrics).length > 0) {
                    set({ lsegQuantMetrics: result.quantMetrics });

                    const currentObjects = get().objects;
                    const currentLinks = get().links;
                    const derivedUpdates = computeDerivedRiskStates(
                        currentObjects, result.quantMetrics, currentLinks,
                    );

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

                    const currentState = get();
                    const ontologyFleet = mapOntologyToFleetVessels(currentState.objects);
                    set({
                        dynamicFleetData: calculateDynamicFleetData(
                            currentState.simulationParams,
                            ontologyFleet,
                            result.quantMetrics,
                        ),
                    });
                }
            } catch (err) {
                const msg = err instanceof Error ? err.message : 'Unknown market data error';
                console.error('[OntologyStore] fetchAndBindMarketData failed:', msg);
                set({ lsegDataSource: 'demo', lsegIsLoading: false, lsegError: msg });
            }
        },

        recalculate: () => {
            const state = get();
            const { simulationParams, objects } = state;

            // Fleet is derived purely from ontology objects
            const ontologyFleet = mapOntologyToFleetVessels(objects);

            set({
                dynamicChartData: calculateDynamicChartData(simulationParams),
                dynamicFleetData: calculateDynamicFleetData(simulationParams, ontologyFleet, get().lsegQuantMetrics),
            });
        },

        // ---- Scenario Branching ----
        createScenarioBranch: (name, branchParams) => {
            const state = get();
            const baseObjects = ONTOLOGY_OBJECTS.map(o => ({
                ...o,
                properties: { ...o.properties },
                metadata: { ...o.metadata },
            }));
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
            setTimeout(() => set({ highlightedNodeIds: [] }), 3000);
        },

        clearScenarioBranch: () => set({ scenarioBranch: null }),

        // ---- Typed Selectors ----
        selectFleetVessels: () => mapOntologyToFleetVessels(get().objects),
        selectBrokerReports: () => mapOntologyToBrokerReports(get().objects),
        selectInsuranceCirculars: () => mapOntologyToInsuranceCirculars(get().objects),
        selectObjectsByType: (type) => get().objects.filter((o) => o.type === type),
        selectLinksForObject: (objectId) =>
            get().links.filter((l) => l.sourceId === objectId || l.targetId === objectId),

        // NEW: Get all objects linked to a given object
        selectLinkedObjects: (objectId: string) => {
            const state = get();
            const connectedLinks = state.links.filter(l => l.sourceId === objectId || l.targetId === objectId);
            const linkedIds = new Set<string>();
            connectedLinks.forEach(l => {
                if (l.sourceId !== objectId) linkedIds.add(l.sourceId);
                if (l.targetId !== objectId) linkedIds.add(l.targetId);
            });
            return state.objects.filter(o => linkedIds.has(o.id));
        },

        // ---- Quant-Ontology Selectors (Module 2) ----
        selectHighRiskVessels: () => {
            const state = get();
            return selectHighRiskVesselsFromState(state.objects, state.links, state.lsegQuantMetrics);
        },

        // ---- Module 3: Executive Briefing Actions ----
        requestExecutiveBriefing: async () => {
            const state = get();
            if (state.isExecutiveBriefingLoading) return;

            set({
                isExecutiveBriefingLoading: true,
                showExecutiveBriefingModal: true,
                executiveBriefing: null,
            });

            try {
                const { generateAIPExecutiveBriefing } = await import('../services/geminiService');
                const briefing = await generateAIPExecutiveBriefing(
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
// ============================================================
setInterval(() => {
    if (_beviDirty) {
        useOntologyStore.getState().recalculateBEVI();
    }
}, BEVI_UPDATE_INTERVAL_MS);
