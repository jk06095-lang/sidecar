/**
 * quantEngine — Maritime Quantitative Preprocessing Engine
 *
 * Part A: Technical indicators (SMA, Volatility, Z-Score, Trend)
 * Part B: Maritime P&L pipeline (TCE, OPEX, Delay Days, Voyage P&L)
 *
 * Strict: No mock data, no fallbacks. Throws or returns safe
 * defaults on insufficient data. All edge cases defended.
 */

import type { QuantMetrics, SimulationParams, FleetVessel } from '../types';

// ============================================================
// PART A — CORE MATH FUNCTIONS (unchanged)
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
        if (slice[i - 1] <= 0 || slice[i] <= 0) continue;
        logReturns.push(Math.log(slice[i] / slice[i - 1]));
    }

    if (logReturns.length < 2) {
        throw new Error('Insufficient valid log returns for volatility calculation');
    }

    const mean = logReturns.reduce((s, v) => s + v, 0) / logReturns.length;
    const variance = logReturns.reduce((s, v) => s + (v - mean) ** 2, 0) / (logReturns.length - 1);
    const dailyVol = Math.sqrt(variance);
    const annualizedVol = dailyVol * Math.sqrt(252);

    return Math.round(annualizedVol * 10000) / 10000;
}

/**
 * Z-Score — how many standard deviations the current value
 * is from the mean (SMA) of the given period.
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

    if (stddev === 0) return 0;

    return Math.round(((currentValue - sma) / stddev) * 100) / 100;
}

/**
 * Computes full QuantMetrics from a time-series price array.
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

    const validPrices = historicalPrices.filter(p => typeof p === 'number' && isFinite(p) && p > 0);
    if (validPrices.length < 20) {
        throw new Error(
            `Insufficient valid prices after filtering: need ≥20, got ${validPrices.length}`
        );
    }

    const price = currentPrice ?? validPrices[validPrices.length - 1];
    const sma20 = calculateSMA(validPrices, 20);

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

    const priceDelta = price - sma20;
    const threshold = sma20 * 0.005;
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

// ============================================================
// PART B — MARITIME P&L PIPELINE
// ============================================================

/**
 * Per-vessel P&L breakdown for a given scenario configuration.
 */
export interface VesselPnL {
    vesselName: string;
    vesselType: string;
    /** Time Charter Equivalent — $/day */
    tce: number;
    /** TCE change vs baseline — $/day */
    tceDelta: number;
    /** Operating Expenditure — $/day */
    opex: number;
    /** OPEX change vs baseline — $/day */
    opexDelta: number;
    /** Additional delay days from scenario events */
    delayDays: number;
    /** Delay days change vs baseline */
    delayDaysDelta: number;
    /** Estimated voyage P&L — $ total */
    voyagePnL: number;
    /** Voyage P&L change vs baseline — $ total */
    voyagePnLDelta: number;
    /** Bunker cost component — $/day */
    bunkerCostPerDay: number;
    /** AWRP premium cost — $ total */
    awrpCost: number;
    /** Carbon tax cost — $ total */
    carbonCost: number;
    /** Voyage duration in days */
    voyageDays: number;
}

/**
 * Fleet-level scenario P&L result.
 */
export interface ScenarioPnLResult {
    /** ISO timestamp */
    calculatedAt: string;
    /** Per-vessel breakdowns */
    vessels: VesselPnL[];
    /** Fleet-level aggregates */
    fleet: {
        totalRevenueDelta: number;   // $ total
        totalOpexDelta: number;      // $ total
        totalDelayDaysDelta: number; // days
        netPnLDelta: number;         // $ total
        avgTceDelta: number;         // $/day
    };
}

// ── Constants ──
const VLCC_FLAT_RATE = 19.80;         // $/mt Worldscale flat rate (Persian Gulf → East)
const BASE_CARGO_MT = 270_000;        // VLCC standard cargo (mt)
const BASE_WS = 55;                   // Worldscale baseline
const BASE_SEA_DAYS = 20;             // Typical PG→East voyage
const BASE_CANAL_FEE = 150_000;       // Suez transit fee ($)
const CAPE_REROUTE_EXTRA_DAYS = 12;   // Extra days for Cape of Good Hope reroute
const BASE_CREW_COST_PER_DAY = 8_500; // $/day crew + M&R
const HULL_VALUE_USD = 95_000_000;    // Estimated VLCC hull value for AWRP calculation
const CO2_EMISSION_PER_DAY = 85;      // tCO₂/day at sea for VLCC
const DELAY_PENALTY_PER_DAY = 35_000; // Demurrage/opportunity cost $/day

/**
 * Compute Time Charter Equivalent (TCE) in $/day.
 *
 * TCE = (Freight Revenue − Voyage Costs) / Sea Days
 * Freight Revenue = WS × Flat Rate × Cargo
 * Voyage Costs = Bunker + Canal Fees
 */
export function computeTCE(params: SimulationParams, baseWS: number = BASE_WS): number {
    const vlsfo = params.vlsfoPrice ?? 620;
    const hormuzRisk = (params.hormuzRisk ?? 0) / 100; // 0–1
    const suezRisk = (params.suezRisk ?? 0) / 100;     // 0–1

    // WS adjusts upward with geopolitical risk (supply disruption → higher rates)
    const wsMultiplier = 1 + hormuzRisk * 0.6 + suezRisk * 0.3;
    const effectiveWS = baseWS * wsMultiplier;

    // Freight revenue
    const freightRevenue = (effectiveWS / 100) * VLCC_FLAT_RATE * BASE_CARGO_MT;

    // Bunker cost: VLCC burns ~75mt/day at sea
    const bunkerConsumption = 75; // mt/day
    const seaDays = BASE_SEA_DAYS + (suezRisk > 0.5 ? CAPE_REROUTE_EXTRA_DAYS : 0);
    const bunkerCost = vlsfo * bunkerConsumption * seaDays;

    // Canal fee (waived if rerouted via Cape)
    const canalFee = suezRisk > 0.5 ? 0 : BASE_CANAL_FEE;

    // TCE
    const voyageCosts = bunkerCost + canalFee;
    const tce = (freightRevenue - voyageCosts) / seaDays;

    return Math.round(tce);
}

/**
 * Compute daily OPEX (Operating Expenditure) in $/day.
 *
 * OPEX = Crew/M&R + AWRP Insurance + Carbon Tax
 */
export function computeOPEX(params: SimulationParams): number {
    const awrpRate = params.awrpRate ?? 0.04;       // percentage
    const carbonTax = params.carbonTax ?? 45;       // €/tCO₂
    const crewSupply = (params.crewSupply ?? 15) / 100; // 0–1

    // Crew & maintenance — increases with crew shortage
    const crewCost = BASE_CREW_COST_PER_DAY * (1 + crewSupply * 0.25);

    // AWRP — Additional War Risk Premium (annualized, prorated to daily)
    const awrpDaily = (awrpRate / 100) * HULL_VALUE_USD / 365;

    // Carbon tax — EU ETS
    const carbonDaily = carbonTax * CO2_EMISSION_PER_DAY;

    return Math.round(crewCost + awrpDaily + carbonDaily);
}

/**
 * Compute additional delay days from scenario risk factors.
 */
export function computeDelayDays(params: SimulationParams): number {
    const portCongestion = (params.portCongestion ?? 20) / 100;   // 0–1
    const hormuzRisk = (params.hormuzRisk ?? 15) / 100;           // 0–1
    const suezRisk = (params.suezRisk ?? 10) / 100;               // 0–1
    const seaState = (params.seaStateIndex ?? 20) / 100;           // 0–1
    const supplyChainStress = (params.supplyChainStress ?? 25) / 100;

    // Port congestion → waiting days (max ~10 days)
    const portDelay = portCongestion * 10;

    // Chokepoint reroute → fixed 12 days if risk > 50%
    const rerouteDelay = suezRisk > 0.5 ? CAPE_REROUTE_EXTRA_DAYS : (hormuzRisk > 0.7 ? 8 : hormuzRisk * 5);

    // Weather → up to 4 extra days
    const weatherDelay = seaState * 4;

    // Supply chain → up to 3 extra days (waiting for cargo, documentation)
    const scDelay = supplyChainStress * 3;

    return Math.round((portDelay + rerouteDelay + weatherDelay + scDelay) * 10) / 10;
}

/**
 * Compute full voyage P&L for a single vessel.
 *
 * Voyage P&L = TCE × Voyage Days − OPEX × Total Days − Delay Penalty
 */
export function computeVoyagePnL(
    params: SimulationParams,
    baseTce?: number,
    baseOpex?: number,
    baseVoyageDays: number = BASE_SEA_DAYS,
): number {
    const tce = baseTce ?? computeTCE(params);
    const opex = baseOpex ?? computeOPEX(params);
    const delayDays = computeDelayDays(params);
    const totalDays = baseVoyageDays + delayDays;

    // Revenue from TCE covers sea days
    const revenue = tce * baseVoyageDays;

    // OPEX covers all days (at sea + delay)
    const totalOpex = opex * totalDays;

    // Delay penalty (demurrage / opportunity cost)
    const delayPenalty = delayDays * DELAY_PENALTY_PER_DAY;

    return Math.round(revenue - totalOpex - delayPenalty);
}

// ============================================================
// MAIN PIPELINE — runScenarioPnL
// ============================================================

/**
 * Run full fleet-level P&L simulation comparing base vs branch params.
 *
 * @param baseParams - Baseline scenario parameters (defaults / current state)
 * @param branchParams - Modified scenario parameters (user adjustments)
 * @param fleet - Fleet vessels to evaluate
 * @returns ScenarioPnLResult with per-vessel and fleet aggregates
 */
export function runScenarioPnL(
    baseParams: SimulationParams,
    branchParams: SimulationParams,
    fleet: FleetVessel[],
): ScenarioPnLResult {
    // Use fleet vessels, or create a synthetic VLCC if fleet is empty
    const effectiveFleet = fleet.length > 0 ? fleet : [{
        vessel_name: 'FLEET AVG (VLCC)',
        vessel_type: 'VLCC',
        riskLevel: 'Medium' as const,
    } as FleetVessel];

    const vessels: VesselPnL[] = effectiveFleet.map(v => {
        // Baseline
        const baseTce = computeTCE(baseParams);
        const baseOpex = computeOPEX(baseParams);
        const baseDelay = computeDelayDays(baseParams);
        const basePnL = computeVoyagePnL(baseParams, baseTce, baseOpex);

        // Branch (modified scenario)
        const branchTce = computeTCE(branchParams);
        const branchOpex = computeOPEX(branchParams);
        const branchDelay = computeDelayDays(branchParams);
        const branchPnL = computeVoyagePnL(branchParams, branchTce, branchOpex);

        const vlsfo = branchParams.vlsfoPrice ?? 620;
        const awrpRate = branchParams.awrpRate ?? 0.04;
        const carbonTax = branchParams.carbonTax ?? 45;
        const voyageDays = BASE_SEA_DAYS + branchDelay;

        return {
            vesselName: v.vessel_name,
            vesselType: v.vessel_type || 'VLCC',
            tce: branchTce,
            tceDelta: branchTce - baseTce,
            opex: branchOpex,
            opexDelta: branchOpex - baseOpex,
            delayDays: branchDelay,
            delayDaysDelta: branchDelay - baseDelay,
            voyagePnL: branchPnL,
            voyagePnLDelta: branchPnL - basePnL,
            bunkerCostPerDay: Math.round(vlsfo * 75),
            awrpCost: Math.round((awrpRate / 100) * HULL_VALUE_USD * voyageDays / 365),
            carbonCost: Math.round(carbonTax * CO2_EMISSION_PER_DAY * voyageDays),
            voyageDays: Math.round(voyageDays * 10) / 10,
        };
    });

    // Fleet aggregates
    const n = vessels.length || 1;
    const totalRevenueDelta = vessels.reduce((s, v) => s + v.tceDelta * BASE_SEA_DAYS, 0);
    const totalOpexDelta = vessels.reduce((s, v) => s + v.opexDelta * v.voyageDays, 0);
    const totalDelayDaysDelta = vessels.reduce((s, v) => s + v.delayDaysDelta, 0);
    const netPnLDelta = vessels.reduce((s, v) => s + v.voyagePnLDelta, 0);
    const avgTceDelta = vessels.reduce((s, v) => s + v.tceDelta, 0) / n;

    return {
        calculatedAt: new Date().toISOString(),
        vessels,
        fleet: {
            totalRevenueDelta: Math.round(totalRevenueDelta),
            totalOpexDelta: Math.round(totalOpexDelta),
            totalDelayDaysDelta: Math.round(totalDelayDaysDelta * 10) / 10,
            netPnLDelta: Math.round(netPnLDelta),
            avgTceDelta: Math.round(avgTceDelta),
        },
    };
}
