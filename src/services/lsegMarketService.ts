/**
 * LSEG Market Data Service — Real LSEG Data API with Fallback
 *
 * RIC Code Mappings:
 *   - LCOc1  → Brent Crude Oil
 *   - BADI   → Baltic Dry Index
 *   - KRW=   → USD/KRW Exchange Rate
 *   - CLc1   → WTI Crude Oil
 *   - VLSFO  → VLSFO Bunker Fuel
 *   - GCc1   → Gold
 *   - HGc1   → Copper
 *   - DXY    → Dollar Index
 *
 * On failure → falls back to Yahoo Finance → then mock data.
 */

import { lsegGet, isLSEGAvailable, type LSEGResponse } from '../lib/lsegApiClient';
import type { MarketQuote } from './marketDataService';
import { fetchAllMarketData, getCachedMarketData } from './marketDataService';
import type { QuantMetrics } from '../types';

// ============================================================
// LSEG RIC → Symbol Mapping
// ============================================================

interface LSEGRICMapping {
    ric: string;
    name: string;
    nameKo: string;
    currency: string;
    scenarioVarId?: string;
    yahooFallbackSymbol?: string; // For mapping to Yahoo data
}

const LSEG_RIC_MAPPINGS: LSEGRICMapping[] = [
    // Energy
    { ric: 'LCOc1', name: 'Brent Crude', nameKo: '브렌트 원유', currency: 'USD', scenarioVarId: 'brentCrude', yahooFallbackSymbol: 'BZ=F' },
    { ric: 'CLc1', name: 'WTI Crude', nameKo: 'WTI 원유', currency: 'USD', scenarioVarId: 'wtiCrude', yahooFallbackSymbol: 'CL=F' },
    { ric: 'NGc1', name: 'Natural Gas', nameKo: '천연가스', currency: 'USD', scenarioVarId: 'lngSpot', yahooFallbackSymbol: 'NG=F' },
    // Maritime
    { ric: 'BADI', name: 'Baltic Dry Index', nameKo: 'BDI 운임', currency: 'USD', scenarioVarId: 'bdiFactor', yahooFallbackSymbol: '^BDIY' },
    // FX
    { ric: 'KRW=', name: 'USD/KRW', nameKo: '원/달러', currency: 'KRW', scenarioVarId: 'usdKrw', yahooFallbackSymbol: 'KRW=X' },
    { ric: 'EUR=', name: 'EUR/USD', nameKo: '유로/달러', currency: 'USD', scenarioVarId: 'eurUsd', yahooFallbackSymbol: 'EURUSD=X' },
    // Metals & Commodities
    { ric: 'GCc1', name: 'Gold', nameKo: '금', currency: 'USD', yahooFallbackSymbol: 'GC=F' },
    { ric: 'HGc1', name: 'Copper', nameKo: '구리', currency: 'USD', scenarioVarId: 'copperLME', yahooFallbackSymbol: 'HG=F' },
    { ric: 'SIc1', name: 'Silver', nameKo: '은', currency: 'USD', yahooFallbackSymbol: 'SI=F' },
    // Maritime Freight & Bunker
    { ric: 'SCFI', name: 'Shanghai Containerized Freight Index', nameKo: 'SCFI 컨테이너운임', currency: 'USD', scenarioVarId: 'scfiFactor' },
    { ric: 'VLSFO380', name: 'VLSFO Singapore', nameKo: 'VLSFO 벙커유', currency: 'USD', scenarioVarId: 'vlsfoPrice', yahooFallbackSymbol: 'VLSFO.SI' },
    // Indices
    { ric: '.SPX', name: 'S&P 500', nameKo: 'S&P 500', currency: 'USD', yahooFallbackSymbol: '^GSPC' },
    { ric: '.DXY', name: 'Dollar Index', nameKo: '달러 인덱스', currency: 'USD', yahooFallbackSymbol: 'DX-Y.NYB' },
];

// ============================================================
// LSEG API Response Types
// ============================================================

interface LSEGPricingField {
    TRDPRC_1?: number;  // Last trade price
    HIGH_1?: number;    // High
    LOW_1?: number;     // Low
    NETCHNG_1?: number; // Net change
    PCTCHNG?: number;   // Percent change
    OPEN_PRC?: number;  // Open price
    HST_CLOSE?: number; // Previous close
}

interface LSEGPricingResponse {
    data?: Array<{
        ric: string;
        fields: LSEGPricingField;
    }>;
}

interface LSEGTimeSeriesPoint {
    date: string;
    value: number;
}

interface LSEGTimeSeriesResponse {
    data?: Array<{
        ric: string;
        timeSeries?: LSEGTimeSeriesPoint[];
    }>;
}

// ============================================================
// DATA SOURCE STATE
// ============================================================

export type MarketDataSource = 'lseg' | 'yahoo' | 'cache' | 'mock';

export interface MarketDataResult {
    quotes: MarketQuote[];
    source: MarketDataSource;
    isFallback: boolean;
    lastUpdated: string;
    /** 30-day historical time series (when available from LSEG) */
    historicalData?: Record<string, { date: string; close: number }[]>;
    /** Quant preprocessing metrics per RIC — auto-calculated from historical data */
    quantMetrics?: Record<string, QuantMetrics>;
}

// ============================================================
// MOCK MARKET DATA (Last resort fallback)
// ============================================================

function getMockMarketQuotes(): MarketQuote[] {
    const now = new Date().toISOString();
    return [
        { symbol: 'LCOc1', name: 'Brent Crude', nameKo: '브렌트 원유', price: 92.35, change: 1.85, changePercent: 2.04, currency: 'USD', lastUpdated: now, source: 'Mock' },
        { symbol: 'CLc1', name: 'WTI Crude', nameKo: 'WTI 원유', price: 87.20, change: 1.50, changePercent: 1.75, currency: 'USD', lastUpdated: now, source: 'Mock' },
        { symbol: 'NGc1', name: 'Natural Gas', nameKo: '천연가스', price: 3.85, change: 0.12, changePercent: 3.22, currency: 'USD', lastUpdated: now, source: 'Mock' },
        { symbol: 'BADI', name: 'Baltic Dry Index', nameKo: 'BDI 운임', price: 1625, change: -35, changePercent: -2.11, currency: 'USD', lastUpdated: now, source: 'Mock' },
        { symbol: 'KRW=', name: 'USD/KRW', nameKo: '원/달러', price: 1420, change: 5.50, changePercent: 0.39, currency: 'KRW', lastUpdated: now, source: 'Mock' },
        { symbol: 'EUR=', name: 'EUR/USD', nameKo: '유로/달러', price: 1.0880, change: -0.0025, changePercent: -0.23, currency: 'USD', lastUpdated: now, source: 'Mock' },
        { symbol: 'GCc1', name: 'Gold', nameKo: '금', price: 2180, change: 12.50, changePercent: 0.58, currency: 'USD', lastUpdated: now, source: 'Mock' },
        { symbol: 'HGc1', name: 'Copper', nameKo: '구리', price: 4.15, change: 0.03, changePercent: 0.73, currency: 'USD', lastUpdated: now, source: 'Mock' },
        { symbol: 'SIc1', name: 'Silver', nameKo: '은', price: 24.80, change: 0.35, changePercent: 1.43, currency: 'USD', lastUpdated: now, source: 'Mock' },
        { symbol: '.SPX', name: 'S&P 500', nameKo: 'S&P 500', price: 5205, change: 22.30, changePercent: 0.43, currency: 'USD', lastUpdated: now, source: 'Mock' },
        { symbol: '.DXY', name: 'Dollar Index', nameKo: '달러 인덱스', price: 103.85, change: 0.15, changePercent: 0.14, currency: 'USD', lastUpdated: now, source: 'Mock' },
    ];
}

// ============================================================
// LSEG API FETCH — Current Prices
// ============================================================

/**
 * Fetch real-time pricing from LSEG Workspace API.
 * Requests only the fields we need to minimize data transfer.
 */
async function fetchLSEGPricing(): Promise<MarketQuote[]> {
    const rics = LSEG_RIC_MAPPINGS.map(m => m.ric).join(',');

    const response = await lsegGet<LSEGPricingResponse>(
        '/api/data/pricing',
        {
            rics,
            fields: 'TRDPRC_1,NETCHNG_1,PCTCHNG,HST_CLOSE',
        },
        600, // 10min cache for pricing
    );

    const quotes: MarketQuote[] = [];
    const items = response.data?.data || [];

    for (const item of items) {
        const mapping = LSEG_RIC_MAPPINGS.find(m => m.ric === item.ric);
        if (!mapping) continue;

        const fields = item.fields;
        const price = fields.TRDPRC_1 ?? 0;
        const change = fields.NETCHNG_1 ?? 0;
        const changePercent = fields.PCTCHNG ?? 0;

        quotes.push({
            symbol: mapping.ric,
            name: mapping.name,
            nameKo: mapping.nameKo,
            price: Math.round(price * 100) / 100,
            change: Math.round(change * 100) / 100,
            changePercent: Math.round(changePercent * 100) / 100,
            currency: mapping.currency,
            lastUpdated: new Date().toISOString(),
            source: 'LSEG Workspace',
        });
    }

    return quotes;
}

// ============================================================
// LSEG API FETCH — Historical Time Series (20 days)
// ============================================================

/**
 * Fetch 30-day historical data for key maritime & macro RICs.
 * Returns compact data to stay within 10K daily point limit.
 * 30 data points per RIC × 5 RICs = 150 points per call — very conservative.
 * Cache TTL: 2h (7200s) to minimize redundant API calls.
 */
async function fetchLSEGHistorical(): Promise<Record<string, { date: string; close: number }[]>> {
    // Key indicators for quant preprocessing: energy, freight, bunker, FX
    const keyRics = ['LCOc1', 'BADI', 'KRW=', 'SCFI', 'VLSFO380'];
    const rics = keyRics.join(',');

    try {
        const response = await lsegGet<LSEGTimeSeriesResponse>(
            '/api/data/timeseries',
            {
                rics,
                interval: 'daily',
                count: 30,  // 30 days for volatility calculation
                fields: 'CLOSE',
            },
            7200, // 2h cache — conservative to save API quota
        );

        const result: Record<string, { date: string; close: number }[]> = {};
        const items = response.data?.data || [];

        for (const item of items) {
            if (item.timeSeries) {
                result[item.ric] = item.timeSeries.map(p => ({
                    date: p.date,
                    close: p.value,
                }));
            }
        }

        return result;
    } catch (err) {
        console.warn('[LSEGMarket] Historical fetch failed:', err);
        return {};
    }
}

// ============================================================
// QUANT PREPROCESSING — SMA, Volatility, Z-Score
// ============================================================

/**
 * Calculate Simple Moving Average for the last `period` data points.
 * Returns 0 if insufficient data.
 */
function calculateSMA(closes: number[], period: number): number {
    if (closes.length < period) return closes.length > 0 ? closes.reduce((a, b) => a + b, 0) / closes.length : 0;
    const slice = closes.slice(-period);
    return slice.reduce((sum, v) => sum + v, 0) / period;
}

/**
 * Calculate historical volatility (annualized standard deviation of log returns).
 * Uses log returns: ln(P_t / P_{t-1}) for each consecutive pair.
 * Annualizes by √252 (trading days per year).
 */
function calculateVolatility(closes: number[], period: number): number {
    const slice = closes.slice(-Math.min(period + 1, closes.length));
    if (slice.length < 3) return 0; // Need at least 3 points for meaningful vol

    // Calculate log returns
    const logReturns: number[] = [];
    for (let i = 1; i < slice.length; i++) {
        if (slice[i - 1] > 0 && slice[i] > 0) {
            logReturns.push(Math.log(slice[i] / slice[i - 1]));
        }
    }

    if (logReturns.length < 2) return 0;

    // Standard deviation of log returns
    const mean = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
    const variance = logReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (logReturns.length - 1);
    const dailyStdDev = Math.sqrt(variance);

    // Annualize: daily vol × √252
    return Math.round(dailyStdDev * Math.sqrt(252) * 10000) / 10000;
}

/**
 * Calculate Z-Score: how many standard deviations the current price
 * deviates from the SMA. Positive = above SMA, Negative = below SMA.
 */
function calculateZScore(currentPrice: number, sma: number, closes: number[], period: number): number {
    if (sma === 0 || closes.length < 2) return 0;

    const slice = closes.slice(-period);
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const variance = slice.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / slice.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) return 0;
    return Math.round(((currentPrice - sma) / stdDev) * 10000) / 10000;
}

/**
 * Compute QuantMetrics for all RICs with available historical data.
 * Returns a map of RIC → QuantMetrics with SMA20, 30d Volatility, Z-Score,
 * momentum ratio, and automatic risk alerting when |Z-Score| > 2.0.
 *
 * This replaces the need for a data scientist to manually compute these
 * indicators — the engine runs automatically on every LSEG data fetch.
 */
export function computeQuantMetrics(
    historicalData: Record<string, { date: string; close: number }[]>,
    currentQuotes: MarketQuote[]
): Record<string, QuantMetrics> {
    const metrics: Record<string, QuantMetrics> = {};
    const now = new Date().toISOString();

    for (const [ric, series] of Object.entries(historicalData)) {
        if (!series || series.length < 5) {
            // Need minimum 5 data points for meaningful analysis
            console.debug(`[QuantEngine] Skipping ${ric}: insufficient data (${series?.length ?? 0} points)`);
            continue;
        }

        const closes = series.map(p => p.close);

        // Get current price from live quotes first, fallback to latest historical
        const quote = currentQuotes.find(q => q.symbol === ric);
        const currentPrice = quote?.price ?? closes[closes.length - 1];

        // Calculate quant indicators
        const sma20 = calculateSMA(closes, 20);
        const volatility30d = calculateVolatility(closes, 30);
        const zScore = calculateZScore(currentPrice, sma20, closes, 20);
        const momentum = sma20 > 0 ? Math.round((currentPrice / sma20) * 10000) / 10000 : 1;
        const riskAlert = Math.abs(zScore) > 2.0;

        metrics[ric] = {
            sma20: Math.round(sma20 * 100) / 100,
            volatility30d,
            zScore,
            riskAlert,
            momentum,
            lastCalculatedAt: now,
        };

        if (riskAlert) {
            console.warn(
                `[QuantEngine] 🚨 RISK ALERT: ${ric} Z-Score=${zScore.toFixed(2)} ` +
                `(price=${currentPrice}, SMA20=${sma20.toFixed(2)}, vol=${volatility30d.toFixed(4)})`
            );
        }
    }

    console.log(`[QuantEngine] ✅ Computed metrics for ${Object.keys(metrics).length} RICs`);
    return metrics;
}

// ============================================================
// UNIFIED FETCH — LSEG → Yahoo → Cache → Mock
// ============================================================

/**
 * Fetch market data with multi-tier fallback:
 * 1. LSEG Workspace (real-time, local proxy)
 * 2. Yahoo Finance (free, CORS proxy)
 * 3. localStorage cache (last known data)
 * 4. Mock data (hardcoded last resort)
 *
 * When LSEG succeeds, automatically computes QuantMetrics
 * (SMA20, 30d volatility, Z-Score) from historical time-series data.
 */
export async function fetchMarketDataWithFallback(): Promise<MarketDataResult> {
    const now = new Date().toISOString();

    // ── TIER 1: Try LSEG Workspace ──
    try {
        const available = await isLSEGAvailable();
        if (available) {
            const [quotes, historical] = await Promise.all([
                fetchLSEGPricing(),
                fetchLSEGHistorical(),
            ]);

            if (quotes.length > 0) {
                const hasHistorical = Object.keys(historical).length > 0;

                // Auto-compute quant metrics if historical data is available
                const quantMetrics = hasHistorical
                    ? computeQuantMetrics(historical, quotes)
                    : undefined;

                console.log(
                    `[LSEGMarket] ✅ Live LSEG data: ${quotes.length} quotes` +
                    (quantMetrics ? `, ${Object.keys(quantMetrics).length} quant metrics` : '')
                );

                return {
                    quotes,
                    source: 'lseg',
                    isFallback: false,
                    lastUpdated: now,
                    historicalData: hasHistorical ? historical : undefined,
                    quantMetrics,
                };
            }
        }
    } catch (err) {
        console.warn('[LSEGMarket] LSEG fetch failed, trying Yahoo:', err);
    }

    // ── TIER 2: Try Yahoo Finance ──
    try {
        const yahooQuotes = await fetchAllMarketData();
        if (yahooQuotes.length > 0) {
            console.log('[LSEGMarket] ⚠️ Using Yahoo Finance fallback:', yahooQuotes.length, 'quotes');
            return {
                quotes: yahooQuotes,
                source: 'yahoo',
                isFallback: true,
                lastUpdated: now,
            };
        }
    } catch (err) {
        console.warn('[LSEGMarket] Yahoo fetch failed, trying cache:', err);
    }

    // ── TIER 3: Try localStorage cache ──
    const cached = getCachedMarketData();
    if (cached.quotes.length > 0) {
        console.log('[LSEGMarket] ⚠️ Using cached data from:', cached.lastFetched);
        return {
            quotes: cached.quotes,
            source: 'cache',
            isFallback: true,
            lastUpdated: cached.lastFetched || now,
        };
    }

    // ── TIER 4: Mock data (absolute last resort) ──
    console.log('[LSEGMarket] ⚠️ Using mock data — no data sources available');
    return {
        quotes: getMockMarketQuotes(),
        source: 'mock',
        isFallback: true,
        lastUpdated: now,
    };
}

// ============================================================
// SCENARIO VARIABLE MAPPING
// ============================================================

/**
 * Maps market quotes (from any source) to scenario variable updates.
 */
export function mapLSEGQuotesToScenarioParams(quotes: MarketQuote[]): Record<string, number> {
    const params: Record<string, number> = {};

    for (const mapping of LSEG_RIC_MAPPINGS) {
        if (!mapping.scenarioVarId) continue;

        // Try LSEG RIC first, then Yahoo symbol
        let quote = quotes.find(q => q.symbol === mapping.ric);
        if (!quote && mapping.yahooFallbackSymbol) {
            quote = quotes.find(q => q.symbol === mapping.yahooFallbackSymbol);
        }

        if (quote) {
            params[mapping.scenarioVarId] = quote.price;
        }
    }

    return params;
}

// ============================================================
// EXPORTS
// ============================================================

export { LSEG_RIC_MAPPINGS };
export type { LSEGRICMapping };
