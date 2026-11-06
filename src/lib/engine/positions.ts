/**
 * Position ledger: replays trades and corporate actions chronologically using FIFO lots
 * (matching Zerodha's FIFO P&L convention). Charges are capitalised into buy cost and
 * deducted from sale proceeds when known.
 *
 * Corporate actions on an ex-date are applied BEFORE trades on that date, because trades
 * on/after the ex-date already settle at post-action prices.
 *
 * Bonus/split: total cost of a lot is preserved and spread across the new quantity
 * (portfolio-cost convention; income-tax cost of bonus shares differs and is out of scope).
 */
import type { CorporateAction, Trade } from "../types";

export interface Lot { qty: number; cost: number; date: string }

export interface RealizedEvent {
  date: string;
  symbol: string;
  qty: number;
  proceeds: number;
  cost: number;
  pnl: number;
  holdingDays: number;
}

export interface Position {
  symbol: string;
  quantity: number;
  costBasis: number; // cost of remaining lots (net invested cost)
  avgCost: number;
  realizedPnl: number;
  grossBought: number; // total buy value incl. charges (after corporate-action transfers)
  grossSold: number; // total sale proceeds net of charges
  firstBuyDate?: string;
  lastTradeDate?: string;
  /** Weighted-average acquisition date of remaining lots. */
  avgHoldingStart?: string;
  buyCount: number;
  sellCount: number;
  chargesUnknownTrades: number;
  lots: Lot[];
}

export interface LedgerWarning { symbol: string; date: string; message: string }

export interface QtyChange { date: string; symbol: string; qty: number }

export interface LedgerResult {
  positions: Map<string, Position>;
  realized: RealizedEvent[];
  warnings: LedgerWarning[];
  /** Quantity of each symbol after each event date (for historical valuation). */
  qtyTimeline: QtyChange[];
}

const EPS = 1e-9;

function emptyPosition(symbol: string): Position {
  return { symbol, quantity: 0, costBasis: 0, avgCost: 0, realizedPnl: 0, grossBought: 0, grossSold: 0, buyCount: 0, sellCount: 0, chargesUnknownTrades: 0, lots: [] };
}

function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

export function runLedger(trades: Trade[], actions: CorporateAction[] = [], asOf?: string): LedgerResult {
  type Ev = { date: string; order: number; t?: Trade; a?: CorporateAction };
  const events: Ev[] = [];
  for (const a of actions) if (!asOf || a.exDate <= asOf) events.push({ date: a.exDate, order: 0, a });
  for (const t of trades) if (!asOf || t.date <= asOf) events.push({ date: t.date, order: t.side === "BUY" ? 1 : 2, t });
  // Same day: actions, then buys, then sells (intraday round-trips net correctly).
  events.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : x.order - y.order));

  const positions = new Map<string, Position>();
  const realized: RealizedEvent[] = [];
  const warnings: LedgerWarning[] = [];
  const qtyTimeline: QtyChange[] = [];
  const get = (s: string) => {
    let p = positions.get(s);
    if (!p) { p = emptyPosition(s); positions.set(s, p); }
    return p;
  };
  const recompute = (p: Position) => {
    p.quantity = p.lots.reduce((s, l) => s + l.qty, 0);
    p.costBasis = p.lots.reduce((s, l) => s + l.cost, 0);
    if (p.quantity < EPS) { p.quantity = 0; p.costBasis = 0; p.lots = []; }
    p.avgCost = p.quantity > 0 ? p.costBasis / p.quantity : 0;
  };
  const mark = (s: string, d: string) => qtyTimeline.push({ date: d, symbol: s, qty: positions.get(s)?.quantity ?? 0 });

  for (const ev of events) {
    if (ev.a) {
      const a = ev.a;
      const p = positions.get(a.symbol);
      if (!p || p.quantity === 0) continue;
      const r = a.ratioFrom > 0 ? a.ratioTo / a.ratioFrom : NaN;
      if (!Number.isFinite(r) || r <= 0) {
        warnings.push({ symbol: a.symbol, date: a.exDate, message: `Invalid ratio on ${a.kind}` });
        continue;
      }
      if (a.kind === "SPLIT") {
        for (const l of p.lots) l.qty *= r;
      } else if (a.kind === "BONUS") {
        for (const l of p.lots) l.qty *= 1 + r;
      } else if (a.kind === "MERGER" || a.kind === "SYMBOL_CHANGE") {
        if (!a.newSymbol) { warnings.push({ symbol: a.symbol, date: a.exDate, message: `${a.kind} without new symbol` }); continue; }
        const np = get(a.newSymbol);
        for (const l of p.lots) np.lots.push({ qty: l.qty * r, cost: l.cost, date: l.date });
        np.grossBought += p.costBasis;
        np.firstBuyDate = [np.firstBuyDate, p.firstBuyDate].filter(Boolean).sort()[0];
        p.lots = [];
        recompute(np);
        mark(a.newSymbol, a.exDate);
      } else if (a.kind === "DEMERGER") {
        if (!a.newSymbol) { warnings.push({ symbol: a.symbol, date: a.exDate, message: "DEMERGER without new symbol" }); continue; }
        const pct = (a.costAllocationPct ?? 0) / 100;
        if (a.costAllocationPct === undefined) warnings.push({ symbol: a.symbol, date: a.exDate, message: "Demerger cost allocation % missing; 0% allocated to new entity" });
        const np = get(a.newSymbol);
        for (const l of p.lots) {
          const moved = l.cost * pct;
          np.lots.push({ qty: l.qty * r, cost: moved, date: l.date });
          l.cost -= moved;
        }
        np.firstBuyDate = [np.firstBuyDate, p.firstBuyDate].filter(Boolean).sort()[0];
        recompute(np);
        mark(a.newSymbol, a.exDate);
      }
      recompute(p);
      mark(a.symbol, a.exDate);
      continue;
    }
    const t = ev.t!;
    const p = get(t.symbol);
    if (!t.chargesKnown) p.chargesUnknownTrades++;
    p.lastTradeDate = t.date;
    if (t.side === "BUY") {
      const cost = t.quantity * t.price + (t.charges || 0);
      p.lots.push({ qty: t.quantity, cost, date: t.date });
      p.grossBought += cost;
      p.buyCount++;
      if (!p.firstBuyDate || t.date < p.firstBuyDate) p.firstBuyDate = t.date;
    } else {
      p.sellCount++;
      const proceedsTotal = t.quantity * t.price - (t.charges || 0);
      p.grossSold += proceedsTotal;
      let remaining = t.quantity;
      while (remaining > EPS && p.lots.length) {
        const lot = p.lots[0];
        const take = Math.min(lot.qty, remaining);
        const costPart = lot.cost * (take / lot.qty);
        const proceeds = proceedsTotal * (take / t.quantity);
        realized.push({ date: t.date, symbol: t.symbol, qty: take, proceeds, cost: costPart, pnl: proceeds - costPart, holdingDays: daysBetween(lot.date, t.date) });
        p.realizedPnl += proceeds - costPart;
        lot.qty -= take;
        lot.cost -= costPart;
        remaining -= take;
        if (lot.qty < EPS) p.lots.shift();
      }
      if (remaining > EPS) {
        warnings.push({
          symbol: t.symbol,
          date: t.date,
          message: `Sold ${remaining.toFixed(4)} more shares than the imported buy history holds. Earlier buys (or a corporate action) are missing; realised P&L for this portion is unknown and excluded.`,
        });
      }
    }
    recompute(p);
    mark(t.symbol, t.date);
  }

  for (const p of positions.values()) {
    if (p.quantity > 0) {
      const w = p.lots.reduce((s, l) => s + l.qty * Date.parse(l.date), 0) / p.quantity;
      p.avgHoldingStart = new Date(w).toISOString().slice(0, 10);
    }
  }
  return { positions, realized, warnings, qtyTimeline };
}

/** Quantity held of each symbol at end of `date`, from a ledger timeline (actions included). */
export function quantitiesAsOf(trades: Trade[], actions: CorporateAction[], date: string): Map<string, number> {
  const { positions } = runLedger(trades, actions, date);
  const out = new Map<string, number>();
  for (const p of positions.values()) if (p.quantity > 0) out.set(p.symbol, p.quantity);
  return out;
}
