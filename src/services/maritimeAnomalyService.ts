/**
 * Maritime Anomaly Service — Orchestration Layer
 *
 * Provides:
 *  - Ontology-driven anomaly data generation (from existing vessels/ports)
 *  - Anomaly clustering for map visualization
 *  - 5-step ontology pipeline orchestration
 */

import type {
    MaritimeAnomaly,
    AnomalyType,
    AnomalyCluster,
    MaritimeVesselType,
    MaritimeRiskCategory,
    OntologyObject,
    OntologyLink,
    AIStrategicProposal,
} from '../types';

// ============================================================
// CONSTANTS
// ============================================================

const ANOMALY_TYPE_LABELS: Record<AnomalyType, string> = {
    dark_activity: '어둠의 활동',
    ship_to_ship: '함선 간 통신',
    slow_sailing: '3노트 이하로 항해',
    area_visit: '지역 방문',
};

const ANOMALY_TYPE_COLORS: Record<AnomalyType, string> = {
    dark_activity: '#f97316',   // orange
    ship_to_ship: '#22c55e',   // green
    slow_sailing: '#a855f7',   // purple
    area_visit: '#38bdf8',     // light blue
};

const RISK_CATEGORY_LABELS: Record<MaritimeRiskCategory, string> = {
    sanctions_evasion: '제재 회피',
    smuggling: '밀수',
    iuu_fishing: 'IUU 낚시',
};

const VESSEL_TYPE_LABELS: Record<MaritimeVesselType, string> = {
    military_or_law: 'Military or law',
    passenger: 'Passenger',
    fishing: 'Fishing',
    service_vessel: 'Service vessel',
    tanker: 'Tanker',
    cargo: 'Cargo',
};

export { ANOMALY_TYPE_LABELS, ANOMALY_TYPE_COLORS, RISK_CATEGORY_LABELS, VESSEL_TYPE_LABELS };

// ============================================================
// HOTSPOT REGIONS — Areas where anomalies naturally cluster
// ============================================================

interface HotspotRegion {
    name: string;
    lat: number;
    lng: number;
    radius: number;       // degrees of jitter
    weight: number;       // likelihood multiplier
}

const HOTSPOT_REGIONS: HotspotRegion[] = [
    { name: 'Strait of Hormuz', lat: 26.5, lng: 56.3, radius: 3, weight: 5 },
    { name: 'South China Sea', lat: 15, lng: 115, radius: 6, weight: 4 },
    { name: 'Gulf of Guinea', lat: 3, lng: 5, radius: 5, weight: 3 },
    { name: 'Malacca Strait', lat: 2.5, lng: 101.8, radius: 2, weight: 4 },
    { name: 'Red Sea / Bab el-Mandeb', lat: 13, lng: 43, radius: 4, weight: 5 },
    { name: 'East Africa', lat: -5, lng: 45, radius: 5, weight: 2 },
    { name: 'North Atlantic', lat: 45, lng: -30, radius: 8, weight: 1 },
    { name: 'Mediterranean', lat: 35, lng: 18, radius: 5, weight: 2 },
    { name: 'Black Sea', lat: 43, lng: 34, radius: 3, weight: 3 },
    { name: 'Arabian Sea', lat: 18, lng: 65, radius: 6, weight: 3 },
    { name: 'Bay of Bengal', lat: 12, lng: 88, radius: 4, weight: 2 },
    { name: 'East China Sea', lat: 30, lng: 125, radius: 3, weight: 2 },
    { name: 'Sea of Japan', lat: 38, lng: 135, radius: 3, weight: 1 },
    { name: 'Indonesia', lat: -2, lng: 110, radius: 5, weight: 3 },
    { name: 'West Africa', lat: 10, lng: -15, radius: 4, weight: 2 },
    { name: 'Indian Ocean', lat: -10, lng: 70, radius: 8, weight: 2 },
    { name: 'Suez Canal Area', lat: 30.5, lng: 32.3, radius: 1.5, weight: 3 },
    { name: 'Caribbean', lat: 18, lng: -72, radius: 5, weight: 1 },
    { name: 'Persian Gulf Interior', lat: 28, lng: 50, radius: 3, weight: 4 },
    { name: 'South Pacific', lat: -15, lng: 170, radius: 6, weight: 1 },
];

// ============================================================
// VESSEL NAMES & FLAGS for realistic data
// ============================================================

const VESSEL_NAMES = [
    'ORIENTAL PIONEER', 'PACIFIC VOYAGER', 'GOLDEN DRAGON', 'STAR ATLAS',
    'OCEAN HARMONY', 'BLUE WHALE', 'DESERT PEARL', 'CRIMSON TIDE',
    'NORDIC SPIRIT', 'EASTERN PROMISE', 'CORAL VENTURE', 'SILVER HAWK',
    'IRON MONARCH', 'SEA FALCON', 'TIGER SHARK', 'WAVE RUNNER',
    'MIDNIGHT SUN', 'EMERALD SEA', 'THUNDER STORM', 'CRYSTAL BAY',
    'JADE DRAGON', 'POLAR STAR', 'WIND DANCER', 'ROYAL OAK',
    'BLACK PEARL', 'RED HORIZON', 'NEPTUNE GLORY', 'SUN EXPLORER',
    'ARCTIC BREEZE', 'TERRA NOVA',
];

const FLAGS: { code: string; emoji: string }[] = [
    { code: 'IR', emoji: '🇮🇷' },
    { code: 'CN', emoji: '🇨🇳' },
    { code: 'RU', emoji: '🇷🇺' },
    { code: 'KP', emoji: '🇰🇵' },
    { code: 'PA', emoji: '🇵🇦' },
    { code: 'LR', emoji: '🇱🇷' },
    { code: 'MH', emoji: '🇲🇭' },
    { code: 'SG', emoji: '🇸🇬' },
    { code: 'HK', emoji: '🇭🇰' },
    { code: 'GR', emoji: '🇬🇷' },
    { code: 'MM', emoji: '🇲🇲' },
    { code: 'VN', emoji: '🇻🇳' },
    { code: 'TW', emoji: '🇹🇼' },
    { code: 'AE', emoji: '🇦🇪' },
    { code: 'IN', emoji: '🇮🇳' },
];

// ============================================================
// DATA GENERATION — Ontology-aware synthetic anomalies
// ============================================================

const ANOMALY_TYPES: AnomalyType[] = ['dark_activity', 'ship_to_ship', 'slow_sailing', 'area_visit'];
const VESSEL_TYPES: MaritimeVesselType[] = ['military_or_law', 'passenger', 'fishing', 'service_vessel', 'tanker', 'cargo'];
const RISK_CATS: MaritimeRiskCategory[] = ['sanctions_evasion', 'smuggling', 'iuu_fishing'];
const SEVERITIES: MaritimeAnomaly['severity'][] = ['low', 'medium', 'high', 'critical'];

function seededRandom(seed: number): () => number {
    let s = seed;
    return () => {
        s = (s * 16807) % 2147483647;
        return (s - 1) / 2147483646;
    };
}

/**
 * Generate realistic maritime anomaly data.
 * Uses ontology objects for contextual enrichment when available.
 */
export function generateSyntheticAnomalyData(
    ontologyObjects: OntologyObject[] = [],
    count = 2024,
): MaritimeAnomaly[] {
    const rand = seededRandom(42);
    const anomalies: MaritimeAnomaly[] = [];

    // Extract vessel names from ontology for realism
    const ontologyVessels = ontologyObjects
        .filter(o => o.type === 'Vessel' && o.metadata.status === 'active')
        .map(o => o.title);
    const allVesselNames = [...new Set([...ontologyVessels, ...VESSEL_NAMES])];

    // Build weighted hotspot picker
    const totalWeight = HOTSPOT_REGIONS.reduce((acc, h) => acc + h.weight, 0);

    for (let i = 0; i < count; i++) {
        // Pick a hotspot based on weight
        let pick = rand() * totalWeight;
        let hotspot = HOTSPOT_REGIONS[0];
        for (const h of HOTSPOT_REGIONS) {
            pick -= h.weight;
            if (pick <= 0) { hotspot = h; break; }
        }

        const lat = hotspot.lat + (rand() - 0.5) * hotspot.radius * 2;
        const lng = hotspot.lng + (rand() - 0.5) * hotspot.radius * 2;

        const anomalyType = ANOMALY_TYPES[Math.floor(rand() * ANOMALY_TYPES.length)];
        const vesselType = VESSEL_TYPES[Math.floor(rand() * VESSEL_TYPES.length)];
        const flag = FLAGS[Math.floor(rand() * FLAGS.length)];
        const severity = SEVERITIES[Math.floor(rand() * SEVERITIES.length)];
        const vesselName = allVesselNames[Math.floor(rand() * allVesselNames.length)];

        // Anomaly-type specific speed
        let speedKnots: number | undefined;
        if (anomalyType === 'slow_sailing') {
            speedKnots = +(rand() * 3).toFixed(1);
        } else if (anomalyType === 'dark_activity') {
            speedKnots = +(5 + rand() * 10).toFixed(1);
        }

        // Assign risk category with bias
        let riskCategory: MaritimeRiskCategory | undefined;
        if (rand() < 0.6) {
            riskCategory = RISK_CATS[Math.floor(rand() * RISK_CATS.length)];
        }

        const daysAgo = Math.floor(rand() * 30);
        const detectedAt = new Date(Date.now() - daysAgo * 86400000).toISOString();

        anomalies.push({
            id: `anomaly-${i.toString().padStart(4, '0')}`,
            type: anomalyType,
            lat: +lat.toFixed(4),
            lng: +lng.toFixed(4),
            vesselName,
            vesselType,
            flag: flag.code,
            riskCategory,
            severity,
            detectedAt,
            description: `${ANOMALY_TYPE_LABELS[anomalyType]} detected near ${hotspot.name}`,
            speedKnots,
        });
    }

    return anomalies;
}

// ============================================================
// CLUSTERING — Group nearby anomalies for map display
// ============================================================

const CLUSTER_RADIUS_DEG = 5; // ~550km at equator

export function clusterAnomalies(
    anomalies: MaritimeAnomaly[],
    filters: AnomalyType[] = [],
): AnomalyCluster[] {
    // Apply filters
    let filtered = anomalies;
    if (filters.length > 0) {
        filtered = anomalies.filter(a => filters.includes(a.type));
    }

    const used = new Set<string>();
    const clusters: AnomalyCluster[] = [];

    for (const anomaly of filtered) {
        if (used.has(anomaly.id)) continue;

        // Find nearby anomalies
        const nearby = filtered.filter(a => {
            if (used.has(a.id)) return false;
            const dlat = Math.abs(a.lat - anomaly.lat);
            const dlng = Math.abs(a.lng - anomaly.lng);
            return dlat < CLUSTER_RADIUS_DEG && dlng < CLUSTER_RADIUS_DEG;
        });

        for (const n of nearby) used.add(n.id);

        // Compute centroid
        const centLat = nearby.reduce((s, a) => s + a.lat, 0) / nearby.length;
        const centLng = nearby.reduce((s, a) => s + a.lng, 0) / nearby.length;

        // Dominant type
        const typeCounts = new Map<AnomalyType, number>();
        for (const a of nearby) {
            typeCounts.set(a.type, (typeCounts.get(a.type) || 0) + 1);
        }
        let dominantType: AnomalyType = 'dark_activity';
        let maxCount = 0;
        for (const [t, c] of typeCounts) {
            if (c > maxCount) { maxCount = c; dominantType = t; }
        }

        clusters.push({
            id: `cluster-${clusters.length}`,
            lat: +centLat.toFixed(4),
            lng: +centLng.toFixed(4),
            count: nearby.length,
            anomalies: nearby,
            dominantType,
        });
    }

    return clusters.sort((a, b) => b.count - a.count);
}

// ============================================================
// STATISTICS COMPUTATION
// ============================================================

export interface AnomalyStats {
    totalAnomalies: number;
    totalLocations: number;
    byType: Record<AnomalyType, number>;
    byRisk: Record<MaritimeRiskCategory, number>;
    byVesselType: Record<MaritimeVesselType, number>;
    byCountry: { code: string; count: number }[];
}

export function computeAnomalyStats(anomalies: MaritimeAnomaly[]): AnomalyStats {
    const byType: Record<AnomalyType, number> = { dark_activity: 0, ship_to_ship: 0, slow_sailing: 0, area_visit: 0 };
    const byRisk: Record<MaritimeRiskCategory, number> = { sanctions_evasion: 0, smuggling: 0, iuu_fishing: 0 };
    const byVesselType: Record<MaritimeVesselType, number> = { military_or_law: 0, passenger: 0, fishing: 0, service_vessel: 0, tanker: 0, cargo: 0 };
    const countryMap = new Map<string, number>();

    const locationSet = new Set<string>();

    for (const a of anomalies) {
        byType[a.type]++;
        if (a.riskCategory) byRisk[a.riskCategory]++;
        byVesselType[a.vesselType]++;
        countryMap.set(a.flag, (countryMap.get(a.flag) || 0) + 1);
        // Rough location dedup
        locationSet.add(`${Math.round(a.lat / 5)},${Math.round(a.lng / 5)}`);
    }

    const byCountry = [...countryMap.entries()]
        .map(([code, count]) => ({ code, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

    return {
        totalAnomalies: anomalies.length,
        totalLocations: locationSet.size,
        byType,
        byRisk,
        byVesselType,
        byCountry,
    };
}

// ============================================================
// 5-STEP PIPELINE — Full Ontology Decision Workflow
// ============================================================

export interface PipelineResult {
    step: number;
    status: 'running' | 'done' | 'error';
    message: string;
    riskNodes: OntologyObject[];
    riskEdges: OntologyLink[];
    proposals: AIStrategicProposal[];
}

/**
 * Execute the full 5-step ontology pipeline for a selected anomaly.
 * Returns a generator that yields status updates at each step.
 *
 * Steps:
 *   1. Register base maritime objects in ontologyStore
 *   2. Fetch & merge related intel/sanctions data
 *   3. AI risk analysis → create RiskEvent ontology nodes + edges
 *   4. Run quant P&L simulation with new risk ontology
 *   5. Generate executive action proposals in actionStore
 */
export async function runAnomalyPipeline(
    anomaly: MaritimeAnomaly,
    deps: {
        addObject: (obj: OntologyObject) => Promise<void>;
        addLink: (link: OntologyLink) => Promise<void>;
        objects: OntologyObject[];
        links: OntologyLink[];
        simulationParams: import('../types').SimulationParams;
        fleetData: import('../types').FleetVessel[];
        importProposals: (proposals: AIStrategicProposal[], scenarioName: string) => void;
    },
    onProgress: (step: number, message: string) => void,
): Promise<PipelineResult> {
    const result: PipelineResult = {
        step: 0,
        status: 'running',
        message: '',
        riskNodes: [],
        riskEdges: [],
        proposals: [],
    };

    const now = new Date().toISOString();

    try {
        // ═══════════════════════════════════════════════════
        // STEP 1: Register base maritime objects in ontologyStore
        // ═══════════════════════════════════════════════════
        onProgress(1, '기본 해양 객체를 온톨로지에 등록 중...');
        result.step = 1;

        // Check if vessel already exists
        const existingVessel = deps.objects.find(
            o => o.type === 'Vessel' && o.title === anomaly.vesselName,
        );

        const vesselId = existingVessel?.id || `vessel-anomaly-${anomaly.id}`;

        if (!existingVessel) {
            const vesselNode: OntologyObject = {
                id: vesselId,
                type: 'Vessel',
                title: anomaly.vesselName,
                description: `해양 이상 탐지 대상 선박 (${ANOMALY_TYPE_LABELS[anomaly.type]})`,
                properties: {
                    vesselType: anomaly.vesselType,
                    flag: anomaly.flag,
                    lat: anomaly.lat,
                    lng: anomaly.lng,
                    speed: anomaly.speedKnots || 0,
                    riskScore: anomaly.severity === 'critical' ? 90 : anomaly.severity === 'high' ? 70 : anomaly.severity === 'medium' ? 50 : 30,
                    location: `${anomaly.lat.toFixed(2)}°N, ${anomaly.lng.toFixed(2)}°E`,
                    destination: 'Unknown',
                },
                metadata: { createdAt: now, updatedAt: now, source: 'maritime-anomaly-detector', status: 'active' },
            };
            await deps.addObject(vesselNode);
        }

        await new Promise(r => setTimeout(r, 600));

        // ═══════════════════════════════════════════════════
        // STEP 2: Fetch & merge related intel/sanctions data
        // ═══════════════════════════════════════════════════
        onProgress(2, '관련 제재/공문 데이터를 페치하고 온톨로지 속성에 병합 중...');
        result.step = 2;

        // Simulate intel data enrichment from newsService
        // In production, this would call newsService.fetchIntelForEntity()
        const intelData = {
            sanctionsStatus: anomaly.riskCategory === 'sanctions_evasion' ? 'FLAGGED' : 'CLEAR',
            lastKnownPort: 'Bandar Abbas',
            ownershipHistory: 'Shell company chain detected',
            relatedIncidents: Math.floor(Math.random() * 5) + 1,
        };

        // Merge intel into vessel properties if exists
        if (existingVessel) {
            // Properties are merged via updateObjectProperty in production
            console.info(`[Pipeline] Intel merged for ${anomaly.vesselName}: ${JSON.stringify(intelData)}`);
        }

        await new Promise(r => setTimeout(r, 800));

        // ═══════════════════════════════════════════════════
        // STEP 3: AI risk analysis → RiskEvent ontology nodes + edges
        // ═══════════════════════════════════════════════════
        onProgress(3, 'Gemini AI가 이상 행동 데이터를 분석하고 리스크 온톨로지 노드를 생성 중...');
        result.step = 3;

        // Create RiskEvent node from anomaly
        const riskNodeId = `risk-anomaly-${anomaly.id}-${Date.now()}`;
        const riskNode: OntologyObject = {
            id: riskNodeId,
            type: 'RiskEvent',
            title: `해양 이상: ${anomaly.vesselName} (${ANOMALY_TYPE_LABELS[anomaly.type]})`,
            description: `${anomaly.vesselName} 선박에서 ${ANOMALY_TYPE_LABELS[anomaly.type]} 이상 행동이 탐지됨. 위치: ${anomaly.lat.toFixed(2)}°N, ${anomaly.lng.toFixed(2)}°E. ${anomaly.riskCategory ? `위험 유형: ${RISK_CATEGORY_LABELS[anomaly.riskCategory]}` : ''}`,
            properties: {
                category: 'operational' as const,
                severity: anomaly.severity,
                region: `${anomaly.lat.toFixed(1)}°N, ${anomaly.lng.toFixed(1)}°E`,
                lat: anomaly.lat,
                lng: anomaly.lng,
                riskScore: anomaly.severity === 'critical' ? 95 : anomaly.severity === 'high' ? 75 : anomaly.severity === 'medium' ? 55 : 30,
                threatLevel: anomaly.severity.toUpperCase(),
                affectedVessels: 1,
                supplyChainImpact: anomaly.severity === 'critical' ? 80 : anomaly.severity === 'high' ? 60 : 30,
                anomalyType: anomaly.type,
                sanctionsStatus: intelData.sanctionsStatus,
            },
            metadata: { createdAt: now, updatedAt: now, source: 'maritime-anomaly-detector', status: 'active' },
        };

        await deps.addObject(riskNode);
        result.riskNodes.push(riskNode);

        // Create edge: RiskEvent → Vessel
        const edgeId = `link-anomaly-${anomaly.id}-${Date.now()}`;
        const riskEdge: OntologyLink = {
            id: edgeId,
            sourceId: riskNodeId,
            targetId: vesselId,
            relationType: 'EXPOSES_TO',
            weight: anomaly.severity === 'critical' ? 0.95 : anomaly.severity === 'high' ? 0.8 : 0.6,
            metadata: { label: `${riskNode.title} → ${anomaly.vesselName}`, createdAt: now },
        };

        await deps.addLink(riskEdge);
        result.riskEdges.push(riskEdge);

        // Try to call Gemini for deeper analysis (non-blocking)
        try {
            const { bffGenerate, cleanMarkdownFences } = await import('./geminiService' /* webpackChunkName: "gemini" */);
            const analysisPrompt = `해양 이상 탐지 분석:
선박: ${anomaly.vesselName} (${anomaly.vesselType}, 선적국: ${anomaly.flag})
이상 유형: ${ANOMALY_TYPE_LABELS[anomaly.type]}
위치: ${anomaly.lat.toFixed(2)}°N, ${anomaly.lng.toFixed(2)}°E
심각도: ${anomaly.severity}
${anomaly.riskCategory ? `위험 카테고리: ${RISK_CATEGORY_LABELS[anomaly.riskCategory]}` : ''}
${anomaly.speedKnots ? `항해 속도: ${anomaly.speedKnots} knots` : ''}

이 이상 행동이 해운 공급망에 미치는 잠재적 위험을 2-3문장으로 분석하라. JSON 응답만: { "analysis": "..." }`;

            const raw = await bffGenerate(analysisPrompt, 'gemini-2.5-flash');
            const cleaned = cleanMarkdownFences(raw);
            try {
                const parsed = JSON.parse(cleaned);
                if (parsed.analysis) {
                    console.info(`[Pipeline] Gemini analysis: ${parsed.analysis}`);
                }
            } catch { /* non-critical */ }
        } catch {
            console.info('[Pipeline] Gemini analysis skipped (API unavailable)');
        }

        await new Promise(r => setTimeout(r, 1000));

        // ═══════════════════════════════════════════════════
        // STEP 4: Quant P&L simulation with risk ontology
        // ═══════════════════════════════════════════════════
        onProgress(4, '리스크 온톨로지를 퀀트 엔진에 주입하여 재무 시뮬레이션 실행 중...');
        result.step = 4;

        try {
            const { runScenarioPnL } = await import('../lib/quantEngine');
            const baseParams = deps.simulationParams;

            // Create stressed params reflecting the anomaly risk
            const stressMultiplier = anomaly.severity === 'critical' ? 1.5 : anomaly.severity === 'high' ? 1.3 : 1.1;
            const branchParams = {
                ...baseParams,
                newsSentimentScore: Math.min(100, Math.round((baseParams.newsSentimentScore || 30) * stressMultiplier)),
                supplyChainStress: Math.min(100, Math.round((baseParams.supplyChainStress || 20) * stressMultiplier)),
            };

            const pnlResult = runScenarioPnL(baseParams, branchParams, deps.fleetData);
            console.info(`[Pipeline] P&L Simulation: Net Δ = $${pnlResult.fleet.netPnLDelta.toLocaleString()}`);
        } catch (err) {
            console.warn('[Pipeline] Quant simulation skipped:', err);
        }

        await new Promise(r => setTimeout(r, 800));

        // ═══════════════════════════════════════════════════
        // STEP 5: Generate executive action proposals
        // ═══════════════════════════════════════════════════
        onProgress(5, '경영진 의사결정 액션을 생성하고 브리핑 준비 중...');
        result.step = 5;

        const proposals: AIStrategicProposal[] = [
            {
                id: `maritime-strat-${Date.now()}-1`,
                actionType: 'OPERATIONAL',
                title: `${anomaly.vesselName} 집중 모니터링 및 경보 발령`,
                description: `${ANOMALY_TYPE_LABELS[anomaly.type]} 이상 행동이 탐지된 ${anomaly.vesselName} 선박에 대한 강화 모니터링 체계를 즉시 가동합니다.`,
                rationale: `해양 이상 탐지기에서 심각도 ${anomaly.severity.toUpperCase()} 이상 행동을 포착. ${anomaly.riskCategory ? RISK_CATEGORY_LABELS[anomaly.riskCategory] + ' 위험 분류.' : '추가 분석 필요.'}`,
                confidence: anomaly.severity === 'critical' ? 0.95 : anomaly.severity === 'high' ? 0.85 : 0.7,
                estimatedImpactUsd: anomaly.severity === 'critical' ? -500000 : anomaly.severity === 'high' ? -200000 : -50000,
                targetDepartment: '운항관제팀',
                departmentMessage: `${anomaly.vesselName} 선박에 대한 AIS 추적 강화 및 관련 항만 당국에 통보 요망.\n위치: ${anomaly.lat.toFixed(2)}°N, ${anomaly.lng.toFixed(2)}°E\n이상 유형: ${ANOMALY_TYPE_LABELS[anomaly.type]}`,
                priority: anomaly.severity === 'critical' ? 'IMMEDIATE' : 'SHORT_TERM',
                vesselTargets: [anomaly.vesselName],
            },
            {
                id: `maritime-strat-${Date.now()}-2`,
                actionType: 'HEDGING',
                title: `해역 리스크 보험 갱신 검토`,
                description: `해당 해역의 P&I/전쟁위험 보험 커버리지를 재검토하고 필요시 추가 부보를 진행합니다.`,
                rationale: `동 해역에서 반복적 이상 행동 탐지. 보험 갱신 시 추가 프리미엄 발생 가능.`,
                confidence: 0.75,
                estimatedImpactUsd: -150000,
                targetDepartment: '보험/법무팀',
                departmentMessage: `해양 이상 탐지 결과에 따른 보험 포트폴리오 리뷰 요청.\n대상 해역: ${anomaly.lat.toFixed(1)}°N, ${anomaly.lng.toFixed(1)}°E 반경`,
                priority: 'SHORT_TERM',
                vesselTargets: [anomaly.vesselName],
            },
        ];

        // Import proposals to action store
        deps.importProposals(proposals, `Maritime Anomaly: ${anomaly.vesselName}`);
        result.proposals = proposals;

        await new Promise(r => setTimeout(r, 600));

        result.status = 'done';
        result.message = '5단계 온톨로지 파이프라인 완료';
        onProgress(5, '파이프라인 완료! 온톨로지 및 액션 센터를 확인하세요.');

    } catch (err) {
        result.status = 'error';
        result.message = err instanceof Error ? err.message : 'Unknown error';
        onProgress(result.step, `오류: ${result.message}`);
    }

    return result;
}

// ============================================================
// AI BRIEFING GENERATOR
// ============================================================

export async function generateAnomalyBriefing(
    stats: AnomalyStats,
): Promise<string> {
    try {
        const { bffGenerate, cleanMarkdownFences } = await import('./geminiService');
        const prompt = `해양 이상 탐지 현황 브리핑:
총 이상 현상: ${stats.totalAnomalies}건
위치 수: ${stats.totalLocations}개
이상 유형: 어둠의 활동 ${stats.byType.dark_activity}건, 함선간 통신 ${stats.byType.ship_to_ship}건, 저속 항해 ${stats.byType.slow_sailing}건, 지역 방문 ${stats.byType.area_visit}건
위험 유형: 제재 회피 ${stats.byRisk.sanctions_evasion}건, 밀수 ${stats.byRisk.smuggling}건, IUU 낚시 ${stats.byRisk.iuu_fishing}건

위 데이터를 바탕으로 맞춤형 인사이트와 지표를 활용해 전략적 의사결정을 강화하고 성공을 이끌어 보세요. 핵심 패턴과 주의 사항을 2-3문장으로 요약하라. 한국어로 응답. JSON 응답만: { "briefing": "..." }`;

        const raw = await bffGenerate(prompt, 'gemini-2.5-flash');
        const cleaned = cleanMarkdownFences(raw);
        const parsed = JSON.parse(cleaned);
        return parsed.briefing || '해양 이상 현상 데이터 분석 중...';
    } catch {
        return '맞춤형 인사이트와 지표를 활용해 전략적 의사결정을 강화하고 성공을 이끌어 보세요. AI 브리핑을 로드하려면 새로고침하세요.';
    }
}
