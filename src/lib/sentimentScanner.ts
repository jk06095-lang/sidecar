/**
 * News Sentiment Scanner — Text Mining for Risk Keywords
 *
 * Scans news headlines for geopolitical and maritime risk keywords
 * and produces a quantified risk boost score.
 *
 * Used by:
 *   - GeopoliticalRiskWidget (risk score boost)
 *   - Scenario simulation (spike injection)
 *   - BEVI calculation (intel shock component)
 */

// ============================================================
// RISK KEYWORD DEFINITIONS
// ============================================================

interface RiskKeyword {
    term: string;
    weight: number;    // Base weight 1-10
    category: 'military' | 'economic' | 'maritime' | 'diplomatic';
}

const RISK_KEYWORDS: RiskKeyword[] = [
    // Military / Conflict (highest weight)
    { term: 'war', weight: 10, category: 'military' },
    { term: 'attack', weight: 9, category: 'military' },
    { term: 'missile', weight: 9, category: 'military' },
    { term: 'strike', weight: 8, category: 'military' },
    { term: 'blockade', weight: 10, category: 'military' },
    { term: 'conflict', weight: 8, category: 'military' },
    { term: 'invasion', weight: 10, category: 'military' },
    { term: 'escalation', weight: 8, category: 'military' },
    { term: 'naval', weight: 6, category: 'military' },
    { term: 'convoy', weight: 5, category: 'military' },
    { term: 'torpedo', weight: 9, category: 'military' },
    { term: 'mine', weight: 7, category: 'military' },
    { term: 'drone', weight: 7, category: 'military' },
    { term: 'hostage', weight: 8, category: 'military' },
    { term: 'casualt', weight: 9, category: 'military' },
    { term: 'explosion', weight: 8, category: 'military' },

    // Economic / Crisis
    { term: 'crisis', weight: 8, category: 'economic' },
    { term: 'sanction', weight: 7, category: 'economic' },
    { term: 'embargo', weight: 9, category: 'economic' },
    { term: 'tariff', weight: 5, category: 'economic' },
    { term: 'default', weight: 7, category: 'economic' },
    { term: 'recession', weight: 6, category: 'economic' },
    { term: 'inflation', weight: 4, category: 'economic' },
    { term: 'collapse', weight: 8, category: 'economic' },

    // Maritime / Shipping specific
    { term: 'piracy', weight: 7, category: 'maritime' },
    { term: 'seizure', weight: 8, category: 'maritime' },
    { term: 'hijack', weight: 9, category: 'maritime' },
    { term: 'disruption', weight: 6, category: 'maritime' },
    { term: 'congestion', weight: 4, category: 'maritime' },
    { term: 'reroute', weight: 5, category: 'maritime' },
    { term: 'houthi', weight: 8, category: 'maritime' },
    { term: 'detained', weight: 7, category: 'maritime' },

    // Diplomatic / Geopolitical
    { term: 'threat', weight: 5, category: 'diplomatic' },
    { term: 'tension', weight: 4, category: 'diplomatic' },
    { term: 'evacuat', weight: 7, category: 'diplomatic' },
    { term: 'terror', weight: 8, category: 'diplomatic' },
    { term: 'nuclear', weight: 9, category: 'diplomatic' },
];

// ============================================================
// SCANNER FUNCTION
// ============================================================

export interface SentimentScanResult {
    /** Total risk boost score (0-100 scale) */
    riskBoost: number;
    /** Matched keywords and their individual contributions */
    matchedKeywords: Array<{
        keyword: string;
        category: string;
        contribution: number;
    }>;
    /** Category breakdown */
    categoryBreakdown: Record<string, number>;
    /** Raw headline count that contained risk keywords */
    riskHeadlineCount: number;
    /** Total headlines scanned */
    totalScanned: number;
}

/**
 * Scan an array of news headlines for risk keywords.
 * Returns a quantified risk boost score with diminishing returns.
 *
 * Algorithm:
 *   1. For each headline, find all matching risk keywords
 *   2. Sum weighted scores with log-scale diminishing returns
 *   3. Normalize to 0-100 scale
 *
 * @param headlines Array of headline strings to scan
 * @returns SentimentScanResult with riskBoost and matched details
 */
export function scanHeadlinesForRisk(headlines: string[]): SentimentScanResult {
    const matched: SentimentScanResult['matchedKeywords'] = [];
    const categoryScores: Record<string, number> = {};
    let riskHeadlineCount = 0;

    for (const headline of headlines) {
        const lower = headline.toLowerCase();
        let headlineHasRisk = false;

        for (const kw of RISK_KEYWORDS) {
            if (lower.includes(kw.term)) {
                // Check if already matched (avoid duplicates from same keyword)
                const alreadyMatched = matched.find(m => m.keyword === kw.term);
                if (alreadyMatched) {
                    // Diminishing returns: each additional occurrence adds less
                    alreadyMatched.contribution += kw.weight * 0.3;
                } else {
                    matched.push({
                        keyword: kw.term,
                        category: kw.category,
                        contribution: kw.weight,
                    });
                }

                categoryScores[kw.category] = (categoryScores[kw.category] || 0) + kw.weight;
                headlineHasRisk = true;
            }
        }

        if (headlineHasRisk) riskHeadlineCount++;
    }

    // Calculate total with log-scale diminishing returns
    const rawTotal = matched.reduce((sum, m) => sum + m.contribution, 0);

    // Normalize: use logarithmic scaling to prevent extreme spikes
    // rawTotal of ~10 → boost ~20, rawTotal of ~30 → boost ~50, rawTotal of ~80+ → boost ~80-90
    const riskBoost = Math.min(100, Math.round(
        rawTotal > 0 ? Math.log2(1 + rawTotal) * 12 : 0
    ));

    return {
        riskBoost,
        matchedKeywords: matched.sort((a, b) => b.contribution - a.contribution),
        categoryBreakdown: categoryScores,
        riskHeadlineCount,
        totalScanned: headlines.length,
    };
}

/**
 * Quick utility: extract just the numeric risk boost from headlines.
 */
export function getNewsRiskBoost(headlines: string[]): number {
    return scanHeadlinesForRisk(headlines).riskBoost;
}

/**
 * Check if a single headline contains any risk keywords.
 */
export function isRiskHeadline(headline: string): boolean {
    const lower = headline.toLowerCase();
    return RISK_KEYWORDS.some(kw => lower.includes(kw.term));
}

export { RISK_KEYWORDS };

// ============================================================
// CONTEXT-AWARE RISK ANALYSIS — Ontology + P&L fusion
// Phase 4: Injects ontology state + scenario loss into risk context
// ============================================================

import type { OntologyObject } from '../types';
import type { ScenarioPnLResult } from './quantEngine';

export interface VesselActionHint {
    vesselName: string;
    action: string;           // e.g. "희망봉 우회 및 2노트 감속 지시"
    rationale: string;        // why this action is recommended
    estimatedSavingsUsd: number;
    confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
    riskFactors: string[];
}

export interface ContextualRiskAnalysis {
    /** Combined risk score (keyword + ontology + P&L) */
    compositeRiskScore: number;
    /** Keyword scan results */
    keywordScan: SentimentScanResult;
    /** Ontology-derived high-risk nodes */
    criticalOntologyNodes: Array<{
        id: string;
        title: string;
        type: string;
        riskScore: number;
        relevantKeywords: string[];
    }>;
    /** Per-vessel action recommendations */
    vesselActionHints: VesselActionHint[];
    /** Estimated total fleet P&L exposure from scenario */
    fleetPnLExposure: {
        totalNetPnLDelta: number;
        avgTceDelta: number;
        totalDelayDaysDelta: number;
        totalOpexDelta: number;
    };
    /** Top risk drivers connecting keywords → ontology → P&L */
    riskDriverChain: Array<{
        trigger: string;          // keyword or event
        ontologyNode: string;     // affected object
        financialImpact: string;  // description of impact
    }>;
    analysisTimestamp: string;
}

/**
 * Generate a context-aware risk analysis that fuses:
 *   1. Keyword-based headline scanning
 *   2. Ontology object risk state
 *   3. Scenario P&L loss data
 *
 * Returns actionable insights with per-vessel recommendations.
 */
export function generateContextualRiskAnalysis(
    headlines: string[],
    ontologyObjects: OntologyObject[],
    pnlResult?: ScenarioPnLResult | null,
): ContextualRiskAnalysis {
    // 1. Standard keyword scan
    const keywordScan = scanHeadlinesForRisk(headlines);

    // 2. Identify high-risk ontology nodes
    const highRiskObjects = ontologyObjects
        .filter(o => (o.properties.riskScore as number) >= 50 && o.metadata.status === 'active')
        .sort((a, b) => (b.properties.riskScore as number) - (a.properties.riskScore as number))
        .slice(0, 15);

    // Cross-reference keywords with ontology nodes
    const criticalOntologyNodes = highRiskObjects.map(o => {
        const titleLower = o.title.toLowerCase();
        const descLower = (o.description || '').toLowerCase();
        const relevantKeywords = keywordScan.matchedKeywords
            .filter(kw => titleLower.includes(kw.keyword) || descLower.includes(kw.keyword))
            .map(kw => kw.keyword);
        return {
            id: o.id,
            title: o.title,
            type: o.type,
            riskScore: o.properties.riskScore as number,
            relevantKeywords,
        };
    });

    // 3. Generate vessel action hints from P&L data + ontology context
    const vesselActionHints: VesselActionHint[] = [];
    const vessels = ontologyObjects.filter(o => o.type === 'Vessel');

    // Check risk conditions
    const hormuzRisk = ontologyObjects.find(o =>
        o.title.toLowerCase().includes('호르무즈') || o.id.includes('hormuz')
    );
    const hormuzScore = (hormuzRisk?.properties.riskScore as number) || 0;

    const insuranceRisk = ontologyObjects.find(o =>
        o.type === 'MarketIndicator' && o.properties.issuer != null && (o.properties.riskScore as number) >= 60
    );

    const hasConflictKeywords = keywordScan.matchedKeywords.some(
        kw => kw.category === 'military' && kw.contribution >= 8
    );

    for (const vessel of vessels.slice(0, 10)) {
        const vesselRisk = (vessel.properties.riskScore as number) || 0;
        const vesselPnl = pnlResult?.vessels.find(
            v => v.vesselName.toLowerCase().includes(vessel.title.toLowerCase().split(' ')[0])
        );
        const factors: string[] = [];

        // High Hormuz risk → reroute via Cape
        if (hormuzScore >= 60 && vesselRisk >= 40) {
            factors.push('호르무즈 해협 고위험');
            const savings = vesselPnl ? Math.abs(vesselPnl.voyagePnL) * 0.15 : 50000;
            vesselActionHints.push({
                vesselName: vessel.title,
                action: `${vessel.title} 희망봉 우회 및 2노트 감속 지시`,
                rationale: `호르무즈 해협 리스크 점수 ${hormuzScore}/100 — ${hasConflictKeywords ? '무력 충돌 징후 감지' : '긴장 고조'}. 우회 시 AWRP 절감 및 안전 확보.`,
                estimatedSavingsUsd: Math.round(savings),
                confidenceLevel: hormuzScore >= 80 ? 'HIGH' : 'MEDIUM',
                riskFactors: factors,
            });
        }
        // Insurance spike → slow steaming
        else if (insuranceRisk && vesselRisk >= 35) {
            factors.push('보험료 급등');
            vesselActionHints.push({
                vesselName: vessel.title,
                action: `${vessel.title} 감속 운항 (Eco Speed) 전환`,
                rationale: `전쟁위험보험료(AWRP) 스파이크 감지. 감속 운항으로 연료비 절감 및 위험 회피.`,
                estimatedSavingsUsd: Math.round((vesselPnl?.opex || 8000) * 0.08),
                confidenceLevel: 'MEDIUM',
                riskFactors: factors,
            });
        }
        // General high risk
        else if (vesselRisk >= 60) {
            factors.push('종합 리스크 고위');
            vesselActionHints.push({
                vesselName: vessel.title,
                action: `${vessel.title} 리스크 등급 긴급 재평가`,
                rationale: `리스크 점수 ${vesselRisk}/100. ${keywordScan.riskHeadlineCount}건의 위험 뉴스 감지.`,
                estimatedSavingsUsd: Math.round(vesselRisk * 500),
                confidenceLevel: vesselRisk >= 80 ? 'HIGH' : 'LOW',
                riskFactors: factors,
            });
        }
    }

    // 4. Fleet P&L exposure summary
    const fleetPnLExposure = pnlResult ? {
        totalNetPnLDelta: pnlResult.fleet.netPnLDelta,
        avgTceDelta: pnlResult.fleet.avgTceDelta,
        totalDelayDaysDelta: pnlResult.fleet.totalDelayDaysDelta,
        totalOpexDelta: pnlResult.fleet.totalOpexDelta,
    } : {
        totalNetPnLDelta: 0,
        avgTceDelta: 0,
        totalDelayDaysDelta: 0,
        totalOpexDelta: 0,
    };

    // 5. Build risk driver chain (keyword → ontology → financial)
    const riskDriverChain: ContextualRiskAnalysis['riskDriverChain'] = [];
    for (const node of criticalOntologyNodes.filter(n => n.relevantKeywords.length > 0).slice(0, 5)) {
        riskDriverChain.push({
            trigger: node.relevantKeywords.join(', '),
            ontologyNode: `${node.title} (Risk: ${node.riskScore})`,
            financialImpact: fleetPnLExposure.totalNetPnLDelta !== 0
                ? `선대 순손실 $${Math.abs(fleetPnLExposure.totalNetPnLDelta).toLocaleString()}`
                : `리스크 점수 ${node.riskScore}/100`,
        });
    }

    // 6. Composite score = weighted blend
    const ontologyAvgRisk = highRiskObjects.length > 0
        ? highRiskObjects.reduce((sum, o) => sum + (o.properties.riskScore as number), 0) / highRiskObjects.length
        : 0;
    const pnlPenalty = Math.min(30, Math.abs(fleetPnLExposure.totalNetPnLDelta) / 10000);
    const compositeRiskScore = Math.min(100, Math.round(
        keywordScan.riskBoost * 0.3 + ontologyAvgRisk * 0.4 + pnlPenalty * 0.3
    ));

    return {
        compositeRiskScore,
        keywordScan,
        criticalOntologyNodes,
        vesselActionHints,
        fleetPnLExposure,
        riskDriverChain,
        analysisTimestamp: new Date().toISOString(),
    };
}
