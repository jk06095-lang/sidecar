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
} from '../types';
import { computeScenarioBranch } from '../lib/utils';
import {
    BASE_SCENARIOS,
    FLEET_DATA,
    BASE_VULNERABILITY_DATA,
    BROKER_REPORTS,
    INSURANCE_CIRCULARS,
    ONTOLOGY_OBJECTS,
    ONTOLOGY_LINKS,
} from '../data/mockData';

// ============================================================
// CALCULATION HELPERS (moved from App.tsx for centralization)
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

function calculateDynamicFleetData(params: SimulationParams, baseFleet: FleetVessel[]): FleetVessel[] {
    const { newsSentimentScore, awrpRate } = params;

    return baseFleet.map((vessel) => {
        const isMiddleEast =
            vessel.location.toLowerCase().includes('hormuz') ||
            vessel.location.toLowerCase().includes('middle east') ||
            vessel.location.toLowerCase().includes('persian gulf') ||
            vessel.location.toLowerCase().includes('fujairah') ||
            vessel.location.toLowerCase().includes('oman');

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

        return { ...vessel, riskLevel };
    });
}

// ============================================================
// ONTOLOGY → LEGACY MAPPERS (backward-compat selectors)
// ============================================================

/** Map Vessel-type OntologyObjects back to the FleetVessel interface */
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

/** Map Market-type OntologyObjects back to BrokerReport interface */
function mapOntologyToBrokerReports(objects: OntologyObject[]): BrokerReport[] {
    return objects
        .filter((o) => o.type === 'Market' && o.metadata.status === 'active')
        .map((o) => ({
            source: String(o.properties.source || '-'),
            date: o.metadata.updatedAt.split('T')[0],
            asset_class: String(o.properties.assetClass || '-'),
            current_price_mil_usd: Number(o.properties.priceMilUsd || 0),
            wow_change_pct: String(Number(o.properties.wowChangePct || 0) > 0 ? `+${o.properties.wowChangePct}` : o.properties.wowChangePct),
            market_sentiment: String(o.properties.sentiment || '-'),
        }));
}

/** Map Insurance-type OntologyObjects back to InsuranceCircular interface */
function mapOntologyToInsuranceCirculars(objects: OntologyObject[]): InsuranceCircular[] {
    return objects
        .filter((o) => o.type === 'Insurance' && o.metadata.status === 'active')
        .map((o) => ({
            issuer: String(o.properties.issuer || '-'),
            date: String(o.properties.effectiveDate || o.metadata.updatedAt.split('T')[0]),
            title: o.title,
            impact: o.description || '-',
        }));
}


// ============================================================
// STORE INTERFACE
// ============================================================

interface OntologyState {
    // ---- Graph Data ----
    objects: OntologyObject[];
    links: OntologyLink[];
    actionLog: OntologyAction[];

    // ---- Application State ----
    scenarios: Scenario[];
    activeScenarioId: string;
    simulationParams: SimulationParams;
    dynamicChartData: ChartDataPoint[];
    dynamicFleetData: FleetVessel[];

    // ---- Scenario Branching ----
    scenarioBranch: {
        active: boolean;
        name: string;
        baseParams: SimulationParams;
        branchParams: SimulationParams;
        baseObjects: OntologyObject[];
        branchObjects: OntologyObject[];
    } | null;

    // ---- Graph Actions ----
    addObject: (obj: OntologyObject) => void;
    removeObject: (id: string) => void;
    updateObjectProperty: (id: string, key: string, value: string | number | boolean) => void;
    addLink: (link: OntologyLink) => void;
    removeLink: (id: string) => void;
    executeAction: (action: OntologyAction) => void;

    // ---- Application Actions ----
    setActiveScenario: (id: string) => void;
    setSimulationParams: (params: SimulationParams) => void;
    addScenario: (scenario: Scenario) => void;
    updateScenario: (id: string, name: string) => void;
    copyScenario: (id: string) => void;
    deleteScenario: (id: string) => void;
    updateRealtimeScenarioParams: (params: SimulationParams) => void;
    recalculate: () => void;

    // ---- Scenario Branching Actions ----
    createScenarioBranch: (name: string, branchParams: SimulationParams) => void;
    clearScenarioBranch: () => void;

    // ---- Backward-Compatible Selectors ----
    selectFleetVessels: () => FleetVessel[];
    selectBrokerReports: () => BrokerReport[];
    selectInsuranceCirculars: () => InsuranceCircular[];
    selectObjectsByType: (type: OntologyObjectType) => OntologyObject[];
    selectLinksForObject: (objectId: string) => OntologyLink[];
}

// ============================================================
// ZUSTAND STORE
// ============================================================

const initialParams = BASE_SCENARIOS[0].params;

export const useOntologyStore = create<OntologyState>((set, get) => {
    // Build merged fleet on init: ontology vessels + legacy FLEET_DATA
    const ontologyFleet = mapOntologyToFleetVessels(ONTOLOGY_OBJECTS);
    const initialMergedFleet = [...ontologyFleet];
    // Append any FLEET_DATA vessels not already present in ontology
    FLEET_DATA.forEach((fv) => {
        if (!initialMergedFleet.find((v) => v.vessel_name === fv.vessel_name)) {
            initialMergedFleet.push(fv);
        }
    });

    return {
        // ---- Graph Data ----
        objects: [...ONTOLOGY_OBJECTS],
        links: [...ONTOLOGY_LINKS],
        actionLog: [],
        scenarioBranch: null,

        // ---- Application State ----
        scenarios: [...BASE_SCENARIOS],
        activeScenarioId: 'realtime',
        simulationParams: { ...initialParams },
        dynamicChartData: calculateDynamicChartData(initialParams),
        dynamicFleetData: calculateDynamicFleetData(initialParams, initialMergedFleet),

        // ---- Graph Actions ----
        addObject: (obj) =>
            set((state) => ({ objects: [...state.objects, obj] })),

        removeObject: (id) =>
            set((state) => ({
                objects: state.objects.filter((o) => o.id !== id),
                links: state.links.filter((l) => l.sourceId !== id && l.targetId !== id),
            })),

        updateObjectProperty: (id, key, value) =>
            set((state) => ({
                objects: state.objects.map((o) =>
                    o.id === id
                        ? { ...o, properties: { ...o.properties, [key]: value }, metadata: { ...o.metadata, updatedAt: new Date().toISOString() } }
                        : o,
                ),
            })),

        addLink: (link) =>
            set((state) => ({ links: [...state.links, link] })),

        removeLink: (id) =>
            set((state) => ({ links: state.links.filter((l) => l.id !== id) })),

        executeAction: (action) =>
            set((state) => {
                const newLog = [...state.actionLog, action];
                let newObjects = state.objects;

                // Handle specific action types
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
            }),

        // ---- Application Actions ----
        setActiveScenario: (id) => {
            const state = get();
            const scenario = state.scenarios.find((s) => s.id === id);
            if (scenario) {
                set({ activeScenarioId: id, simulationParams: { ...scenario.params } });
                // Trigger recalculation
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

        recalculate: () => {
            const state = get();
            const { simulationParams, objects } = state;

            // Build merged fleet from ontology + localStorage legacy data
            const ontologyFleet = mapOntologyToFleetVessels(objects);
            let mergedFleet = [...ontologyFleet];

            // Append FLEET_DATA vessels not covered by ontology
            FLEET_DATA.forEach((fv) => {
                if (!mergedFleet.find((v) => v.vessel_name === fv.vessel_name)) {
                    mergedFleet.push(fv);
                }
            });

            // Also include localStorage ontology data (legacy compat)
            try {
                const stored = localStorage.getItem('sidecar_ontology');
                if (stored) {
                    const ontologies = JSON.parse(stored);
                    const formalVesselInstances = ontologies.filter(
                        (o: any) => o.isActive && o.type === 'object_instance' && o.properties,
                    );
                    const legacyVesselItems = ontologies.filter(
                        (o: any) => o.isActive && o.type === 'factor' && o.subCategory === '자산 (Asset)' && o.vesselData,
                    );

                    const customFleet: FleetVessel[] = [
                        ...formalVesselInstances.map((v: any) => {
                            const props = v.properties || {};
                            const type = props.type || props.vesselType || props.VesselType || '-';
                            const loc = props.location || props.Location || props.lat || '-';
                            const risk = props.risk || props.riskLevel || props.riskScore || 'Low';
                            let formattedRisk: 'Low' | 'Medium' | 'High' | 'Critical' = 'Low';
                            if (String(risk).toLowerCase().includes('high')) formattedRisk = 'High';
                            if (String(risk).toLowerCase().includes('crit') || Number(risk) > 80) formattedRisk = 'Critical';
                            if (String(risk).toLowerCase().includes('med') || Number(risk) > 50) formattedRisk = 'Medium';

                            return {
                                vessel_name: v.title || props.name || 'Auto Object',
                                vessel_type: String(type),
                                location: String(loc),
                                riskLevel: formattedRisk,
                                voyage_info: { departure_port: '-', destination_port: '-', sailed_days: 0, plan_days: 0, last_report_type: 'Ontology Object', last_report_time: v.lastUpdated, timezone: 'UTC' },
                                speed_and_weather_metrics: { avg_speed: 0, speed_cp: 0, speed_diff: 0, avg_speed_good_wx: 0, still_water_avg_speed_good_wx: 0, avg_curf: 0, avg_wxf: 0 },
                                consumption_and_rob: { avg_ifo: 0, ifo_cp: 0, ifo_diff: 0, fo_rob: 0, lo_rob: 0, fw_rob: 0, total_consumed: 0 },
                                compliance: { cii_rating: '-', cii_trend: '-' },
                            };
                        }),
                        ...legacyVesselItems.map((v: any) => ({
                            vessel_name: v.title || 'Unknown Asset',
                            vessel_type: v.vesselData.vessel_type || '-',
                            location: v.vesselData.location || '-',
                            riskLevel: v.vesselData.riskLevel || 'Low',
                            voyage_info: { departure_port: '-', destination_port: '-', sailed_days: 0, plan_days: 0, last_report_type: 'Ontology Factor', last_report_time: v.lastUpdated, timezone: 'UTC' },
                            speed_and_weather_metrics: { avg_speed: 0, speed_cp: 0, speed_diff: 0, avg_speed_good_wx: 0, still_water_avg_speed_good_wx: 0, avg_curf: 0, avg_wxf: 0 },
                            consumption_and_rob: { avg_ifo: 0, ifo_cp: 0, ifo_diff: 0, fo_rob: 0, lo_rob: 0, fw_rob: 0, total_consumed: 0 },
                            compliance: { cii_rating: '-', cii_trend: '-' },
                        })),
                    ];

                    mergedFleet = [...customFleet, ...mergedFleet];
                }
            } catch (e) {
                console.error('Failed to parse ontology fleet data', e);
            }

            set({
                dynamicChartData: calculateDynamicChartData(simulationParams),
                dynamicFleetData: calculateDynamicFleetData(simulationParams, mergedFleet),
            });
        },

        // ---- Scenario Branching ----
        createScenarioBranch: (name, branchParams) => {
            const state = get();
            // Use the INITIAL (default) ontology objects as the base snapshot
            const baseObjects = ONTOLOGY_OBJECTS.map(o => ({
                ...o,
                properties: { ...o.properties },
                metadata: { ...o.metadata },
            }));
            // Compute branch objects: apply ripple effect from initial params -> branch params
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

        clearScenarioBranch: () => set({ scenarioBranch: null }),

        // ---- Backward-Compatible Selectors ----
        selectFleetVessels: () => mapOntologyToFleetVessels(get().objects),
        selectBrokerReports: () => mapOntologyToBrokerReports(get().objects),
        selectInsuranceCirculars: () => mapOntologyToInsuranceCirculars(get().objects),
        selectObjectsByType: (type) => get().objects.filter((o) => o.type === type),
        selectLinksForObject: (objectId) =>
            get().links.filter((l) => l.sourceId === objectId || l.targetId === objectId),
    };
});
