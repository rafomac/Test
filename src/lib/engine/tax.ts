/**
 * Indicative capital-gains classification and transaction-cost analytics.
 * NOT tax advice and NOT authoritative: broker tax P&L statements and a qualified adviser prevail.
 * Treatment depends on residency (NRI vs resident), security type, holding period and the rules in
 * force for the financial year; rates are user-supplied and left blank by default.
 */
import type { Trade, CorporateAction, TaxConfig, AssetType } from "../types";
import { runLedger } from "./positions";

export type GainClass = "STCG (equity)" | "LTCG (equity)" | "Slab-rate (specified fund / debt)" | "Unclassified (verify)";

export function fyOf(date: string): string {
  const y = Number(date.slice(0, 4)), m = Number(date.slice(5, 7));
  return m >= 4 ? `FY${y}-${String((y + 1) % 100).padStart(2, "0")}` : `FY${y - 1}-${String(y % 100).padStart(2, "0")}`;
}

export interface RealisedRow { date: string; fy: string; symbol: string; qty: number; proceeds: number; cost: number; pnl: number; holdingDays: number; cls: GainClass }

export function classifyGains(trades: Trade[], actions: CorporateAction[], assetTypeOf: (s: string) => AssetType, cfg: TaxConfig): RealisedRow[] {
  const { realized } = runLedger(trades, actions);
  const slab = new Set(cfg.slabTaxedSymbols.map((x) => x.toUpperCase()));
  const ltDays = Math.round((cfg.equityLtcgMonths / 12) * 365);
  return realized.map((r) => {
    const at = assetTypeOf(r.symbol);
    let cls: GainClass;
    if (slab.has(r.symbol.toUpperCase()) || at === "CASH_EQUIVALENT") cls = "Slab-rate (specified fund / debt)";
    else if (at === "STOCK" || at === "ETF") cls = r.holdingDays > ltDays ? "LTCG (equity)" : "STCG (equity)";
    else cls = "Unclassified (verify)"; // MFs: equity vs debt orientation must be confirmed per scheme
    return { date: r.date, fy: fyOf(r.date), symbol: r.symbol, qty: r.qty, proceeds: r.proceeds, cost: r.cost, pnl: r.pnl, holdingDays: r.holdingDays, cls };
  });
}

export function summariseByFy(rows: RealisedRow[], cfg: TaxConfig) {
  const m = new Map<string, Record<GainClass, number>>();
  for (const r of rows) {
    const e = m.get(r.fy) ?? { "STCG (equity)": 0, "LTCG (equity)": 0, "Slab-rate (specified fund / debt)": 0, "Unclassified (verify)": 0 };
    e[r.cls] += r.pnl;
    m.set(r.fy, e);
  }
  return [...m].sort().map(([fy, g]) => {
    const st = Math.max(0, g["STCG (equity)"]), lt = Math.max(0, g["LTCG (equity)"] - (cfg.ltcgExemption ?? 0));
    const indicative = cfg.stcgRatePct !== null && cfg.ltcgRatePct !== null ? (st * cfg.stcgRatePct) / 100 + (lt * cfg.ltcgRatePct) / 100 : null;
    return { fy, ...g, indicativeEquityTax: indicative };
  });
}

export function chargesSummary(trades: Trade[]) {
  const known = trades.filter((t) => t.chargesKnown);
  const total = known.reduce((s, t) => s + t.charges, 0);
  const turnover = known.reduce((s, t) => s + t.quantity * t.price, 0);
  const breakdown: Record<string, number> = {};
  for (const t of trades) for (const [k, v] of Object.entries(t.chargesBreakdown ?? {})) breakdown[k] = (breakdown[k] ?? 0) + v;
  return { total, turnover, bps: turnover > 0 ? (total / turnover) * 10000 : null, tradesWithCharges: known.length, tradesWithoutCharges: trades.length - known.length, breakdown };
}
