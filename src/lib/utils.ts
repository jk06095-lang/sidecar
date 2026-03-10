import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import type { OntologyObject, OntologyLink, SimulationParams } from "../types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ============================================================
// QUANT RISK RIPPLE EFFECT ENGINE
// ============================================================

/**
 * Mapping from SimulationParams keys → which OntologyObject types and
 * properties they directly affect, with a sensitivity coefficient.
 */
interface ParamInfluence {
  paramKey: string;
  targetType: string;
  targetProp: string;
  sensitivity: number; // How much a 1-unit change in param affects target
  riskSensitivity: number; // How much riskScore changes per 1-unit param change
}

const PARAM_INFLUENCES: ParamInfluence[] = [
  // VLSFO price → Vessel fuel cost + risk, Commodity price
  { paramKey: 'vlsfoPrice', targetType: 'Vessel', targetProp: 'avgIfo', sensitivity: 0.03, riskSensitivity: 0.03 },
  { paramKey: 'vlsfoPrice', targetType: 'Commodity', targetProp: 'basePrice', sensitivity: 0.8, riskSensitivity: 0.02 },

  // News sentiment → broad risk increase
  { paramKey: 'newsSentimentScore', targetType: 'Vessel', targetProp: '', sensitivity: 0, riskSensitivity: 0.4 },
  { paramKey: 'newsSentimentScore', targetType: 'Port', targetProp: 'baseWaitDays', sensitivity: 0.05, riskSensitivity: 0.3 },
  { paramKey: 'newsSentimentScore', targetType: 'MacroEvent', targetProp: 'supplyChainImpact', sensitivity: 0.3, riskSensitivity: 0.5 },

  // AWRP rate → Insurance risk, Vessel risk
  { paramKey: 'awrpRate', targetType: 'Insurance', targetProp: 'rateTo', sensitivity: 0.5, riskSensitivity: 30 },
  { paramKey: 'awrpRate', targetType: 'Vessel', targetProp: '', sensitivity: 0, riskSensitivity: 20 },

  // Supply chain stress → Port congestion, Commodity volatility
  { paramKey: 'supplyChainStress', targetType: 'Port', targetProp: 'baseWaitDays', sensitivity: 0.06, riskSensitivity: 0.4 },
  { paramKey: 'supplyChainStress', targetType: 'Commodity', targetProp: 'volatility', sensitivity: 0.003, riskSensitivity: 0.2 },

  // Energy crisis → Commodity prices, Vessel operating cost
  { paramKey: 'energyCrisisLevel', targetType: 'Commodity', targetProp: 'basePrice', sensitivity: 0.5, riskSensitivity: 0.25 },
  { paramKey: 'energyCrisisLevel', targetType: 'Vessel', targetProp: '', sensitivity: 0, riskSensitivity: 0.15 },

  // Trade war → Market valuation, RiskFactor
  { paramKey: 'tradeWarIntensity', targetType: 'Market', targetProp: 'wowChangePct', sensitivity: -0.1, riskSensitivity: 0.2 },
  { paramKey: 'tradeWarIntensity', targetType: 'RiskFactor', targetProp: 'baseImpact', sensitivity: 0.3, riskSensitivity: 0.3 },

  // Cyber threat → Vessel and Port risk
  { paramKey: 'cyberThreatLevel', targetType: 'Vessel', targetProp: '', sensitivity: 0, riskSensitivity: 0.15 },
  { paramKey: 'cyberThreatLevel', targetType: 'Port', targetProp: '', sensitivity: 0, riskSensitivity: 0.2 },

  // Pandemic risk → Port congestion, supply chain
  { paramKey: 'pandemicRisk', targetType: 'Port', targetProp: 'baseWaitDays', sensitivity: 0.04, riskSensitivity: 0.2 },

  // Natural disaster → Port and Vessel risk
  { paramKey: 'naturalDisasterIndex', targetType: 'Port', targetProp: '', sensitivity: 0, riskSensitivity: 0.25 },
  { paramKey: 'naturalDisasterIndex', targetType: 'Vessel', targetProp: '', sensitivity: 0, riskSensitivity: 0.1 },
];

/**
 * Propagate risk changes through the ontology graph via link weights (BFS).
 * Each hop attenuates the delta by `link.weight * decay`.
 */
function propagateRiskThroughLinks(
  objects: OntologyObject[],
  links: OntologyLink[],
  changedIds: Set<string>,
  riskDeltas: Map<string, number>,
  decay: number = 0.4,
  maxHops: number = 3,
): OntologyObject[] {
  const objMap = new Map(objects.map(o => [o.id, { ...o, properties: { ...o.properties } }]));

  // Apply direct deltas first
  riskDeltas.forEach((delta, id) => {
    const obj = objMap.get(id);
    if (obj) {
      const currentRisk = (obj.properties.riskScore as number) || 0;
      obj.properties.riskScore = Math.max(0, Math.min(100, Math.round(currentRisk + delta)));
    }
  });

  // BFS propagation
  let frontier = new Set(changedIds);
  for (let hop = 0; hop < maxHops && frontier.size > 0; hop++) {
    const nextFrontier = new Set<string>();
    frontier.forEach(srcId => {
      const srcDelta = riskDeltas.get(srcId) || 0;
      const connectedLinks = links.filter(l => l.sourceId === srcId || l.targetId === srcId);
      connectedLinks.forEach(link => {
        const targetId = link.sourceId === srcId ? link.targetId : link.sourceId;
        if (changedIds.has(targetId) && hop === 0) return; // Skip already-changed on first hop
        const obj = objMap.get(targetId);
        if (!obj) return;

        const propagatedDelta = srcDelta * link.weight * decay;
        if (Math.abs(propagatedDelta) < 0.5) return;

        const currentRisk = (obj.properties.riskScore as number) || 0;
        obj.properties.riskScore = Math.max(0, Math.min(100, Math.round(currentRisk + propagatedDelta)));
        nextFrontier.add(targetId);
      });
    });
    frontier = nextFrontier;
  }

  return Array.from(objMap.values());
}

/**
 * Compute a full scenario branch: deep-copy objects + apply ripple effect
 * from the delta between base and scenario simulation params.
 */
export function computeScenarioBranch(
  baseObjects: OntologyObject[],
  links: OntologyLink[],
  baseParams: SimulationParams,
  scenarioParams: SimulationParams,
): OntologyObject[] {
  // Deep copy objects
  let branchObjects = baseObjects.map(o => ({
    ...o,
    properties: { ...o.properties },
    metadata: { ...o.metadata },
  }));

  const riskDeltas = new Map<string, number>();
  const changedIds = new Set<string>();

  // For each param influence, calculate delta and apply to matching objects
  PARAM_INFLUENCES.forEach(inf => {
    const baseVal = (baseParams[inf.paramKey] as number) ?? 0;
    const scenVal = (scenarioParams[inf.paramKey] as number) ?? 0;
    const paramDelta = scenVal - baseVal;
    if (Math.abs(paramDelta) < 0.001) return;

    branchObjects.forEach(obj => {
      if (obj.type !== inf.targetType) return;

      // Apply property change
      if (inf.targetProp && inf.sensitivity !== 0) {
        const currentVal = (obj.properties[inf.targetProp] as number) ?? 0;
        obj.properties[inf.targetProp] = Math.round((currentVal + paramDelta * inf.sensitivity) * 100) / 100;
      }

      // Apply risk change
      if (inf.riskSensitivity !== 0) {
        const existingDelta = riskDeltas.get(obj.id) || 0;
        riskDeltas.set(obj.id, existingDelta + paramDelta * inf.riskSensitivity);
        changedIds.add(obj.id);
      }
    });
  });

  // Propagate risk through the graph via link weights
  branchObjects = propagateRiskThroughLinks(branchObjects, links, changedIds, riskDeltas);

  return branchObjects;
}

/**
 * Compare two sets of ontology objects and return per-object deltas.
 */
export interface ObjectDelta {
  id: string;
  title: string;
  type: string;
  baseRisk: number;
  branchRisk: number;
  riskDelta: number;
  propertyChanges: { key: string; baseVal: number; branchVal: number; delta: number }[];
}

export function computeObjectDeltas(
  baseObjects: OntologyObject[],
  branchObjects: OntologyObject[],
): ObjectDelta[] {
  const baseMap = new Map(baseObjects.map(o => [o.id, o]));

  return branchObjects
    .map(branch => {
      const base = baseMap.get(branch.id);
      if (!base) return null;

      const baseRisk = (base.properties.riskScore as number) || 0;
      const branchRisk = (branch.properties.riskScore as number) || 0;

      const propertyChanges: ObjectDelta['propertyChanges'] = [];
      Object.keys(branch.properties).forEach(key => {
        if (key === 'riskScore') return;
        const bv = base.properties[key];
        const sv = branch.properties[key];
        if (typeof bv === 'number' && typeof sv === 'number' && Math.abs(sv - bv) > 0.01) {
          propertyChanges.push({ key, baseVal: bv, branchVal: sv, delta: Math.round((sv - bv) * 100) / 100 });
        }
      });

      if (branchRisk === baseRisk && propertyChanges.length === 0) return null;

      return {
        id: branch.id,
        title: branch.title,
        type: branch.type,
        baseRisk,
        branchRisk,
        riskDelta: branchRisk - baseRisk,
        propertyChanges,
      };
    })
    .filter((d): d is NonNullable<typeof d> => d !== null)
    .sort((a, b) => Math.abs(b.riskDelta) - Math.abs(a.riskDelta));
}

/**
 * Aggregate branch-level metrics for the comparison dashboard.
 */
export interface BranchMetrics {
  avgRisk: number;
  maxRisk: number;
  criticalCount: number;
  highCount: number;
  totalObjects: number;
  riskByType: Record<string, number>;
}

export function computeBranchMetrics(objects: OntologyObject[]): BranchMetrics {
  const risks = objects.map(o => (o.properties.riskScore as number) || 0);
  const riskByType: Record<string, number> = {};

  objects.forEach(o => {
    const r = (o.properties.riskScore as number) || 0;
    if (!riskByType[o.type]) riskByType[o.type] = 0;
    riskByType[o.type] += r;
  });

  // Average per type
  const typeCounts: Record<string, number> = {};
  objects.forEach(o => { typeCounts[o.type] = (typeCounts[o.type] || 0) + 1; });
  Object.keys(riskByType).forEach(t => { riskByType[t] = Math.round(riskByType[t] / (typeCounts[t] || 1)); });

  return {
    avgRisk: risks.length > 0 ? Math.round(risks.reduce((a, b) => a + b, 0) / risks.length) : 0,
    maxRisk: risks.length > 0 ? Math.max(...risks) : 0,
    criticalCount: risks.filter(r => r >= 80).length,
    highCount: risks.filter(r => r >= 55).length,
    totalObjects: objects.length,
    riskByType,
  };
}
