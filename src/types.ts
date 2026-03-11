export interface VoyageInfo {
  departure_port: string;
  destination_port: string;
  sailed_days: number;
  plan_days: number;
  last_report_type: string;
  last_report_time: string;
  timezone: string;
}

export interface SpeedMetrics {
  avg_speed: number;
  speed_cp: number;
  speed_diff: number;
  avg_speed_good_wx: number;
  still_water_avg_speed_good_wx: number;
  avg_curf: number;
  avg_wxf: number;
}

export interface ConsumptionROB {
  avg_ifo: number;
  ifo_cp: number;
  ifo_diff: number;
  fo_rob: number;
  lo_rob: number;
  fw_rob: number;
  total_consumed: number;
}

export interface Compliance {
  cii_rating: string;
  cii_trend: string;
}

export interface FleetVessel {
  vessel_name: string;
  vessel_type: string;
  location: string;
  riskLevel: 'Low' | 'Medium' | 'High' | 'Critical';
  voyage_info: VoyageInfo;
  speed_and_weather_metrics: SpeedMetrics;
  consumption_and_rob: ConsumptionROB;
  compliance: Compliance;
}

export interface SimulationParams {
  vlsfoPrice: number;
  newsSentimentScore: number;
  awrpRate: number;
  interestRate: number;
  supplyChainStress?: number;
  cyberThreatLevel?: number;
  naturalDisasterIndex?: number;
  pandemicRisk?: number;
  tradeWarIntensity?: number;
  energyCrisisLevel?: number;
  [key: string]: number | undefined;
}

export interface ObjectProperty {
  id: string; // API Name (camelCase)
  displayName: string;
  baseType: 'string' | 'number' | 'boolean' | 'date';
  isPrimaryKey: boolean;
  isTitleKey: boolean;
  mappedColumn?: string;
}

export interface ObjectTypeDefinition {
  id: string; // API Name (PascalCase)
  displayName: string;
  pluralDisplayName: string;
  description: string;
  icon: string;
  color: string;
  groups: string[];
  backingDatasource: string;
  properties: ObjectProperty[];
}


export interface Scenario {
  id: string;
  name: string;
  description: string;
  params: SimulationParams;
  isCustom?: boolean;
  isRealtime?: boolean;
  selectedVariableIds?: string[];
}

export interface VulnerabilityDataPoint {
  date: string;
  Base_WS: number;
  WS_High: number;
  WS_Low: number;
  News_Sentiment_Score: number;
}

export interface ChartDataPoint {
  date: string;
  Base_WS: number;
  WS_High: number;
  WS_Low: number;
  News_Sentiment_Score: number;
  Spread: number;
}

export interface BrokerReport {
  source: string;
  date: string;
  asset_class: string;
  current_price_mil_usd: number;
  wow_change_pct: string;
  market_sentiment: string;
}

export interface InsuranceCircular {
  issuer: string;
  date: string;
  title: string;
  impact: string;
}

export type Theme = 'dark' | 'light';
export type Language = 'ko' | 'en';

export interface AppSettings {
  apiKey: string;
  theme: Theme;
  language: Language;
  osintSources: string[];
  osintKeywords: string[];
  // Persistence Tracker thresholds
  persistenceThresholdMinutes: number;  // default 30
  persistenceMinArticles: number;       // default 3
  crisisKeywords: string[];             // custom crisis regex terms
  pollingIntervalMinutes: number;       // default 10
}

// ============================================================
// OSINT INTELLIGENCE ARTICLE (LLM-evaluated)
// ============================================================

/** Actionable parameter extracted by LLM from official circulars/alerts */
export interface SuggestedAction {
  targetNodeId: string;      // ontology object id, e.g. 'insurance-war-risk'
  targetNodeTitle: string;   // human label, e.g. 'War Risk Premium'
  propertyKey: string;       // e.g. 'rateTo', 'riskScore'
  newValue: number | string;
  displayLabel: string;      // e.g. 'War Risk Premium +0.5%'
  sourceRef: string;         // e.g. 'KP&I Circular CIR-2026-003'
}

export interface IntelArticle {
  id: string;
  title: string;
  description: string;
  url: string;
  source: string;           // e.g. 'AP News', 'Bloomberg', 'Lloyd's List'
  sourceBadge: string;       // emoji badge e.g. '🔴', '🟠', '⚓'
  publishedAt: string;
  fetchedAt: string;
  // LLM-evaluated fields (null until evaluated)
  impactScore?: number;      // 0-100
  riskLevel?: 'Low' | 'Medium' | 'High' | 'Critical';
  aiInsight?: string;        // 1-liner actionable insight
  ontologyTags?: string[];   // related ontology keywords e.g. ['Hormuz', 'VLCC', 'BrentOil']
  evaluated?: boolean;       // LLM evaluation completed
  dropped?: boolean;         // noise-filtered by LLM
  // Official source classification
  category?: 'OSINT' | 'OFFICIAL_CIRCULAR' | 'SECURITY_ALERT';
  refNumber?: string;        // e.g. 'CIR-2026-003', 'WARNING 042/MAR/2026'
  suggestedAction?: SuggestedAction;
  acknowledged?: boolean;    // User has acknowledged this official item
}

// ============================================================
// PALANTIR FOUNDRY-STYLE ONTOLOGY LAYER
// ============================================================

/** Semantic object types in the maritime domain ontology */
export type OntologyObjectType =
  | 'Vessel'
  | 'Port'
  | 'Commodity'
  | 'MacroEvent'
  | 'Scenario'
  | 'Market'
  | 'Insurance'
  | 'Currency'
  | 'RiskFactor';

/** Vessel-specific properties — required schema for type='Vessel' ontology objects */
export interface VesselProperties {
  fuel: number;           // bunker ROB percentage 0–100
  freshWater: number;     // fresh water ROB percentage 0–100
  lubeOil: number;        // lube oil ROB percentage 0–100
  crewCount: number;      // onboard crew headcount
  speed: number;          // current speed in knots
  heading: number;        // heading in degrees 0–360
  destination: string;    // destination port name
  eta: string;            // ETA ISO datetime string
}

/** Dynamic property bag for ontology objects — all quant values live here */
export interface OntologyProperties {
  [key: string]: string | number | boolean | undefined;
  riskScore?: number;
}

/** A single node in the ontology graph */
export interface OntologyObject {
  id: string;
  type: OntologyObjectType;
  title: string;
  description?: string;
  properties: OntologyProperties;
  metadata: {
    createdAt: string;
    updatedAt: string;
    source: string;      // e.g. 'mock', 'api:frankfurter', 'user'
    status: 'active' | 'inactive' | 'archived';
  };
}

/** Typed relationship between two ontology objects */
export type OntologyLinkRelation =
  | 'ROUTES_THROUGH'
  | 'CARRIES'
  | 'AFFECTED_BY'
  | 'SUPPLIES'
  | 'INSURES'
  | 'PRICED_IN'
  | 'TRIGGERS'
  | 'LOCATED_AT'
  | 'MONITORS'
  | 'DEPENDS_ON';

/** An edge in the ontology graph */
export interface OntologyLink {
  id: string;
  sourceId: string;
  targetId: string;
  relationType: OntologyLinkRelation;
  weight: number;       // Risk propagation weight 0–1
  metadata?: {
    label?: string;
    createdAt?: string;
  };
}

/** Business logic action types */
export type OntologyActionType =
  | 'RerouteVessel'
  | 'UpdateRiskLevel'
  | 'AdjustInsurance'
  | 'ModifyScenarioParam'
  | 'FlagPort'
  | 'EscalateMacroEvent'
  | 'UpdateCommodityPrice';

/** An action that mutates ontology object state */
export interface OntologyAction {
  id: string;
  type: OntologyActionType;
  targetObjectId: string;
  payload: Record<string, unknown>;
  timestamp: string;
  executedBy: string;   // 'system' | 'user' | 'ai'
}

// ============================================================
// BEVI (Business Environment Volatility Index)
// ============================================================

/** Single data point in the BEVI time-series history */
export interface BEVIHistoryEntry {
  timestamp: string;
  value: number;
}

/** Derived BEVI state — auto-calculated from ontology + intel articles */
export interface BEVIState {
  value: number;                       // 0-100 composite score
  previousValue: number;               // prior value for trend calc
  trend: 'up' | 'down' | 'stable';    // direction
  delta: number;                       // signed change (new - old)
  topFactor: string;                   // e.g. "견인 요인: 유가 급등"
  macroRiskAvg: number;                // component 1 raw avg (40%)
  assetRiskAvg: number;                // component 2 raw avg (30%)
  intelShockAvg: number;               // component 3 raw avg (30%)
  history: BEVIHistoryEntry[];         // max 50 entries
  lastCalculatedAt: string;
}
