/**
 * Bear/base/bull valuation scenarios. ASSUMPTIONS, not facts: the output is the return implied by
 * the user's inputs, never an objective fair value.
 *
 *   Revenue_T  = Revenue_0 × (1 + g)^years
 *   Profit_T   = Revenue_T × terminal net margin
 *   MarketCap_T = Profit_T × exit P/E
 *   Per-share multiple = (MarketCap_T / MarketCap_0) ÷ (1 + dilution)^years
 *   Implied CAGR = multiple^(1/years) − 1
 *   Value today at required return r = MarketCap_T / (1+r)^years ÷ (1+dilution)^years
 */
import type { ValuationScenario } from "../types";

export interface ScenarioResult {
  name: string;
  revenueT: number;
  profitT: number;
  marketCapT: number;
  multiple: number | null;
  impliedCagr: number | null;
  presentValueCr: number | null;
  upsideVsToday: number | null;
}

export function runScenario(sc: ValuationScenario, revenue0Cr: number, marketCap0Cr: number, requiredReturn: number): ScenarioResult {
  const revenueT = revenue0Cr * Math.pow(1 + sc.revenueGrowthPct / 100, sc.years);
  const profitT = revenueT * (sc.netMarginPct / 100);
  const marketCapT = Math.max(0, profitT * sc.exitPe);
  const dil = Math.pow(1 + sc.dilutionPct / 100, sc.years);
  const multiple = marketCap0Cr > 0 ? marketCapT / marketCap0Cr / dil : null;
  const pv = marketCapT / Math.pow(1 + requiredReturn, sc.years) / dil;
  return {
    name: sc.name, revenueT, profitT, marketCapT, multiple,
    impliedCagr: multiple !== null && multiple > 0 && sc.years > 0 ? Math.pow(multiple, 1 / sc.years) - 1 : multiple === 0 ? -1 : null,
    presentValueCr: pv, upsideVsToday: marketCap0Cr > 0 ? pv / marketCap0Cr - 1 : null,
  };
}

export const DEFAULT_SCENARIOS: ValuationScenario[] = [
  { name: "Bear", revenueGrowthPct: 8, netMarginPct: 5, dilutionPct: 2, exitPe: 12, years: 5 },
  { name: "Base", revenueGrowthPct: 20, netMarginPct: 8, dilutionPct: 1, exitPe: 20, years: 5 },
  { name: "Bull", revenueGrowthPct: 35, netMarginPct: 12, dilutionPct: 0, exitPe: 30, years: 5 },
];
