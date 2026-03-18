import { useOntologyStore } from '../store/ontologyStore';
import type { MaritimeAnomaly, AnomalyType, VesselRiskLevel, OntologyObject, OntologyLink } from '../types';

/**
 * Generate mock anomalies to mimic Windward data
 */
export function generateAnomalies(vesselIds: string[]): MaritimeAnomaly[] {
    const anomalyTypes: AnomalyType[] = [
        'Dark Activity', 'Identity Tampering', 'Loitering', 'Port Congestion', 'Deviated Route'
    ];

    const anomalies: MaritimeAnomaly[] = [];
    const now = new Date();

    // Randomly generate 5-10 anomalies
    const count = Math.floor(Math.random() * 6) + 5;

    for (let i = 0; i < count; i++) {
        const type = anomalyTypes[Math.floor(Math.random() * anomalyTypes.length)];
        const vesselId = vesselIds.length > 0 ? vesselIds[Math.floor(Math.random() * vesselIds.length)] : undefined;

        let riskLevel: VesselRiskLevel = 'LOW';
        if (type === 'Dark Activity' || type === 'Identity Tampering') {
            riskLevel = Math.random() > 0.5 ? 'CRITICAL' : 'HIGH';
        } else if (type === 'Deviated Route') {
            riskLevel = Math.random() > 0.5 ? 'HIGH' : 'MEDIUM';
        } else {
            riskLevel = Math.random() > 0.5 ? 'MEDIUM' : 'LOW';
        }

        anomalies.push({
            id: `anomaly-${Date.now()}-${i}`,
            vesselId,
            type,
            description: `Detected ${type} behavior. Automatic flagging triggered.`,
            timestamp: new Date(now.getTime() - Math.random() * 86400000).toISOString(),
            location: {
                lat: (Math.random() * 180) - 90,
                lng: (Math.random() * 360) - 180,
            },
            riskLevel,
        });
    }

    return anomalies;
}

/**
 * Simulate AI reasoning on an anomaly using Gemini (or mock AI)
 */
export async function analyzeAnomalyWithAI(anomaly: MaritimeAnomaly): Promise<MaritimeAnomaly> {
    // Mock AI reasoning based on anomaly type to simulate geminiService
    let explanation = '';

    switch (anomaly.type) {
        case 'Dark Activity':
            explanation = "AI Analysis: The vessel disabled its AIS transponder for over 12 hours near an OFAC sanctioned zone. This indicates potential ship-to-ship transfer of illicit cargo, posing a critical compliance and supply chain risk.";
            break;
        case 'Identity Tampering':
            explanation = "AI Analysis: MMSI spoofing detected. The vessel appears to be broadcasting an identity belonging to another scrapped ship to evade sanctions. High risk of vessel seizure and cargo confiscation.";
            break;
        case 'Deviated Route':
            explanation = "AI Analysis: The vessel deviated significantly from its planned route. With the recent tensions in the Red Sea, this could be an evasive maneuver adding 14 days to the voyage, heavily impacting supply chain schedules and freight margins.";
            break;
        case 'Port Congestion':
            explanation = "AI Analysis: Unexpected loitering outside the destination port. Analysis of satellite imagery and port schedules suggests a sudden labor strike, leading to extensive delays and potential demurrage costs.";
            break;
        case 'Loitering':
            explanation = "AI Analysis: Vessel is drifting at 2 knots in open waters without a declared emergency. Historically associated with awaiting orders for STS transfers or mechanical failure. Monitor closely for supply chain disruption.";
            break;
    }

    // Simulated delay for "AI processing"
    await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 500));

    return {
        ...anomaly,
        aiExplanation: explanation,
    };
}

/**
 * Integrate processed anomalies into the ontology store
 */
export async function integrateAnomalyToOntology(anomalies: MaritimeAnomaly[]) {
    const store = useOntologyStore.getState();

    for (const anomaly of anomalies) {
        // 1. Create the Anomaly Node
        const anomalyNode: OntologyObject = {
            id: anomaly.id,
            type: 'Anomaly', // Must match OntologyObjectType
            title: `${anomaly.type} Detected`,
            description: anomaly.description,
            properties: {
                anomalyType: anomaly.type,
                riskLevel: anomaly.riskLevel,
                timestamp: anomaly.timestamp,
                aiExplanation: anomaly.aiExplanation || '',
                lat: anomaly.location?.lat,
                lng: anomaly.location?.lng,
                // Calculate a risk score based on level
                riskScore: anomaly.riskLevel === 'CRITICAL' ? 95 : anomaly.riskLevel === 'HIGH' ? 80 : anomaly.riskLevel === 'MEDIUM' ? 50 : 20,
            },
            metadata: {
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                source: 'Windward / AI Agent',
                status: 'active',
            }
        };

        // Add Node to store
        await store.addObject(anomalyNode);

        // 2. Create the Edge if a vessel is associated
        if (anomaly.vesselId) {
            const link: OntologyLink = {
                id: `link-${anomaly.vesselId}-${anomaly.id}`,
                sourceId: anomaly.vesselId,
                targetId: anomaly.id,
                relationType: 'HAS_ANOMALY',
                weight: anomaly.riskLevel === 'CRITICAL' ? 0.9 : anomaly.riskLevel === 'HIGH' ? 0.7 : 0.4,
                metadata: {
                    label: 'associated with',
                    createdAt: new Date().toISOString()
                }
            };

            await store.addLink(link);
        }
    }
}
