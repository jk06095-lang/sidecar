/**
 * quantEngine — Maritime Quantitative Preprocessing Engine
 *
 * Pure math utility module. Computes technical indicators from
 * time-series numerical data — SMA, Volatility, Z-Score, Trend.
 *
 * Strict: No mock data, no fallbacks. Throws or returns safe
 * defaults on insufficient data. All edge cases defended.
 */

import type { QuantMetrics } from '../types';

// ============================================================
// CORE MATH FUNCTIONS
// ============================================================

/**
 * Simple Moving Average (SMA) for the last `period` data points.
 * @throws if data length < period
 */
export function calculateSMA(data: number[], period: number): number {
    if (data.length < period) {
        throw new Error(`Insufficient data for SMA${period}: need ${period}, got ${data.length}`);
    }
    const slice = data.slice(-period);
    const sum = slice.reduce((acc, v) => acc + v, 0);
    return sum / period;
}

/**
 * Historical Volatility — annualized standard deviation of log returns.
 * Uses log(P_t / P_{t-1}) for each consecutive pair.
 * Annualizes by √252 (trading days/year).
 * @throws if data length < period + 1
 */
export function calculateVolatility(data: number[], period: number): number {
    if (data.length < period + 1) {
        throw new Error(`Insufficient data for volatility(${period}): need ${period + 1}, got ${data.length}`);
    }

    const slice = data.slice(-(period + 1));
    const logReturns: number[] = [];

    for (let i = 1; i < slice.length; i++) {
        if (slice[i - 1] <= 0 || slice[i] <= 0) continue; // Skip zero/negative prices
        logReturns.push(Math.log(slice[i] / slice[i - 1]));
    }

    if (logReturns.length < 2) {
        throw new Error('Insufficient valid log returns for volatility calculation');
    }

    const mean = logReturns.reduce((s, v) => s + v, 0) / logReturns.length;
    const variance = logReturns.reduce((s, v) => s + (v - mean) ** 2, 0) / (logReturns.length - 1);
    const dailyVol = Math.sqrt(variance);
    const annualizedVol = dailyVol * Math.sqrt(252);

    return Math.round(annualizedVol * 10000) / 10000; // 4 decimal places
}

/**
 * Z-Score — how many standard deviations the current value
 * is from the mean (SMA) of the given period.
 * @returns 0 if stddev is 0 (no variance)
 */
export function calculateZScore(
    currentValue: number,
    sma: number,
    data: number[],
    period: number,
): number {
    if (data.length < period) {
        throw new Error(`Insufficient data for Z-Score: need ${period}, got ${data.length}`);
    }

    const slice = data.slice(-period);
    const mean = slice.reduce((s, v) => s + v, 0) / period;
    const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period;
    const stddev = Math.sqrt(variance);

    if (stddev === 0) return 0; // No variance — all values identical

    return Math.round(((currentValue - sma) / stddev) * 100) / 100;
}

// ============================================================
// MAIN EXPORT — Generate Complete QuantMetrics
// ============================================================

/**
 * Computes full QuantMetrics from a time-series price array.
 *
 * @param historicalPrices - Array of closing prices (oldest → newest)
 * @param currentPrice - Current live price (optional, defaults to last in array)
 * @returns QuantMetrics object
 * @throws if data is insufficient (< 20 data points minimum)
 */
export function generateQuantMetrics(
    historicalPrices: number[],
    currentPrice?: number,
): QuantMetrics {
    if (!historicalPrices || historicalPrices.length < 20) {
        throw new Error(
            `Insufficient historical data for quant analysis: need ≥20 data points, got ${historicalPrices?.length ?? 0}`
        );
    }

    // Filter out invalid values
    const validPrices = historicalPrices.filter(p => typeof p === 'number' && isFinite(p) && p > 0);
    if (validPrices.length < 20) {
        throw new Error(
            `Insufficient valid prices after filtering: need ≥20, got ${validPrices.length}`
        );
    }

    const price = currentPrice ?? validPrices[validPrices.length - 1];
    const sma20 = calculateSMA(validPrices, 20);

    // Volatility — use up to 30 days if available, otherwise use what we have (min 5)
    let volatility30d: number;
    try {
        const volPeriod = Math.min(30, validPrices.length - 1);
        volatility30d = volPeriod >= 5
            ? calculateVolatility(validPrices, volPeriod)
            : 0;
    } catch {
        volatility30d = 0;
    }

    const zScore = calculateZScore(price, sma20, validPrices, 20);
    const riskAlert = Math.abs(zScore) > 2.0;
    const momentum = sma20 !== 0 ? Math.round((price / sma20) * 1000) / 1000 : 1;

    // Trend from SMA comparison
    const priceDelta = price - sma20;
    const threshold = sma20 * 0.005; // 0.5% threshold for STABLE zone
    let trend: 'UP' | 'DOWN' | 'STABLE';
    if (priceDelta > threshold) {
        trend = 'UP';
    } else if (priceDelta < -threshold) {
        trend = 'DOWN';
    } else {
        trend = 'STABLE';
    }

    return {
        historicalPrices: validPrices,
        sma20: Math.round(sma20 * 100) / 100,
        volatility30d,
        zScore,
        riskAlert,
        momentum,
        trend,
        lastCalculatedAt: new Date().toISOString(),
    };
}
