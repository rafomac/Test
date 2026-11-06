/** Period metrics and monthly / annual report builders (pure). */
import type { PortfolioAnalytics, PortfolioData } from "./portfolio";
import { addDays, daysBetween, monthEnd, monthKey } from "./dates";
import { buildPriceBook, chainReturn } from "./series";
import { runLedger } from "./positions";
import { xirr, annualise } from "./xirr";
import { classify, inferAssetType } from "./classify";
import type { Settings } from "../types";

export type RangeKey = "all" | "ytd" | "prev-year" | "12m" | "6m" | "3m" | "30d" | "custom";

export function rangeDates(key: RangeKey, asOf: string, inception?: string, custom?: { from?: string; to?: string }): { from: string; to: string; label: string } {
  const y = Number(asOf.slice(0, 4));
  switch (key) {
    case "ytd": return { from: `${y - 1}-12-31`, to: asOf, label: `Calendar ${y} to date` };
    case "prev-year": return { from: `${y - 2}-12-31`, to: `${y - 1}-12-31`, label: `Calendar ${y - 1}` };
    case "12m": return { from: addDays(asOf, -365), to: asOf, label: "Last 12 months" };
    case "6m": return { from: addDays(asOf, -182), to: asOf, label: "Last 6 months" };
    case "3m": return { from: addDays(asOf, -91), to: asOf, label: "Last 3 months" };
    case "30d": return { from: addDays(asOf, -30), to: asOf, label: "Last 30 days" };
    case "custom": return { from: custom?.from ?? inception ?? asOf, to: custom?.to ?? asOf, label: `${custom?.from} → ${custom?.to}` };
    default: return { from: inception ? addDays(inception, -1) : asOf, to: asOf, label: "All time" };
  }
}

export interface PeriodMetrics {
  from: string; to: string; label: string;
  startValue: number | null; endValue: number | null;
  netFlows: number; dividends: number; contributions: number | null;
  pnl: number | null; twr: number | null; twrComplete: boolean;
  mwr: number | null; mwrAnnualised: boolean; days: number;
  note?: string;
}

export function periodMetrics(a: PortfolioAnalytics, from: string, to: string, label: string): PeriodMetrics {
  const pts = a.series;
  const startPt = [...pts].reverse().find((p) => p.date <= from);
  const endPt = [...pts].reverse().find((p) => p.date <= to);
  const inR = pts.filter((p) => p.date > from && p.date <= to);
  const netFlows = inR.reduce((s, p) => s + p.netFlow, 0);
  const dividends = inR.reduce((s, p) => s + p.dividends, 0);
  const sv = startPt ? (startPt.covered ? startPt.value : null) : 0;
  const ev = endPt?.covered ? endPt.value : null;
  const c = chainReturn(pts, from, to);
  const months = a.sip.months.filter((m) => m.month > monthKey(from) && m.month <= monthKey(to));
  const contributions = a.sip.basis === "ledger" ? months.reduce((s, m) => s + m.contribution, 0) : null;
  const pnl = sv !== null && ev !== null ? ev - sv - netFlows + dividends : null;
  let mwr: number | null = null;
  const days = daysBetween(startPt?.date ?? inR[0]?.date ?? from, to);
  if (sv !== null && ev !== null) {
    const flows = [{ date: startPt?.date ?? from, amount: -sv }, ...inR.filter((p) => p.netFlow || p.dividends).map((p) => ({ date: p.date, amount: -p.netFlow + p.dividends })), { date: endPt!.date, amount: ev }];
    const x = xirr(flows);
    // Show the de-annualised period figure for < 1 year to avoid misleading annualisation.
    mwr = x === null ? null : days >= 365 ? x : Math.pow(1 + x, days / 365) - 1;
  }
  return {
    from, to, label, startValue: sv, endValue: ev, netFlows, dividends, contributions, pnl,
    twr: c.ret, twrComplete: c.complete, mwr, mwrAnnualised: days >= 365, days,
    note: !pts.length ? "No valuation history." : c.complete ? undefined : "Price history incomplete for part of this period.",
  };
}

export interface MonthlyReport {
  month: string;
  opening: number | null; closing: number | null;
  contributions: number | null; withdrawals: number | null;
  netFlows: number; pnl: number | null; twr: number | null;
  realized: number; dividends: number;
  sip: PortfolioAnalytics["sip"]["months"][number] | undefined;
  capStart: Record<string, number>; capEnd: Record<string, number>;
  sectorStart: Record<string, number>; sectorEnd: Record<string, number>;
  best: { symbol: string; gain: number }[]; worst: { symbol: string; gain: number }[];
  targetMonthly: number; // pro-rata target return for one month
  followUps: { symbol: string; nextReview?: string }[];
}

function weightsAt(d: PortfolioData, s: Settings, date: string, by: "cap" | "sector") {
  const book = buildPriceBook(d.prices);
  const secs = new Map(d.securities.map((x) => [x.symbol, x]));
  const pos = runLedger(d.trades, d.actions, date).positions;
  const out: Record<string, number> = {};
  let tot = 0;
  for (const p of pos.values()) {
    if (p.quantity <= 0) continue;
    const sec = secs.get(p.symbol);
    const at = sec?.assetType ?? inferAssetType(p.symbol, "", s.liquidSymbols);
    if (at !== "STOCK") continue;
    const px = book.get(p.symbol, date); if (px === undefined) continue;
    const k = by === "cap" ? classify(sec ?? { assetType: "STOCK" }, s.thresholds).category : sec?.sector ?? "Unclassified";
    out[k] = (out[k] ?? 0) + p.quantity * px; tot += p.quantity * px;
  }
  for (const k of Object.keys(out)) out[k] /= tot || 1;
  return out;
}

export function monthlyReport(a: PortfolioAnalytics, d: PortfolioData, s: Settings, month: string): MonthlyReport {
  const start = addDays(`${month}-01`, -1);
  const end = [monthEnd(month), a.asOf].sort()[0];
  const pm = periodMetrics(a, start, end, month);
  const book = buildPriceBook(d.prices);
  const before = runLedger(d.trades, d.actions, start), after = runLedger(d.trades, d.actions, end);
  const syms = new Set([...before.positions.keys(), ...after.positions.keys()]);
  const gains: { symbol: string; gain: number }[] = [];
  for (const sym of syms) {
    const q0 = before.positions.get(sym)?.quantity ?? 0, q1 = after.positions.get(sym)?.quantity ?? 0;
    const p0 = book.get(sym, start), p1 = book.get(sym, end);
    if ((q0 && p0 === undefined) || (q1 && p1 === undefined)) continue;
    const flows = d.trades.filter((t) => t.symbol === sym && t.date > start && t.date <= end).reduce((acc, t) => acc + (t.side === "BUY" ? t.quantity * t.price + t.charges : -(t.quantity * t.price - t.charges)), 0);
    const div = d.cash.filter((c) => c.kind === "DIVIDEND" && c.symbol === sym && c.date > start && c.date <= end).reduce((x, c) => x + c.amount, 0);
    gains.push({ symbol: sym, gain: q1 * (p1 ?? 0) - q0 * (p0 ?? 0) - flows + div });
  }
  gains.sort((x, y) => y.gain - x.gain);
  const sip = a.sip.months.find((m) => m.month === month);
  return {
    month, opening: pm.startValue, closing: pm.endValue,
    contributions: a.sip.basis === "ledger" ? sip?.deposits ?? 0 : null, withdrawals: a.sip.basis === "ledger" ? sip?.withdrawals ?? 0 : null,
    netFlows: pm.netFlows, pnl: pm.pnl, twr: pm.twr,
    realized: after.realized.filter((r) => r.date > start && r.date <= end).reduce((x, r) => x + r.pnl, 0),
    dividends: pm.dividends, sip,
    capStart: weightsAt(d, s, start, "cap"), capEnd: weightsAt(d, s, end, "cap"),
    sectorStart: weightsAt(d, s, start, "sector"), sectorEnd: weightsAt(d, s, end, "sector"),
    best: gains.slice(0, 5), worst: gains.slice(-5).reverse().filter((g) => g.gain < 0),
    targetMonthly: Math.pow(1 + s.targetCagrPct / 100, 1 / 12) - 1,
    followUps: d.research.filter((r) => r.nextReview && r.nextReview <= addDays(end, 31)).map((r) => ({ symbol: r.symbol, nextReview: r.nextReview })),
  };
}

export interface AnnualReport {
  year: string;
  pm: PeriodMetrics;
  contributions: number | null;
  sipTarget: number;
  monthsMet: number; monthsInPlan: number;
  benchmarks: { name: string; ret: number | null }[];
  sectorAttribution: { key: string; gain: number }[];
  capAttribution: { key: string; gain: number }[];
  wealthCreated: number | null;
  targetReturn: number;
}

export function annualReport(a: PortfolioAnalytics, d: PortfolioData, s: Settings, year: string): AnnualReport {
  const from = `${Number(year) - 1}-12-31`, to = [`${year}-12-31`, a.asOf].sort()[0];
  const pm = periodMetrics(a, from, to, year);
  const months = a.sip.months.filter((m) => m.month.startsWith(year) && m.inPlan);
  const sectorGain: Record<string, number> = {}, capGain: Record<string, number> = {};
  const secs = new Map(d.securities.map((x) => [x.symbol, x]));
  // Attribution over the full year by symbol
  const book = buildPriceBook(d.prices);
  const b0 = runLedger(d.trades, d.actions, from), b1 = runLedger(d.trades, d.actions, to);
  for (const sym of new Set([...b0.positions.keys(), ...b1.positions.keys()])) {
    const sec = secs.get(sym);
    if ((sec?.assetType ?? inferAssetType(sym, "", s.liquidSymbols)) !== "STOCK") continue;
    const q0 = b0.positions.get(sym)?.quantity ?? 0, q1 = b1.positions.get(sym)?.quantity ?? 0;
    const p0 = book.get(sym, from), p1 = book.get(sym, to);
    if ((q0 && p0 === undefined) || (q1 && p1 === undefined)) continue;
    const flows = d.trades.filter((t) => t.symbol === sym && t.date > from && t.date <= to).reduce((acc, t) => acc + (t.side === "BUY" ? t.quantity * t.price + t.charges : -(t.quantity * t.price - t.charges)), 0);
    const div = d.cash.filter((c) => c.kind === "DIVIDEND" && c.symbol === sym && c.date > from && c.date <= to).reduce((x, c) => x + c.amount, 0);
    const g = q1 * (p1 ?? 0) - q0 * (p0 ?? 0) - flows + div;
    const sk = sec?.sector ?? "Unclassified", ck = classify(sec ?? { assetType: "STOCK" }, s.thresholds).category;
    sectorGain[sk] = (sectorGain[sk] ?? 0) + g; capGain[ck] = (capGain[ck] ?? 0) + g;
  }
  const benchmarks = a.benchmarks.filter((b) => b.available).map((b) => {
    const pts = b.cumulative;
    const s0 = [...pts].reverse().find((p) => p.date <= from)?.value, s1 = [...pts].reverse().find((p) => p.date <= to)?.value;
    return { name: b.name, ret: s0 && s1 && pts[0].date <= addDays(from, 7) ? s1 / s0 - 1 : null };
  });
  return {
    year, pm, contributions: a.sip.basis === "ledger" ? months.reduce((x, m) => x + m.contribution, 0) : null,
    sipTarget: months.reduce((x, m) => x + m.target, 0), monthsMet: months.filter((m) => m.status === "Met" || m.status === "Surplus").length, monthsInPlan: months.length,
    benchmarks, sectorAttribution: Object.entries(sectorGain).map(([key, gain]) => ({ key, gain })).sort((x, y) => y.gain - x.gain),
    capAttribution: Object.entries(capGain).map(([key, gain]) => ({ key, gain })).sort((x, y) => y.gain - x.gain),
    wealthCreated: pm.pnl, targetReturn: s.targetCagrPct / 100,
  };
}

export { annualise };
