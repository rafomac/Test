/**
 * Historical valuation series and time-weighted returns.
 *
 * The securities sleeve (stocks + ETFs + MFs + Liquid BeES) is valued daily from replayed
 * quantities × closing prices. A day is "covered" only if every held symbol has a price
 * within `maxStaleDays`. Returns are never chained across uncovered days; affected periods
 * are reported as incomplete rather than estimated.
 *
 * Daily return (flows at start of day):  r_t = (V_t + D_t) / (V_{t-1} + F_t) − 1
 *   F_t = buy cost − sale proceeds on day t (net capital moved into the sleeve)
 *   D_t = dividends received on day t (income distributed out of the sleeve)
 */
import type { CashEntry, CorporateAction, PricePoint, Trade } from "../types";
import { addDays, monthKey } from "./dates";
import { runLedger } from "./positions";

export interface PriceBook {
  /** Close on or before `date` within `maxStale` days, else undefined. */
  get(symbol: string, date: string, maxStale?: number): number | undefined;
  dates(symbol: string): string[];
  has(symbol: string): boolean;
}

export function buildPriceBook(points: PricePoint[]): PriceBook {
  const m = new Map<string, { d: string[]; c: number[] }>();
  const sorted = [...points].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  for (const p of sorted) {
    let e = m.get(p.symbol);
    if (!e) { e = { d: [], c: [] }; m.set(p.symbol, e); }
    if (e.d[e.d.length - 1] === p.date) e.c[e.c.length - 1] = p.close;
    else { e.d.push(p.date); e.c.push(p.close); }
  }
  return {
    has: (s) => m.has(s),
    dates: (s) => m.get(s)?.d ?? [],
    get(symbol, date, maxStale = 7) {
      const e = m.get(symbol);
      if (!e) return undefined;
      let lo = 0, hi = e.d.length - 1, idx = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (e.d[mid] <= date) { idx = mid; lo = mid + 1; } else hi = mid - 1;
      }
      if (idx < 0) return undefined;
      const age = Math.round((Date.parse(date) - Date.parse(e.d[idx])) / 86_400_000);
      return age <= maxStale ? e.c[idx] : undefined;
    },
  };
}

export interface SeriesPoint {
  date: string;
  value: number; // market value of securities held at close
  netFlow: number; // F_t
  dividends: number; // D_t
  cumNetInvested: number; // running Σ F_t (cost-based, after sales)
  covered: boolean;
  missing: string[];
  dailyReturn: number | null;
  twrIndex: number | null; // growth of 1 since the start of the latest continuous covered run
}

export interface SeriesResult {
  points: SeriesPoint[];
  coveredDays: number;
  uncoveredDays: number;
  firstDate?: string;
  lastDate?: string;
  gaps: { from: string; to: string; symbols: string[] }[];
}

/** Build the daily series on business days (Mon–Fri) between the first trade and `endDate`. */
export function buildSeries(
  trades: Trade[],
  actions: CorporateAction[],
  cash: CashEntry[],
  prices: PriceBook,
  endDate: string,
  maxStaleDays = 7,
): SeriesResult {
  if (!trades.length) return { points: [], coveredDays: 0, uncoveredDays: 0, gaps: [] };
  const start = trades.map((t) => t.date).sort()[0];
  const flowsByDate = new Map<string, number>();
  for (const t of trades) {
    const v = t.side === "BUY" ? t.quantity * t.price + (t.charges || 0) : -(t.quantity * t.price - (t.charges || 0));
    flowsByDate.set(t.date, (flowsByDate.get(t.date) ?? 0) + v);
  }
  const divByDate = new Map<string, number>();
  for (const c of cash) if (c.kind === "DIVIDEND") divByDate.set(c.date, (divByDate.get(c.date) ?? 0) + c.amount);

  // Replay quantities incrementally by date
  const { qtyTimeline } = runLedger(trades, actions, endDate);
  const qty = new Map<string, number>();
  let ti = 0;

  const points: SeriesPoint[] = [];
  const gaps: SeriesResult["gaps"] = [];
  let prevValue = 0;
  let prevCovered = false;
  let index: number | null = null;
  let cum = 0;
  let pendingFlow = 0; // flows on weekend days roll into next business day
  let pendingDiv = 0;
  for (let d = start; d <= endDate; d = addDays(d, 1)) {
    while (ti < qtyTimeline.length && qtyTimeline[ti].date <= d) {
      const q = qtyTimeline[ti];
      if (q.qty > 0) qty.set(q.symbol, q.qty); else qty.delete(q.symbol);
      ti++;
    }
    pendingFlow += flowsByDate.get(d) ?? 0;
    pendingDiv += divByDate.get(d) ?? 0;
    const dow = new Date(d + "T00:00:00Z").getUTCDay();
    // Weekend days are skipped, except the final as-of date so trailing weekend flows (e.g. a Saturday UPI deposit) are never dropped.
    if ((dow === 0 || dow === 6) && d !== endDate) continue;
    let value = 0;
    const missing: string[] = [];
    for (const [s, q] of qty) {
      const px = prices.get(s, d, maxStaleDays);
      if (px === undefined) missing.push(s); else value += q * px;
    }
    const covered = missing.length === 0;
    const F = pendingFlow, D = pendingDiv;
    pendingFlow = 0; pendingDiv = 0;
    cum += F;
    let r: number | null = null;
    if (covered && (prevCovered || points.length === 0 || prevValue === 0)) {
      const base = prevValue + F;
      r = base > 1e-6 ? (value + D) / base - 1 : 0;
      index = (index ?? 1) * (1 + r);
    } else if (covered) {
      // start of a new covered run after a gap
      index = 1;
      r = null;
    } else {
      index = null;
    }
    if (!covered) {
      const last = gaps[gaps.length - 1];
      if (last && last.to === points[points.length - 1]?.date) { last.to = d; for (const s of missing) if (!last.symbols.includes(s)) last.symbols.push(s); }
      else gaps.push({ from: d, to: d, symbols: [...missing] });
    }
    points.push({ date: d, value, netFlow: F, dividends: D, cumNetInvested: cum, covered, missing, dailyReturn: r, twrIndex: index });
    prevValue = value;
    prevCovered = covered;
  }
  const coveredDays = points.filter((p) => p.covered).length;
  return { points, coveredDays, uncoveredDays: points.length - coveredDays, firstDate: points[0]?.date, lastDate: points[points.length - 1]?.date, gaps };
}

export interface PeriodReturn {
  key: string;
  from: string;
  to: string;
  ret: number | null;
  complete: boolean;
  days: number;
}

/** Chain daily returns within [from, to]. Incomplete if any business day in range lacks a return. */
export function chainReturn(points: SeriesPoint[], from: string, to: string): { ret: number | null; complete: boolean } {
  const inRange = points.filter((p) => p.date > from && p.date <= to);
  if (!inRange.length) return { ret: null, complete: false };
  let g = 1;
  let complete = true;
  for (const p of inRange) {
    if (p.dailyReturn === null) { complete = false; continue; }
    g *= 1 + p.dailyReturn;
  }
  return { ret: complete ? g - 1 : null, complete };
}

export function monthlyReturns(points: SeriesPoint[]): PeriodReturn[] {
  const byMonth = new Map<string, SeriesPoint[]>();
  for (const p of points) {
    const k = monthKey(p.date);
    if (!byMonth.has(k)) byMonth.set(k, []);
    byMonth.get(k)!.push(p);
  }
  const out: PeriodReturn[] = [];
  for (const [k, ps] of byMonth) {
    let g = 1, complete = true;
    for (const p of ps) { if (p.dailyReturn === null) { complete = false; } else g *= 1 + p.dailyReturn; }
    out.push({ key: k, from: ps[0].date, to: ps[ps.length - 1].date, ret: complete ? g - 1 : null, complete, days: ps.length });
  }
  // The very first month's first day has r=0 by construction (capital deployed that day), fine.
  return out;
}

export function compoundPeriods(rs: (number | null)[]): number | null {
  let g = 1;
  for (const r of rs) { if (r === null) return null; g *= 1 + r; }
  return g - 1;
}

export function calendarYearReturns(monthly: PeriodReturn[]): PeriodReturn[] {
  const byYear = new Map<string, PeriodReturn[]>();
  for (const m of monthly) {
    const y = m.key.slice(0, 4);
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y)!.push(m);
  }
  return [...byYear].map(([y, ms]) => {
    const r = compoundPeriods(ms.map((m) => m.ret));
    return { key: y, from: ms[0].from, to: ms[ms.length - 1].to, ret: r, complete: r !== null, days: ms.reduce((s, m) => s + m.days, 0) };
  });
}

/** Rolling N-month returns; annualised when N >= 12. */
export function rollingReturns(monthly: PeriodReturn[], n: number): { key: string; ret: number | null }[] {
  const out: { key: string; ret: number | null }[] = [];
  for (let i = n - 1; i < monthly.length; i++) {
    const r = compoundPeriods(monthly.slice(i - n + 1, i + 1).map((m) => m.ret));
    out.push({ key: monthly[i].key, ret: r === null ? null : n >= 12 ? Math.pow(1 + r, 12 / n) - 1 : r });
  }
  return out;
}

/** Index series → daily returns aligned to the supplied business dates. */
export function indexReturns(prices: PriceBook, symbol: string, dates: string[]): Map<string, number | null> {
  const out = new Map<string, number | null>();
  let prev: number | undefined;
  for (const d of dates) {
    const px = prices.get(symbol, d, 5);
    out.set(d, px !== undefined && prev !== undefined ? px / prev - 1 : null);
    if (px !== undefined) prev = px;
  }
  return out;
}

/** Daily-rebalanced blend of index returns. Null on days any component lacks data. */
export function blendedReturns(prices: PriceBook, blend: Record<string, number>, dates: string[]): Map<string, number | null> {
  const comps = Object.entries(blend).filter(([, w]) => w > 0);
  const total = comps.reduce((s, [, w]) => s + w, 0);
  const series = comps.map(([s, w]) => [indexReturns(prices, s, dates), w / total] as const);
  const out = new Map<string, number | null>();
  for (const d of dates) {
    let r = 0, ok = comps.length > 0;
    for (const [m, w] of series) { const x = m.get(d); if (x === null || x === undefined) { ok = false; break; } r += w * x; }
    out.set(d, ok ? r : null);
  }
  return out;
}

/**
 * Target reference path: each dated net flow compounds at the target rate from its own date.
 * Value_target(t) = Σ_{i: t_i ≤ t} F_i × (1+g)^((t − t_i)/365) − Σ dividends compounded likewise.
 */
export function targetPath(points: SeriesPoint[], targetRate: number): { date: string; target: number }[] {
  let acc = 0;
  let prev: string | undefined;
  const out: { date: string; target: number }[] = [];
  for (const p of points) {
    if (prev) acc *= Math.pow(1 + targetRate, (Date.parse(p.date) - Date.parse(prev)) / 86_400_000 / 365);
    acc += p.netFlow - p.dividends;
    out.push({ date: p.date, target: acc });
    prev = p.date;
  }
  return out;
}

export function maxDrawdown(index: (number | null)[]): number | null {
  let peak = -Infinity, mdd = 0, any = false;
  for (const v of index) {
    if (v === null) continue;
    any = true;
    peak = Math.max(peak, v);
    mdd = Math.min(mdd, v / peak - 1);
  }
  return any ? mdd : null;
}
