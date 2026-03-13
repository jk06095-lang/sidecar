/**
 * Maritime Integration Service — Unified Data Access Layer
 *
 * THE SINGLE SOURCE OF TRUTH for all external data in the SIDECAR Maritime Command platform.
 * Consolidates market data, OSINT intelligence, maritime operations, and quant preprocessing
 * into a single integration point. All widgets should subscribe to the Ontology Store instead
 * of calling these services directly.
 *
 * Absorbed services:
 *   - marketDataService.ts  → Yahoo Finance (free API)
 *   - lsegMarketService.ts  → LSEG Workspace (real-time) + Quant Engine
 *   - maritimeService.ts    → OpenSanctions screening + Vessel presets
 *   - newsService.ts        → Delegated (not absorbed) — independent OSINT pipeline
 *
 * Data Pipeline: LSEG → Yahoo → Cache → Error
 * Quant Engine:  Historical → SMA20, Vol30d, Z-Score, Momentum
 */

import type { IntelArticle, QuantMetrics, SimulationParams, OntologyObject, OntologyLink } from '../types';
import { lsegGet, isLSEGAvailable, type LSEGResponse } from '../lib/lsegApiClient';
import { fetchLSEGNewsHeadlines } from './newsService';
import { scanHeadlinesForRisk } from '../lib/sentimentScanner';

// ============================================================
// 1. MARKET QUOTE TYPE
// ============================================================

export interface MarketQuote {
    symbol: string;
    name: string;
    nameKo: string;
    price: number;
    change: number;
    changePercent: number;
    currency: string;
    lastUpdated: string;
    source: string;
}

export interface MarketDataState {
    quotes: MarketQuote[];
    lastFetched: string | null;
    isLoading: boolean;
    error: string | null;
}

// ============================================================
// 2. YAHOO FINANCE — Free CORS proxy
// ============================================================

interface YahooSymbol {
    symbol: string;
    name: string;
    nameKo: string;
    currency: string;
    scenarioVarId?: string;
}

const YAHOO_SYMBOLS: YahooSymbol[] = [
    { symbol: 'BZ=F', name: 'Brent Crude', nameKo: '브렌트 원유', currency: 'USD', scenarioVarId: 'brentCrude' },
    { symbol: 'CL=F', name: 'WTI Crude', nameKo: 'WTI 원유', currency: 'USD', scenarioVarId: 'wtiCrude' },
    { symbol: 'NG=F', name: 'Natural Gas', nameKo: '천연가스', currency: 'USD', scenarioVarId: 'lngSpot' },
    { symbol: 'GC=F', name: 'Gold', nameKo: '금', currency: 'USD' },
    { symbol: 'HG=F', name: 'Copper', nameKo: '구리', currency: 'USD', scenarioVarId: 'copperLME' },
    { symbol: 'SI=F', name: 'Silver', nameKo: '은', currency: 'USD' },
    { symbol: 'KRW=X', name: 'USD/KRW', nameKo: '원/달러', currency: 'KRW', scenarioVarId: 'usdKrw' },
    { symbol: 'EURUSD=X', name: 'EUR/USD', nameKo: '유로/달러', currency: 'USD', scenarioVarId: 'eurUsd' },
    { symbol: 'DX-Y.NYB', name: 'Dollar Index', nameKo: '달러 인덱스', currency: 'USD' },
    { symbol: '^GSPC', name: 'S&P 500', nameKo: 'S&P 500', currency: 'USD' },
    { symbol: '^BDIY', name: 'Baltic Dry Index', nameKo: 'BDI 운임', currency: 'USD', scenarioVarId: 'bdiFactor' },
];

const CORS_PROXY = 'https://api.allorigins.win/raw?url=';

async function fetchYahooQuote(sym: YahooSymbol): Promise<MarketQuote | null> {
    try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym.symbol)}?range=1d&interval=1d`;
        const proxyUrl = `${CORS_PROXY}${encodeURIComponent(url)}`;

        const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) return null;
        const json = await res.json();

        const result = json?.chart?.result?.[0];
        if (!result) return null;

        const meta = result.meta;
        const price = meta?.regularMarketPrice ?? 0;
        const prevClose = meta?.chartPreviousClose ?? meta?.previousClose ?? price;
        const change = price - prevClose;
        const changePercent = prevClose !== 0 ? (change / prevClose) * 100 : 0;

        return {
            symbol: sym.symbol,
            name: sym.name,
            nameKo: sym.nameKo,
            price: Math.round(price * 100) / 100,
            change: Math.round(change * 100) / 100,
            changePercent: Math.round(changePercent * 100) / 100,
            currency: sym.currency,
            lastUpdated: new Date().toISOString(),
            source: 'Yahoo Finance',
        };
    } catch (err) {
        console.warn(`[MarketData] Yahoo fetch failed for ${sym.symbol}:`, err);
        return null;
    }
}

export async function fetchAllMarketData(): Promise<MarketQuote[]> {
    const promises = YAHOO_SYMBOLS.map(sym => fetchYahooQuote(sym));
    const results = await Promise.allSettled(promises);

    const quotes: MarketQuote[] = [];
    for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
            quotes.push(result.value);
        }
    }

    try {
        localStorage.setItem('sidecar_market_data', JSON.stringify({
            quotes,
            lastFetched: new Date().toISOString(),
        }));
    } catch { /* ignore */ }

    return quotes;
}

export function getCachedMarketData(): { quotes: MarketQuote[]; lastFetched: string | null } {
    try {
        const cached = localStorage.getItem('sidecar_market_data');
        if (cached) {
            const parsed = JSON.parse(cached);
            return { quotes: parsed.quotes || [], lastFetched: parsed.lastFetched || null };
        }
    } catch { /* ignore */ }
    return { quotes: [], lastFetched: null };
}

export function mapQuotesToScenarioParams(quotes: MarketQuote[]): Record<string, number> {
    const params: Record<string, number> = {};
    for (const sym of YAHOO_SYMBOLS) {
        if (!sym.scenarioVarId) continue;
        const quote = quotes.find(q => q.symbol === sym.symbol);
        if (!quote) continue;
        params[sym.scenarioVarId] = quote.price;
    }
    return params;
}

// ============================================================
// 3. LSEG WORKSPACE — Real-time pricing + historical
// ============================================================

interface LSEGRICMapping {
    ric: string;
    name: string;
    nameKo: string;
    currency: string;
    scenarioVarId?: string;
    yahooFallbackSymbol?: string;
}

const LSEG_RIC_MAPPINGS: LSEGRICMapping[] = [
    { ric: 'LCOc1', name: 'Brent Crude', nameKo: '브렌트 원유', currency: 'USD', scenarioVarId: 'brentCrude', yahooFallbackSymbol: 'BZ=F' },
    { ric: 'CLc1', name: 'WTI Crude', nameKo: 'WTI 원유', currency: 'USD', scenarioVarId: 'wtiCrude', yahooFallbackSymbol: 'CL=F' },
    { ric: 'NGc1', name: 'Natural Gas', nameKo: '천연가스', currency: 'USD', scenarioVarId: 'lngSpot', yahooFallbackSymbol: 'NG=F' },
    { ric: 'BADI', name: 'Baltic Dry Index', nameKo: 'BDI 운임', currency: 'USD', scenarioVarId: 'bdiFactor', yahooFallbackSymbol: '^BDIY' },
    { ric: 'KRW=', name: 'USD/KRW', nameKo: '원/달러', currency: 'KRW', scenarioVarId: 'usdKrw', yahooFallbackSymbol: 'KRW=X' },
    { ric: 'EUR=', name: 'EUR/USD', nameKo: '유로/달러', currency: 'USD', scenarioVarId: 'eurUsd', yahooFallbackSymbol: 'EURUSD=X' },
    { ric: 'GCc1', name: 'Gold', nameKo: '금', currency: 'USD', yahooFallbackSymbol: 'GC=F' },
    { ric: 'HGc1', name: 'Copper', nameKo: '구리', currency: 'USD', scenarioVarId: 'copperLME', yahooFallbackSymbol: 'HG=F' },
    { ric: 'SIc1', name: 'Silver', nameKo: '은', currency: 'USD', yahooFallbackSymbol: 'SI=F' },
    { ric: 'SCFI', name: 'Shanghai Containerized Freight Index', nameKo: 'SCFI 컨테이너운임', currency: 'USD', scenarioVarId: 'scfiFactor' },
    { ric: 'VLSFO380', name: 'VLSFO Singapore', nameKo: 'VLSFO 벙커유', currency: 'USD', scenarioVarId: 'vlsfoPrice', yahooFallbackSymbol: 'VLSFO.SI' },
    { ric: '.SPX', name: 'S&P 500', nameKo: 'S&P 500', currency: 'USD', yahooFallbackSymbol: '^GSPC' },
    { ric: '.DXY', name: 'Dollar Index', nameKo: '달러 인덱스', currency: 'USD', yahooFallbackSymbol: 'DX-Y.NYB' },
];

interface LSEGPricingField {
    TRDPRC_1?: number;
    HIGH_1?: number;
    LOW_1?: number;
    NETCHNG_1?: number;
    PCTCHNG?: number;
    OPEN_PRC?: number;
    HST_CLOSE?: number;
}

interface LSEGPricingResponse {
    data?: Array<{ ric: string; fields: LSEGPricingField }>;
}

interface LSEGTimeSeriesPoint {
    date: string;
    value: number;
}

interface LSEGTimeSeriesResponse {
    data?: Array<{ ric: string; timeSeries?: LSEGTimeSeriesPoint[] }>;
}

async function fetchLSEGPricing(): Promise<MarketQuote[]> {
    const rics = LSEG_RIC_MAPPINGS.map(m => m.ric).join(',');
    const response = await lsegGet<LSEGPricingResponse>(
        '/api/data/pricing',
        { rics, fields: 'TRDPRC_1,NETCHNG_1,PCTCHNG,HST_CLOSE' },
        600,
    );

    const quotes: MarketQuote[] = [];
    const items = response.data?.data || [];

    for (const item of items) {
        const mapping = LSEG_RIC_MAPPINGS.find(m => m.ric === item.ric);
        if (!mapping) continue;
        const fields = item.fields;
        quotes.push({
            symbol: mapping.ric,
            name: mapping.name,
            nameKo: mapping.nameKo,
            price: Math.round((fields.TRDPRC_1 ?? 0) * 100) / 100,
            change: Math.round((fields.NETCHNG_1 ?? 0) * 100) / 100,
            changePercent: Math.round((fields.PCTCHNG ?? 0) * 100) / 100,
            currency: mapping.currency,
            lastUpdated: new Date().toISOString(),
            source: 'LSEG Workspace',
        });
    }
    return quotes;
}

async function fetchLSEGHistorical(): Promise<Record<string, { date: string; close: number }[]>> {
    const keyRics = ['LCOc1', 'BADI', 'KRW=', 'SCFI', 'VLSFO380'];
    try {
        const response = await lsegGet<LSEGTimeSeriesResponse>(
            '/api/data/timeseries',
            { rics: keyRics.join(','), interval: 'daily', count: 30, fields: 'CLOSE' },
            7200,
        );
        const result: Record<string, { date: string; close: number }[]> = {};
        for (const item of (response.data?.data || [])) {
            if (item.timeSeries) {
                result[item.ric] = item.timeSeries.map(p => ({ date: p.date, close: p.value }));
            }
        }
        return result;
    } catch (err) {
        console.warn('[MaritimeIntegration] Historical fetch failed:', err);
        return {};
    }
}

// ============================================================
// 4. QUANT PREPROCESSING — SMA, Volatility, Z-Score
// ============================================================

function calculateSMA(closes: number[], period: number): number {
    if (closes.length < period) return closes.length > 0 ? closes.reduce((a, b) => a + b, 0) / closes.length : 0;
    const slice = closes.slice(-period);
    return slice.reduce((sum, v) => sum + v, 0) / period;
}

function calculateVolatility(closes: number[], period: number): number {
    const slice = closes.slice(-Math.min(period + 1, closes.length));
    if (slice.length < 3) return 0;
    const logReturns: number[] = [];
    for (let i = 1; i < slice.length; i++) {
        if (slice[i - 1] > 0 && slice[i] > 0) logReturns.push(Math.log(slice[i] / slice[i - 1]));
    }
    if (logReturns.length < 2) return 0;
    const mean = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
    const variance = logReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (logReturns.length - 1);
    return Math.round(Math.sqrt(variance) * Math.sqrt(252) * 10000) / 10000;
}

function calculateZScore(currentPrice: number, sma: number, closes: number[], period: number): number {
    if (sma === 0 || closes.length < 2) return 0;
    const slice = closes.slice(-period);
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const variance = slice.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / slice.length;
    const stdDev = Math.sqrt(variance);
    if (stdDev === 0) return 0;
    return Math.round(((currentPrice - sma) / stdDev) * 10000) / 10000;
}

export function computeQuantMetrics(
    historicalData: Record<string, { date: string; close: number }[]>,
    currentQuotes: MarketQuote[]
): Record<string, QuantMetrics> {
    const metrics: Record<string, QuantMetrics> = {};
    const now = new Date().toISOString();

    for (const [ric, series] of Object.entries(historicalData)) {
        if (!series || series.length < 5) continue;
        const closes = series.map(p => p.close);
        const quote = currentQuotes.find(q => q.symbol === ric);
        const currentPrice = quote?.price ?? closes[closes.length - 1];

        const sma20 = calculateSMA(closes, 20);
        const volatility30d = calculateVolatility(closes, 30);
        const zScore = calculateZScore(currentPrice, sma20, closes, 20);
        const momentum = sma20 > 0 ? Math.round((currentPrice / sma20) * 10000) / 10000 : 1;
        const riskAlert = Math.abs(zScore) > 2.0;

        metrics[ric] = {
            historicalPrices: closes,
            sma20: Math.round(sma20 * 100) / 100,
            volatility30d,
            zScore,
            riskAlert,
            momentum,
            trend: (currentPrice - sma20) > sma20 * 0.005 ? 'UP' : (currentPrice - sma20) < -(sma20 * 0.005) ? 'DOWN' : 'STABLE',
            lastCalculatedAt: now,
        };

        if (riskAlert) {
            console.warn(`[QuantEngine] 🚨 RISK ALERT: ${ric} Z-Score=${zScore.toFixed(2)}`);
        }
    }
    return metrics;
}

// ============================================================
// 5. UNIFIED FETCH — LSEG → Yahoo → Cache (NO MOCK)
// ============================================================

export type MarketDataSource = 'lseg' | 'yahoo' | 'cache' | 'mock';

export interface MarketDataResult {
    quotes: MarketQuote[];
    source: MarketDataSource;
    isFallback: boolean;
    lastUpdated: string;
    historicalData?: Record<string, { date: string; close: number }[]>;
    quantMetrics?: Record<string, QuantMetrics>;
}

export async function fetchMarketDataWithFallback(): Promise<MarketDataResult> {
    const now = new Date().toISOString();

    // TIER 1: LSEG Workspace
    try {
        const available = await isLSEGAvailable();
        if (available) {
            const [quotes, historical] = await Promise.all([fetchLSEGPricing(), fetchLSEGHistorical()]);
            if (quotes.length > 0) {
                const hasHistorical = Object.keys(historical).length > 0;
                const quantMetrics = hasHistorical ? computeQuantMetrics(historical, quotes) : undefined;
                return { quotes, source: 'lseg', isFallback: false, lastUpdated: now, historicalData: hasHistorical ? historical : undefined, quantMetrics };
            }
        }
    } catch (err) {
        console.warn('[MaritimeIntegration] LSEG failed, trying Yahoo:', err);
    }

    // TIER 2: Yahoo Finance
    try {
        const yahooQuotes = await fetchAllMarketData();
        if (yahooQuotes.length > 0) {
            return { quotes: yahooQuotes, source: 'yahoo', isFallback: true, lastUpdated: now };
        }
    } catch (err) {
        console.warn('[MaritimeIntegration] Yahoo failed, trying cache:', err);
    }

    // TIER 3: Cache
    const cached = getCachedMarketData();
    if (cached.quotes.length > 0) {
        return { quotes: cached.quotes, source: 'cache', isFallback: true, lastUpdated: cached.lastFetched || now };
    }

    throw new Error('DATA_PIPELINE_OFFLINE: All market data sources (LSEG, Yahoo, Cache) are unavailable');
}

/**
 * Maps market quotes (from any source) to scenario variable updates.
 */
export function mapLSEGQuotesToScenarioParams(quotes: MarketQuote[]): Record<string, number> {
    const params: Record<string, number> = {};
    for (const mapping of LSEG_RIC_MAPPINGS) {
        if (!mapping.scenarioVarId) continue;
        let quote = quotes.find(q => q.symbol === mapping.ric);
        if (!quote && mapping.yahooFallbackSymbol) {
            quote = quotes.find(q => q.symbol === mapping.yahooFallbackSymbol);
        }
        if (quote) params[mapping.scenarioVarId] = quote.price;
    }
    return params;
}

// ============================================================
// 6. OPENSANCTIONS — Vessel Sanctions Screening
// ============================================================

export interface SanctionsResult {
    status: 'CLEAR' | 'SANCTIONED' | 'PARTIAL_MATCH' | 'ERROR' | 'LOADING';
    matchCount: number;
    matches: SanctionsMatch[];
    checkedAt: string;
    source: string;
}

export interface SanctionsMatch {
    id: string;
    caption: string;
    schema: string;
    datasets: string[];
    properties: Record<string, string[]>;
    score: number;
}

export interface VesselLookupResult {
    found: boolean;
    name?: string;
    imo?: string;
    mmsi?: string;
    callSign?: string;
    flag?: string;
    vesselType?: string;
    dwt?: number;
    loa?: number;
    beam?: number;
    yearBuilt?: number;
    lat?: number;
    lng?: number;
    speed?: number;
    heading?: number;
    destination?: string;
    eta?: string;
    lastUpdate?: string;
    source: string;
}

const OPENSANCTIONS_BASE = 'https://api.opensanctions.org';

export async function screenVesselSanctions(
    vesselName: string,
    imo?: string,
): Promise<SanctionsResult> {
    try {
        const query = imo ? `${vesselName} ${imo}` : vesselName;
        const url = `${OPENSANCTIONS_BASE}/search/default?q=${encodeURIComponent(query)}&schema=Vessel&limit=5`;
        const response = await fetch(url, { headers: { 'Accept': 'application/json' } });

        if (!response.ok) {
            if (response.status === 429) {
                return { status: 'ERROR', matchCount: 0, matches: [], checkedAt: new Date().toISOString(), source: 'OpenSanctions (rate limited)' };
            }
            throw new Error(`OpenSanctions API returned ${response.status}`);
        }

        const data = await response.json();
        const results = data.results || [];
        const matches: SanctionsMatch[] = results.map((r: any) => ({
            id: r.id || '', caption: r.caption || r.name || '', schema: r.schema || '',
            datasets: r.datasets || [], properties: r.properties || {}, score: r.score || 0,
        }));

        let status: SanctionsResult['status'] = 'CLEAR';
        if (matches.length > 0) {
            status = matches.some(m => m.score > 0.7) ? 'SANCTIONED' : 'PARTIAL_MATCH';
        }

        return { status, matchCount: matches.length, matches, checkedAt: new Date().toISOString(), source: 'OpenSanctions' };
    } catch (error) {
        console.error('[MaritimeIntegration] Sanctions screening failed:', error);
        return { status: 'ERROR', matchCount: 0, matches: [], checkedAt: new Date().toISOString(), source: 'OpenSanctions (error)' };
    }
}

const _sanctionsCache = new Map<string, SanctionsResult>();

export async function getCachedSanctionsCheck(vesselName: string, imo?: string): Promise<SanctionsResult> {
    const cacheKey = `${vesselName}|${imo || ''}`;
    const cached = _sanctionsCache.get(cacheKey);
    if (cached && new Date().getTime() - new Date(cached.checkedAt).getTime() < 3600000) return cached;
    const result = await screenVesselSanctions(vesselName, imo);
    _sanctionsCache.set(cacheKey, result);
    return result;
}

// ============================================================
// 7. VESSEL PRESETS & FLAG OPTIONS
// ============================================================

export interface VesselPreset {
    id: string;
    label: string;
    labelKo: string;
    icon: string;
    defaults: { vesselType: string; dwt: number; loa: number; beam: number; speedCp: number; avgIfo: number };
}

export const VESSEL_PRESETS: VesselPreset[] = [
    { id: 'vlcc', label: 'VLCC', labelKo: '초대형 원유운반선', icon: '🛢️', defaults: { vesselType: 'Crude Oil Tanker (VLCC)', dwt: 300000, loa: 330, beam: 60, speedCp: 14.5, avgIfo: 52 } },
    { id: 'suezmax', label: 'Suezmax', labelKo: '수에즈맥스 유조선', icon: '⛽', defaults: { vesselType: 'Crude Oil Tanker (Suezmax)', dwt: 160000, loa: 275, beam: 48, speedCp: 14.0, avgIfo: 42 } },
    { id: 'aframax', label: 'Aframax', labelKo: '아프라막스', icon: '🚢', defaults: { vesselType: 'Crude Oil Tanker (Aframax)', dwt: 105000, loa: 244, beam: 42, speedCp: 14.0, avgIfo: 35 } },
    { id: 'bulk', label: 'Bulk Carrier', labelKo: '벌크선', icon: '📦', defaults: { vesselType: 'Bulk Carrier', dwt: 82000, loa: 229, beam: 32, speedCp: 12.5, avgIfo: 28 } },
    { id: 'container', label: 'Container', labelKo: '컨테이너선', icon: '📦', defaults: { vesselType: 'Container Ship', dwt: 120000, loa: 366, beam: 51, speedCp: 18.0, avgIfo: 180 } },
    { id: 'lng', label: 'LNG Carrier', labelKo: 'LNG 운반선', icon: '❄️', defaults: { vesselType: 'LNG Carrier', dwt: 90000, loa: 295, beam: 46, speedCp: 19.5, avgIfo: 65 } },
    { id: 'product', label: 'Product Tanker', labelKo: '석유제품 운반선', icon: '⛽', defaults: { vesselType: 'Product Tanker (MR)', dwt: 50000, loa: 183, beam: 32, speedCp: 13.5, avgIfo: 25 } },
];

export const FLAG_OPTIONS = [
    { value: 'Republic of Korea', label: '🇰🇷 대한민국', code: 'KOR' },
    { value: 'Marshall Islands', label: '🇲🇭 마셜아일랜드', code: 'MHL' },
    { value: 'Panama', label: '🇵🇦 파나마', code: 'PAN' },
    { value: 'Liberia', label: '🇱🇷 라이베리아', code: 'LBR' },
    { value: 'Singapore', label: '🇸🇬 싱가포르', code: 'SGP' },
    { value: 'Hong Kong', label: '🇭🇰 홍콩', code: 'HKG' },
    { value: 'Bahamas', label: '🇧🇸 바하마', code: 'BHS' },
    { value: 'Malta', label: '🇲🇹 몰타', code: 'MLT' },
    { value: 'Greece', label: '🇬🇷 그리스', code: 'GRC' },
    { value: 'Norway', label: '🇳🇴 노르웨이', code: 'NOR' },
    { value: 'Japan', label: '🇯🇵 일본', code: 'JPN' },
    { value: 'China', label: '🇨🇳 중국', code: 'CHN' },
    { value: 'United Kingdom', label: '🇬🇧 영국', code: 'GBR' },
    { value: 'Cyprus', label: '🇨🇾 키프로스', code: 'CYP' },
];

// ============================================================
// 8. GRAPH QUERY API — Domain-centric data access
// ============================================================

/** Query a vessel and all linked risks, market indicators, and routes */
export function queryVesselGraph(
    vesselId: string,
    objects: OntologyObject[],
    links: OntologyLink[],
): { vessel: OntologyObject | null; risks: OntologyObject[]; market: OntologyObject[]; routes: OntologyObject[] } {
    const vessel = objects.find(o => o.id === vesselId && o.type === 'Vessel') || null;
    if (!vessel) return { vessel: null, risks: [], market: [], routes: [] };

    const linkedIds = new Set<string>();
    for (const link of links) {
        if (link.sourceId === vesselId) linkedIds.add(link.targetId);
        if (link.targetId === vesselId) linkedIds.add(link.sourceId);
    }

    const linked = objects.filter(o => linkedIds.has(o.id));
    return {
        vessel,
        risks: linked.filter(o => o.type === 'RiskEvent'),
        market: linked.filter(o => o.type === 'MarketIndicator'),
        routes: linked.filter(o => o.type === 'Route'),
    };
}

/** Query a port and all linked vessels, risks */
export function queryPortGraph(
    portId: string,
    objects: OntologyObject[],
    links: OntologyLink[],
): { port: OntologyObject | null; vessels: OntologyObject[]; risks: OntologyObject[] } {
    const port = objects.find(o => o.id === portId && o.type === 'Port') || null;
    if (!port) return { port: null, vessels: [], risks: [] };

    const linkedIds = new Set<string>();
    for (const link of links) {
        if (link.sourceId === portId) linkedIds.add(link.targetId);
        if (link.targetId === portId) linkedIds.add(link.sourceId);
    }

    const linked = objects.filter(o => linkedIds.has(o.id));
    return {
        port,
        vessels: linked.filter(o => o.type === 'Vessel'),
        risks: linked.filter(o => o.type === 'RiskEvent'),
    };
}

// ============================================================
// 9. FULL SYNC — Orchestrate all data pipelines
// ============================================================

export interface IntegrationSyncResult {
    marketQuotes: MarketQuote[];
    marketSource: MarketDataSource;
    quantMetrics: Record<string, QuantMetrics>;
    scenarioParamUpdates: Record<string, number>;
    newsArticles: IntelArticle[];
    newsRiskBoost: number;
    timestamp: string;
    errors: string[];
}

export type IntegrationCallback = (result: IntegrationSyncResult) => void;

let _pollingTimer: ReturnType<typeof setInterval> | null = null;
let _isPolling = false;

export async function fullSync(): Promise<IntegrationSyncResult> {
    const errors: string[] = [];
    let marketResult: MarketDataResult | null = null;
    let newsArticles: IntelArticle[] = [];
    let newsRiskBoost = 0;

    // 1. Market Data
    try {
        marketResult = await fetchMarketDataWithFallback();
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Market data fetch failed';
        errors.push(msg);
    }

    // 2. LSEG News
    try {
        newsArticles = await fetchLSEGNewsHeadlines();
    } catch { /* optional */ }

    // 3. News risk boost
    const headlines = newsArticles.map(a => a.title);
    if (headlines.length > 0) {
        const scanResult = scanHeadlinesForRisk(headlines);
        newsRiskBoost = scanResult.riskBoost;
    }

    // 4. Scenario param updates
    const quotes = marketResult?.quotes ?? [];
    const scenarioParamUpdates = quotes.length > 0 ? mapLSEGQuotesToScenarioParams(quotes) : {};

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

export function startIntegrationPolling(callback: IntegrationCallback, intervalMs: number = 60_000) {
    stopIntegrationPolling();
    _isPolling = true;
    fullSync().then(result => { if (_isPolling) callback(result); }).catch(err => console.warn('[MaritimeIntegration] Initial sync failed:', err));
    _pollingTimer = setInterval(async () => {
        if (!_isPolling) return;
        try { const result = await fullSync(); callback(result); } catch (err) { console.warn('[MaritimeIntegration] Polling error:', err); }
    }, intervalMs);
}

export function stopIntegrationPolling() {
    _isPolling = false;
    if (_pollingTimer) { clearInterval(_pollingTimer); _pollingTimer = null; }
}

export function applyMarketUpdatesToParams(
    currentParams: SimulationParams,
    scenarioUpdates: Record<string, number>,
    newsRiskBoost: number,
): SimulationParams {
    if (Object.keys(scenarioUpdates).length === 0 && newsRiskBoost === 0) return currentParams;
    return {
        ...currentParams,
        ...scenarioUpdates,
        newsSentimentScore: Math.min(100, (currentParams.newsSentimentScore || 0) * 0.5 + newsRiskBoost * 0.5),
    };
}

// ============================================================
// 10. MARKET DATA POLLING (Yahoo Finance — standalone)
// ============================================================

let marketPollingTimer: ReturnType<typeof setInterval> | null = null;

export function startMarketDataPolling(onUpdate: (quotes: MarketQuote[]) => void, intervalMs: number = 60000) {
    stopMarketDataPolling();
    fetchAllMarketData().then(quotes => { if (quotes.length > 0) onUpdate(quotes); });
    marketPollingTimer = setInterval(async () => {
        try { const quotes = await fetchAllMarketData(); if (quotes.length > 0) onUpdate(quotes); } catch (err) { console.warn('[MarketData] Polling error:', err); }
    }, intervalMs);
}

export function stopMarketDataPolling() {
    if (marketPollingTimer) { clearInterval(marketPollingTimer); marketPollingTimer = null; }
}

// ============================================================
// RE-EXPORTS for convenience
// ============================================================

export { YAHOO_SYMBOLS, LSEG_RIC_MAPPINGS };
export type { YahooSymbol, LSEGRICMapping };
