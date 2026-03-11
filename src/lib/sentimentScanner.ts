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
