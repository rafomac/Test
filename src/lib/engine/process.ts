/**
 * Investment-process effectiveness: analyses every BUY lot (initial ₹10k research positions vs
 * later additions) with FIFO matching of sales. Separates market exposure (benchmark return over
 * the same holding window) from selection, and warns when samples are too small to infer skill.
 */
import type { CorporateAction, JournalEntry, PricePoint, ResearchEntry, Security, Settings, Trade } from "../types";
import { buildPriceBook } from "./series";
import { classifyAt } from "./classify";
import { daysBetween } from "./dates";

export interface LotResult {
  tradeId: string;
  symbol: string;
  date: string;
  kind: "Initial" | "Addition";
  amount: number;
  qty: number;
  currentValue: number | null; // remaining shares × price + realised proceeds of this lot
  multiple: number | null;
  ret: number | null;
  annualised: number | null;
  days: number;
  conviction: string;
  convictionSource: "journal" | "current research" | "not set";
  scoreAtEntry: number | null;
  peAtEntry: number | null;
  cap: string;
  benchmarkRet: number | null;
  excess: number | null;
  closed: boolean;
}

export function lotAnalysis(trades: Trade[], actions: CorporateAction[], prices: PricePoint[], securities: Security[], research: ResearchEntry[], journal: JournalEntry[], s: Settings, asOf: string, benchmark = "IDX:NIFTY_SMALLCAP_250_TRI"): LotResult[] {
  const book = buildPriceBook(prices);
  const secMap = new Map(securities.map((x) => [x.symbol, x]));
  const resMap = new Map(research.map((r) => [r.symbol, r]));
  const sorted = [...trades].filter((t) => t.date <= asOf).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.side === "BUY" ? -1 : 1));
  type Lot = { t: Trade; qty: number; proceeds: number; kind: "Initial" | "Addition" };
  const lots = new Map<string, Lot[]>();
  const seen = new Set<string>();
  const acts = [...actions].sort((a, b) => (a.exDate < b.exDate ? -1 : 1));
  let ai = 0;
  for (const t of sorted) {
    while (ai < acts.length && acts[ai].exDate <= t.date) {
      const a = acts[ai++];
      const f = a.kind === "SPLIT" ? a.ratioTo / a.ratioFrom : a.kind === "BONUS" ? 1 + a.ratioTo / a.ratioFrom : 1;
      for (const l of lots.get(a.symbol) ?? []) l.qty *= f;
    }
    if (t.side === "BUY") {
      const arr = lots.get(t.symbol) ?? [];
      arr.push({ t, qty: t.quantity, proceeds: 0, kind: seen.has(t.symbol) ? "Addition" : "Initial" });
      seen.add(t.symbol);
      lots.set(t.symbol, arr);
    } else {
      let rem = t.quantity;
      const net = t.quantity * t.price - t.charges;
      for (const l of lots.get(t.symbol) ?? []) {
        if (rem <= 1e-9) break;
        const take = Math.min(l.qty, rem);
        l.qty -= take; rem -= take;
        l.proceeds += net * (take / t.quantity);
      }
    }
  }
  while (ai < acts.length && acts[ai].exDate <= asOf) {
    const a = acts[ai++];
    const f = a.kind === "SPLIT" ? a.ratioTo / a.ratioFrom : a.kind === "BONUS" ? 1 + a.ratioTo / a.ratioFrom : 1;
    for (const l of lots.get(a.symbol) ?? []) l.qty *= f;
  }
  const out: LotResult[] = [];
  const b1 = book.get(benchmark, asOf, 10);
  for (const [sym, arr] of lots) {
    const px = book.get(sym, asOf, 10);
    const sec = secMap.get(sym);
    if ((sec?.assetType ?? "STOCK") !== "STOCK") continue;
    for (const l of arr) {
      const amount = l.t.quantity * l.t.price + l.t.charges;
      const val = l.qty > 1e-9 ? (px !== undefined ? l.qty * px + l.proceeds : null) : l.proceeds;
      const days = daysBetween(l.t.date, asOf);
      const ret = val !== null && amount > 0 ? val / amount - 1 : null;
      const j = journal.filter((x) => x.symbol === sym && x.date <= l.t.date).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
      const conv = j?.conviction ?? resMap.get(sym)?.conviction;
      const b0 = book.get(benchmark, l.t.date, 10);
      const br = b0 && b1 ? b1 / b0 - 1 : null;
      out.push({
        tradeId: l.t.id, symbol: sym, date: l.t.date, kind: l.kind, amount, qty: l.t.quantity, currentValue: val,
        multiple: ret !== null ? 1 + ret : null, ret, annualised: ret !== null && days >= 365 ? Math.pow(1 + ret, 365 / days) - 1 : null, days,
        conviction: conv ?? "not set", convictionSource: j?.conviction ? "journal" : conv ? "current research" : "not set",
        scoreAtEntry: j?.researchScoreAtEntry ?? null, peAtEntry: j?.peAtEntry ?? null,
        cap: classifyAt(sec, l.t.date, s.thresholds).category,
        benchmarkRet: br, excess: ret !== null && br !== null ? ret - br : null, closed: l.qty <= 1e-9,
      });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

export interface GroupStats { key: string; n: number; invested: number; gain: number; median: number | null; mean: number | null; winRate: number | null; meanExcess: number | null; tStat: number | null; sampleNote: string }

const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export function sampleNote(n: number) {
  return n < 10 ? "Insufficient sample — do not infer skill" : n < 30 ? "Small sample — treat as anecdotal" : "Moderate sample";
}

export function groupStats(lots: LotResult[], key: (l: LotResult) => string): GroupStats[] {
  const m = new Map<string, LotResult[]>();
  for (const l of lots) { if (l.ret === null) continue; const k = key(l); if (!m.has(k)) m.set(k, []); m.get(k)!.push(l); }
  return [...m].map(([k, ls]) => {
    const rs = ls.map((l) => l.ret!), ex = ls.map((l) => l.excess).filter((x): x is number => x !== null);
    const meanEx = ex.length ? ex.reduce((s, x) => s + x, 0) / ex.length : null;
    const sd = ex.length > 1 && meanEx !== null ? Math.sqrt(ex.reduce((s, x) => s + (x - meanEx) ** 2, 0) / (ex.length - 1)) : null;
    return {
      key: k, n: ls.length, invested: ls.reduce((s, l) => s + l.amount, 0), gain: ls.reduce((s, l) => s + ((l.currentValue ?? l.amount) - l.amount), 0),
      median: median(rs), mean: rs.reduce((s, x) => s + x, 0) / rs.length, winRate: rs.filter((r) => r > 0).length / rs.length,
      meanExcess: meanEx, tStat: sd && sd > 0 && meanEx !== null ? meanEx / (sd / Math.sqrt(ex.length)) : null, sampleNote: sampleNote(ls.length),
    };
  }).sort((a, b) => b.invested - a.invested);
}

export function gainConcentration(lots: LotResult[]) {
  const gains = lots.filter((l) => l.currentValue !== null).map((l) => l.currentValue! - l.amount);
  const pos = gains.filter((g) => g > 0).sort((a, b) => b - a);
  const total = gains.reduce((s, g) => s + g, 0);
  const totalPos = pos.reduce((s, g) => s + g, 0);
  const top = (n: number) => (totalPos > 0 ? pos.slice(0, n).reduce((s, g) => s + g, 0) / totalPos : null);
  const top10pctN = Math.max(1, Math.ceil(gains.length * 0.1));
  return { lots: gains.length, totalGain: total, top1: top(1), top3: top(3), top10pct: top(top10pctN), top10pctN, realisedLosses: lots.filter((l) => l.closed && l.currentValue !== null && l.currentValue < l.amount).reduce((s, l) => s + (l.currentValue! - l.amount), 0), unrealisedLosses: lots.filter((l) => !l.closed && l.currentValue !== null && l.currentValue < l.amount).reduce((s, l) => s + (l.currentValue! - l.amount), 0), losers: gains.filter((g) => g < 0).length };
}

export function additionTiming(lots: LotResult[]) {
  const bySym = new Map<string, LotResult[]>();
  for (const l of lots) { if (!bySym.has(l.symbol)) bySym.set(l.symbol, []); bySym.get(l.symbol)!.push(l); }
  const gaps: number[] = [];
  for (const ls of bySym.values()) { const init = ls.find((l) => l.kind === "Initial"); const add = ls.find((l) => l.kind === "Addition"); if (init && add) gaps.push(daysBetween(init.date, add.date)); }
  return { companiesWithAdditions: gaps.length, avgDaysToFirstAddition: gaps.length ? gaps.reduce((s, x) => s + x, 0) / gaps.length : null, medianDays: median(gaps) };
}

export function holdingBucket(days: number) {
  return days < 180 ? "< 6 months" : days < 365 ? "6–12 months" : days < 730 ? "1–2 years" : days < 1825 ? "2–5 years" : "5+ years";
}
