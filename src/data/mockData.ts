import type { Scenario, OntologyObject, OntologyLink } from '../types';

// ============================================================
// BASE SCENARIOS
// ============================================================
export const BASE_SCENARIOS: Scenario[] = [
    {
        id: 'realtime',
        name: '🔴 현재 상황 (Real-time Live)',
        description: '실시간 외부 데이터 기반 자동 갱신 모드. 유가, 환율, 뉴스 감성 분석 등이 30초 주기로 업데이트됩니다.',
        isRealtime: true,
        params: {
            vlsfoPrice: 620,
            newsSentimentScore: 35,
            awrpRate: 0.04,
            interestRate: 4.5,
            supplyChainStress: 25,
            cyberThreatLevel: 12,
            naturalDisasterIndex: 5,
            pandemicRisk: 3,
            tradeWarIntensity: 30,
            energyCrisisLevel: 22,
        },
    },
    {
        id: 'peaceful',
        name: '평시 경영 환경 (Business as Usual)',
        description: '안정적인 글로벌 해운 시장. 지정학적 리스크 최소.',
        params: {
            vlsfoPrice: 600,
            newsSentimentScore: 15,
            awrpRate: 0.02,
            interestRate: 3.5,
            supplyChainStress: 10,
            cyberThreatLevel: 5,
            naturalDisasterIndex: 0,
            pandemicRisk: 0,
            tradeWarIntensity: 5,
            energyCrisisLevel: 10,
        },
    },
    {
        id: 'iran-conflict',
        name: '이란-이스라엘-미국 무력 충돌 격화 (호르무즈 위기)',
        description: '호르무즈 해협 봉쇄 위협. VLSFO +35%, 운임 Spread +200%, AWRP 최고치.',
        params: {
            vlsfoPrice: 810,
            newsSentimentScore: 92,
            awrpRate: 0.25,
            interestRate: 4.2,
            supplyChainStress: 75,
            cyberThreatLevel: 30,
            naturalDisasterIndex: 0,
            pandemicRisk: 0,
            tradeWarIntensity: 40,
            energyCrisisLevel: 85,
        },
    },
    {
        id: 'stagflation',
        name: '글로벌 스태그플레이션',
        description: '고물가·저성장 동시 진행. 수요 위축과 원가 상승의 이중고.',
        params: {
            vlsfoPrice: 950,
            newsSentimentScore: 65,
            awrpRate: 0.05,
            interestRate: 7.5,
            supplyChainStress: 55,
            cyberThreatLevel: 15,
            naturalDisasterIndex: 10,
            pandemicRisk: 5,
            tradeWarIntensity: 60,
            energyCrisisLevel: 70,
        },
    },
    {
        id: 'pandemic-resurgence',
        name: '글로벌 팬데믹 재발 (신종 변이 바이러스)',
        description: '신종 변이 바이러스로 인한 글로벌 봉쇄. 항만 운영 중단, 선원 교대 불가.',
        params: {
            vlsfoPrice: 520,
            newsSentimentScore: 88,
            awrpRate: 0.03,
            interestRate: 2.0,
            supplyChainStress: 95,
            cyberThreatLevel: 20,
            naturalDisasterIndex: 5,
            pandemicRisk: 95,
            tradeWarIntensity: 30,
            energyCrisisLevel: 40,
        },
    },
    {
        id: 'natural-disaster',
        name: '대규모 천재지변 (태풍/지진/쓰나미)',
        description: '아시아 태평양 대규모 지진 및 쓰나미. 주요 항만 마비, 보험료 급등.',
        params: {
            vlsfoPrice: 700,
            newsSentimentScore: 78,
            awrpRate: 0.08,
            interestRate: 3.0,
            supplyChainStress: 85,
            cyberThreatLevel: 10,
            naturalDisasterIndex: 95,
            pandemicRisk: 15,
            tradeWarIntensity: 10,
            energyCrisisLevel: 50,
        },
    },
    {
        id: 'trade-war',
        name: '미중 무역전쟁 전면전',
        description: '관세 300% 부과. 글로벌 무역량 30% 급감. 대체 항로 급등.',
        params: {
            vlsfoPrice: 580,
            newsSentimentScore: 72,
            awrpRate: 0.04,
            interestRate: 5.5,
            supplyChainStress: 80,
            cyberThreatLevel: 25,
            naturalDisasterIndex: 0,
            pandemicRisk: 0,
            tradeWarIntensity: 95,
            energyCrisisLevel: 55,
        },
    },
    {
        id: 'cyber-attack',
        name: '글로벌 사이버 공격 (항만/물류 인프라 마비)',
        description: '국가 배후 사이버공격으로 GPS, AIS, 항만 시스템 마비. 디지털 물류 중단.',
        params: {
            vlsfoPrice: 650,
            newsSentimentScore: 85,
            awrpRate: 0.15,
            interestRate: 4.0,
            supplyChainStress: 70,
            cyberThreatLevel: 98,
            naturalDisasterIndex: 0,
            pandemicRisk: 0,
            tradeWarIntensity: 20,
            energyCrisisLevel: 45,
        },
    },
    {
        id: 'energy-crisis',
        name: '글로벌 에너지 위기 (OPEC 감산 + 전쟁)',
        description: 'OPEC 급감산 + 중동 불안으로 유가 $150 돌파. 에너지 비용 폭등.',
        params: {
            vlsfoPrice: 1350,
            newsSentimentScore: 90,
            awrpRate: 0.20,
            interestRate: 6.0,
            supplyChainStress: 65,
            cyberThreatLevel: 15,
            naturalDisasterIndex: 5,
            pandemicRisk: 0,
            tradeWarIntensity: 35,
            energyCrisisLevel: 98,
        },
    },
];

export const DEFAULT_PARAMS = BASE_SCENARIOS[0].params;

// ============================================================
// LINKED OBJECT GRAPH — "Hormuz Crisis Ripple Effect"
//
// Storyline:
//   VL BREEZE (VLCC)가 Ras Laffan에서 원유를 적재 후 울산으로 향하는 중,
//   호르무즈 해협의 지정학적 긴장이 고조되어 대기 중이다.
//   이 위기는 유가, 연료비, 보험료, 환율 등에 연쇄적으로 영향을 미치며,
//   STAR MARIA (벌크선)도 아라비안해를 경유하는 항로에서 영향을 받는다.
//
// Graph Structure:
//   TIER 1 — 거시 리스크 (Macro & Geo)          → triggers cascade
//   TIER 2 — 해상 자산 (Maritime Assets)         → directly affected
//   TIER 3 — 항로 & 초크포인트 (Routes & Ports)   → operational bottleneck
//   TIER 4 — 시장 지표 (Financial & Market)       → cost/revenue impact
//   TIER 5 — 리스크 팩터 (Risk Factors)           → amplifiers
// ============================================================

const NOW = '2026-03-13T10:00:00Z';
const meta = (source = 'Palantir AIP') => ({
    createdAt: NOW,
    updatedAt: NOW,
    source,
    status: 'active' as const,
});

export const ONTOLOGY_OBJECTS: OntologyObject[] = [
    // ================================================================
    // 🌐 TIER 1: 거시 경제 및 지정학 (Macro & Geo Events)
    // ================================================================
    {
        id: 'macro-hormuz-tension',
        type: 'RiskFactor',
        title: 'Hormuz Tension',
        description: 'IRGC maritime activity surge + US carrier group deployment. UKMTO Level 3.',
        properties: {
            riskScore: 95,
            category: 'geopolitical',
            severity: 'critical',
            status: 'Armed group activity increasing',
            region: 'ME',
            lat: 26.56,
            lng: 56.25,
            impactValue: 95,
            threatLevel: 'UKMTO Level 3',
            lastIncident: '2026-03-09 IRGC fast boat approach near Hormuz TSS',
            affectedVessels: 23,
            supplyChainImpact: 85,
            energyImpact: 90,
        },
        metadata: meta(),
    },

    // ================================================================
    // 🚢 TIER 2: Maritime Assets (Vessels)
    // ================================================================
    {
        id: 'vessel-vl-breeze',
        type: 'Vessel',
        title: 'VL BREEZE',
        description: 'VLCC 319K DWT Crude Oil Tanker. 대한민국 국적. Ras Laffan 원유 적재 후 울산 향해 대기.',
        properties: {
            vesselType: 'Crude Oil Tanker (VLCC)',
            location: 'Persian Gulf — Ras Laffan OPL',
            riskScore: 72,
            status: 'Awaiting berth at Ras Laffan',
            departurePort: 'Ras Laffan (Qatar)',
            destinationPort: 'Ulsan (South Korea)',
            sailedDays: 2,
            planDays: 24,
            avgSpeed: 0.1,
            speedCp: 14.5,
            avgIfo: 52.0,
            foRob: 4100,
            loRob: 55,
            fwRob: 310,
            totalConsumed: 104,
            ciiRating: 'A',
            ciiTrend: 'Stable',
            lastReportType: 'At Anchor',
            lastReportTime: '2026-03-11T06:00:00',
            timezone: 'UTC+3',
            ifoCp: 55.0,
            speedDiff: -14.4,
            ifoDiff: -3.0,
            avgSpeedGoodWx: 15.0,
            stillWaterAvgSpeedGoodWx: 15.2,
            avgCurf: 0.0,
            avgWxf: 0.0,
            cargoValueUsd: 180000000,
            charterRate: 52000,
            dwt: 319202,
            imo: '9926738',
            mmsi: '441345000',
            callSign: 'D7YP',
            flag: 'Republic of Korea',
            yearBuilt: 2022,
            loa: 333,
            beam: 60,
            impactValue: 72,
            lat: 25.85,
            lng: 51.55,
            fuel: 88,
            freshWater: 76,
            lubeOil: 93,
            crewCount: 25,
            heading: 135,
            destination: 'Ulsan (South Korea)',
            eta: '2026-04-02T10:00:00Z',
        },
        metadata: meta('Noon Report'),
    },
    {
        id: 'vessel-star-maria',
        type: 'Vessel',
        title: 'STAR MARIA',
        description: 'Bulk Carrier 82K DWT. 마셜아일랜드 국적. Arabian Sea 경유 Shinas 항 입항 예정.',
        properties: {
            vesselType: 'Bulk Carrier',
            location: 'Arabian Sea — En Route to Shinas, Oman',
            riskScore: 55,
            status: 'Under way to Shinas',
            departurePort: 'Sharjah Anchorage (UAE)',
            destinationPort: 'Shinas (Oman)',
            sailedDays: 1,
            planDays: 2,
            avgSpeed: 11.3,
            speedCp: 12.5,
            avgIfo: 28.0,
            foRob: 1850,
            loRob: 32,
            fwRob: 140,
            totalConsumed: 28,
            ciiRating: 'B',
            ciiTrend: 'Stable',
            lastReportType: 'Noon Report',
            lastReportTime: '2026-03-11T08:00:00',
            timezone: 'UTC+4',
            ifoCp: 30.0,
            speedDiff: -1.2,
            ifoDiff: -2.0,
            avgSpeedGoodWx: 12.0,
            stillWaterAvgSpeedGoodWx: 12.3,
            avgCurf: -0.1,
            avgWxf: -0.2,
            cargoValueUsd: 8500000,
            charterRate: 18000,
            dwt: 82598,
            imo: '9401489',
            mmsi: '538002639',
            callSign: 'V7KL2',
            flag: 'Marshall Islands',
            yearBuilt: 2007,
            loa: 229,
            beam: 32,
            impactValue: 55,
            lat: 24.5,
            lng: 57.0,
            fuel: 62,
            freshWater: 22,
            lubeOil: 71,
            crewCount: 22,
            heading: 210,
            destination: 'Shinas (Oman)',
            eta: '2026-03-11T18:00:00Z',
        },
        metadata: meta('Noon Report'),
    },

    // ================================================================
    // ⚓ TIER 3: Routes, Chokepoints & Ports
    // ================================================================
    {
        id: 'route-raslaffan-ulsan',
        type: 'Route',
        title: 'Ras Laffan — Ulsan (Persian Gulf → Korea East)',
        description: 'Primary crude import route for South Korean refineries. Transits Hormuz Strait, Indian Ocean, Malacca Strait.',
        properties: {
            riskScore: 78,
            status: 'restricted',
            impactValue: 78,
            originPortId: 'chokepoint-hormuz',
            destinationPortId: 'port-busan',
            distanceNm: 6400,
            estimatedDays: 24,
            riskZones: 'Hormuz TSS, Gulf of Oman HRA',
            fuelCostEstimateUsd: 1820000,
            currentStatus: 'restricted',
            lat: 15.0,
            lng: 70.0,
        },
        metadata: meta('Voyage Planning'),
    },
    {
        id: 'route-sharjah-shinas',
        type: 'Route',
        title: 'Sharjah — Shinas (Short-Sea Gulf)',
        description: 'Short-sea coastal route within Persian Gulf / Gulf of Oman.',
        properties: {
            riskScore: 42,
            status: 'open',
            impactValue: 42,
            originPortId: 'chokepoint-hormuz',
            destinationPortId: 'port-singapore',
            distanceNm: 180,
            estimatedDays: 2,
            riskZones: 'Gulf of Oman coastal',
            fuelCostEstimateUsd: 45000,
            currentStatus: 'open',
            lat: 25.3,
            lng: 56.5,
        },
        metadata: meta('Voyage Planning'),
    },
    {
        id: 'chokepoint-hormuz',
        type: 'Port',
        title: 'Strait of Hormuz',
        description: '21% of global seaborne oil transits here. UKMTO Level 3. Vessel queue forming.',
        properties: {
            riskScore: 92,
            region: 'ME',
            status: 'Navigation Risk — Level 3',
            baseWaitDays: 4.5,
            latitude: 26.56,
            longitude: 56.25,
            lat: 26.56,
            lng: 56.25,
            dailyTraffic: 85,
            oilTransitMbpd: 17.5,
            securityLevel: 'UKMTO Level 3',
            queuedVessels: 23,
            impactValue: 92,
            congestionPct: 88,
        },
        metadata: meta('UKMTO / ONI'),
    },
    {
        id: 'port-busan',
        type: 'Port',
        title: 'Busan Port',
        description: 'Korea largest container/crude port. VLCC arrival delay 7-14 days expected. Congestion 78%.',
        properties: {
            riskScore: 45,
            region: 'KR',
            status: 'Arrival delay concern',
            baseWaitDays: 2.5,
            latitude: 35.10,
            longitude: 129.03,
            lat: 35.10,
            lng: 129.03,
            congestionPct: 78,
            impactValue: 45,
            annualTEU: 22000000,
            crudeImportPct: 35,
            affectedCargoDays: 7,
        },
        metadata: meta('BPCA'),
    },
    {
        id: 'port-singapore',
        type: 'Port',
        title: 'Singapore Port',
        description: 'World largest transshipment hub. Cape reroute causing bunkering demand surge.',
        properties: {
            riskScore: 38,
            region: 'SEA',
            status: 'Bunkering demand surge',
            baseWaitDays: 3.8,
            latitude: 1.26,
            longitude: 103.84,
            lat: 1.26,
            lng: 103.84,
            congestionPct: 65,
            impactValue: 38,
            annualTEU: 39000000,
            bunkerDemandSpike: '+32%',
            avgBunkerPriceMt: 680,
        },
        metadata: meta('MPA Singapore'),
    },

    // ================================================================
    // 💰 TIER 4: Financial & Market (Commodities, Assets, Currencies, Insurance)
    // ================================================================
    {
        id: 'commodity-brent',
        type: 'Commodity',
        title: 'Brent Crude Oil',
        description: 'International crude benchmark. $92/bbl surge on Hormuz tension + OPEC cuts.',
        properties: {
            riskScore: 82,
            basePrice: 92,
            unit: '$/bbl',
            status: '$92/bbl breakout',
            previousPrice: 78,
            priceChange: '+17.9%',
            volatility: 0.22,
            impactValue: 82,
            lat: 58.0,
            lng: 0.0,
            benchmarkType: 'ICE Brent Futures',
            weeklyCeiling: 96,
            weeklyFloor: 84,
        },
        metadata: meta('Bloomberg Terminal'),
    },
    {
        id: 'commodity-vlsfo',
        type: 'Commodity',
        title: 'VLSFO',
        description: 'IMO 2020 compliant bunker fuel. $680/mt on crude surge + demand spike.',
        properties: {
            riskScore: 58,
            basePrice: 680,
            unit: '$/mt',
            status: '$680/mt breakout',
            previousPrice: 600,
            priceChange: '+13.3%',
            volatility: 0.15,
            impactValue: 58,
            lat: 1.26,
            lng: 103.84,
        },
        metadata: meta('Ship & Bunker'),
    },
    {
        id: 'insurance-war-risk',
        type: 'Insurance',
        title: 'War Risk Premium (AWRP)',
        description: 'H&M Underwriters AWRP surcharge: +0.75% of hull value for Persian Gulf entry.',
        properties: {
            riskScore: 88,
            issuer: 'H&M Underwriters / West of England P&I',
            rateFrom: 0.0005,
            rateTo: 0.0075,
            status: '0.75% surcharge',
            impactValue: 88,
            lat: 26.0,
            lng: 56.0,
            premiumCostPerVlcc: 840000,
            effectiveDate: '2026-03-08',
            preNoticeHours: 72,
            affectedZone: 'Persian Gulf / Strait of Hormuz / Gulf of Oman',
        },
        metadata: meta('Lloyd\'s of London'),
    },
    {
        id: 'market-vlcc-5yr',
        type: 'Market',
        title: 'VLCC (5-year old) Asset Value',
        description: 'Clarksons VLCC 5yr valuation. Rising on Hormuz crisis premium.',
        properties: {
            source: 'Clarksons',
            assetClass: 'VLCC (5-year old)',
            priceMilUsd: 118.0,
            wowChangePct: 4.2,
            sentiment: 'Firm — Hormuz premium',
            riskScore: 30,
            impactValue: 30,
        },
        metadata: meta('Clarksons Research'),
    },
    {
        id: 'currency-krw',
        type: 'Currency',
        title: 'KRW (Korean Won)',
        properties: { code: 'KRW', baseRate: 1420, riskScore: 22, impactValue: 22, previousRate: 1385, weeklyChange: '+2.5%' },
        metadata: meta('api:frankfurter'),
    },
    {
        id: 'currency-eur',
        type: 'Currency',
        title: 'EUR (Euro)',
        properties: { code: 'EUR', baseRate: 0.905, riskScore: 15, impactValue: 15, previousRate: 0.918, weeklyChange: '-1.4%' },
        metadata: meta('api:frankfurter'),
    },

    // ================================================================
    // ⚠️ TIER 5: Risk Factors (Amplifiers)
    // ================================================================
    {
        id: 'risk-supply-chain',
        type: 'RiskFactor',
        title: 'Supply Chain Disruption',
        description: 'Hormuz crisis cascading into global energy/logistics supply chain collapse risk.',
        properties: { category: 'supply', baseImpact: 85, riskScore: 75, impactValue: 75 },
        metadata: meta(),
    },
    {
        id: 'risk-reroute-cost',
        type: 'RiskFactor',
        title: 'Reroute Cost Increase',
        description: 'Cape reroute adds $2.7M fuel cost + 14 days delay per voyage.',
        properties: { category: 'operational', baseImpact: 70, riskScore: 60, impactValue: 60, extraCostPerVoyageUsd: 2730000, extraDays: 14 },
        metadata: meta(),
    },
];

// ============================================================
// LINKED OBJECT GRAPH — EDGES
// "Hormuz Crisis Ripple Effect" — Directed Risk Propagation
//
// All sourceId/targetId values reference ONTOLOGY_OBJECTS above.
// ============================================================
export const ONTOLOGY_LINKS: OntologyLink[] = [
    // ── Hormuz Tension → Macro/Financial cascade ──
    { id: 'link-ht-brent', sourceId: 'macro-hormuz-tension', targetId: 'commodity-brent', relationType: 'TRIGGERS', weight: 0.90, metadata: { label: 'causes spike in oil price' } },
    { id: 'link-ht-wrp', sourceId: 'macro-hormuz-tension', targetId: 'insurance-war-risk', relationType: 'TRIGGERS', weight: 0.85, metadata: { label: 'increases war risk premium' } },
    { id: 'link-ht-hormuz', sourceId: 'macro-hormuz-tension', targetId: 'chokepoint-hormuz', relationType: 'AFFECTED_BY', weight: 0.95, metadata: { label: 'threatens navigation' } },
    { id: 'link-ht-vlsfo', sourceId: 'macro-hormuz-tension', targetId: 'commodity-vlsfo', relationType: 'TRIGGERS', weight: 0.80, metadata: { label: 'fuel price spike' } },
    { id: 'link-ht-supply', sourceId: 'macro-hormuz-tension', targetId: 'risk-supply-chain', relationType: 'TRIGGERS', weight: 0.88, metadata: { label: 'supply chain cascade' } },

    // ── Vessels → Routes (OPERATES_ON) ──
    { id: 'link-vlbreeze-route', sourceId: 'vessel-vl-breeze', targetId: 'route-raslaffan-ulsan', relationType: 'OPERATES_ON', weight: 0.95, metadata: { label: 'active voyage' } },
    { id: 'link-starmaria-route', sourceId: 'vessel-star-maria', targetId: 'route-sharjah-shinas', relationType: 'OPERATES_ON', weight: 0.90, metadata: { label: 'active voyage' } },

    // ── Routes → Chokepoints (TRANSITS) ──
    { id: 'link-route1-hormuz', sourceId: 'route-raslaffan-ulsan', targetId: 'chokepoint-hormuz', relationType: 'TRANSITS', weight: 0.90, metadata: { label: 'transits Hormuz Strait' } },
    { id: 'link-route2-hormuz', sourceId: 'route-sharjah-shinas', targetId: 'chokepoint-hormuz', relationType: 'TRANSITS', weight: 0.60, metadata: { label: 'near Hormuz zone' } },

    // ── Strait of Hormuz → Vessel delays ──
    { id: 'link-hormuz-vlbreeze', sourceId: 'chokepoint-hormuz', targetId: 'vessel-vl-breeze', relationType: 'AFFECTED_BY', weight: 0.90, metadata: { label: 'forces delay of transit' } },
    { id: 'link-hormuz-starmaria', sourceId: 'chokepoint-hormuz', targetId: 'vessel-star-maria', relationType: 'AFFECTED_BY', weight: 0.70, metadata: { label: 'wait for safe passage' } },

    // ── Cost factors → Vessel impact ──
    { id: 'link-brent-vlbreeze', sourceId: 'commodity-brent', targetId: 'vessel-vl-breeze', relationType: 'TRIGGERS', weight: 0.75, metadata: { label: 'increases voyage cost' } },
    { id: 'link-brent-starmaria', sourceId: 'commodity-brent', targetId: 'vessel-star-maria', relationType: 'TRIGGERS', weight: 0.65, metadata: { label: 'increases voyage cost' } },
    { id: 'link-wrp-vlbreeze', sourceId: 'insurance-war-risk', targetId: 'vessel-vl-breeze', relationType: 'INSURES', weight: 0.85, metadata: { label: 'AWRP surcharge applied' } },
    { id: 'link-wrp-starmaria', sourceId: 'insurance-war-risk', targetId: 'vessel-star-maria', relationType: 'INSURES', weight: 0.60, metadata: { label: 'AWRP surcharge applied' } },
    { id: 'link-vlsfo-vlbreeze', sourceId: 'commodity-vlsfo', targetId: 'vessel-vl-breeze', relationType: 'CARRIES', weight: 0.75, metadata: { label: 'fuel cost impact' } },
    { id: 'link-vlsfo-starmaria', sourceId: 'commodity-vlsfo', targetId: 'vessel-star-maria', relationType: 'CARRIES', weight: 0.80, metadata: { label: 'fuel cost impact' } },

    // ── Vessel → Port arrival impact ──
    { id: 'link-vlbreeze-busan', sourceId: 'vessel-vl-breeze', targetId: 'port-busan', relationType: 'ROUTES_THROUGH', weight: 0.80, metadata: { label: 'crude delivery to Ulsan/Busan' } },
    { id: 'link-starmaria-singapore', sourceId: 'vessel-star-maria', targetId: 'port-singapore', relationType: 'ROUTES_THROUGH', weight: 0.70, metadata: { label: 'bulk transit via Singapore' } },

    // ── Reroute cost factor ──
    { id: 'link-reroute-starmaria', sourceId: 'risk-reroute-cost', targetId: 'vessel-star-maria', relationType: 'DEPENDS_ON', weight: 0.85, metadata: { label: 'delay risk from Gulf tensions' } },
    { id: 'link-reroute-hormuz', sourceId: 'risk-reroute-cost', targetId: 'chokepoint-hormuz', relationType: 'DEPENDS_ON', weight: 0.75, metadata: { label: 'triggered by blockade risk' } },

    // ── Supply chain cascade ──
    { id: 'link-supply-busan', sourceId: 'risk-supply-chain', targetId: 'port-busan', relationType: 'AFFECTED_BY', weight: 0.72, metadata: { label: 'crude import delay' } },
    { id: 'link-supply-singapore', sourceId: 'risk-supply-chain', targetId: 'port-singapore', relationType: 'AFFECTED_BY', weight: 0.68, metadata: { label: 'transshipment bottleneck' } },

    // ── Market valuation impact ──
    { id: 'link-market-vlbreeze', sourceId: 'market-vlcc-5yr', targetId: 'vessel-vl-breeze', relationType: 'MONITORS', weight: 0.50, metadata: { label: 'asset valuation benchmark' } },
    { id: 'link-brent-market', sourceId: 'commodity-brent', targetId: 'market-vlcc-5yr', relationType: 'TRIGGERS', weight: 0.55, metadata: { label: 'drives tanker demand/value' } },

    // ── Currency exposure ──
    { id: 'link-vlsfo-krw', sourceId: 'commodity-vlsfo', targetId: 'currency-krw', relationType: 'PRICED_IN', weight: 0.35 },
    { id: 'link-brent-eur', sourceId: 'commodity-brent', targetId: 'currency-eur', relationType: 'PRICED_IN', weight: 0.40 },
    { id: 'link-ht-krw', sourceId: 'macro-hormuz-tension', targetId: 'currency-krw', relationType: 'TRIGGERS', weight: 0.45, metadata: { label: 'risk-off KRW weakness' } },

    // ── Cross-tier amplifiers ──
    { id: 'link-brent-vlsfo', sourceId: 'commodity-brent', targetId: 'commodity-vlsfo', relationType: 'TRIGGERS', weight: 0.85, metadata: { label: 'crude price drives bunker fuel price' } },
];

// ============================================================
// INITIAL ONTOLOGY GRAPH — Convenience export
// ============================================================
export const INITIAL_ONTOLOGY_GRAPH = {
    objects: ONTOLOGY_OBJECTS,
    links: ONTOLOGY_LINKS,
};
