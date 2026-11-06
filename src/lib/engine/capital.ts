/**
 * V2 capital accounting.
 *
 * Three distinct capital measures (never mixed):
 *   A. Total portfolio market value = securities (stocks, ETFs, MFs, Liquid BeES) + broker cash.
 *   B. Invested capital            = cost basis of held lots (incl. known acquisition charges), by asset type.
 *   C. Net external contributions  = ledger deposits − payouts.
 *
 * Account (securities + broker cash) cash flows are EXTERNAL only. Purchases, sales and switches
 * between Liquid BeES and stocks are internal and never counted as contributions.
 */
import type { BrokerFunds, CashEntry, HoldingsSnapshot, Trade } from "../types";
import type { SeriesPoint } from "./series";
import { addDays } from "./dates";

export interface CashResolution {
  /** Zerodha available cash (ledger cash, excludes collateral). */
  availableCash: number | null;
  /** Broker-authoritative margin available for trading (may include collateral from pledged holdings). */
  buyingPower: number | null;
  collateral: number | null;
  source: string;
  legacy: boolean;
  warnings: string[];
}

export function resolveCash(snap: HoldingsSnapshot | undefined, ledgerCash: number | null): CashResolution {
  const warnings: string[] = [];
  if (snap?.funds) {
    const f: BrokerFunds = snap.funds;
    if ((f.collateral ?? 0) > 0) warnings.push(`₹${Math.round(f.collateral!).toLocaleString("en-IN")} of buying power is collateral margin from pledged holdings — it is not cash and is not added to the reserve.`);
    return { availableCash: f.cash, buyingPower: f.net ?? f.liveBalance ?? f.cash, collateral: f.collateral ?? null, source: `Kite funds (${snap.asOfDate})`, legacy: false, warnings };
  }
  if (snap?.cash !== undefined) {
    warnings.push("Snapshot predates the V2 cash fix: its cash figure is Kite 'net' margin, which may include collateral from pledged Liquid BeES. Re-sync Kite to separate cash from collateral.");
    return { availableCash: snap.cash, buyingPower: snap.cash, collateral: null, source: `Kite margins (legacy, ${snap.asOfDate})`, legacy: true, warnings };
  }
  if (ledgerCash !== null) {
    if (ledgerCash < -1) warnings.push("Ledger-derived cash is negative — deposits or opening balance are missing from the imported ledger.");
    return { availableCash: ledgerCash, buyingPower: null, collateral: null, source: "Derived from imported ledger (deposits − net purchases + ledger credits − charges)", legacy: false, warnings };
  }
  return { availableCash: null, buyingPower: null, collateral: null, source: "Unknown — connect Kite or import the ledger", legacy: false, warnings };
}

/** Dividends credited to the trading ledger (vs paid directly to the bank, which is Zerodha's norm). */
export const isLedgerCredit = (c: CashEntry) => c.source === "CONSOLE_LEDGER";

export interface CashPoint { date: string; cash: number; deposits: number; withdrawals: number; bankIncome: number; ledgerIncome: number; charges: number }

/**
 * Daily broker-cash balance replayed from the ledger and trades.
 * cash_t = cash_{t−1} + deposits − payouts − buys + sells + ledger dividends/interest − charges
 * Returns null when no deposits/withdrawals have been imported (cannot be reconstructed).
 */
export function cashLedger(trades: Trade[], cash: CashEntry[], dates: string[]): CashPoint[] | null {
  if (!cash.some((c) => c.kind === "DEPOSIT" || c.kind === "WITHDRAWAL")) return null;
  const by = new Map<string, Omit<CashPoint, "date" | "cash">>();
  const get = (d: string) => { let e = by.get(d); if (!e) { e = { deposits: 0, withdrawals: 0, bankIncome: 0, ledgerIncome: 0, charges: 0 }; by.set(d, e); } return e; };
  const tradeFlow = new Map<string, number>();
  for (const t of trades) tradeFlow.set(t.date, (tradeFlow.get(t.date) ?? 0) + (t.side === "BUY" ? -(t.quantity * t.price + t.charges) : t.quantity * t.price - t.charges));
  for (const c of cash) {
    const e = get(c.date);
    if (c.kind === "DEPOSIT") e.deposits += c.amount;
    else if (c.kind === "WITHDRAWAL") e.withdrawals += c.amount;
    else if (c.kind === "DIVIDEND" || c.kind === "INTEREST") { if (isLedgerCredit(c)) e.ledgerIncome += c.amount; else e.bankIncome += c.amount; }
    else if (c.kind === "CHARGE") e.charges += c.amount;
  }
  // Roll every calendar day into the next business date in `dates`.
  const first = [...by.keys(), ...tradeFlow.keys()].sort()[0] ?? dates[0];
  let bal = 0;
  const out: CashPoint[] = [];
  let acc = { deposits: 0, withdrawals: 0, bankIncome: 0, ledgerIncome: 0, charges: 0, trade: 0 };
  let di = 0;
  const end = dates[dates.length - 1];
  for (let d = first < dates[0] ? first : dates[0]; d <= end; d = addDays(d, 1)) {
    const e = by.get(d);
    if (e) { acc.deposits += e.deposits; acc.withdrawals += e.withdrawals; acc.bankIncome += e.bankIncome; acc.ledgerIncome += e.ledgerIncome; acc.charges += e.charges; }
    acc.trade += tradeFlow.get(d) ?? 0;
    if (dates[di] === d) {
      bal += acc.deposits - acc.withdrawals + acc.trade + acc.ledgerIncome - acc.charges;
      out.push({ date: d, cash: bal, deposits: acc.deposits, withdrawals: acc.withdrawals, bankIncome: acc.bankIncome, ledgerIncome: acc.ledgerIncome, charges: acc.charges });
      acc = { deposits: 0, withdrawals: 0, bankIncome: 0, ledgerIncome: 0, charges: 0, trade: 0 };
      di++;
    }
  }
  return out;
}

export interface AccountPoint { date: string; securities: number | null; cash: number; value: number | null; extFlow: number; bankIncome: number; dailyReturn: number | null; twrIndex: number | null; cumContrib: number }

/**
 * Account-level TWR with valuation at every external cash flow (daily sub-periods):
 *   r_t = (V_t + B_t) / (V_{t−1} + E_t) − 1,  V = securities + broker cash,
 *   E_t = deposits − payouts (start of day), B_t = income paid outside the account (bank dividends).
 */
export function accountSeries(sec: SeriesPoint[], cash: CashPoint[]): AccountPoint[] {
  const cm = new Map(cash.map((c) => [c.date, c]));
  let prev: number | null = null, idx: number | null = null, cum = 0, lastCash = 0;
  return sec.map((p) => {
    const c = cm.get(p.date);
    const cashBal = c?.cash ?? lastCash;
    lastCash = cashBal;
    const E = (c?.deposits ?? 0) - (c?.withdrawals ?? 0), B = c?.bankIncome ?? 0;
    cum += E;
    const v = p.covered ? p.value + cashBal : null;
    let r: number | null = null;
    if (v !== null && prev !== null) { const base = prev + E; r = base > 1e-6 ? (v + B) / base - 1 : 0; idx = (idx ?? 1) * (1 + r); }
    else if (v !== null && prev === null) { idx = 1; }
    else idx = null;
    prev = v;
    return { date: p.date, securities: p.covered ? p.value : null, cash: cashBal, value: v, extFlow: E, bankIncome: B, dailyReturn: r, twrIndex: idx, cumContrib: cum };
  });
}

export interface Bridge {
  from: string; to: string;
  opening: number | null;
  contributions: number;
  withdrawals: number;
  marketGain: number | null; // securities ΔV − net purchases (realised + unrealised price P/L)
  ledgerIncome: number; // dividends/interest credited to the trading account
  charges: number; // non-trade charges (DP, AMC…) debited from the ledger
  closingDerived: number | null;
  closingReported: number | null;
  residual: number | null; // reported − derived; should be ~0 when data is complete
  bankIncome: number; // memo: dividends paid to bank (outside account valuation)
  totalInvestmentGain: number | null; // marketGain + all income − charges
  available: boolean;
  note: string;
}

/** Value bridge over (from, to]. Requires the daily account series. */
export function valueBridge(acct: AccountPoint[] | null, sec: SeriesPoint[], cash: CashPoint[] | null, from: string, to: string, reportedClosing: number | null): Bridge {
  const empty: Bridge = { from, to, opening: null, contributions: 0, withdrawals: 0, marketGain: null, ledgerIncome: 0, charges: 0, closingDerived: null, closingReported: reportedClosing, residual: null, bankIncome: 0, totalInvestmentGain: null, available: false, note: "" };
  if (!acct || !cash || !sec.length) return { ...empty, note: "Needs the funds ledger (deposits/payouts) and price history." };
  const inR = (d: string) => d > from && d <= to;
  const startS = [...sec].reverse().find((p) => p.date <= from);
  const endS = [...sec].reverse().find((p) => p.date <= to);
  const startC = [...cash].reverse().find((p) => p.date <= from)?.cash ?? 0;
  const endA = [...acct].reverse().find((p) => p.date <= to);
  if (!endS || !endS.covered || (startS && !startS.covered)) return { ...empty, note: "Price history incomplete at the start or end of the period." };
  const sv0 = startS ? startS.value : 0;
  const netPurch = sec.filter((p) => inR(p.date)).reduce((s, p) => s + p.netFlow, 0);
  const marketGain = endS.value - sv0 - netPurch;
  const cs = cash.filter((c) => inR(c.date));
  const contributions = cs.reduce((s, c) => s + c.deposits, 0), withdrawals = cs.reduce((s, c) => s + c.withdrawals, 0);
  const ledgerIncome = cs.reduce((s, c) => s + c.ledgerIncome, 0), charges = cs.reduce((s, c) => s + c.charges, 0), bankIncome = cs.reduce((s, c) => s + c.bankIncome, 0);
  const opening = sv0 + startC;
  const closingDerived = opening + contributions - withdrawals + marketGain + ledgerIncome - charges;
  return {
    from, to, opening, contributions, withdrawals, marketGain, ledgerIncome, charges, closingDerived,
    closingReported: reportedClosing ?? endA?.value ?? null,
    residual: reportedClosing !== null ? reportedClosing - closingDerived : null,
    bankIncome, totalInvestmentGain: marketGain + ledgerIncome + bankIncome - charges, available: true,
    note: "Each flow is counted once: purchases/sales/switches move value between cash and securities and net to zero in the bridge.",
  };
}

// ---------------- Standardised return-metric definitions ----------------
export type MetricId = "accountXirr" | "securitiesXirr" | "periodXirr" | "accountTwr" | "securitiesTwr" | "calendarTwr" | "rolling12Twr" | "inceptionTwrAnn" | "absolutePnl";

export interface MetricDef {
  id: MetricId;
  label: string;
  value: number | null;
  start?: string;
  end: string;
  scope: string;
  flows: string;
  annualisation: string;
  fees: string;
  dividends: string;
  taxes: string;
  cash: string;
  liquid: string;
  note?: string;
}

export const FEES_NOTE = "Brokerage/STT/GST/stamp/exchange charges are included in trade cost or proceeds when the import carries them; non-trade ledger charges (DP, AMC) reduce account value.";
export const TAX_NOTE = "Pre-tax. Taxes withheld (e.g. TDS for NRIs) are not deducted unless they appear as ledger debits.";

export function annualisationNote(days: number) {
  return days >= 365 ? `Annualised (actual/365) over ${days} days` : `Not annualised: ${days} days < 1 year (shown as cumulative period return)`;
}
