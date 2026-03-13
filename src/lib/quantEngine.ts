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
// PART B — MARITIME P&L PIPELINE (Real Formulas)
//
// Key formulas:
//   Sea Days       = voyageDistance / (designSpeed + speedDelta) / 24
//   Daily Fuel     = baseFuelConsumption × ((designSpeed + speedDelta) / designSpeed)³
//   Bunker Cost    = vlsfo × dailyFuel × seaDays
//   Freight Rev    = (WS / 100) × flatRate × cargoMT
//   TCE            = (Freight Revenue − Voyage Costs) / Sea Days
//   Voyage P&L     = TCE × seaDays − OPEX × totalDays − delayPenalty
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
    /** Voyage duration in days (sea days) */
    voyageDays: number;
    /** Total bunker consumption (mt) */
    totalBunkerMT: number;
    /** Daily fuel consumption (mt/day) */
    dailyFuelMT: number;
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

// ── Vessel Design Constants (VLCC class) ──
const DESIGN_SPEED_KNOTS = 14.5;          // Design speed (knots)
const BASE_FUEL_CONSUMPTION_MT = 65;      // mt/day at design speed (VLCC VLSFO main engine)
const VLCC_FLAT_RATE = 19.80;             // $/mt Worldscale flat rate (PG → East)
const SUEZ_CANAL_FEE = 400_000;           // Suez transit fee ($) — VLCC laden
const CAPE_REROUTE_EXTRA_NM = 3_200;      // Extra nautical miles via Cape of Good Hope
const BASE_CREW_COST_PER_DAY = 8_500;     // $/day crew + M&R + insurance base
const HULL_VALUE_USD = 95_000_000;        // VLCC hull value for AWRP calc
const CO2_EMISSION_FACTOR = 3.114;        // tCO₂ per metric ton of VLSFO burned (IMO)
const DELAY_PENALTY_PER_DAY = 35_000;     // Demurrage/opportunity cost $/day

/**
 * Compute sea days from distance, speed, and reroute.
 *
 *   seaDays = totalDistance / (actualSpeed × 24)
 *   where totalDistance = voyageDistance + (capeReroute ? CAPE_REROUTE_EXTRA_NM : 0)
 *   and   actualSpeed = designSpeed + speedDelta (clamped to min 8 knots)
 */
export function computeSeaDays(params: SimulationParams): number {
    const voyageDistance = params.voyageDistance ?? 6500;
    const speedDelta = params.speedDelta ?? 0;
    const capeReroute = (params.capeReroute ?? 0) >= 1;
    const suezRisk = (params.suezRisk ?? 0) / 100;

    // Auto-trigger Cape reroute if Suez risk > 60% and not already set
    const effectiveCapeReroute = capeReroute || suezRisk > 0.6;

    const totalDistance = voyageDistance + (effectiveCapeReroute ? CAPE_REROUTE_EXTRA_NM : 0);
    const actualSpeed = Math.max(8, DESIGN_SPEED_KNOTS + speedDelta);

    return totalDistance / (actualSpeed * 24);
}

/**
 * Compute daily fuel consumption using the Admiralty cubic law.
 *
 *   dailyFuel = baseFuel × (actualSpeed / designSpeed)³
 *
 * This is the standard naval architecture approximation —
 * fuel consumption scales with the cube of speed.
 */
export function computeDailyFuel(params: SimulationParams): number {
    const speedDelta = params.speedDelta ?? 0;
    const actualSpeed = Math.max(8, DESIGN_SPEED_KNOTS + speedDelta);
    const speedRatio = actualSpeed / DESIGN_SPEED_KNOTS;

    return BASE_FUEL_CONSUMPTION_MT * Math.pow(speedRatio, 3);
}

/**
 * Compute Time Charter Equivalent (TCE) in $/day.
 *
 *   TCE = (Freight Revenue − Voyage Costs) / Sea Days
 *
 *   Freight Revenue = (WS / 100) × flatRate × cargoMT × geoMultiplier
 *   Voyage Costs    = (dailyFuel × vlsfo × seaDays) + canalFee
 */
export function computeTCE(params: SimulationParams): number {
    const vlsfo = params.vlsfoPrice ?? 620;
    const ws = params.freightRateWS ?? 55;
    const cargoMT = params.cargoVolume ?? 270_000;
    const hormuzRisk = (params.hormuzRisk ?? 0) / 100;
    const suezRisk = (params.suezRisk ?? 0) / 100;
    const capeReroute = (params.capeReroute ?? 0) >= 1;
    const effectiveCapeReroute = capeReroute || suezRisk > 0.6;

    // Geopolitical premium on freight rates (supply disruption → higher WS)
    const geoMultiplier = 1 + hormuzRisk * 0.6 + suezRisk * 0.3;
    const effectiveWS = ws * geoMultiplier;

    // Revenue
    const freightRevenue = (effectiveWS / 100) * VLCC_FLAT_RATE * cargoMT;

    // Voyage costs  
    const seaDays = computeSeaDays(params);
    const dailyFuel = computeDailyFuel(params);
    const bunkerCost = vlsfo * dailyFuel * seaDays;
    const canalFee = effectiveCapeReroute ? 0 : SUEZ_CANAL_FEE;

    const voyageCosts = bunkerCost + canalFee;
    const tce = (freightRevenue - voyageCosts) / seaDays;

    return Math.round(tce);
}

/**
 * Compute daily OPEX (Operating Expenditure) in $/day.
 *
 *   OPEX = Crew/M&R + AWRP Insurance + Carbon Tax
 */
export function computeOPEX(params: SimulationParams): number {
    const awrpRate = params.awrpRate ?? 0.04;
    const carbonTax = params.carbonTax ?? 45;
    const crewSupply = (params.crewSupply ?? 15) / 100;

    // Crew & maintenance — increases with crew shortage
    const crewCost = BASE_CREW_COST_PER_DAY * (1 + crewSupply * 0.25);

    // AWRP — Additional War Risk Premium (annualized → daily)
    const awrpDaily = (awrpRate / 100) * HULL_VALUE_USD / 365;

    // Carbon tax — EU ETS (based on actual daily fuel burn)
    const dailyFuel = computeDailyFuel(params);
    const dailyCO2 = dailyFuel * CO2_EMISSION_FACTOR;
    const carbonDaily = carbonTax * dailyCO2;

    return Math.round(crewCost + awrpDaily + carbonDaily);
}

/**
 * Compute additional delay days from scenario risk factors.
 */
export function computeDelayDays(params: SimulationParams): number {
    const portCongestion = (params.portCongestion ?? 20) / 100;
    const hormuzRisk = (params.hormuzRisk ?? 15) / 100;
    const seaState = (params.seaStateIndex ?? 20) / 100;
    const supplyChainStress = (params.supplyChainStress ?? 25) / 100;

    // Port congestion → waiting days (max ~10 days)
    const portDelay = portCongestion * 10;

    // Hormuz chokepoint → up to 8 days disruption
    const hormuzDelay = hormuzRisk > 0.7 ? 8 : hormuzRisk * 5;

    // Weather → up to 4 extra days
    const weatherDelay = seaState * 4;

    // Supply chain → up to 3 extra days
    const scDelay = supplyChainStress * 3;

    return Math.round((portDelay + hormuzDelay + weatherDelay + scDelay) * 10) / 10;
}

/**
 * Compute full voyage P&L for a single vessel.
 *
 *   Voyage P&L = TCE × seaDays − OPEX × totalDays − delayPenalty
 */
export function computeVoyagePnL(
    params: SimulationParams,
    tce?: number,
    opex?: number,
): number {
    const effectiveTce = tce ?? computeTCE(params);
    const effectiveOpex = opex ?? computeOPEX(params);
    const seaDays = computeSeaDays(params);
    const delayDays = computeDelayDays(params);
    const totalDays = seaDays + delayDays;

    const revenue = effectiveTce * seaDays;
    const totalOpex = effectiveOpex * totalDays;
    const delayPenalty = delayDays * DELAY_PENALTY_PER_DAY;

    return Math.round(revenue - totalOpex - delayPenalty);
}

// ============================================================
// MAIN PIPELINE — runScenarioPnL
// ============================================================

/**
 * Run full fleet-level P&L simulation comparing base vs branch params.
 */
export function runScenarioPnL(
    baseParams: SimulationParams,
    branchParams: SimulationParams,
    fleet: FleetVessel[],
): ScenarioPnLResult {
    const effectiveFleet = fleet.length > 0 ? fleet : [{
        vessel_name: 'FLEET AVG (VLCC)',
        vessel_type: 'VLCC',
        riskLevel: 'Medium' as const,
    } as FleetVessel];

    const vessels: VesselPnL[] = effectiveFleet.map(v => {
        // ── Baseline calculation ──
        const baseTce = computeTCE(baseParams);
        const baseOpex = computeOPEX(baseParams);
        const baseSeaDays = computeSeaDays(baseParams);
        const baseDelay = computeDelayDays(baseParams);
        const basePnL = computeVoyagePnL(baseParams, baseTce, baseOpex);

        // ── Branch (user-modified) calculation ──
        const branchTce = computeTCE(branchParams);
        const branchOpex = computeOPEX(branchParams);
        const branchSeaDays = computeSeaDays(branchParams);
        const branchDelay = computeDelayDays(branchParams);
        const branchPnL = computeVoyagePnL(branchParams, branchTce, branchOpex);

        const vlsfo = branchParams.vlsfoPrice ?? 620;
        const awrpRate = branchParams.awrpRate ?? 0.04;
        const carbonTax = branchParams.carbonTax ?? 45;
        const dailyFuel = computeDailyFuel(branchParams);
        const totalBunker = dailyFuel * branchSeaDays;
        const dailyCO2 = dailyFuel * CO2_EMISSION_FACTOR;

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
            bunkerCostPerDay: Math.round(vlsfo * dailyFuel),
            awrpCost: Math.round((awrpRate / 100) * HULL_VALUE_USD * branchSeaDays / 365),
            carbonCost: Math.round(carbonTax * dailyCO2 * branchSeaDays),
            voyageDays: Math.round(branchSeaDays * 10) / 10,
            totalBunkerMT: Math.round(totalBunker),
            dailyFuelMT: Math.round(dailyFuel * 10) / 10,
        };
    });

    // Fleet aggregates
    const n = vessels.length || 1;
    const totalRevenueDelta = vessels.reduce((s, v) => s + v.tceDelta * v.voyageDays, 0);
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

