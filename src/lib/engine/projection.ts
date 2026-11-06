/**
 * Wealth projections.
 *
 * Deterministic: monthly compounding at r_m = (1 + r_annual)^(1/12) − 1. Each month the SIP is
 * added at the START of the month, then the whole balance grows by r_m. The SIP steps up by
 * `stepUpPct` every 12 months. Real (inflation-adjusted) value deflates by (1 + inflation)^(t/12).
 *
 * Monte Carlo: monthly log-returns drawn from a Student-t distribution (fat tails, df = 4 by
 * default) scaled to the chosen annual volatility, with drift chosen so that the MEDIAN path
 * compounds at the chosen expected return. A two-state regime (normal / stress) adds volatility
 * clustering and crash correlation across months. Outputs are illustrative, not forecasts.
 */

export interface ProjectionInput {
  startValue: number;
  monthlySip: number;
  years: number;
  annualReturn: number; // e.g. 0.15
  inflation: number; // e.g. 0.05
  stepUpPct: number; // e.g. 0.1 = +10% SIP each year
}

export interface ProjectionRow {
  month: number;
  year: number;
  contributed: number; // cumulative incl. start value
  value: number;
  real: number;
  gains: number;
}

export function monthlyRate(annual: number) { return Math.pow(1 + annual, 1 / 12) - 1; }

export function project(inp: ProjectionInput): ProjectionRow[] {
  const rm = monthlyRate(inp.annualReturn);
  let v = inp.startValue, contributed = inp.startValue, sip = inp.monthlySip;
  const rows: ProjectionRow[] = [{ month: 0, year: 0, contributed, value: v, real: v, gains: 0 }];
  for (let m = 1; m <= inp.years * 12; m++) {
    if (m > 1 && (m - 1) % 12 === 0) sip *= 1 + inp.stepUpPct;
    v = (v + sip) * (1 + rm);
    contributed += sip;
    const real = v / Math.pow(1 + inp.inflation, m / 12);
    rows.push({ month: m, year: m / 12, contributed, value: v, real, gains: v - contributed });
  }
  return rows;
}

/** Months until value first reaches `target`, simulating up to `maxYears`. null if never. */
export function monthsToTarget(inp: Omit<ProjectionInput, "years">, target: number, maxYears = 40): number | null {
  if (inp.startValue >= target) return 0;
  const rows = project({ ...inp, years: maxYears });
  const hit = rows.find((r) => r.value >= target);
  return hit ? hit.month : null;
}

/** Closed-form check: FV of start value + level SIP (start-of-month) with no step-up. */
export function futureValueClosedForm(start: number, sip: number, annual: number, months: number): number {
  const r = monthlyRate(annual);
  if (r === 0) return start + sip * months;
  return start * Math.pow(1 + r, months) + sip * (1 + r) * ((Math.pow(1 + r, months) - 1) / r);
}

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand: () => number) {
  let u = 0, v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
/** Student-t with unit variance. */
function studentT(rand: () => number, df: number) {
  const z = gaussian(rand);
  let chi = 0;
  for (let i = 0; i < df; i++) { const g = gaussian(rand); chi += g * g; }
  const t = z / Math.sqrt(chi / df);
  return df > 2 ? t * Math.sqrt((df - 2) / df) : t;
}

export interface MonteCarloInput extends ProjectionInput {
  volatility: number; // annual, e.g. 0.28
  df: number; // Student-t degrees of freedom
  paths: number;
  seed: number;
  stressProb: number; // monthly probability of entering a stress regime (e.g. 0.02)
  stressStay: number; // probability of staying in stress next month (e.g. 0.8)
  stressVolMult: number; // vol multiplier in stress (e.g. 2)
  stressDriftAnnual: number; // annual drift in stress (e.g. -0.3)
  milestones: number[];
}

export interface MonteCarloResult {
  years: number[];
  p10: number[]; p25: number[]; p50: number[]; p75: number[]; p90: number[];
  contributed: number[];
  milestoneProb: { milestone: number; prob: number; medianMonths: number | null }[];
  cagrAbove: { rate: number; prob: number }[];
  finalXirrMedian: number | null;
}

function pct(sorted: number[], q: number) {
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

export function monteCarlo(inp: MonteCarloInput): MonteCarloResult {
  const rand = mulberry32(inp.seed);
  const months = inp.years * 12;
  const sigmaM = inp.volatility / Math.sqrt(12);
  // Median monthly log growth so that median path ≈ expected return (stress regime lowers it further, intentionally).
  const muM = Math.log(1 + inp.annualReturn) / 12;
  const stressMu = Math.log(1 + inp.stressDriftAnnual) / 12;
  const byYear: number[][] = Array.from({ length: inp.years + 1 }, () => []);
  const hitMonths: (number | null)[][] = inp.milestones.map(() => []);
  const twrs: number[] = [];
  const contributed: number[] = [];
  for (let p = 0; p < inp.paths; p++) {
    let v = inp.startValue, sip = inp.monthlySip, stress = false, growth = 1, contrib = inp.startValue;
    const hits: (number | null)[] = inp.milestones.map((m) => (inp.startValue >= m ? 0 : null));
    byYear[0].push(v);
    for (let m = 1; m <= months; m++) {
      if (m > 1 && (m - 1) % 12 === 0) sip *= 1 + inp.stepUpPct;
      stress = stress ? rand() < inp.stressStay : rand() < inp.stressProb;
      const s = stress ? sigmaM * inp.stressVolMult : sigmaM;
      const mu = stress ? stressMu : muM;
      const lr = mu + s * studentT(rand, inp.df);
      const g = Math.exp(lr);
      v = (v + sip) * g;
      growth *= g;
      contrib += sip;
      for (let i = 0; i < hits.length; i++) if (hits[i] === null && v >= inp.milestones[i]) hits[i] = m;
      if (m % 12 === 0) { byYear[m / 12].push(v); if (p === 0) contributed[m / 12] = contrib; }
    }
    if (p === 0) contributed[0] = inp.startValue;
    hits.forEach((h, i) => hitMonths[i].push(h));
    twrs.push(Math.pow(growth, 1 / inp.years) - 1);
  }
  const res: MonteCarloResult = { years: [], p10: [], p25: [], p50: [], p75: [], p90: [], contributed, milestoneProb: [], cagrAbove: [], finalXirrMedian: null };
  byYear.forEach((vals, y) => {
    const s = [...vals].sort((a, b) => a - b);
    res.years.push(y);
    res.p10.push(pct(s, 0.1)); res.p25.push(pct(s, 0.25)); res.p50.push(pct(s, 0.5)); res.p75.push(pct(s, 0.75)); res.p90.push(pct(s, 0.9));
  });
  res.milestoneProb = inp.milestones.map((m, i) => {
    const hs = hitMonths[i].filter((x): x is number => x !== null).sort((a, b) => a - b);
    return { milestone: m, prob: hs.length / inp.paths, medianMonths: hs.length >= inp.paths / 2 ? hs[Math.floor(inp.paths / 2)] : null };
  });
  const ts = [...twrs].sort((a, b) => a - b);
  res.cagrAbove = [0.1, 0.15, 0.2, 0.25, 0.3, 0.4].map((r) => ({ rate: r, prob: ts.filter((x) => x >= r).length / ts.length }));
  res.finalXirrMedian = pct(ts, 0.5);
  return res;
}

export const SCENARIOS = [
  { rate: 0.1, label: "10%", note: "Conservative" },
  { rate: 0.12, label: "12%", note: "Near long-run Nifty" },
  { rate: 0.15, label: "15%", note: "Strong" },
  { rate: 0.2, label: "20%", note: "Aggressive" },
  { rate: 0.25, label: "25%", note: "Very aggressive, uncertain" },
  { rate: 0.3, label: "30%", note: "Exceptional, highly uncertain" },
  { rate: 0.4, label: "40%", note: "Extreme aspirational scenario — not a realistic base case" },
];
