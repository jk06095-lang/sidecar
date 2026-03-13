// ============================================================
// SCENARIO VARIABLE CATALOG
// 7 domains, 40+ variables — users assemble like LEGO bricks
// ============================================================

export interface ScenarioVariable {
    id: string;
    name: string;
    nameKo: string;
    category: ScenarioVariableCategory;
    unit: string;
    min: number;
    max: number;
    step: number;
    defaultValue: number;
    description: string;
    icon: string; // lucide icon name or emoji
    color: string; // tailwind color class
}

export type ScenarioVariableCategory =
    | 'energy'
    | 'supplyChain'
    | 'geopolitics'
    | 'finance'
    | 'maritime'
    | 'cyber'
    | 'health';

export interface CategoryMeta {
    id: ScenarioVariableCategory;
    label: string;
    labelKo: string;
    icon: string;
    color: string;
    borderColor: string;
    bgColor: string;
}

export const CATEGORY_META: Record<ScenarioVariableCategory, CategoryMeta> = {
    energy: { id: 'energy', label: 'Energy & Commodities', labelKo: '에너지 & 원자재', icon: '🛢️', color: 'text-orange-400', borderColor: 'border-orange-800/40', bgColor: 'bg-orange-950/20' },
    supplyChain: { id: 'supplyChain', label: 'Supply Chain & Logistics', labelKo: '공급망 & 물류', icon: '📦', color: 'text-amber-400', borderColor: 'border-amber-800/40', bgColor: 'bg-amber-950/20' },
    geopolitics: { id: 'geopolitics', label: 'Geopolitics & Security', labelKo: '지정학 & 안보', icon: '🌍', color: 'text-rose-400', borderColor: 'border-rose-800/40', bgColor: 'bg-rose-950/20' },
    finance: { id: 'finance', label: 'Finance & Economics', labelKo: '금융 & 경제', icon: '💰', color: 'text-blue-400', borderColor: 'border-blue-800/40', bgColor: 'bg-blue-950/20' },
    maritime: { id: 'maritime', label: 'Maritime & Climate', labelKo: '해양 & 기후', icon: '🌊', color: 'text-cyan-400', borderColor: 'border-cyan-800/40', bgColor: 'bg-cyan-950/20' },
    cyber: { id: 'cyber', label: 'Cyber & Technology', labelKo: '사이버 & 기술', icon: '🔒', color: 'text-violet-400', borderColor: 'border-violet-800/40', bgColor: 'bg-violet-950/20' },
    health: { id: 'health', label: 'Health & Society', labelKo: '보건 & 사회', icon: '🦠', color: 'text-pink-400', borderColor: 'border-pink-800/40', bgColor: 'bg-pink-950/20' },
};

export const SCENARIO_VARIABLE_CATALOG: ScenarioVariable[] = [
    // ── Energy & Commodities ──
    { id: 'vlsfoPrice', name: 'VLSFO Price', nameKo: 'VLSFO 유가', category: 'energy', unit: '$/mt', min: 300, max: 1500, step: 10, defaultValue: 620, description: 'Very Low Sulphur Fuel Oil 가격 (메트릭톤 당)', icon: 'Fuel', color: 'text-cyan-400' },
    { id: 'brentCrude', name: 'Brent Crude', nameKo: '브렌트 원유', category: 'energy', unit: '$/bbl', min: 30, max: 200, step: 1, defaultValue: 82, description: 'ICE 브렌트 원유 선물 가격', icon: 'Fuel', color: 'text-orange-400' },
    { id: 'wtiCrude', name: 'WTI Crude', nameKo: 'WTI 원유', category: 'energy', unit: '$/bbl', min: 25, max: 190, step: 1, defaultValue: 78, description: 'NYMEX WTI 원유 선물', icon: 'Fuel', color: 'text-orange-300' },
    { id: 'lngSpot', name: 'LNG Spot', nameKo: 'LNG 현물가', category: 'energy', unit: '$/MMBtu', min: 2, max: 60, step: 0.5, defaultValue: 12, description: 'JKM LNG 현물 가격', icon: 'Flame', color: 'text-blue-400' },
    { id: 'ironOre', name: 'Iron Ore', nameKo: '철광석', category: 'energy', unit: '$/mt', min: 50, max: 250, step: 1, defaultValue: 120, description: '62% Fe CFR 중국 기준', icon: 'Box', color: 'text-red-400' },
    { id: 'thermalCoal', name: 'Thermal Coal', nameKo: '석탄 (발전용)', category: 'energy', unit: '$/mt', min: 40, max: 400, step: 5, defaultValue: 150, description: 'Newcastle 발전용 석탄', icon: 'Flame', color: 'text-gray-400' },
    { id: 'steelHRC', name: 'Steel HRC', nameKo: '열연강판', category: 'energy', unit: '$/mt', min: 300, max: 1500, step: 10, defaultValue: 650, description: '열연강판 (Hot Rolled Coil) 국제 가격', icon: 'Box', color: 'text-slate-400' },
    { id: 'copperLME', name: 'Copper (LME)', nameKo: '구리 (LME)', category: 'energy', unit: '$/mt', min: 4000, max: 15000, step: 100, defaultValue: 8500, description: 'LME 구리 3개월 선물', icon: 'Box', color: 'text-orange-500' },
    { id: 'energyCrisisLevel', name: 'Energy Crisis', nameKo: '에너지 위기 수준', category: 'energy', unit: '/100', min: 0, max: 100, step: 1, defaultValue: 22, description: 'OPEC 감산, 에너지 안보 종합 위기 지수', icon: 'Flame', color: 'text-red-500' },

    // ── Supply Chain & Logistics ──
    { id: 'supplyChainStress', name: 'Supply Chain Stress', nameKo: '공급망 스트레스', category: 'supplyChain', unit: '/100', min: 0, max: 100, step: 1, defaultValue: 25, description: '항만 체선, 물류 지연, 원자재 부족 종합', icon: 'Package', color: 'text-amber-400' },
    { id: 'portCongestion', name: 'Port Congestion', nameKo: '항만 체선 지수', category: 'supplyChain', unit: '/100', min: 0, max: 100, step: 1, defaultValue: 20, description: '글로벌 주요 항만 체선/지연 정도', icon: 'Anchor', color: 'text-amber-300' },
    { id: 'containerShortage', name: 'Container Shortage', nameKo: '컨테이너 부족', category: 'supplyChain', unit: '/100', min: 0, max: 100, step: 1, defaultValue: 15, description: '글로벌 컨테이너 가용률 역지수', icon: 'Package', color: 'text-amber-500' },
    { id: 'freightLeadTime', name: 'Freight Lead Time', nameKo: '운송 리드타임', category: 'supplyChain', unit: 'days', min: 5, max: 90, step: 1, defaultValue: 25, description: '아시아→유럽 평균 해상 운송 소요일', icon: 'Clock', color: 'text-yellow-400' },
    { id: 'bdiFactor', name: 'BDI Volatility', nameKo: 'BDI 변동성', category: 'supplyChain', unit: '/100', min: 0, max: 100, step: 1, defaultValue: 30, description: 'Baltic Dry Index 변동성 지수', icon: 'TrendingUp', color: 'text-yellow-500' },
    { id: 'warehousingCost', name: 'Warehousing Cost', nameKo: '보관비용 지수', category: 'supplyChain', unit: '/100', min: 0, max: 100, step: 1, defaultValue: 20, description: '글로벌 창고/보관 비용 상승률', icon: 'Warehouse', color: 'text-amber-600' },

    // ── Geopolitics & Security ──
    { id: 'newsSentimentScore', name: 'News Sentiment', nameKo: '글로벌 뉴스 불안 지수', category: 'geopolitics', unit: '/100', min: 0, max: 100, step: 1, defaultValue: 35, description: '지정학 리스크 및 시장 심리 불안 종합', icon: 'AlertTriangle', color: 'text-rose-400' },
    { id: 'awrpRate', name: 'AWRP Rate', nameKo: '전쟁보험료 율', category: 'geopolitics', unit: '%', min: 0, max: 1, step: 0.01, defaultValue: 0.04, description: '추가 전쟁 위험 보험료율 (Additional War Risk Premium)', icon: 'Shield', color: 'text-purple-400' },
    { id: 'tradeWarIntensity', name: 'Trade War', nameKo: '무역전쟁 강도', category: 'geopolitics', unit: '/100', min: 0, max: 100, step: 1, defaultValue: 30, description: '관세/제재/수출입 규제 종합 수준', icon: 'Globe2', color: 'text-rose-300' },
    { id: 'sanctionsLevel', name: 'Sanctions Level', nameKo: '국제 제재 수준', category: 'geopolitics', unit: '/100', min: 0, max: 100, step: 1, defaultValue: 15, description: 'UN/EU/US 제재 영향도 (이란, 러시아 등)', icon: 'Shield', color: 'text-rose-500' },
    { id: 'piracyThreat', name: 'Piracy Threat', nameKo: '해적 위협', category: 'geopolitics', unit: '/100', min: 0, max: 100, step: 1, defaultValue: 10, description: '소말리아/기니만/말라카해협 해적 활동 수준', icon: 'AlertTriangle', color: 'text-red-400' },
    { id: 'territorialDispute', name: 'Territorial Dispute', nameKo: '영토 분쟁', category: 'geopolitics', unit: '/100', min: 0, max: 100, step: 1, defaultValue: 20, description: '남중국해/대만해협/동해 분쟁 긴장도', icon: 'Globe2', color: 'text-rose-600' },
    { id: 'hormuzRisk', name: 'Hormuz Strait Risk', nameKo: '호르무즈 해협 위험', category: 'geopolitics', unit: '/100', min: 0, max: 100, step: 1, defaultValue: 15, description: '호르무즈 해협 봉쇄/분쟁 위험도', icon: 'AlertTriangle', color: 'text-red-500' },
    { id: 'suezRisk', name: 'Suez Canal Risk', nameKo: '수에즈 운하 위험', category: 'geopolitics', unit: '/100', min: 0, max: 100, step: 1, defaultValue: 10, description: '수에즈 운하 장애/우회 위험도', icon: 'AlertTriangle', color: 'text-orange-500' },

    // ── Finance & Economics ──
    { id: 'interestRate', name: 'Interest Rate', nameKo: '글로벌 기준금리', category: 'finance', unit: '%', min: 0, max: 15, step: 0.1, defaultValue: 4.5, description: 'Fed 기준금리 (글로벌 벤치마크)', icon: 'TrendingUp', color: 'text-blue-400' },
    { id: 'inflationRate', name: 'Inflation Rate', nameKo: '물가 상승률', category: 'finance', unit: '%', min: -2, max: 20, step: 0.1, defaultValue: 3.2, description: '미국 CPI 기준 연간 인플레이션율', icon: 'TrendingUp', color: 'text-blue-300' },
    { id: 'usdKrw', name: 'USD/KRW', nameKo: '원/달러 환율', category: 'finance', unit: '₩', min: 1000, max: 1600, step: 5, defaultValue: 1320, description: '달러 대비 원화 환율', icon: 'DollarSign', color: 'text-green-400' },
    { id: 'eurUsd', name: 'EUR/USD', nameKo: '유로/달러', category: 'finance', unit: '', min: 0.8, max: 1.4, step: 0.01, defaultValue: 1.08, description: '유로/달러 환율', icon: 'DollarSign', color: 'text-blue-500' },
    { id: 'cdsSpread', name: 'Korea CDS', nameKo: '한국 CDS 스프레드', category: 'finance', unit: 'bp', min: 10, max: 500, step: 5, defaultValue: 35, description: '한국 5년 CDS 스프레드 (bp)', icon: 'Shield', color: 'text-blue-600' },
    { id: 'shippingStockIdx', name: 'Shipping Stock Index', nameKo: '해운주 지수', category: 'finance', unit: '/100', min: 0, max: 100, step: 1, defaultValue: 55, description: '글로벌 해운사 주가 종합 지수', icon: 'BarChart3', color: 'text-green-500' },

    // ── Maritime & Climate ──
    { id: 'speedDelta', name: 'Speed Adjustment', nameKo: '선속 조절', category: 'maritime', unit: 'knot', min: -3, max: 3, step: 0.5, defaultValue: 0, description: '기본 설계 속도 대비 증감 (감속→연비↑, 가속→도착↓)', icon: 'Gauge', color: 'text-cyan-400' },
    { id: 'capeReroute', name: 'Cape of Good Hope', nameKo: '희망봉 우회', category: 'maritime', unit: '0/1', min: 0, max: 1, step: 1, defaultValue: 0, description: '수에즈 운하 대신 희망봉(COGH) 우회 여부 (1=우회)', icon: 'Map', color: 'text-cyan-500' },
    { id: 'voyageDistance', name: 'Route Distance', nameKo: '항로 거리', category: 'maritime', unit: 'nm', min: 1000, max: 20000, step: 100, defaultValue: 6500, description: '편도 항해 거리 (해리, Nautical Miles)', icon: 'Route', color: 'text-cyan-300' },
    { id: 'cargoVolume', name: 'Cargo Volume', nameKo: '화물 적재량', category: 'maritime', unit: 'mt', min: 50000, max: 320000, step: 5000, defaultValue: 270000, description: '항차별 화물 적재량 (메트릭톤)', icon: 'Package', color: 'text-cyan-400' },
    { id: 'freightRateWS', name: 'Freight Rate (WS)', nameKo: 'WS 운임 지수', category: 'maritime', unit: 'WS', min: 20, max: 200, step: 1, defaultValue: 55, description: 'Worldscale 운임 지수 (화주-선주 합의 용선료 기준)', icon: 'TrendingUp', color: 'text-cyan-600' },
    { id: 'naturalDisasterIndex', name: 'Natural Disaster', nameKo: '천재지변 지수', category: 'maritime', unit: '/100', min: 0, max: 100, step: 1, defaultValue: 5, description: '태풍/지진/쓰나미/홍수 물리적 위험', icon: 'CloudLightning', color: 'text-cyan-400' },
    { id: 'seaStateIndex', name: 'Sea State Index', nameKo: '해상 상태 지수', category: 'maritime', unit: '/100', min: 0, max: 100, step: 1, defaultValue: 20, description: '파고/풍속/해류 악화 종합지수', icon: 'Waves', color: 'text-cyan-300' },
    { id: 'typhoonRisk', name: 'Typhoon Risk', nameKo: '태풍 리스크', category: 'maritime', unit: '/100', min: 0, max: 100, step: 1, defaultValue: 10, description: '서태평양 태풍 활동 강도/빈도', icon: 'CloudLightning', color: 'text-cyan-500' },
    { id: 'iceNavigation', name: 'Ice Navigation Risk', nameKo: '빙해 항행 위험', category: 'maritime', unit: '/100', min: 0, max: 100, step: 1, defaultValue: 5, description: '북극/발트해 결빙에 따른 항행 제약', icon: 'Snowflake', color: 'text-sky-400' },
    { id: 'ecaCompliance', name: 'ECA Compliance Cost', nameKo: 'ECA 규제 비용', category: 'maritime', unit: '/100', min: 0, max: 100, step: 1, defaultValue: 30, description: '배출통제구역(ECA) 규제 준수 비용', icon: 'Leaf', color: 'text-emerald-400' },
    { id: 'carbonTax', name: 'Carbon Tax', nameKo: '탄소배출 비용', category: 'maritime', unit: '€/tCO₂', min: 0, max: 200, step: 5, defaultValue: 45, description: 'EU ETS 탄소배출권 가격', icon: 'Leaf', color: 'text-emerald-500' },

    // ── Cyber & Technology ──
    { id: 'cyberThreatLevel', name: 'Cyber Threat', nameKo: '사이버 위협 수준', category: 'cyber', unit: '/100', min: 0, max: 100, step: 1, defaultValue: 12, description: 'GPS/AIS/항만 IT 인프라 마비 위험도', icon: 'Wifi', color: 'text-violet-400' },
    { id: 'gpsJamming', name: 'GPS Jamming', nameKo: 'GPS 교란', category: 'cyber', unit: '/100', min: 0, max: 100, step: 1, defaultValue: 8, description: 'GPS/GNSS 재밍/스푸핑 위협 수준', icon: 'Wifi', color: 'text-violet-300' },
    { id: 'aisSpoofing', name: 'AIS Spoofing', nameKo: 'AIS 위조', category: 'cyber', unit: '/100', min: 0, max: 100, step: 1, defaultValue: 5, description: 'AIS 신호 위조/은닉 활동 수준', icon: 'Shield', color: 'text-violet-500' },
    { id: 'portItDisruption', name: 'Port IT Disruption', nameKo: '항만 IT 장애', category: 'cyber', unit: '/100', min: 0, max: 100, step: 1, defaultValue: 5, description: '항만 TOS/EDI 시스템 장애 위협', icon: 'Server', color: 'text-violet-600' },

    // ── Health & Society ──
    { id: 'pandemicRisk', name: 'Pandemic Risk', nameKo: '팬데믹 리스크', category: 'health', unit: '/100', min: 0, max: 100, step: 1, defaultValue: 3, description: '바이러스 변이/봉쇄/선원교대 불가', icon: 'Zap', color: 'text-pink-400' },
    { id: 'crewSupply', name: 'Crew Supply', nameKo: '선원 수급', category: 'health', unit: '/100', min: 0, max: 100, step: 1, defaultValue: 15, description: '글로벌 선원 수급 난이도 (부족 시 ↑)', icon: 'Users', color: 'text-pink-300' },
    { id: 'laborStrike', name: 'Labor Strike', nameKo: '노동 파업', category: 'health', unit: '/100', min: 0, max: 100, step: 1, defaultValue: 5, description: '항만/터미널 노동자 파업 가능성', icon: 'AlertTriangle', color: 'text-pink-500' },
    { id: 'regulationChange', name: 'Regulation Change', nameKo: '규제 변경', category: 'health', unit: '/100', min: 0, max: 100, step: 1, defaultValue: 10, description: 'IMO/각국 해사 규제 변경 리스크', icon: 'FileText', color: 'text-pink-600' },
];

// Quick lookup
export const VARIABLE_MAP = new Map(SCENARIO_VARIABLE_CATALOG.map(v => [v.id, v]));

// Default variable IDs that every new scenario starts with
export const DEFAULT_VARIABLE_IDS = [
    'vlsfoPrice', 'freightRateWS', 'speedDelta', 'voyageDistance', 'capeReroute',
    'suezRisk', 'awrpRate', 'carbonTax',
];
