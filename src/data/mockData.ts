import type { Scenario, FleetVessel, VulnerabilityDataPoint, BrokerReport, InsuranceCircular } from '../types';

// ============================================================
// BASE SCENARIOS
// ============================================================
export const BASE_SCENARIOS: Scenario[] = [
    {
        id: 'peaceful',
        name: '평시 경영 환경 (Business as Usual)',
        description: '안정적인 글로벌 해운 시장. 지정학적 리스크 최소.',
        params: {
            vlsfoPrice: 600,
            newsSentimentScore: 15,
            awrpRate: 0.02,
            interestRate: 3.5,
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
        },
    },
];

export const DEFAULT_PARAMS = BASE_SCENARIOS[0].params;

// ============================================================
// FLEET ONTOLOGY DATA
// ============================================================
export const FLEET_DATA: FleetVessel[] = [
    {
        vessel_name: 'Oceanic Titan',
        vessel_type: 'VLCC',
        location: 'Hormuz Strait (Persian Gulf)',
        riskLevel: 'Medium',
        voyage_info: {
            departure_port: 'Ras Tanura',
            destination_port: 'Ulsan',
            sailed_days: 12.5,
            plan_days: 21.0,
            last_report_type: 'Noon Report',
            last_report_time: '2026-03-09T12:00:00',
            timezone: 'UTC+9',
        },
        speed_and_weather_metrics: {
            avg_speed: 12.4,
            speed_cp: 13.0,
            speed_diff: -0.6,
            avg_speed_good_wx: 13.1,
            still_water_avg_speed_good_wx: 13.3,
            avg_curf: -0.2,
            avg_wxf: -0.5,
        },
        consumption_and_rob: {
            avg_ifo: 45.2,
            ifo_cp: 47.0,
            ifo_diff: -1.8,
            fo_rob: 1250.0,
            lo_rob: 35.5,
            fw_rob: 180.0,
            total_consumed: 565.0,
        },
        compliance: {
            cii_rating: 'C',
            cii_trend: 'Stable',
        },
    },
    {
        vessel_name: 'Pacific Pioneer',
        vessel_type: 'Suezmax',
        location: 'West Africa (Lagos Anchorage)',
        riskLevel: 'Low',
        voyage_info: {
            departure_port: 'Bonny',
            destination_port: 'Rotterdam',
            sailed_days: 3.0,
            plan_days: 18.0,
            last_report_type: 'Noon Report',
            last_report_time: '2026-03-09T12:00:00',
            timezone: 'UTC+1',
        },
        speed_and_weather_metrics: {
            avg_speed: 13.8,
            speed_cp: 14.0,
            speed_diff: -0.2,
            avg_speed_good_wx: 14.1,
            still_water_avg_speed_good_wx: 14.2,
            avg_curf: 0.1,
            avg_wxf: -0.1,
        },
        consumption_and_rob: {
            avg_ifo: 52.1,
            ifo_cp: 53.0,
            ifo_diff: -0.9,
            fo_rob: 2100.0,
            lo_rob: 42.0,
            fw_rob: 210.0,
            total_consumed: 156.3,
        },
        compliance: {
            cii_rating: 'B',
            cii_trend: 'Improving',
        },
    },
    {
        vessel_name: 'Gulf Voyager',
        vessel_type: 'Aframax',
        location: 'Middle East (Fujairah)',
        riskLevel: 'Medium',
        voyage_info: {
            departure_port: 'Fujairah',
            destination_port: 'Mumbai',
            sailed_days: 1.5,
            plan_days: 5.0,
            last_report_type: 'Departure Report',
            last_report_time: '2026-03-10T06:00:00',
            timezone: 'UTC+4',
        },
        speed_and_weather_metrics: {
            avg_speed: 14.2,
            speed_cp: 14.5,
            speed_diff: -0.3,
            avg_speed_good_wx: 14.4,
            still_water_avg_speed_good_wx: 14.5,
            avg_curf: 0.0,
            avg_wxf: -0.1,
        },
        consumption_and_rob: {
            avg_ifo: 38.5,
            ifo_cp: 40.0,
            ifo_diff: -1.5,
            fo_rob: 850.0,
            lo_rob: 28.0,
            fw_rob: 150.0,
            total_consumed: 57.75,
        },
        compliance: {
            cii_rating: 'B',
            cii_trend: 'Stable',
        },
    },
    {
        vessel_name: 'Nordic Carrier',
        vessel_type: 'VLCC',
        location: 'North Sea (Rotterdam)',
        riskLevel: 'Low',
        voyage_info: {
            departure_port: 'Rotterdam',
            destination_port: 'Ningbo',
            sailed_days: 0,
            plan_days: 28.0,
            last_report_type: 'At Berth',
            last_report_time: '2026-03-10T18:00:00',
            timezone: 'UTC+1',
        },
        speed_and_weather_metrics: {
            avg_speed: 0,
            speed_cp: 13.0,
            speed_diff: 0,
            avg_speed_good_wx: 0,
            still_water_avg_speed_good_wx: 0,
            avg_curf: 0,
            avg_wxf: 0,
        },
        consumption_and_rob: {
            avg_ifo: 0,
            ifo_cp: 47.0,
            ifo_diff: 0,
            fo_rob: 3200.0,
            lo_rob: 55.0,
            fw_rob: 300.0,
            total_consumed: 0,
        },
        compliance: {
            cii_rating: 'A',
            cii_trend: 'Improving',
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
