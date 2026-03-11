import type { Scenario, FleetVessel, VulnerabilityDataPoint, BrokerReport, InsuranceCircular, OntologyObject, OntologyLink } from '../types';

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
// FLEET ONTOLOGY DATA
// Canonical fleet derived from ONTOLOGY_OBJECTS vessels.
// ============================================================
export const FLEET_DATA: FleetVessel[] = [
    {
        vessel_name: 'VL BREEZE',
        vessel_type: 'Crude Oil Tanker (VLCC)',
        location: 'Persian Gulf — Ras Laffan OPL',
        riskLevel: 'High',
        voyage_info: {
            departure_port: 'Ras Laffan (Qatar)',
            destination_port: 'Ulsan (South Korea)',
            sailed_days: 2,
            plan_days: 24,
            last_report_type: 'At Anchor',
            last_report_time: '2026-03-11T06:00:00',
            timezone: 'UTC+3',
        },
        speed_and_weather_metrics: {
            avg_speed: 0.1,
            speed_cp: 14.5,
            speed_diff: -14.4,
            avg_speed_good_wx: 15.0,
            still_water_avg_speed_good_wx: 15.2,
            avg_curf: 0.0,
            avg_wxf: 0.0,
        },
        consumption_and_rob: {
            avg_ifo: 52.0,
            ifo_cp: 55.0,
            ifo_diff: -3.0,
            fo_rob: 4100,
            lo_rob: 55,
            fw_rob: 310,
            total_consumed: 104,
        },
        compliance: {
            cii_rating: 'A',
            cii_trend: 'Stable',
        },
    },
    {
        vessel_name: 'STAR MARIA',
        vessel_type: 'Bulk Carrier',
        location: 'Arabian Sea — En Route to Shinas, Oman',
        riskLevel: 'Medium',
        voyage_info: {
            departure_port: 'Sharjah Anchorage (UAE)',
            destination_port: 'Shinas (Oman)',
            sailed_days: 1,
            plan_days: 2,
            last_report_type: 'Noon Report',
            last_report_time: '2026-03-11T08:00:00',
            timezone: 'UTC+4',
        },
        speed_and_weather_metrics: {
            avg_speed: 11.3,
            speed_cp: 12.5,
            speed_diff: -1.2,
            avg_speed_good_wx: 12.0,
            still_water_avg_speed_good_wx: 12.3,
            avg_curf: -0.1,
            avg_wxf: -0.2,
        },
        consumption_and_rob: {
            avg_ifo: 28.0,
            ifo_cp: 30.0,
            ifo_diff: -2.0,
            fo_rob: 1850,
            lo_rob: 32,
            fw_rob: 140,
            total_consumed: 28,
        },
        compliance: {
            cii_rating: 'B',
            cii_trend: 'Stable',
        },
    },
];

// ============================================================
// TIME-SERIES VULNERABILITY DATA (30 days)
// ============================================================
export const BASE_VULNERABILITY_DATA: VulnerabilityDataPoint[] = [
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
// MARKET & ASSET VALUATION
// ============================================================
export const BROKER_REPORTS: BrokerReport[] = [
    {
        source: 'Clarksons',
        date: '2026-03-06',
        asset_class: 'VLCC (5-year old)',
        current_price_mil_usd: 112.5,
        wow_change_pct: '+1.5',
        market_sentiment: 'Firm, driven by ton-mile demand increase',
    },
    {
        source: 'SSY',
        date: '2026-03-06',
        asset_class: 'Suezmax (5-year old)',
        current_price_mil_usd: 78.0,
        wow_change_pct: '+0.8',
        market_sentiment: 'Stable with upward bias',
    },
    {
        source: 'Fearnleys',
        date: '2026-03-06',
        asset_class: 'Aframax (5-year old)',
        current_price_mil_usd: 62.5,
        wow_change_pct: '-0.3',
        market_sentiment: 'Soft, oversupply in Mediterranean',
    },
];

// ============================================================
// RISK & COMPLIANCE NOTICES
// ============================================================
export const INSURANCE_CIRCULARS: InsuranceCircular[] = [
    {
        issuer: 'H&M Underwriters',
        date: '2026-03-08',
        title: '호르무즈 해협 AWRP(추가전쟁보험료) 요율 인상 안내',
        impact: '해당 수역 진입 선박 선체 가치의 0.05%에서 0.25%로 급등',
    },
    {
        issuer: 'West of England P&I',
        date: '2026-03-07',
        title: '중동 수역 확장 위험 지역 고시',
        impact: '오만만 및 아라비해 북부 추가 지정, 사전 통보 72시간 의무화',
    },
];

// ============================================================
// ONTOLOGY GRAPH — OBJECTS (Nodes)
// Production Demo Dataset: "Hormuz Crisis Ripple Effect"
//
// 16 Nodes across 5 domain tiers:
//   1. Macro & Geo (3): Hormuz Tension, Brent Crude, War Risk Premium
//   2. Maritime Assets (2): VLCC Apollo, MSC Isabella
//   3. Chokepoints & Ports (3): Strait of Hormuz, Busan Port, Singapore Port
//   4. Financial/Market (4): VLSFO, VLCC 5yr Value, KRW, EUR
//   5. Risk Factors (2): Supply Chain Disruption, Reroute Cost
// ============================================================
const NOW = '2026-03-11T10:00:00Z';
const mockMeta = (source = 'Palantir AIP') => ({
    createdAt: NOW,
    updatedAt: NOW,
    source,
    status: 'active' as const,
});

export const ONTOLOGY_OBJECTS: OntologyObject[] = [
    // ================================================================
    // 🌐 TIER 1: 거시 경제 및 지정학 (Macro & Geo)
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
        metadata: mockMeta(),
    },
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
        metadata: mockMeta('Bloomberg Terminal'),
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
        metadata: mockMeta('Lloyd\'s of London'),
    },

    // ================================================================
    // 🚢 TIER 2: Maritime Assets
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
        metadata: mockMeta('Noon Report'),
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
        metadata: mockMeta('Noon Report'),
    },

    // ================================================================
    // ⚓ TIER 3: Chokepoints & Ports
    // ================================================================
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
        metadata: mockMeta('UKMTO / ONI'),
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
        metadata: mockMeta('BPCA'),
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
        metadata: mockMeta('MPA Singapore'),
    },

    // ================================================================
    // 💰 TIER 4: Financial & Market
    // ================================================================
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
        metadata: mockMeta('Ship & Bunker'),
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
        metadata: mockMeta('Clarksons Research'),
    },
    {
        id: 'currency-krw',
        type: 'Currency',
        title: 'KRW (Korean Won)',
        properties: { code: 'KRW', baseRate: 1420, riskScore: 22, impactValue: 22, previousRate: 1385, weeklyChange: '+2.5%' },
        metadata: mockMeta('api:frankfurter'),
    },
    {
        id: 'currency-eur',
        type: 'Currency',
        title: 'EUR (Euro)',
        properties: { code: 'EUR', baseRate: 0.905, riskScore: 15, impactValue: 15, previousRate: 0.918, weeklyChange: '-1.4%' },
        metadata: mockMeta('api:frankfurter'),
    },

    // ================================================================
    // ⚠️ TIER 5: Risk Factors
    // ================================================================
    {
        id: 'risk-supply-chain',
        type: 'RiskFactor',
        title: 'Supply Chain Disruption',
        description: 'Hormuz crisis cascading into global energy/logistics supply chain collapse risk.',
        properties: { category: 'supply', baseImpact: 85, riskScore: 75, impactValue: 75 },
        metadata: mockMeta(),
    },
    {
        id: 'risk-reroute-cost',
        type: 'RiskFactor',
        title: 'Reroute Cost Increase',
        description: 'Cape reroute adds $2.7M fuel cost + 14 days delay per voyage.',
        properties: { category: 'operational', baseImpact: 70, riskScore: 60, impactValue: 60, extraCostPerVoyageUsd: 2730000, extraDays: 14 },
        metadata: mockMeta(),
    },
];

// ============================================================
// ONTOLOGY GRAPH — LINKS (Edges)
// "Hormuz Crisis Ripple Effect" — Directed Risk Propagation Graph
//
// REFERENTIAL INTEGRITY CHECK:
//   All sourceId/targetId values exist in ONTOLOGY_OBJECTS above:
//   macro-hormuz-tension, commodity-brent, insurance-war-risk,
//   vessel-vl-breeze, vessel-star-maria, chokepoint-hormuz,
//   port-busan, port-singapore, commodity-vlsfo, market-vlcc-5yr,
//   currency-krw, currency-eur, risk-supply-chain, risk-reroute-cost
// ============================================================
export const ONTOLOGY_LINKS: OntologyLink[] = [
    // ── Hormuz Tension → Macro/Financial cascade ──
    { id: 'link-ht-brent', sourceId: 'macro-hormuz-tension', targetId: 'commodity-brent', relationType: 'TRIGGERS', weight: 0.90, metadata: { label: 'causes spike in oil price' } },
    { id: 'link-ht-wrp', sourceId: 'macro-hormuz-tension', targetId: 'insurance-war-risk', relationType: 'TRIGGERS', weight: 0.85, metadata: { label: 'increases war risk premium' } },
    { id: 'link-ht-hormuz', sourceId: 'macro-hormuz-tension', targetId: 'chokepoint-hormuz', relationType: 'AFFECTED_BY', weight: 0.95, metadata: { label: 'threatens navigation' } },
    { id: 'link-ht-vlsfo', sourceId: 'macro-hormuz-tension', targetId: 'commodity-vlsfo', relationType: 'TRIGGERS', weight: 0.80, metadata: { label: 'fuel price spike' } },
    { id: 'link-ht-supply', sourceId: 'macro-hormuz-tension', targetId: 'risk-supply-chain', relationType: 'TRIGGERS', weight: 0.88, metadata: { label: 'supply chain cascade' } },

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
