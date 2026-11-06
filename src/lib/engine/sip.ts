/**
 * Monthly ₹2 lakh SIP tracker.
 *
 * Contributions = EXTERNAL cash flows only (ledger "funds added" minus payouts).
 * Buying, selling, switching ETFs/Liquid BeES into stocks are INTERNAL deployment and never
 * count as contributions.
 *
 * If no ledger (deposit) data has been imported, a clearly-labelled ESTIMATE is offered:
 * net new capital into securities = buys − sales (incl. internal switches netted) within the month.
 */
import type { AssetType, CashEntry, Settings, Trade } from "../types";
import { monthKey, monthsRange } from "./dates";

export interface SipMonth {
  month: string;
  inPlan: boolean;
  target: number;
  deposits: number;
  withdrawals: number;
  contribution: number; // net external
  difference: number; // contribution − target (0 when not in plan)
  buys: Record<AssetType, number>;
  sells: Record<AssetType, number>;
  liquidNet: number; // net parked in cash-equivalents (buys − sells)
  dividends: number;
  cashBalance: number | null; // running ledger-derived cash; null if no ledger data
  cumTarget: number;
  cumActual: number;
  cumGap: number;
  status: "Met" | "Surplus" | "Partial" | "Missed" | "Before plan" | "In progress";
}

export interface SipResult {
  months: SipMonth[];
  basis: "ledger" | "estimate" | "none";
  basisNote: string;
  annual: { year: string; target: number; actual: number; gap: number }[];
  consistency: { monthsInPlan: number; monthsMet: number; hitRate: number | null; streak: number };
}

const zero = (): Record<AssetType, number> => ({ STOCK: 0, ETF: 0, MF: 0, CASH_EQUIVALENT: 0 });

export function targetFor(month: string, s: Pick<Settings, "monthlyTarget" | "planStartMonth" | "monthlyTargetOverrides">): number {
  if (month < s.planStartMonth) return s.monthlyTargetOverrides[month] ?? 0;
  return s.monthlyTargetOverrides[month] ?? s.monthlyTarget;
}

export function computeSip(
  trades: Trade[],
  cash: CashEntry[],
  assetTypeOf: (symbol: string) => AssetType,
  settings: Pick<Settings, "monthlyTarget" | "planStartMonth" | "monthlyTargetOverrides">,
  currentMonth: string,
): SipResult {
  const hasLedger = cash.some((c) => c.kind === "DEPOSIT" || c.kind === "WITHDRAWAL");
  const allDates = [...trades.map((t) => t.date), ...cash.map((c) => c.date)].sort();
  if (!allDates.length) return { months: [], basis: "none", basisNote: "No transactions imported yet.", annual: [], consistency: { monthsInPlan: 0, monthsMet: 0, hitRate: null, streak: 0 } };
  const first = [monthKey(allDates[0]), settings.planStartMonth].sort()[0];
  const range = monthsRange(first, currentMonth);
  const rows = new Map<string, SipMonth>();
  for (const m of range) rows.set(m, { month: m, inPlan: m >= settings.planStartMonth, target: 0, deposits: 0, withdrawals: 0, contribution: 0, difference: 0, buys: zero(), sells: zero(), liquidNet: 0, dividends: 0, cashBalance: null, cumTarget: 0, cumActual: 0, cumGap: 0, status: "Before plan" });

  for (const t of trades) {
    const r = rows.get(monthKey(t.date));
    if (!r) continue;
    const at = assetTypeOf(t.symbol);
    const v = t.quantity * t.price + (t.side === "BUY" ? t.charges : -t.charges);
    if (t.side === "BUY") r.buys[at] += v; else r.sells[at] += v;
  }
  // Zerodha pays dividends to the bank account; only ledger-credited income changes broker cash (V2 fix).
  const ledgerIncome = new Map<string, number>();
  for (const c of cash) {
    const r = rows.get(monthKey(c.date));
    if (!r) continue;
    if (c.kind === "DEPOSIT") r.deposits += c.amount;
    else if (c.kind === "WITHDRAWAL") r.withdrawals += c.amount;
    else if (c.kind === "DIVIDEND") { r.dividends += c.amount; if (c.source === "CONSOLE_LEDGER") ledgerIncome.set(r.month, (ledgerIncome.get(r.month) ?? 0) + c.amount); }
    else if (c.kind === "INTEREST" && c.source === "CONSOLE_LEDGER") ledgerIncome.set(r.month, (ledgerIncome.get(r.month) ?? 0) + c.amount);
  }
  let cumT = 0, cumA = 0, cashBal = 0;
  const out: SipMonth[] = [];
  for (const m of range) {
    const r = rows.get(m)!;
    const totalBuys = Object.values(r.buys).reduce((s, x) => s + x, 0);
    const totalSells = Object.values(r.sells).reduce((s, x) => s + x, 0);
    r.liquidNet = r.buys.CASH_EQUIVALENT - r.sells.CASH_EQUIVALENT;
    r.contribution = hasLedger ? r.deposits - r.withdrawals : totalBuys - totalSells;
    if (hasLedger) {
      const charges = cash.filter((c) => c.kind === "CHARGE" && monthKey(c.date) === m).reduce((s, c) => s + c.amount, 0);
      cashBal += r.deposits - r.withdrawals - totalBuys + totalSells + (ledgerIncome.get(m) ?? 0) - charges;
      r.cashBalance = cashBal;
    }
    r.target = targetFor(m, settings);
    if (r.inPlan) {
      cumT += r.target;
      cumA += r.contribution;
      r.difference = r.contribution - r.target;
      r.status = m === currentMonth && r.contribution < r.target ? "In progress" : r.contribution > r.target * 1.0001 ? "Surplus" : r.contribution >= r.target - 0.5 ? "Met" : r.contribution > 0 ? "Partial" : "Missed";
    }
    r.cumTarget = cumT;
    r.cumActual = cumA;
    r.cumGap = cumA - cumT;
    out.push(r);
  }
  const years = new Map<string, { target: number; actual: number }>();
  for (const r of out) if (r.inPlan) {
    const y = r.month.slice(0, 4);
    const e = years.get(y) ?? { target: 0, actual: 0 };
    e.target += r.target; e.actual += r.contribution;
    years.set(y, e);
  }
  const judged = out.filter((r) => r.inPlan && r.status !== "In progress");
  const met = judged.filter((r) => r.status === "Met" || r.status === "Surplus").length;
  let streak = 0;
  for (let i = judged.length - 1; i >= 0; i--) { if (judged[i].status === "Met" || judged[i].status === "Surplus") streak++; else break; }
  return {
    months: out,
    basis: hasLedger ? "ledger" : "estimate",
    basisNote: hasLedger
      ? "Contributions from imported ledger deposits/payouts. Internal switches (e.g. Liquid BeES → stock) are excluded."
      : "ESTIMATE: no ledger imported. Contribution ≈ purchases − sale proceeds in the month. Import the Console ledger for verified contributions.",
    annual: [...years].map(([year, v]) => ({ year, target: v.target, actual: v.actual, gap: v.actual - v.target })),
    consistency: { monthsInPlan: judged.length, monthsMet: met, hitRate: judged.length ? met / judged.length : null, streak },
  };
}
