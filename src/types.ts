// ============================================================
// SIDECAR MARITIME COMMAND — ONTOLOGY TYPE SYSTEM
// Palantir Foundry-Style Ontology Model
//
// Core Objects: Vessel, Port, Route, MarketIndicator, RiskEvent
// Relationships: OntologyLink (directed, weighted edges)
// ============================================================

// ============================================================
// 1. ONTOLOGY OBJECT TYPES — 5 Core Domain Entities
// ============================================================

/** Semantic object types in the maritime domain ontology */
export type OntologyObjectType =
  | 'Vessel'
  | 'Port'
  | 'Route'
  | 'MarketIndicator'
  | 'RiskEvent';

/**
 * Legacy type aliases — maps old fragmented types to the new 5-entity model.
 * Used for backward compatibility during migration.
 */
export type LegacyObjectType = 'Commodity' | 'MacroEvent' | 'Scenario' | 'Market' | 'Insurance' | 'Currency' | 'RiskFactor';

/** Maps legacy type names to their new canonical ontology type */
export const LEGACY_TYPE_MAP: Record<LegacyObjectType, OntologyObjectType> = {
  Commodity: 'MarketIndicator',
  Market: 'MarketIndicator',
  Insurance: 'MarketIndicator',
  Currency: 'MarketIndicator',
  MacroEvent: 'RiskEvent',
  RiskFactor: 'RiskEvent',
  Scenario: 'RiskEvent', // edge case — scenarios shouldn't be graph nodes
};

// ============================================================
// 2. TYPED PROPERTY SCHEMAS — Per-entity structured properties
// ============================================================

/** Vessel-specific properties — full operational data */
export interface VesselProperties {
  // Identity
  vesselType: string;
  imo?: string;
  mmsi?: string;
  callSign?: string;
  flag?: string;
  yearBuilt?: number;
  dwt?: number;
  loa?: number;
  beam?: number;

  // Position & Navigation
  location: string;
  lat?: number;
  lng?: number;
  speed?: number;
  heading?: number;
  destination: string;
  eta?: string;

  // Voyage
  departurePort?: string;
  destinationPort?: string;
  sailedDays?: number;
  planDays?: number;
  lastReportType?: string;
  lastReportTime?: string;
  timezone?: string;

  // Speed & Weather Performance
  avgSpeed?: number;
  speedCp?: number;
  speedDiff?: number;
  avgSpeedGoodWx?: number;
  stillWaterAvgSpeedGoodWx?: number;
  avgCurf?: number;
  avgWxf?: number;

  // Fuel & Consumption
  fuel?: number;            // ROB percentage 0–100
  freshWater?: number;
  lubeOil?: number;
  avgIfo?: number;
  ifoCp?: number;
  ifoDiff?: number;
  foRob?: number;
  loRob?: number;
  fwRob?: number;
  totalConsumed?: number;

  // Compliance
  ciiRating?: string;
  ciiTrend?: string;
  crewCount?: number;

  // Economics
  cargoValueUsd?: number;
  charterRate?: number;

  // Quant-Derived (set by engine)
  bunkerCostRisk?: string;
  estimatedMargin?: number;
}

/** Port / Chokepoint properties */
export interface PortProperties {
  region: string;
  lat: number;
  lng: number;
  congestionPct?: number;
  baseWaitDays?: number;
  dailyTraffic?: number;
  securityLevel?: string;
  queuedVessels?: number;
  annualTEU?: number;
  oilTransitMbpd?: number;
  crudeImportPct?: number;
  bunkerDemandSpike?: string;
  avgBunkerPriceMt?: number;
  affectedCargoDays?: number;
}

/** Route properties — a maritime path between ports */
export interface RouteProperties {
  originPortId: string;
  destinationPortId: string;
  distanceNm: number;
  estimatedDays: number;
  waypoints?: { lat: number; lng: number; name?: string }[];
  riskZones?: string[];
  alternativeRouteIds?: string[];
  fuelCostEstimateUsd?: number;
  currentStatus?: 'open' | 'restricted' | 'closed';
}

/** MarketIndicator properties — commodity, asset, freight index */
export interface MarketIndicatorProperties {
  basePrice?: number;
  unit?: string;
  previousPrice?: number;
  priceChange?: string;
  volatility?: number;
  benchmarkType?: string;
  weeklyCeiling?: number;
  weeklyFloor?: number;
  // Asset valuation
  source?: string;
  assetClass?: string;
  priceMilUsd?: number;
  wowChangePct?: number;
  sentiment?: string;
  // Currency
  code?: string;
  baseRate?: number;
  previousRate?: number;
  weeklyChange?: string;
  // Insurance
  issuer?: string;
  rateFrom?: number;
  rateTo?: number;
  premiumCostPerVlcc?: number;
  effectiveDate?: string;
  preNoticeHours?: number;
  affectedZone?: string;
}

/** RiskEvent properties — geopolitical, environmental, operational */
export interface RiskEventProperties {
  category: 'geopolitical' | 'supply' | 'operational' | 'environmental' | 'cyber' | 'pandemic';
  severity?: 'low' | 'medium' | 'high' | 'critical';
  region?: string;
  lat?: number;
  lng?: number;
  threatLevel?: string;
  lastIncident?: string;
  affectedVessels?: number;
  supplyChainImpact?: number;
  energyImpact?: number;
  baseImpact?: number;
  extraCostPerVoyageUsd?: number;
  extraDays?: number;
}

// ============================================================
// 3. ONTOLOGY OBJECT — Universal graph node
// ============================================================

/** Dynamic property bag for ontology objects — all quant values live here */
export interface OntologyProperties {
  [key: string]: string | number | boolean | undefined | object;
  riskScore?: number;
  impactValue?: number;
  status?: string;
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
    source: string;      // e.g. 'mock', 'api:frankfurter', 'user', 'Noon Report'
    status: 'active' | 'inactive' | 'archived';
  };
}

// ============================================================
// 4. ONTOLOGY LINK — Directed, weighted edge
// ============================================================

/** Typed relationship between two ontology objects */
export type OntologyLinkRelation =
  | 'ROUTES_THROUGH'    // Vessel → Port/Chokepoint
  | 'CARRIES'           // Vessel → Commodity
  | 'AFFECTED_BY'       // Object ← RiskEvent
  | 'SUPPLIES'          // Port → Commodity
  | 'INSURES'           // Insurance → Vessel
  | 'PRICED_IN'         // Commodity → Currency
  | 'TRIGGERS'          // RiskEvent → MarketIndicator cascade
  | 'LOCATED_AT'        // Vessel → Port (current position)
  | 'MONITORS'          // Market → Vessel (valuation)
  | 'DEPENDS_ON'        // RiskFactor → Resource
  | 'TRANSITS'          // Vessel → Route
  | 'OPERATES_ON'       // Vessel → Route (active voyage)
  | 'OPERATES_AT'       // Vessel → Port (operational base)
  | 'SAILS'             // Vessel → Route (sailing assignment)
  | 'CALLS_AT'          // Route → Port (port of call)
  | 'AFFECTS_COST'      // MarketIndicator → Vessel/Route (cost effect)
  | 'HEDGES'            // Strategy → MarketIndicator
  | 'CONSUMES_FUEL'     // Vessel → MarketIndicator (fuel consumption)
  | 'EXPOSES_TO'        // RiskEvent → Vessel (risk exposure)
  | 'AT_RISK'           // Vessel → RiskEvent (proximity-based auto risk)
  | 'NEAR'              // Object → Object (geographic proximity)
  | 'IMPACTS'           // Event → Object (causal impact)
  | 'COMPETES_WITH';    // Object → Object (competitive relationship)

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

// ============================================================
// 5. ONTOLOGY ACTIONS — Business logic mutations
// ============================================================

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
// 6. SCENARIO & SIMULATION
// ============================================================

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

export interface Scenario {
  id: string;
  name: string;
  description: string;
  params: SimulationParams;
  isCustom?: boolean;
  isRealtime?: boolean;
  selectedVariableIds?: string[];
}

// ============================================================
// 7. CHART DATA
// ============================================================

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

// ============================================================
// 8. BACKWARD-COMPATIBLE LEGACY TYPES
// These exist solely for gradual migration. New code should use
// OntologyObject with type-specific selectors instead.
// ============================================================

/** @deprecated Use OntologyObject with type='Vessel' and selectFleetVessels() selector */
export interface VoyageInfo {
  departure_port: string;
  destination_port: string;
  sailed_days: number;
  plan_days: number;
  last_report_type: string;
  last_report_time: string;
  timezone: string;
}

/** @deprecated Use OntologyObject with type='Vessel' */
export interface SpeedMetrics {
  avg_speed: number;
  speed_cp: number;
  speed_diff: number;
  avg_speed_good_wx: number;
  still_water_avg_speed_good_wx: number;
  avg_curf: number;
  avg_wxf: number;
}

/** @deprecated Use OntologyObject with type='Vessel' */
export interface ConsumptionROB {
  avg_ifo: number;
  ifo_cp: number;
  ifo_diff: number;
  fo_rob: number;
  lo_rob: number;
  fw_rob: number;
  total_consumed: number;
}

/** @deprecated Use OntologyObject with type='Vessel' */
export interface Compliance {
  cii_rating: string;
  cii_trend: string;
}

/** @deprecated Use OntologyObject with type='Vessel' and selectFleetVessels() */
export interface FleetVessel {
  vessel_name: string;
  vessel_type: string;
  location: string;
  riskLevel: 'Low' | 'Medium' | 'High' | 'Critical';
  derivedRiskLevel?: 'SAFE' | 'WARNING' | 'CRITICAL';
  riskFactors?: string[];
  voyage_info: VoyageInfo;
  speed_and_weather_metrics: SpeedMetrics;
  consumption_and_rob: ConsumptionROB;
  compliance: Compliance;
}

/** @deprecated Use OntologyObject with type='Market' and selectMarketIndicators() */
export interface BrokerReport {
  source: string;
  date: string;
  asset_class: string;
  current_price_mil_usd: number;
  wow_change_pct: string;
  market_sentiment: string;
}

/** @deprecated Use OntologyObject with type='Insurance' */
export interface InsuranceCircular {
  issuer: string;
  date: string;
  title: string;
  impact: string;
}

/** @deprecated Legacy Ontology schema definition — replaced by typed OntologyObject */
export interface ObjectProperty {
  id: string;
  displayName: string;
  baseType: 'string' | 'number' | 'boolean' | 'date';
  isPrimaryKey: boolean;
  isTitleKey: boolean;
  mappedColumn?: string;
}

/** @deprecated Legacy Ontology schema definition */
export interface ObjectTypeDefinition {
  id: string;
  displayName: string;
  pluralDisplayName: string;
  description: string;
  icon: string;
  color: string;
  groups: string[];
  backingDatasource: string;
  properties: ObjectProperty[];
}

// ============================================================
// 9. APPLICATION SETTINGS
// ============================================================

export type Theme = 'dark' | 'light';
export type Language = 'ko' | 'en';

export interface AppSettings {
  apiKey: string;
  theme: Theme;
  language: Language;
  osintSources: string[];
  osintKeywords: string[];
  persistenceThresholdMinutes: number;
  persistenceMinArticles: number;
  crisisKeywords: string[];
  pollingIntervalMinutes: number;
}

// ============================================================
// 10. OSINT INTELLIGENCE ARTICLE (LLM-evaluated)
// ============================================================

/** Actionable parameter extracted by LLM from official circulars/alerts */
export interface SuggestedAction {
  targetNodeId: string;
  targetNodeTitle: string;
  propertyKey: string;
  newValue: number | string;
  displayLabel: string;
  sourceRef: string;
}

export interface IntelArticle {
  id: string;
  title: string;
  description: string;
  url: string;
  source: string;
  sourceBadge: string;
  publishedAt: string;
  fetchedAt: string;
  impactScore?: number;
  riskLevel?: 'Low' | 'Medium' | 'High' | 'Critical';
  aiInsight?: string;
  ontologyTags?: string[];
  evaluated?: boolean;
  dropped?: boolean;
  category?: 'OSINT' | 'OFFICIAL_CIRCULAR' | 'SECURITY_ALERT';
  refNumber?: string;
  suggestedAction?: SuggestedAction;
  acknowledged?: boolean;
}

// ============================================================
// 11. BEVI (Business Environment Volatility Index)
// ============================================================

export interface BEVIHistoryEntry {
  timestamp: string;
  value: number;
}

export interface BEVIState {
  value: number;
  previousValue: number;
  trend: 'up' | 'down' | 'stable';
  delta: number;
  topFactor: string;
  macroRiskAvg: number;
  assetRiskAvg: number;
  intelShockAvg: number;
  history: BEVIHistoryEntry[];
  lastCalculatedAt: string;
}

// ============================================================
// 12. QUANT PREPROCESSING METRICS (Module 1)
// ============================================================

export interface QuantMetrics {
  historicalPrices: number[];
  sma20: number;
  volatility30d: number;
  zScore: number;
  riskAlert: boolean;
  momentum: number;
  trend: 'UP' | 'DOWN' | 'STABLE';
  lastCalculatedAt: string;
}

// ============================================================
// 13. AIP EXECUTIVE BRIEFING (Module 3)
// ============================================================

export interface AIPExecutiveBriefing {
  marketOutlook: {
    summary: string;
    keyMetrics: { label: string; value: string; trend: 'up' | 'down' | 'stable' | 'critical' }[];
  };
  financialImpactVaR: {
    totalVaR: string;
    breakdown: { item: string; amount: string; probability: string }[];
    assessment: string;
  };
  hedgingStrategies: {
    strategy: string;
    instrument: string;
    ratio: string;
    rationale: string;
  }[];
  operationalDirectives: {
    priority: 'IMMEDIATE' | 'SHORT_TERM' | 'MEDIUM_TERM';
    directive: string;
    responsible: string;
    impact: string;
  }[];
  generatedAt: string;
}

// ============================================================
// 14. STRATEGIC DECISION & ACTION LOG (Module 4-5)
// ============================================================

export interface StrategicDecision {
  id: string;
  type: 'HEDGING' | 'OPERATIONAL';
  title: string;
  detail: string;
  departmentMessage: string;
  targetDepartment: string;
  approver: string;
  status: 'PENDING' | 'APPROVED' | 'EXECUTED';
  lsegEvidence: Record<string, unknown>;
  executedAt: string;
  scenarioName: string;
}

export interface StrategicActionLog {
  id: string;
  actionType: 'HEDGING' | 'OPERATIONAL';
  description: string;
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'EXECUTED';
  approvedBy: string;
  timestamp: string;
  justificationMetrics: {
    scenarioName: string;
    vlsfoZScore?: number;
    bdiZScore?: number;
    volatility30d?: number;
    riskAlertCount: number;
    highRiskVesselCount: number;
  };
  targetDepartment: string;
  departmentMessage: string;
  /** AI confidence score (0-1) */
  confidence?: number;
  /** Estimated financial impact in USD */
  estimatedImpactUsd?: number;
  /** Approval progress 0-100 (used for UI animation) */
  approvalProgress?: number;
  /** Who rejected, if rejected */
  rejectedBy?: string;
  /** When actually executed */
  executedAt?: string;
}

/** AI-generated strategic proposal with confidence + financial impact */
export interface AIStrategicProposal {
  id: string;
  actionType: 'HEDGING' | 'OPERATIONAL';
  title: string;
  description: string;
  rationale: string;
  confidence: number;           // 0-1
  estimatedImpactUsd: number;   // positive = savings, negative = cost
  targetDepartment: string;
  departmentMessage: string;
  priority: 'IMMEDIATE' | 'SHORT_TERM' | 'MEDIUM_TERM';
  vesselTargets?: string[];     // vessel names involved
  instrument?: string;          // for hedging: specific derivative
  ratio?: string;               // for hedging: hedge ratio
}

