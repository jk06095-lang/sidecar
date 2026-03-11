/**
 * Market Data Service — Free API Integration
 * 
 * Sources:
 *   - Yahoo Finance (via allorigins CORS proxy) — Oil, FX, Commodities
 *   - Trading Economics scrape proxy — BDI
 *   - Exchange Rate API — FX rates
 * 
 * All APIs are free, no key required.
 */

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
// YAHOO FINANCE SYMBOLS
// ============================================================

interface YahooSymbol {
    symbol: string;
    name: string;
    nameKo: string;
    currency: string;
    scenarioVarId?: string; // Maps to ScenarioVariable id
}

const YAHOO_SYMBOLS: YahooSymbol[] = [
    // Energy
    { symbol: 'BZ=F', name: 'Brent Crude', nameKo: '브렌트 원유', currency: 'USD', scenarioVarId: 'brentCrude' },
    { symbol: 'CL=F', name: 'WTI Crude', nameKo: 'WTI 원유', currency: 'USD', scenarioVarId: 'wtiCrude' },
    { symbol: 'NG=F', name: 'Natural Gas', nameKo: '천연가스', currency: 'USD', scenarioVarId: 'lngSpot' },
    // Metals & Commodities
    { symbol: 'GC=F', name: 'Gold', nameKo: '금', currency: 'USD' },
    { symbol: 'HG=F', name: 'Copper', nameKo: '구리', currency: 'USD', scenarioVarId: 'copperLME' },
    { symbol: 'SI=F', name: 'Silver', nameKo: '은', currency: 'USD' },
    // FX
    { symbol: 'KRW=X', name: 'USD/KRW', nameKo: '원/달러', currency: 'KRW', scenarioVarId: 'usdKrw' },
    { symbol: 'EURUSD=X', name: 'EUR/USD', nameKo: '유로/달러', currency: 'USD', scenarioVarId: 'eurUsd' },
    { symbol: 'DX-Y.NYB', name: 'Dollar Index', nameKo: '달러 인덱스', currency: 'USD' },
    // Indices
    { symbol: '^GSPC', name: 'S&P 500', nameKo: 'S&P 500', currency: 'USD' },
    { symbol: '^BDIY', name: 'Baltic Dry Index', nameKo: 'BDI 운임', currency: 'USD', scenarioVarId: 'bdiFactor' },
];

// ============================================================
// CORS PROXY (allorigins — free, no key)
// ============================================================

const CORS_PROXY = 'https://api.allorigins.win/raw?url=';

/**
 * Fetch a single Yahoo Finance quote via v8 API
 */
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

// ============================================================
// BATCH FETCH — All symbols in parallel
// ============================================================

export async function fetchAllMarketData(): Promise<MarketQuote[]> {
    const promises = YAHOO_SYMBOLS.map(sym => fetchYahooQuote(sym));
    const results = await Promise.allSettled(promises);

    const quotes: MarketQuote[] = [];
    for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
            quotes.push(result.value);
        }
    }

    // Cache in localStorage
    try {
        localStorage.setItem('sidecar_market_data', JSON.stringify({
            quotes,
            lastFetched: new Date().toISOString(),
        }));
    } catch { /* ignore */ }

    return quotes;
}

/**
 * Get cached market data (instant, no network)
 */
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

// ============================================================
// POLLING SERVICE
// ============================================================

let marketPollingTimer: ReturnType<typeof setInterval> | null = null;

export function startMarketDataPolling(
    onUpdate: (quotes: MarketQuote[]) => void,
    intervalMs: number = 60000, // 1 minute default
) {
    stopMarketDataPolling();

    // Immediate first fetch
    fetchAllMarketData().then(quotes => {
        if (quotes.length > 0) onUpdate(quotes);
    });

    marketPollingTimer = setInterval(async () => {
        try {
            const quotes = await fetchAllMarketData();
            if (quotes.length > 0) onUpdate(quotes);
        } catch (err) {
            console.warn('[MarketData] Polling error:', err);
        }
    }, intervalMs);
}

export function stopMarketDataPolling() {
    if (marketPollingTimer) {
        clearInterval(marketPollingTimer);
        marketPollingTimer = null;
    }
}

// ============================================================
// SCENARIO VARIABLE MAPPING
// ============================================================

/**
 * Maps market quotes to scenario variable updates.
 * Returns a partial SimulationParams that can be spread into onParamsChange.
 */
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

// Export symbol list for UI
export { YAHOO_SYMBOLS };
export type { YahooSymbol };
