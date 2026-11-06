/** Fundamental metrics, research scorecard, technicals and multibagger attribution. */
import type { Fundamentals, ResearchEntry, ScoreCategory } from "../types";

export const DEFAULT_WEIGHTS: Record<ScoreCategory, number> = {
  growth: 25, financialHealth: 20, valuation: 20, governance: 15, competitive: 10, industry: 5, digital: 5,
};
export const CATEGORY_LABEL: Record<ScoreCategory, string> = {
  growth: "Future growth potential", financialHealth: "Financial health & cash flow", valuation: "Valuation",
  governance: "Management & governance", competitive: "Competitive position", industry: "Industry opportunity", digital: "Digital presence",
};

function fyKeys(rec?: Record<string, number>) {
  return rec ? Object.keys(rec).filter((k) => Number.isFinite(rec[k])).sort() : [];
}

/** CAGR over `years` ending at the latest fiscal year (or at `endKey`). Null when data missing or non-positive. */
export function revenueCagr(rev: Record<string, number> | undefined, years: number, endKey?: string): number | null {
  if (!rev) return null;
  const keys = fyKeys(rev);
  const end = endKey ?? keys[keys.length - 1];
  if (!end) return null;
  const endYear = Number(end.replace(/\D/g, ""));
  const startKey = `FY${endYear - years}`;
  const a = rev[startKey], b = rev[end];
  if (!(a > 0) || !(b > 0)) return null;
  return Math.pow(b / a, 1 / years) - 1;
}

export function yoyGrowth(rev: Record<string, number> | undefined): { key: string; growth: number | null }[] {
  const keys = fyKeys(rev);
  return keys.map((k, i) => ({ key: k, growth: i > 0 && rev![keys[i - 1]] > 0 ? rev![k] / rev![keys[i - 1]] - 1 : null }));
}

/** Coefficient of variation of YoY growth (lower = more consistent) and acceleration (last 2y avg − prior 3y avg). */
export function growthQuality(rev: Record<string, number> | undefined) {
  const g = yoyGrowth(rev).map((x) => x.growth).filter((x): x is number => x !== null);
  if (g.length < 3) return { consistency: null as number | null, acceleration: null as number | null, positiveYears: g.filter((x) => x > 0).length, years: g.length };
  const m = g.reduce((s, x) => s + x, 0) / g.length;
  const sd = Math.sqrt(g.reduce((s, x) => s + (x - m) ** 2, 0) / (g.length - 1));
  const recent = g.slice(-2), prior = g.slice(-5, -2);
  const acc = prior.length ? recent.reduce((s, x) => s + x, 0) / recent.length - prior.reduce((s, x) => s + x, 0) / prior.length : null;
  return { consistency: m !== 0 ? sd / Math.abs(m) : null, acceleration: acc, positiveYears: g.filter((x) => x > 0).length, years: g.length };
}

/**
 * Unpledged promoter ownership = promoter % × (1 − pledged fraction of promoter holding).
 * If only pledge-as-%-of-total-equity is available: unpledged = promoter % − pledge % of total.
 */
export function unpledgedPromoter(f: Pick<Fundamentals, "promoterHoldingPct" | "promoterPledgePctOfPromoter" | "promoterPledgePctOfTotal">): { value: number | null; basis: string } {
  const p = f.promoterHoldingPct;
  if (p === undefined) return { value: null, basis: "Promoter holding unknown" };
  if (f.promoterPledgePctOfPromoter !== undefined) return { value: p * (1 - f.promoterPledgePctOfPromoter / 100), basis: "Pledge reported as % of promoter holding" };
  if (f.promoterPledgePctOfTotal !== undefined) return { value: Math.max(0, p - f.promoterPledgePctOfTotal), basis: "Pledge reported as % of total equity" };
  return { value: null, basis: "Pledge data missing — cannot confirm unpledged holding" };
}

export function promoterTrend(hist?: Record<string, number>): { change: number | null; direction: "Increasing" | "Stable" | "Declining" | "Unknown"; from?: string; to?: string } {
  const keys = fyKeys(hist);
  if (keys.length < 2) return { change: null, direction: "Unknown" };
  const from = keys[Math.max(0, keys.length - 8)], to = keys[keys.length - 1];
  const ch = hist![to] - hist![from];
  return { change: ch, direction: ch > 0.5 ? "Increasing" : ch < -0.5 ? "Declining" : "Stable", from, to };
}

export function peg(pe?: number, growthPct?: number): number | null {
  if (!pe || pe <= 0 || !growthPct || growthPct <= 0) return null;
  return pe / growthPct;
}

export function peBand(pe?: number, ttmProfit?: number): string {
  if (ttmProfit !== undefined && ttmProfit <= 0) return "Loss-making — P/E not meaningful; use revenue multiples, runway, dilution risk";
  if (pe === undefined) return "Unknown";
  if (pe <= 0) return "Not meaningful";
  if (pe < 15) return "< 15: check for undervaluation or fundamental problems";
  if (pe < 30) return "15–30: potentially reasonable given quality/growth";
  if (pe < 50) return "30–50: needs stronger growth justification";
  if (pe < 75) return "50–75: needs exceptional, credible growth";
  return "> 75: especially rigorous valuation scrutiny";
}

/** Digital presence 0–10 from verifiable facts only. */
export function digitalScore(f?: Fundamentals): { score: number | null; facts: string[] } {
  if (!f || (f.website === undefined && !f.socials)) return { score: null, facts: ["No digital-presence data entered"] };
  const facts: string[] = [];
  let s = 0;
  if (f.website) { s += 2; facts.push("Official website listed"); }
  if (f.websiteQuality !== undefined) { s += f.websiteQuality; facts.push(`Website quality ${f.websiteQuality}/3`); }
  const official = (f.socials ?? []).filter((x) => x.verifiedOfficial);
  if (official.length >= 1) { s += 2; facts.push(`${official.length} verified official social account(s)`); }
  if (official.length >= 2) s += 1;
  const active = official.filter((x) => (x.postsLast90d ?? 0) >= 3);
  if (active.length) { s += 2; facts.push(`${active.length} account(s) posting ≈ monthly or better`); }
  return { score: Math.min(10, s), facts };
}

export interface ScoreResult {
  score: number | null; // 0–100 over assessed categories, missing scored 0
  completeness: number; // fraction of weight with a rating
  confidence: number; // weight-share backed by verified evidence
  breakdown: { category: ScoreCategory; weight: number; rating: number | null; points: number; evidence: string }[];
}

/**
 * Weighted score. Missing ratings earn ZERO points (never full credit). Completeness and
 * confidence are reported separately so a high score with low completeness is visible.
 */
export function researchScore(r: ResearchEntry | undefined, f: Fundamentals | undefined, weights: Record<ScoreCategory, number>): ScoreResult {
  const total = Object.values(weights).reduce((s, w) => s + w, 0) || 1;
  const dig = digitalScore(f);
  const breakdown = (Object.keys(weights) as ScoreCategory[]).map((c) => {
    let rating = r?.ratings[c];
    let evidence: string = r?.evidence[c] ?? (rating === undefined ? "missing" : "user");
    if (c === "digital" && rating === undefined && dig.score !== null) { rating = dig.score; evidence = "verified"; }
    const w = (weights[c] / total) * 100;
    return { category: c, weight: w, rating: rating ?? null, points: rating !== undefined ? (w * Math.max(0, Math.min(10, rating))) / 10 : 0, evidence };
  });
  const assessedW = breakdown.filter((b) => b.rating !== null).reduce((s, b) => s + b.weight, 0);
  const verifiedW = breakdown.filter((b) => b.evidence === "verified").reduce((s, b) => s + b.weight, 0);
  return { score: assessedW > 0 ? breakdown.reduce((s, b) => s + b.points, 0) : null, completeness: assessedW / 100, confidence: verifiedW / 100, breakdown };
}

/** Criteria check against the stated stock-selection philosophy. */
export function criteriaCheck(f: Fundamentals | undefined, marketCapCr: number | undefined) {
  const c3 = revenueCagr(f?.revenueAnnual, 3), c5 = revenueCagr(f?.revenueAnnual, 5);
  const up = f ? unpledgedPromoter(f) : { value: null, basis: "" };
  const trend = promoterTrend(f?.promoterHistory);
  const dig = digitalScore(f);
  const check = (ok: boolean | null) => (ok === null ? "unknown" : ok ? "pass" : "fail") as "pass" | "fail" | "unknown";
  return [
    { id: "mcap", label: "Market cap ₹100–2,000 cr", result: check(marketCapCr === undefined ? null : marketCapCr >= 100 && marketCapCr <= 2000), detail: marketCapCr !== undefined ? `₹${marketCapCr.toFixed(0)} cr` : "unknown" },
    { id: "rev", label: "Revenue CAGR ≈ 25%+ (3Y or 5Y)", result: check(c3 === null && c5 === null ? null : (c3 ?? -1) >= 0.25 || (c5 ?? -1) >= 0.25), detail: `3Y ${c3 === null ? "—" : (c3 * 100).toFixed(1) + "%"} · 5Y ${c5 === null ? "—" : (c5 * 100).toFixed(1) + "%"}` },
    { id: "prom", label: "Promoter holding ≥ 50%", result: check(f?.promoterHoldingPct === undefined ? null : f.promoterHoldingPct >= 50), detail: f?.promoterHoldingPct !== undefined ? `${f.promoterHoldingPct.toFixed(1)}%` : "unknown" },
    { id: "unpl", label: "Unpledged promoter ≥ 40% (pref. 50%)", result: check(up.value === null ? null : up.value >= 40), detail: up.value !== null ? `${up.value.toFixed(1)}% — ${up.basis}` : up.basis || "unknown" },
    { id: "trend", label: "Promoter trend stable/increasing", result: check(trend.direction === "Unknown" ? null : trend.direction !== "Declining"), detail: trend.change !== null ? `${trend.direction} (${trend.change > 0 ? "+" : ""}${trend.change.toFixed(2)} pp ${trend.from}→${trend.to})` : "unknown" },
    { id: "dig", label: "Website + ≥1 active official social", result: check(dig.score === null ? null : dig.score >= 6), detail: dig.facts.join("; ") },
  ];
}

// ---------- Technicals ----------
export function sma(xs: number[], n: number): (number | null)[] {
  const out: (number | null)[] = [];
  let s = 0;
  for (let i = 0; i < xs.length; i++) {
    s += xs[i];
    if (i >= n) s -= xs[i - n];
    out.push(i >= n - 1 ? s / n : null);
  }
  return out;
}

export interface Technicals {
  last: number;
  sma50: number | null;
  sma200: number | null;
  vs200: number | null;
  high52: number | null;
  low52: number | null;
  drawdownFromHigh: number | null;
  trend: "Uptrend" | "Downtrend" | "Sideways" | "Insufficient data";
  volumeTrend: number | null; // 20d avg / 100d avg − 1
  relativeStrength6m: number | null; // stock 6m return − benchmark 6m return
  bars: number;
}

export function technicals(closes: { date: string; close: number; volume?: number }[], bench?: { date: string; close: number }[]): Technicals | null {
  if (!closes.length) return null;
  const c = closes.map((x) => x.close);
  const s50 = sma(c, 50), s200 = sma(c, 200);
  const last = c[c.length - 1];
  const yr = closes.slice(-250);
  const hi = yr.length >= 200 ? Math.max(...yr.map((x) => x.close)) : null;
  const lo = yr.length >= 200 ? Math.min(...yr.map((x) => x.close)) : null;
  const l50 = s50[s50.length - 1], l200 = s200[s200.length - 1];
  const prev200 = s200[s200.length - 21] ?? null;
  let trend: Technicals["trend"] = "Insufficient data";
  if (l50 !== null && l200 !== null && prev200 !== null) {
    const slope = l200 / prev200 - 1;
    trend = last > l200 && l50 > l200 && slope > 0 ? "Uptrend" : last < l200 && l50 < l200 && slope < 0 ? "Downtrend" : "Sideways";
  }
  const vols = closes.map((x) => x.volume).filter((v): v is number => v !== undefined);
  const vt = vols.length >= 100 ? vols.slice(-20).reduce((s, x) => s + x, 0) / 20 / (vols.slice(-100).reduce((s, x) => s + x, 0) / 100) - 1 : null;
  let rs: number | null = null;
  if (bench && closes.length > 126) {
    const d0 = closes[closes.length - 127].date;
    const b0 = [...bench].reverse().find((b) => b.date <= d0)?.close;
    const b1 = bench[bench.length - 1]?.close;
    if (b0 && b1) rs = last / closes[closes.length - 127].close - b1 / b0;
  }
  return { last, sma50: l50, sma200: l200, vs200: l200 ? last / l200 - 1 : null, high52: hi, low52: lo, drawdownFromHigh: hi ? last / hi - 1 : null, trend, volumeTrend: vt, relativeStrength6m: rs, bars: closes.length };
}

// ---------- Multibaggers ----------
export const MULTIPLE_TIERS = [50, 20, 10, 5, 3, 2, 1.5];

export function tierFor(multiple: number): number | null {
  return MULTIPLE_TIERS.find((t) => multiple >= t) ?? null;
}

/**
 * Return multiple = (current value + sale proceeds + dividends) / total capital invested.
 * Total capital = gross buy cost (corporate-action adjusted). Partial sales therefore don't
 * inflate or deflate the multiple.
 */
export function returnMultiple(currentValue: number, grossSold: number, dividends: number, grossBought: number): number | null {
  return grossBought > 0 ? (currentValue + grossSold + dividends) / grossBought : null;
}

/**
 * Log-decomposition of price return into earnings growth and P/E change:
 *   ln(P1/P0) = ln(E1/E0) + ln(PE1/PE0). Requires EPS (or profit, if share count is stable) at both dates.
 */
export function attribution(p0: number, p1: number, pe0?: number, pe1?: number) {
  if (!(p0 > 0 && p1 > 0 && pe0 && pe1 && pe0 > 0 && pe1 > 0)) return null;
  const total = Math.log(p1 / p0);
  const valuation = Math.log(pe1 / pe0);
  const earnings = total - valuation;
  return { total, earnings, valuation, earningsShare: total !== 0 ? earnings / total : null, valuationShare: total !== 0 ? valuation / total : null };
}
