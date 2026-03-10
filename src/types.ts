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
}
