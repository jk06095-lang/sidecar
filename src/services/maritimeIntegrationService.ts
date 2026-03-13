/**
 * Maritime Integration Service — Unified Data Access Layer
 *
 * Consolidates market data, OSINT intelligence, and maritime operations
 * into a single integration point. All widgets should subscribe to the
 * Ontology Store instead of calling these services directly.
 *
 * Internal delegation:
 *   - Market Data: lsegMarketService (LSEG → Yahoo → Cache fallback chain)
 *   - OSINT Intel:  newsService (RSS → Filter → Dedup → LLM pipeline)
 *   - Sanctions:    maritimeService (OpenSanctions API)
 */

import type { IntelArticle, QuantMetrics, SimulationParams } from '../types';
import type { MarketQuote } from './marketDataService';
import {
    fetchMarketDataWithFallback,
    mapLSEGQuotesToScenarioParams,
    type MarketDataResult,
    type MarketDataSource,
} from './lsegMarketService';
import { fetchLSEGNewsHeadlines } from './newsService';
import { scanHeadlinesForRisk } from '../lib/sentimentScanner';

// ============================================================
// INTEGRATION RESULT TYPE
// ============================================================

export interface IntegrationSyncResult {
    // Market data
    marketQuotes: MarketQuote[];
    marketSource: MarketDataSource;
    quantMetrics: Record<string, QuantMetrics>;
    scenarioParamUpdates: Record<string, number>;

    // OSINT news
    newsArticles: IntelArticle[];
    newsRiskBoost: number;

    // Metadata
    timestamp: string;
    errors: string[];
}

// ============================================================
// POLLING CALLBACK
// ============================================================

export type IntegrationCallback = (result: IntegrationSyncResult) => void;

// ============================================================
// MARITIME INTEGRATION SERVICE
// ============================================================

let _pollingTimer: ReturnType<typeof setInterval> | null = null;
let _isPolling = false;

/**
 * Perform a full sync of all external data sources:
 * 1. Fetch market data (LSEG → Yahoo → Cache)
 * 2. Fetch LSEG news headlines
 * 3. Compute quant metrics & scenario param updates
 * 4. Compute news risk boost from headlines
 */
export async function fullSync(): Promise<IntegrationSyncResult> {
    const errors: string[] = [];
    let marketResult: MarketDataResult | null = null;
    let newsArticles: IntelArticle[] = [];
    let newsRiskBoost = 0;

    // ── 1. Market Data ──
    try {
        marketResult = await fetchMarketDataWithFallback();
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Market data fetch failed';
        errors.push(msg);
        console.error('[IntegrationService] Market data error:', msg);
    }

    // ── 2. LSEG News ──
    try {
        newsArticles = await fetchLSEGNewsHeadlines();
    } catch {
        // LSEG news is optional — RSS pipeline provides primary news
    }

    // ── 3. Compute news risk boost ──
    const headlines = newsArticles.map(a => a.title);
    if (headlines.length > 0) {
        const scanResult = scanHeadlinesForRisk(headlines);
        newsRiskBoost = scanResult.riskBoost;
    }

    // ── 4. Scenario param updates ──
    const quotes = marketResult?.quotes ?? [];
    const scenarioParamUpdates = quotes.length > 0
        ? mapLSEGQuotesToScenarioParams(quotes)
        : {};

    return {
        marketQuotes: quotes,
        marketSource: marketResult?.source ?? 'cache',
        quantMetrics: marketResult?.quantMetrics ?? {},
        scenarioParamUpdates,
        newsArticles,
        newsRiskBoost,
        timestamp: new Date().toISOString(),
        errors,
    };
}

/**
 * Start periodic polling of all data sources.
 * Default interval: 60 seconds.
 */
export function startIntegrationPolling(
    callback: IntegrationCallback,
    intervalMs: number = 60_000,
) {
    stopIntegrationPolling();
    _isPolling = true;

    // Immediate first sync
    fullSync().then(result => {
        if (_isPolling) callback(result);
    }).catch(err => {
        console.warn('[IntegrationService] Initial sync failed:', err);
    });

    _pollingTimer = setInterval(async () => {
        if (!_isPolling) return;
        try {
            const result = await fullSync();
            callback(result);
        } catch (err) {
            console.warn('[IntegrationService] Polling cycle error:', err);
        }
    }, intervalMs);
}

/**
 * Stop the integration polling loop.
 */
export function stopIntegrationPolling() {
    _isPolling = false;
    if (_pollingTimer) {
        clearInterval(_pollingTimer);
        _pollingTimer = null;
    }
}

/**
 * Apply scenario param updates from market data to current simulation params.
 * Blends news risk into sentiment score.
 */
export function applyMarketUpdatesToParams(
    currentParams: SimulationParams,
    scenarioUpdates: Record<string, number>,
    newsRiskBoost: number,
): SimulationParams {
    if (Object.keys(scenarioUpdates).length === 0 && newsRiskBoost === 0) {
        return currentParams;
    }

    return {
        ...currentParams,
        ...scenarioUpdates,
        newsSentimentScore: Math.min(100,
            (currentParams.newsSentimentScore || 0) * 0.5 + newsRiskBoost * 0.5
        ),
    };
}

// Re-export commonly needed types for convenience
export type { MarketQuote } from './marketDataService';
export type { MarketDataResult, MarketDataSource } from './lsegMarketService';
