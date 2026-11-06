/** Return statistics, concentration and stress testing. */
import type { CapCategory } from "../types";

export function mean(xs: number[]) { return xs.reduce((s, x) => s + x, 0) / xs.length; }
export function stdev(xs: number[]) {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

export interface ReturnStats {
  months: number;
  annualisedReturn: number | null;
  volatility: number | null;
  sharpe: number | null;
  sortino: number | null;
  downsideDeviation: number | null;
  bestMonth: number | null;
  worstMonth: number | null;
  positiveMonthsPct: number | null;
  note?: string;
}

/** Monthly-return statistics. Ratios require >= 12 complete months to be shown. */
export function returnStats(monthly: number[], riskFreeAnnual: number, minMonths = 12): ReturnStats {
  const n = monthly.length;
  const base: ReturnStats = { months: n, annualisedReturn: null, volatility: null, sharpe: null, sortino: null, downsideDeviation: null, bestMonth: n ? Math.max(...monthly) : null, worstMonth: n ? Math.min(...monthly) : null, positiveMonthsPct: n ? monthly.filter((x) => x > 0).length / n : null };
  if (n < 2) return { ...base, note: "Fewer than 2 complete months of return history." };
  const vol = stdev(monthly) * Math.sqrt(12);
  const g = monthly.reduce((s, r) => s * (1 + r), 1);
  const ann = n >= 12 ? Math.pow(g, 12 / n) - 1 : null;
  const rfM = Math.pow(1 + riskFreeAnnual, 1 / 12) - 1;
  const dd = Math.sqrt(monthly.reduce((s, r) => s + Math.min(0, r - rfM) ** 2, 0) / n) * Math.sqrt(12);
  if (n < minMonths) return { ...base, volatility: vol, downsideDeviation: dd, note: `Only ${n} complete months; annualised ratios need ≥ ${minMonths}.` };
  return {
    ...base,
    annualisedReturn: ann,
    volatility: vol,
    downsideDeviation: dd,
    sharpe: vol > 0 && ann !== null ? (ann - riskFreeAnnual) / vol : null,
    sortino: dd > 0 && ann !== null ? (ann - riskFreeAnnual) / dd : null,
  };
}

export interface RelativeStats {
  months: number;
  trackingDifference: number | null; // annualised portfolio − annualised benchmark
  trackingError: number | null;
  informationRatio: number | null;
  benchmarkAnnualised: number | null;
  note?: string;
}

export function relativeStats(port: number[], bench: number[], minMonths = 12): RelativeStats {
  const n = Math.min(port.length, bench.length);
  if (n < minMonths) return { months: n, trackingDifference: null, trackingError: null, informationRatio: null, benchmarkAnnualised: null, note: `Need ≥ ${minMonths} overlapping complete months (have ${n}).` };
  const ex = port.slice(0, n).map((r, i) => r - bench[i]);
  const ga = port.slice(0, n).reduce((s, r) => s * (1 + r), 1);
  const gb = bench.slice(0, n).reduce((s, r) => s * (1 + r), 1);
  const pa = Math.pow(ga, 12 / n) - 1, ba = Math.pow(gb, 12 / n) - 1;
  const te = stdev(ex) * Math.sqrt(12);
  return { months: n, trackingDifference: pa - ba, trackingError: te, informationRatio: te > 0 ? (mean(ex) * 12) / te : null, benchmarkAnnualised: ba };
}

export interface HoldingForRisk {
  symbol: string;
  value: number;
  cost: number;
  sector?: string;
  capCategory: CapCategory;
  assetType: string;
  avgDailyTurnoverInr?: number; // for liquidity estimate
}

export interface Concentration {
  largestByValue?: { symbol: string; weight: number };
  largestByCost?: { symbol: string; weight: number };
  top5Value: number;
  top10Value: number;
  top5Cost: number;
  top10Cost: number;
  hhiValue: number; // Herfindahl index, 0..1
  effectiveN: number; // 1/HHI
}

function topShare(xs: number[], n: number, total: number) {
  return total > 0 ? [...xs].sort((a, b) => b - a).slice(0, n).reduce((s, x) => s + x, 0) / total : 0;
}

export function concentration(h: HoldingForRisk[]): Concentration {
  const tv = h.reduce((s, x) => s + x.value, 0);
  const tc = h.reduce((s, x) => s + Math.max(0, x.cost), 0);
  const byV = [...h].sort((a, b) => b.value - a.value)[0];
  const byC = [...h].sort((a, b) => b.cost - a.cost)[0];
  const hhi = tv > 0 ? h.reduce((s, x) => s + (x.value / tv) ** 2, 0) : 0;
  return {
    largestByValue: byV && tv > 0 ? { symbol: byV.symbol, weight: byV.value / tv } : undefined,
    largestByCost: byC && tc > 0 ? { symbol: byC.symbol, weight: byC.cost / tc } : undefined,
    top5Value: topShare(h.map((x) => x.value), 5, tv),
    top10Value: topShare(h.map((x) => x.value), 10, tv),
    top5Cost: topShare(h.map((x) => Math.max(0, x.cost)), 5, tc),
    top10Cost: topShare(h.map((x) => Math.max(0, x.cost)), 10, tc),
    hhiValue: hhi,
    effectiveN: hhi > 0 ? 1 / hhi : 0,
  };
}

export interface StressScenario {
  id: string;
  name: string;
  description: string;
  shock: (h: HoldingForRisk, ctx: { rankByValue: number }) => number; // fractional change, e.g. -0.5
}

export const DEFAULT_SCENARIOS: StressScenario[] = [
  { id: "largest50", name: "Largest holding −50%", description: "Single largest position by market value halves.", shock: (_h, c) => (c.rankByValue === 0 ? -0.5 : 0) },
  { id: "top5-40", name: "Top 5 holdings −40%", description: "Five largest positions fall 40%.", shock: (_h, c) => (c.rankByValue < 5 ? -0.4 : 0) },
  { id: "small50", name: "Small-cap portfolio −50%", description: "All Small, Micro and Nano direct equities fall 50%.", shock: (h) => (h.assetType === "STOCK" && ["Small", "Micro", "Nano"].includes(h.capCategory) ? -0.5 : 0) },
  { id: "micronano70", name: "Micro/Nano −70%", description: "Micro and Nano-cap direct equities fall 70% (liquidity-driven collapse).", shock: (h) => (h.assetType === "STOCK" && ["Micro", "Nano"].includes(h.capCategory) ? -0.7 : 0) },
  { id: "market35", name: "Broad market −35%", description: "All equity (stocks, equity ETFs, MFs) falls 35%; small/micro/nano fall 1.3× that. Liquid BeES unchanged.", shock: (h) => (h.assetType === "CASH_EQUIVALENT" ? 0 : h.assetType === "STOCK" && ["Small", "Micro", "Nano"].includes(h.capCategory) ? -0.455 : -0.35) },
];

export function stressTest(h: HoldingForRisk[], scenarios = DEFAULT_SCENARIOS) {
  const total = h.reduce((s, x) => s + x.value, 0);
  const ranked = [...h].sort((a, b) => b.value - a.value);
  const rank = new Map(ranked.map((x, i) => [x.symbol, i]));
  return scenarios.map((s) => {
    const loss = h.reduce((acc, x) => acc + x.value * s.shock(x, { rankByValue: rank.get(x.symbol) ?? 999 }), 0);
    return { id: s.id, name: s.name, description: s.description, loss, lossPct: total > 0 ? loss / total : 0, after: total + loss };
  });
}

/** Days to liquidate a position at a fraction of average daily traded value (default 10%). */
export function daysToLiquidate(value: number, avgDailyTurnoverInr: number | undefined, participation = 0.1): number | null {
  if (!avgDailyTurnoverInr || avgDailyTurnoverInr <= 0) return null;
  return value / (avgDailyTurnoverInr * participation);
}
