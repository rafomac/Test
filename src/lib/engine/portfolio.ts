/**
 * Pure portfolio aggregator: PortfolioData + Settings + asOf → PortfolioAnalytics.
 * No I/O. Every metric carries the data-quality / availability information needed to
 * disclose limitations instead of guessing.
 */
import type {
  AssetType, CapCategory, CashEntry, CorporateAction, DataQuality, Fundamentals, HoldingsSnapshot, PricePoint,
  ResearchEntry, Security, Settings, Trade,
} from "../types";
import { classify, classifyAt, inferAssetType, INDEX_ETF_LOOKTHROUGH, type Classification } from "./classify";
import { addDays, daysBetween, monthKey } from "./dates";
import { runLedger, type Position } from "./positions";
import {
  blendedReturns, buildPriceBook, buildSeries, calendarYearReturns, chainReturn, indexReturns, maxDrawdown,
  monthlyReturns, rollingReturns, targetPath, type PeriodReturn, type SeriesPoint,
} from "./series";
import { annualise, xirr, type CashFlow } from "./xirr";
import { computeSip, type SipResult } from "./sip";
import { concentration, daysToLiquidate, relativeStats, returnStats, stressTest, type HoldingForRisk } from "./risk";
import { accountSeries, annualisationNote, cashLedger, FEES_NOTE, resolveCash, TAX_NOTE, valueBridge, type AccountPoint, type Bridge, type CashResolution, type MetricDef } from "./capital";
import { criteriaCheck, peBand, peg, researchScore, returnMultiple, revenueCagr, technicals, tierFor, unpledgedPromoter, type ScoreResult, type Technicals } from "./research";

export interface PortfolioData {
  trades: Trade[];
  cash: CashEntry[];
  actions: CorporateAction[];
  securities: Security[];
  fundamentals: Fundamentals[];
  research: ResearchEntry[];
  snapshots: HoldingsSnapshot[];
  prices: PricePoint[];
}

export interface HoldingRow {
  symbol: string;
  name?: string;
  exchange?: string;
  isin?: string;
  assetType: AssetType;
  sector: string;
  industry: string;
  marketCapCr?: number;
  cap: Classification;
  quantity: number;
  avgPrice: number;
  invested: number;
  lastPrice: number | null;
  priceDate?: string;
  value: number | null;
  unrealized: number | null;
  unrealizedPct: number | null;
  realized: number;
  dividends: number;
  weight: number | null; // of total market value
  costWeight: number | null; // of total invested cost
  quality: DataQuality;
  qualityNotes: string[];
  rev3y: number | null; rev5y: number | null; rev10y: number | null;
  pe?: number; peg: number | null; roce?: number; debtEquity?: number;
  promoter?: number; unpledgedPromoter: number | null;
  score: ScoreResult;
  conviction: ResearchEntry["conviction"];
  limitPct: number;
  /** invested ÷ position-limit denominator (see settings.positionLimitDenominator). */
  limitWeight: number | null;
  limitCapacity: number | null; // remaining ₹ before conviction limit (negative = above)
  aboveLimit: number; // ₹ above conviction limit
  hardCapacity: number | null;
  overLimit: boolean;
  tech: Technicals | null;
  lastReviewed?: string;
  firstBuyDate?: string;
  grossBought: number;
  grossSold: number;
}

export interface AllocationRow {
  key: string;
  target: number | null; // fraction
  valuePct: number;
  costPct: number;
  gapPP: number | null;
  value: number;
  cost: number;
  targetValue: number | null;
  shortfall: number | null; // targetValue − value (positive = underweight)
  count: number;
}

export interface DecompositionTerm { key: string; label: string; value: number | null; evidence: string }

export interface CapitalSection {
  measures: {
    totalMarketValue: number | null; // securities + broker cash
    securitiesValue: number;
    brokerCash: number | null;
    byType: Record<AssetType, { value: number; cost: number; count: number }>;
    investedTotal: number;
    netContributions: number | null;
    deposits: number;
    withdrawals: number;
  };
  reserve: { availableCash: number | null; liquidBees: number; combined: number; buyingPower: number | null; collateral: number | null; source: string; warnings: string[]; liquidNote: string };
  bridge: Bridge;
  bridgeByYear: Bridge[];
  account: { date: string; value: number | null; securities: number | null; cash: number; contributions: number; twrIndex: number | null }[];
  accountTwr: number | null;
  accountTwrAnnualised: number | null;
  equitySleeveTwr: number | null;
  metrics: MetricDef[];
  differences: { a: string; b: string; diff: number | null; explanation: string }[];
  decomposition: { window: { from: string; to: string; days: number; annualised: boolean } | null; terms: DecompositionTerm[]; total: number | null; note: string };
  attributionByCap: { key: string; gain: number; share: number; weight: number }[];
  attributionBySector: { key: string; gain: number; share: number; weight: number }[];
  concentrationOfGains: { top1: number; top3: number; top5: number; positions: number; winnersForHalf: number };
  deployment: { month: string; target: number; contribution: number; parkedInReserve: number; stockBuys: number; stockSells: number; byCap: Record<string, number>; contributionAch: number | null; deploymentAch: number | null; allocationAch: number | null }[];
  limitDenominator: { kind: Settings["positionLimitDenominator"]; label: string; value: number };
}

export interface Availability { available: boolean; reason?: string }

export interface PortfolioAnalytics {
  asOf: string;
  generatedAt: string;
  valuationSource: { kind: "snapshot" | "reconstructed" | "none"; at?: string; source?: string; quality: DataQuality };
  holdings: HoldingRow[];
  summary: {
    marketValue: number;
    invested: number;
    unrealized: number;
    realized: number;
    dividends: number;
    totalGain: number;
    totalReturnPct: number | null;
    netSecurityFlows: number;
    netContributions: number | null; // ledger-based
    cash: number | null;
    cashSource?: string;
    liquidReserve: number;
    totalPortfolio: number;
    counts: { stocks: number; etfs: number; mfs: number; liquid: number };
    xirrSecurities: number | null;
    xirrAccount: number | null;
    xirrNote: string;
    twrSinceInception: number | null;
    twrAnnualised: number | null;
    twrNote: string;
    ytd: number | null;
    ytdNote: string;
    inceptionDate?: string;
    yearsSinceInception: number;
    targetRate: number;
    gapVsTarget: number | null;
    gapNote: string;
    status: "Ahead" | "Near" | "Behind" | "Insufficient data";
    statusDetail: string;
    targetReferenceValue: number | null;
  };
  series: SeriesPoint[];
  seriesGaps: { from: string; to: string; symbols: string[] }[];
  targetSeries: { date: string; target: number; actual: number | null; accountTarget: number | null; accountActual: number | null; contributions: number | null }[];
  monthly: PeriodReturn[];
  calendar: PeriodReturn[];
  rolling12: { key: string; ret: number | null }[];
  rolling36: { key: string; ret: number | null }[];
  benchmarks: { code: string; name: string; available: boolean; monthly: { key: string; ret: number | null }[]; stats: ReturnType<typeof relativeStats> | null; cumulative: { date: string; value: number | null }[] }[];
  stats: ReturnType<typeof returnStats>;
  maxDrawdown: number | null;
  sip: SipResult;
  capital: CapitalSection;
  allocation: {
    directEquity: AllocationRow[];
    assetTypes: AllocationRow[];
    lookThrough: AllocationRow[];
    lookThroughCoverage: number;
    etfs: HoldingRow[];
    mfs: HoldingRow[];
  };
  sectors: { sector: string; count: number; invested: number; value: number; weight: number; costWeight: number; gain: number; returnPct: number | null; contribution: number; largest: string; overLimit: boolean; industries: Record<string, number>; byCap: Partial<Record<CapCategory, number>> }[];
  sectorHistory: { month: string; [sector: string]: number | string }[];
  contributions: { symbol: string; sector: string; gain: number; share: number }[];
  risk: {
    concentration: ReturnType<typeof concentration>;
    stress: ReturnType<typeof stressTest>;
    flags: { symbol: string; kind: string; severity: "high" | "medium" | "low"; detail: string }[];
    microNanoPct: number;
    liquidity: { symbol: string; value: number; adtv: number | null; days: number | null }[];
  };
  multibaggers: { symbol: string; tier: number | null; multiple: number | null; grossBought: number; firstBuy?: string; holdingYears: number | null; value: number; grossSold: number; dividends: number; wealth: number; wealthShare: number; open: boolean; revenueGrowth: number | null }[];
  dataQuality: {
    counts: Record<DataQuality, number>;
    issues: { severity: "high" | "medium" | "low"; area: string; message: string }[];
    reconciliation: { symbol: string; snapshotQty: number | null; ledgerQty: number | null; diff: number; snapshotAvg: number | null; ledgerAvg: number | null; status: "ok" | "mismatch" | "no-trades" | "not-in-snapshot" }[];
    ledgerWarnings: { symbol: string; date: string; message: string }[];
    freshness: { item: string; at: string | null }[];
  };
}

export const DENOM_LABEL: Record<Settings["positionLimitDenominator"], string> = { directEquityCost: "direct-equity invested cost", totalInvestedCost: "total invested cost (all assets)", netContributions: "net external contributions" };

const CAPS: CapCategory[] = ["Large", "Mid", "Small", "Micro", "Nano", "Unclassified"];

export function analyse(d: PortfolioData, s: Settings, asOf: string): PortfolioAnalytics {
  const secMap = new Map(d.securities.map((x) => [x.symbol, x]));
  const fundMap = new Map(d.fundamentals.map((x) => [x.symbol, x]));
  const resMap = new Map(d.research.map((x) => [x.symbol, x]));
  const latestSnap = [...d.snapshots].filter((x) => x.asOfDate <= asOf).sort((a, b) => (a.takenAt < b.takenAt ? 1 : -1))[0];
  const snapItem = new Map((latestSnap?.items ?? []).map((i) => [i.symbol, i]));

  const assetTypeOf = (sym: string): AssetType => secMap.get(sym)?.assetType ?? snapItem.get(sym)?.assetType ?? inferAssetType(sym, secMap.get(sym)?.name, s.liquidSymbols);
  const trades = d.trades.filter((t) => t.date <= asOf);
  const cash = d.cash.filter((c) => c.date <= asOf);
  const ledger = runLedger(trades, d.actions, asOf);
  const book = buildPriceBook(d.prices);

  // Dividends: prefer Console dividend report; use ledger-credited dividends only when no report exists for that symbol.
  const reportDivSyms = new Set(cash.filter((c) => c.kind === "DIVIDEND" && c.source !== "CONSOLE_LEDGER").map((c) => c.symbol));
  const dividends = cash.filter((c) => c.kind === "DIVIDEND" && (c.source !== "CONSOLE_LEDGER" || !reportDivSyms.has(c.symbol)));
  const divBySym = new Map<string, number>();
  for (const c of dividends) if (c.symbol) divBySym.set(c.symbol, (divBySym.get(c.symbol) ?? 0) + c.amount);
  const cashForSeries = [...cash.filter((c) => c.kind !== "DIVIDEND"), ...dividends];

  // ---------- Holdings ----------
  const symbols = new Set<string>([...snapItem.keys(), ...[...ledger.positions.values()].filter((p) => p.quantity > 0).map((p) => p.symbol)]);
  const raw: Omit<HoldingRow, "weight" | "costWeight" | "limitWeight" | "limitCapacity" | "aboveLimit" | "hardCapacity">[] = [];
  const reconciliation: PortfolioAnalytics["dataQuality"]["reconciliation"] = [];
  for (const sym of symbols) {
    const sec = secMap.get(sym);
    const si = snapItem.get(sym);
    const pos: Position | undefined = ledger.positions.get(sym);
    const ledgerQty = pos?.quantity ?? 0;
    const notes: string[] = [];
    let quality: DataQuality;
    let qty: number, avg: number, invested: number;
    if (si) {
      qty = si.quantity;
      const reconciled = pos && Math.abs(ledgerQty - si.quantity) < 1e-6;
      if (reconciled) { invested = pos!.costBasis; avg = pos!.avgCost; quality = latestSnap!.quality; }
      else { invested = si.averagePrice * si.quantity; avg = si.averagePrice; quality = latestSnap!.quality; if (pos) notes.push(`Ledger qty ${ledgerQty} ≠ holdings qty ${si.quantity}; using broker average price for cost.`); else notes.push("No trades imported for this holding; cost from broker average price."); }
      reconciliation.push({ symbol: sym, snapshotQty: si.quantity, ledgerQty: pos ? ledgerQty : null, diff: si.quantity - ledgerQty, snapshotAvg: si.averagePrice, ledgerAvg: pos?.avgCost ?? null, status: !pos ? "no-trades" : reconciled ? "ok" : "mismatch" });
    } else {
      qty = ledgerQty; avg = pos!.avgCost; invested = pos!.costBasis; quality = "RECONSTRUCTED";
      notes.push("Quantity reconstructed from tradebook (not in latest holdings snapshot).");
      if (latestSnap) reconciliation.push({ symbol: sym, snapshotQty: null, ledgerQty, diff: -ledgerQty, snapshotAvg: null, ledgerAvg: pos!.avgCost, status: "not-in-snapshot" });
    }
    if (pos && pos.chargesUnknownTrades > 0) notes.push(`${pos.chargesUnknownTrades} trade(s) without charges data.`);
    // Price: prefer snapshot LTP when snapshot is the latest info, else latest price-book close.
    const pb = book.get(sym, asOf, 10);
    const pbDate = book.dates(sym).filter((x) => x <= asOf).pop();
    let lastPrice: number | null = null, priceDate: string | undefined;
    if (si && latestSnap && (!pbDate || latestSnap.asOfDate >= pbDate)) { lastPrice = si.lastPrice; priceDate = latestSnap.asOfDate; }
    else if (pb !== undefined) { lastPrice = pb; priceDate = pbDate; }
    if (lastPrice === null) { notes.push("No current price available."); quality = "MISSING"; }
    const value = lastPrice !== null ? qty * lastPrice : null;
    const f = fundMap.get(sym);
    const r = resMap.get(sym);
    const at = assetTypeOf(sym);
    const mc = sec?.marketCapCr;
    const cap = classify(sec ? { ...sec, assetType: at } : { assetType: at, marketCapCr: mc }, s.thresholds);
    const c3 = revenueCagr(f?.revenueAnnual, 3), c5 = revenueCagr(f?.revenueAnnual, 5), c10 = revenueCagr(f?.revenueAnnual, 10);
    const conviction = r?.conviction ?? "Standard";
    const lim = s.positionLimits;
    const limitPct = conviction === "Exceptional" ? lim.exceptionalPct : conviction === "High" ? lim.highPct : lim.standardPct;
    const closes = book.dates(sym).filter((x) => x <= asOf).map((dt) => ({ date: dt, close: book.get(sym, dt, 0)! }));
    const pv = d.prices.filter((p) => p.symbol === sym && p.volume !== undefined);
    const volMap = new Map(pv.map((p) => [p.date, p.volume!]));
    const bench = d.prices.filter((p) => p.symbol === "IDX:NIFTY_SMALLCAP_250_TRI");
    raw.push({
      symbol: sym, name: sec?.name, exchange: si?.exchange ?? sec?.exchange, isin: si?.isin ?? sec?.isin, assetType: at,
      sector: sec?.sector ?? si?.sector ?? (at === "STOCK" ? "Unclassified" : at === "CASH_EQUIVALENT" ? "Cash equivalent" : at === "ETF" ? "ETF" : "Mutual fund"),
      industry: sec?.industry ?? "—", marketCapCr: mc, cap, quantity: qty, avgPrice: avg, invested, lastPrice, priceDate, value,
      unrealized: value !== null ? value - invested : null, unrealizedPct: value !== null && invested > 0 ? value / invested - 1 : null,
      realized: pos?.realizedPnl ?? 0, dividends: divBySym.get(sym) ?? 0, quality, qualityNotes: notes,
      rev3y: c3, rev5y: c5, rev10y: c10, pe: f?.pe, peg: peg(f?.pe, f?.epsGrowth3yPct ?? (c3 !== null ? c3 * 100 : undefined)), roce: f?.rocePct, debtEquity: f?.debtToEquity,
      promoter: f?.promoterHoldingPct, unpledgedPromoter: f ? unpledgedPromoter(f).value : null,
      score: researchScore(r, f, s.scoreWeights), conviction, limitPct, overLimit: false,
      tech: technicals(closes.map((c) => ({ ...c, volume: volMap.get(c.date) })), bench.length ? bench : undefined),
      lastReviewed: r?.lastReviewed, firstBuyDate: pos?.firstBuyDate, grossBought: pos?.grossBought ?? invested, grossSold: pos?.grossSold ?? 0,
    });
  }
  const mv = raw.reduce((acc, h) => acc + (h.value ?? 0), 0);
  const inv = raw.reduce((acc, h) => acc + h.invested, 0);
  const directCost = raw.filter((h) => h.assetType === "STOCK").reduce((acc, h) => acc + h.invested, 0);
  const netContrib0 = cash.filter((c) => c.kind === "DEPOSIT").reduce((a, c) => a + c.amount, 0) - cash.filter((c) => c.kind === "WITHDRAWAL").reduce((a, c) => a + c.amount, 0);
  const limitDenominator = s.positionLimitDenominator === "totalInvestedCost" ? inv : s.positionLimitDenominator === "netContributions" && netContrib0 > 0 ? netContrib0 : directCost;
  const holdings: HoldingRow[] = raw.map((h) => {
    const costWeight = inv > 0 ? h.invested / inv : null;
    const isStock = h.assetType === "STOCK";
    const limitWeight = isStock && limitDenominator > 0 ? h.invested / limitDenominator : null;
    const cap = isStock ? (h.limitPct / 100) * limitDenominator : null;
    return {
      ...h, weight: mv > 0 && h.value !== null ? h.value / mv : null, costWeight, limitWeight,
      limitCapacity: cap !== null ? cap - h.invested : null, aboveLimit: cap !== null ? Math.max(0, h.invested - cap) : 0,
      hardCapacity: isStock ? (s.positionLimits.hardLimitPct / 100) * limitDenominator - h.invested : null,
      overLimit: isStock && limitWeight !== null && limitWeight * 100 > h.limitPct + 1e-9,
    };
  }).sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  // ---------- Summary ----------
  const realized = [...ledger.positions.values()].reduce((acc, p) => acc + p.realizedPnl, 0);
  const divTotal = dividends.reduce((acc, c) => acc + c.amount, 0);
  const unrealized = holdings.reduce((acc, h) => acc + (h.unrealized ?? 0), 0);
  const netSecurityFlows = trades.reduce((acc, t) => acc + (t.side === "BUY" ? t.quantity * t.price + t.charges : -(t.quantity * t.price - t.charges)), 0);
  const hasLedger = cash.some((c) => c.kind === "DEPOSIT" || c.kind === "WITHDRAWAL");
  const deposits = cash.filter((c) => c.kind === "DEPOSIT").reduce((a, c) => a + c.amount, 0);
  const withdrawals = cash.filter((c) => c.kind === "WITHDRAWAL").reduce((a, c) => a + c.amount, 0);
  const sip = computeSip(trades, cashForSeries, assetTypeOf, s, monthKey(asOf));
  const lastSip = sip.months[sip.months.length - 1];
  void lastSip;
  // ---------- Series (securities sleeve) + broker-cash ledger ----------
  const ser = buildSeries(trades, d.actions, cashForSeries, book, asOf);
  const pts = ser.points;
  const cashPts = pts.length ? cashLedger(trades, cash, pts.map((p) => p.date)) : null;
  const ledgerCash = cashPts?.length ? cashPts[cashPts.length - 1].cash : null;
  const cashRes: CashResolution = resolveCash(latestSnap, ledgerCash);
  const cashBal = cashRes.availableCash;
  const cashSource = cashRes.source;
  const liquidReserve = holdings.filter((h) => h.assetType === "CASH_EQUIVALENT").reduce((a, h) => a + (h.value ?? 0), 0);

  const totalGain = unrealized + realized + divTotal;
  const totalReturnPct = trades.length && netSecurityFlows > 0 ? (mv + divTotal - netSecurityFlows) / netSecurityFlows : inv > 0 && !trades.length ? unrealized / inv : null;

  // XIRR (security level): buys −, sells +, dividends +, terminal value +.
  let xirrNote = "";
  let xSec: number | null = null, xAcc: number | null = null;
  const allPriced = holdings.every((h) => h.value !== null);
  if (!trades.length) xirrNote = "XIRR needs dated transactions: import the Console tradebook.";
  else if (!allPriced) xirrNote = "Some holdings have no current price; XIRR withheld.";
  else {
    const reconciledAll = reconciliation.every((r) => r.status === "ok") || !latestSnap;
    const flows: CashFlow[] = trades.map((t) => ({ date: t.date, amount: t.side === "BUY" ? -(t.quantity * t.price + t.charges) : t.quantity * t.price - t.charges }));
    for (const c of dividends) flows.push({ date: c.date, amount: c.amount });
    flows.push({ date: asOf, amount: mv });
    xSec = xirr(flows);
    if (!reconciledAll) xirrNote = "Holdings and tradebook do not fully reconcile — XIRR may be distorted (see Data Quality).";
    if (hasLedger) {
      const af: CashFlow[] = cash.filter((c) => c.kind === "DEPOSIT" || c.kind === "WITHDRAWAL").map((c) => ({ date: c.date, amount: c.kind === "DEPOSIT" ? -c.amount : c.amount }));
      for (const c of dividends) if (c.source !== "CONSOLE_LEDGER") af.push({ date: c.date, amount: c.amount }); // paid to bank = cash back to investor
      af.push({ date: asOf, amount: mv + (cashBal ?? 0) });
      xAcc = xirr(af);
    }
  }
  const inception = trades.map((t) => t.date).sort()[0];
  const years = inception ? daysBetween(inception, asOf) / 365 : 0;

  // ---------- TWR ----------
  const monthly = monthlyReturns(pts);
  const calendar = calendarYearReturns(monthly);
  let twr: number | null = null, twrAnn: number | null = null, twrNote = "";
  if (!pts.length) twrNote = "No transactions — TWR unavailable.";
  else if (ser.uncoveredDays > 0) twrNote = `Price history missing on ${ser.uncoveredDays} of ${pts.length} business days (${ser.gaps.slice(0, 3).map((g) => g.symbols.slice(0, 3).join(", ")).join("; ")}…). TWR is only reported for fully priced periods. Import historical prices or sync Kite historical data.`;
  else {
    const c = chainReturn(pts, addDays(pts[0].date, -1), asOf);
    twr = c.ret;
    twrAnn = twr !== null ? annualise(twr, daysBetween(pts[0].date, asOf)) : null;
    if (twrAnn === null) twrNote = "Under one year of history: TWR shown as a period return (not annualised).";
  }
  const yStart = `${asOf.slice(0, 4)}-01-01`;
  const ytdChain = pts.length ? chainReturn(pts, addDays(yStart, -1) < pts[0].date ? addDays(pts[0].date, -1) : addDays(yStart, -1), asOf) : { ret: null, complete: false };
  const ytd = ytdChain.ret;
  const ytdNote = ytd === null ? "YTD TWR requires full price coverage for this year." : inception && inception > yStart ? `Since first investment on ${inception} (portfolio started this year).` : "Time-weighted; excludes the effect of new deposits.";

  const targetRate = s.targetCagrPct / 100;
  const tp = targetPath(pts, targetRate);

  // ---------- Account level (securities + broker cash), external flows only ----------
  const acct: AccountPoint[] | null = cashPts ? accountSeries(pts, cashPts) : null;
  const acctCovered = !!acct && acct.length > 0 && acct.every((p) => p.value !== null);
  const acctStart = acct?.find((p) => p.value !== null)?.date;
  let acctTwr: number | null = null, acctTwrAnn: number | null = null;
  if (acct && acctCovered && acct.length > 1) {
    acctTwr = acct.reduce((g, p) => g * (1 + (p.dailyReturn ?? 0)), 1) - 1;
    acctTwrAnn = annualise(acctTwr, daysBetween(acct[0].date, asOf));
  }
  // Contribution-adjusted target path at account level: each external deposit compounds at the target rate.
  let accTarget = 0, prevD: string | undefined;
  const acctTarget = (acct ?? []).map((p) => {
    if (prevD) accTarget *= Math.pow(1 + targetRate, daysBetween(prevD, p.date) / 365);
    accTarget += p.extFlow - p.bankIncome;
    prevD = p.date;
    return accTarget;
  });
  const targetSeries = tp.map((t, i) => ({ date: t.date, target: t.target, actual: pts[i].covered ? pts[i].value : null, accountTarget: acct ? acctTarget[i] : null, accountActual: acct ? acct[i].value : null, contributions: acct ? acct[i].cumContrib : null }));
  const firstDeposit = cash.filter((c) => c.kind === "DEPOSIT").map((c) => c.date).sort()[0];
  const reportedClosing = cashBal !== null && allPriced ? mv + cashBal : null;
  const bridgeAll: Bridge = valueBridge(acct, pts, cashPts, addDays(pts[0]?.date ?? asOf, -1), asOf, reportedClosing);

  // Equity sleeve (excludes Liquid BeES / cash-equivalents) for attribution of reserve drag.
  const eqTrades = trades.filter((t) => assetTypeOf(t.symbol) !== "CASH_EQUIVALENT");
  const eqSer = buildSeries(eqTrades, d.actions, cashForSeries.filter((c) => !c.symbol || assetTypeOf(c.symbol) !== "CASH_EQUIVALENT"), book, asOf);
  const eqTwr = eqSer.points.length && eqSer.uncoveredDays === 0 ? chainReturn(eqSer.points, addDays(eqSer.points[0].date, -1), asOf).ret : null;

  // Gap vs target — valid comparisons only.
  let gap: number | null = null, gapNote = "";
  const daysIn = inception ? daysBetween(inception, asOf) : 0;
  const best = xAcc ?? xSec;
  if (best === null) gapNote = "Annualised return unavailable.";
  else if (daysIn >= 365) { gap = best - targetRate; gapNote = `XIRR ${(best * 100).toFixed(1)}% vs target ${s.targetCagrPct}% (annualised, money-weighted).`; }
  else gapNote = `Only ${daysIn} days of history — annualised comparison would be misleading; compare value against the target reference path instead.`;
  // Reference value: account level (external contributions, cash included) when the ledger exists; else securities level.
  const useAcct = !!acct && acctTarget.length > 0 && reportedClosing !== null;
  const tRef = useAcct ? acctTarget[acctTarget.length - 1] : tp.length ? tp[tp.length - 1].target : null;
  const actualForRef = useAcct ? reportedClosing! : mv;
  let status: PortfolioAnalytics["summary"]["status"] = "Insufficient data", statusDetail = "Need dated transactions and current prices.";
  if (tRef !== null && tRef > 0 && allPriced && trades.length) {
    const ratio = actualForRef / tRef - 1;
    status = ratio > 0.05 ? "Ahead" : ratio < -0.05 ? "Behind" : "Near";
    statusDetail = useAcct
      ? `Account value (securities + cash) is ${(ratio * 100).toFixed(1)}% ${ratio >= 0 ? "above" : "below"} what your dated external contributions would be worth compounding at ${s.targetCagrPct}% (±5% = near).`
      : `Securities value is ${(ratio * 100).toFixed(1)}% ${ratio >= 0 ? "above" : "below"} what your dated net purchases would be worth compounding at ${s.targetCagrPct}% (±5% = near). Import the ledger for the account-level comparison.`;
  }

  // ---------- Benchmarks ----------
  const dates = pts.map((p) => p.date);
  const benchDefs = [
    { code: "IDX:NIFTY_50_TRI", name: "Nifty 50 TRI" }, { code: "IDX:NIFTY_NEXT_50_TRI", name: "Nifty Next 50 TRI" },
    { code: "IDX:NIFTY_MIDCAP_150_TRI", name: "Nifty Midcap 150 TRI" }, { code: "IDX:NIFTY_SMALLCAP_250_TRI", name: "Nifty Smallcap 250 TRI" },
    { code: "IDX:NIFTY_MICROCAP_250_TRI", name: "Nifty Microcap 250 TRI" }, { code: "BLEND", name: "Blended target benchmark" },
  ];
  const portMonthly = monthly.filter((m) => m.ret !== null);
  const benchmarks = benchDefs.map((b) => {
    const avail = b.code === "BLEND" ? Object.keys(s.benchmarkBlend).every((k) => book.has(k)) && Object.keys(s.benchmarkBlend).length > 0 : book.has(b.code);
    if (!avail || !dates.length) return { code: b.code, name: b.name, available: false, monthly: [], stats: null, cumulative: [] };
    const dr = b.code === "BLEND" ? blendedReturns(book, s.benchmarkBlend, dates) : indexReturns(book, b.code, dates);
    const byM = new Map<string, number | null>();
    for (const dt of dates) {
      const k = monthKey(dt); const r = dr.get(dt);
      const cur = byM.has(k) ? byM.get(k)! : 1;
      byM.set(k, cur === null || r === null || r === undefined ? null : cur * (1 + r));
    }
    const bm = [...byM].map(([key, g]) => ({ key, ret: g === null ? null : g - 1 }));
    const pair = portMonthly.map((m) => [m.ret!, bm.find((x) => x.key === m.key)?.ret ?? null] as const).filter((x) => x[1] !== null);
    let idx = 1;
    const cumulative = dates.map((dt) => { const r = dr.get(dt); if (r !== null && r !== undefined) idx *= 1 + r; return { date: dt, value: idx }; });
    return { code: b.code, name: b.name, available: true, monthly: bm, stats: relativeStats(pair.map((p) => p[0]), pair.map((p) => p[1] as number)), cumulative };
  });

  // ---------- Allocation ----------
  const stocks = holdings.filter((h) => h.assetType === "STOCK");
  const sv = stocks.reduce((a, h) => a + (h.value ?? 0), 0), sc = stocks.reduce((a, h) => a + h.invested, 0);
  const tgt = s.targetAllocation as Record<string, number | undefined>;
  const tgtSum = Object.values(tgt).reduce((a: number, x) => a + (x ?? 0), 0) || 100;
  const directEquity: AllocationRow[] = CAPS.map((c) => {
    const hs = stocks.filter((h) => h.cap.category === c);
    const value = hs.reduce((a, h) => a + (h.value ?? 0), 0), cost = hs.reduce((a, h) => a + h.invested, 0);
    const t = c === "Unclassified" ? null : (tgt[c] ?? 0) / tgtSum;
    return { key: c, target: t, valuePct: sv > 0 ? value / sv : 0, costPct: sc > 0 ? cost / sc : 0, gapPP: t === null ? null : (sv > 0 ? value / sv : 0) - t, value, cost, targetValue: t === null ? null : t * sv, shortfall: t === null ? null : t * sv - value, count: hs.length };
  }).filter((r) => r.count > 0 || (r.target ?? 0) > 0);
  const types: AssetType[] = ["STOCK", "ETF", "MF", "CASH_EQUIVALENT"];
  const totalWithCash = mv + (cashBal ?? 0);
  const assetTypes: AllocationRow[] = types.map((t) => {
    const hs = holdings.filter((h) => h.assetType === t);
    const value = hs.reduce((a, h) => a + (h.value ?? 0), 0), cost = hs.reduce((a, h) => a + h.invested, 0);
    return { key: t, target: null, valuePct: totalWithCash > 0 ? value / totalWithCash : 0, costPct: inv > 0 ? cost / inv : 0, gapPP: null, value, cost, targetValue: null, shortfall: null, count: hs.length };
  });
  if (cashBal !== null) assetTypes.push({ key: "CASH", target: null, valuePct: totalWithCash > 0 ? cashBal / totalWithCash : 0, costPct: 0, gapPP: null, value: cashBal, cost: cashBal, targetValue: null, shortfall: null, count: 0 });
  // Look-through
  const lt: Record<string, number> = {};
  let covered = 0;
  for (const h of holdings) {
    const v = h.value ?? 0;
    if (h.assetType === "STOCK") { lt[h.cap.category] = (lt[h.cap.category] ?? 0) + v; covered += v; continue; }
    if (h.assetType === "CASH_EQUIVALENT") { lt.Cash = (lt.Cash ?? 0) + v; covered += v; continue; }
    const user = secMap.get(h.symbol)?.lookThrough;
    const idx = INDEX_ETF_LOOKTHROUGH.find((x) => x.re.test(h.symbol))?.lt;
    const w = user ?? idx;
    if (w) { for (const [k, f] of Object.entries(w)) lt[k] = (lt[k] ?? 0) + v * (f ?? 0); covered += v; }
    else lt["Unknown (no look-through data)"] = (lt["Unknown (no look-through data)"] ?? 0) + v;
  }
  const lookThrough: AllocationRow[] = Object.entries(lt).map(([k, v]) => ({ key: k, target: null, valuePct: mv > 0 ? v / mv : 0, costPct: 0, gapPP: null, value: v, cost: 0, targetValue: null, shortfall: null, count: 0 }));

  // ---------- Sectors ----------
  const sectorMap = new Map<string, HoldingRow[]>();
  for (const h of stocks) { if (!sectorMap.has(h.sector)) sectorMap.set(h.sector, []); sectorMap.get(h.sector)!.push(h); }
  const stockGain = stocks.reduce((a, h) => a + (h.unrealized ?? 0) + h.realized + h.dividends, 0);
  const sectors = [...sectorMap].map(([sector, hs]) => {
    const value = hs.reduce((a, h) => a + (h.value ?? 0), 0), invested = hs.reduce((a, h) => a + h.invested, 0);
    const gain = hs.reduce((a, h) => a + (h.unrealized ?? 0) + h.realized + h.dividends, 0);
    const industries: Record<string, number> = {}; const byCap: Partial<Record<CapCategory, number>> = {};
    for (const h of hs) { industries[h.industry] = (industries[h.industry] ?? 0) + (h.value ?? 0); byCap[h.cap.category] = (byCap[h.cap.category] ?? 0) + (h.value ?? 0); }
    return { sector, count: hs.length, invested, value, weight: sv > 0 ? value / sv : 0, costWeight: sc > 0 ? invested / sc : 0, gain, returnPct: invested > 0 ? (value - invested) / invested : null, contribution: stockGain !== 0 ? gain / Math.abs(stockGain) : 0, largest: [...hs].sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0].symbol, overLimit: sv > 0 && (value / sv) * 100 > s.sectorLimitPct, industries, byCap };
  }).sort((a, b) => b.value - a.value);
  // Sector history at month-ends (requires prices)
  const sectorOf = (sym: string) => secMap.get(sym)?.sector ?? snapItem.get(sym)?.sector ?? "Unclassified";
  const sectorHistory: PortfolioAnalytics["sectorHistory"] = [];
  const monthEnds = [...new Set(pts.map((p) => monthKey(p.date)))].map((m) => pts.filter((p) => monthKey(p.date) === m).pop()!).filter((p) => p.covered);
  for (const p of monthEnds) {
    const q = runLedger(trades, d.actions, p.date).positions;
    const row: Record<string, number> = {};
    let tot = 0;
    for (const pos of q.values()) {
      if (pos.quantity <= 0 || assetTypeOf(pos.symbol) !== "STOCK") continue;
      const px = book.get(pos.symbol, p.date); if (px === undefined) continue;
      const v = pos.quantity * px; tot += v; row[sectorOf(pos.symbol)] = (row[sectorOf(pos.symbol)] ?? 0) + v;
    }
    if (tot > 0) sectorHistory.push({ month: monthKey(p.date), ...Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v / tot])) });
  }

  // ---------- Contributions / multibaggers ----------
  const allSyms = new Set([...holdings.map((h) => h.symbol), ...ledger.positions.keys()]);
  const hMap = new Map(holdings.map((h) => [h.symbol, h]));
  const contribRows = [...allSyms].map((sym) => {
    const h = hMap.get(sym), p = ledger.positions.get(sym);
    const gain = (h?.unrealized ?? 0) + (p?.realizedPnl ?? 0) + (divBySym.get(sym) ?? 0);
    return { symbol: sym, sector: h?.sector ?? sectorOf(sym), gain };
  });
  const totG = contribRows.reduce((a, r) => a + r.gain, 0);
  const contributions = contribRows.map((r) => ({ ...r, share: totG !== 0 ? r.gain / Math.abs(totG) : 0 })).sort((a, b) => b.gain - a.gain);
  const multibaggers = [...allSyms].map((sym) => {
    const h = hMap.get(sym), p = ledger.positions.get(sym);
    const gb = p?.grossBought ?? h?.invested ?? 0, gs = p?.grossSold ?? 0, dv = divBySym.get(sym) ?? 0, v = h?.value ?? 0;
    const m = returnMultiple(v, gs, dv, gb);
    const fb = p?.firstBuyDate ?? h?.firstBuyDate;
    const f = fundMap.get(sym);
    return { symbol: sym, tier: m !== null ? tierFor(m) : null, multiple: m, grossBought: gb, firstBuy: fb, holdingYears: fb ? daysBetween(fb, asOf) / 365 : null, value: v, grossSold: gs, dividends: dv, wealth: v + gs + dv - gb, wealthShare: 0, open: (h?.quantity ?? 0) > 0, revenueGrowth: revenueCagr(f?.revenueAnnual, 3) };
  });
  const totW = multibaggers.reduce((a, x) => a + Math.max(0, x.wealth), 0);
  multibaggers.forEach((x) => { x.wealthShare = totW > 0 ? Math.max(0, x.wealth) / totW : 0; });
  multibaggers.sort((a, b) => (b.multiple ?? 0) - (a.multiple ?? 0));

  // ---------- Risk ----------
  const rh: HoldingForRisk[] = holdings.map((h) => {
    const vols = d.prices.filter((p) => p.symbol === h.symbol && p.volume).slice(-20);
    const adtv = vols.length >= 5 ? vols.reduce((a, p) => a + p.close * (p.volume ?? 0), 0) / vols.length : undefined;
    return { symbol: h.symbol, value: h.value ?? 0, cost: h.invested, sector: h.sector, capCategory: h.cap.category, assetType: h.assetType, avgDailyTurnoverInr: adtv };
  });
  const flags: PortfolioAnalytics["risk"]["flags"] = [];
  for (const h of holdings) {
    if (h.assetType !== "STOCK") continue;
    const f = fundMap.get(h.symbol);
    if (h.limitWeight !== null && h.limitWeight * 100 > s.positionLimits.hardLimitPct) flags.push({ symbol: h.symbol, kind: "Position size", severity: "high", detail: `Invested-cost weight ${(h.limitWeight * 100).toFixed(1)}% of ${DENOM_LABEL[s.positionLimitDenominator]} exceeds hard limit ${s.positionLimits.hardLimitPct}%.` });
    else if (h.overLimit) flags.push({ symbol: h.symbol, kind: "Position size", severity: "medium", detail: `Invested-cost weight ${(h.limitWeight! * 100).toFixed(1)}% of ${DENOM_LABEL[s.positionLimitDenominator]} exceeds ${h.conviction} limit ${h.limitPct}% (₹${Math.round(h.aboveLimit).toLocaleString("en-IN")} above).` });
    if (h.weight !== null && h.weight * 100 > s.positionLimits.hardLimitPct) flags.push({ symbol: h.symbol, kind: "Market-value concentration", severity: "low", detail: `Market-value weight ${(h.weight * 100).toFixed(1)}% (grown by appreciation — informational, not a sell signal).` });
    if (f?.ttmNetProfit !== undefined && f.ttmNetProfit <= 0) flags.push({ symbol: h.symbol, kind: "Valuation", severity: "medium", detail: "Loss-making (TTM) — P/E not meaningful." });
    else if (f?.pe !== undefined && f.pe > 75) flags.push({ symbol: h.symbol, kind: "Valuation", severity: "medium", detail: `P/E ${f.pe.toFixed(1)} — ${peBand(f.pe)}.` });
    if (f?.debtToEquity !== undefined && f.debtToEquity > 1) flags.push({ symbol: h.symbol, kind: "Debt", severity: f.debtToEquity > 2 ? "high" : "medium", detail: `Debt/equity ${f.debtToEquity.toFixed(2)}.` });
    if (f?.interestCoverage !== undefined && f.interestCoverage < 3) flags.push({ symbol: h.symbol, kind: "Debt", severity: "medium", detail: `Interest coverage ${f.interestCoverage.toFixed(1)}×.` });
    const up = f ? unpledgedPromoter(f) : null;
    if (up?.value !== null && up?.value !== undefined && up.value < 40) flags.push({ symbol: h.symbol, kind: "Governance", severity: "medium", detail: `Unpledged promoter holding ${up.value.toFixed(1)}% (< 40%).` });
    if ((f?.promoterPledgePctOfPromoter ?? 0) > 0 || (f?.promoterPledgePctOfTotal ?? 0) > 0) flags.push({ symbol: h.symbol, kind: "Governance", severity: "medium", detail: "Promoter shares pledged." });
    for (const g of f?.governanceFlags ?? []) flags.push({ symbol: h.symbol, kind: "Governance", severity: "high", detail: g });
    const cc = criteriaCheck(f, h.marketCapCr).find((x) => x.id === "trend");
    if (cc?.result === "fail") flags.push({ symbol: h.symbol, kind: "Governance", severity: "medium", detail: `Promoter holding declining: ${cc.detail}` });
    const liq = rh.find((x) => x.symbol === h.symbol);
    const dl = daysToLiquidate(h.value ?? 0, liq?.avgDailyTurnoverInr);
    if (dl !== null && dl > 5) flags.push({ symbol: h.symbol, kind: "Liquidity", severity: dl > 20 ? "high" : "medium", detail: `≈${dl.toFixed(0)} trading days to exit at 10% of average daily turnover.` });
  }
  for (const sct of sectors) if (sct.overLimit) flags.push({ symbol: sct.sector, kind: "Sector concentration", severity: "medium", detail: `${(sct.weight * 100).toFixed(1)}% of direct equity (limit ${s.sectorLimitPct}%).` });
  const microNano = stocks.filter((h) => h.cap.category === "Micro" || h.cap.category === "Nano").reduce((a, h) => a + (h.value ?? 0), 0);

  // ---------- Data quality ----------
  const counts: Record<DataQuality, number> = { VERIFIED: 0, RECONSTRUCTED: 0, ESTIMATED: 0, MISSING: 0, SYNTHETIC: 0 };
  for (const h of holdings) counts[h.quality]++;
  const issues: PortfolioAnalytics["dataQuality"]["issues"] = [];
  if (d.snapshots.some((x) => x.quality === "SYNTHETIC") || d.trades.some((t) => t.quality === "SYNTHETIC")) issues.push({ severity: "high", area: "Sample data", message: "SYNTHETIC SAMPLE DATA is loaded. Nothing shown is your real portfolio. Remove it in Settings before importing real data." });
  if (!latestSnap) issues.push({ severity: "high", area: "Holdings", message: "No holdings snapshot. Connect Kite or import a Console holdings export to verify current holdings." });
  if (!trades.length) issues.push({ severity: "high", area: "Transactions", message: "No tradebook imported — XIRR, TWR, realised P&L and SIP tracking unavailable." });
  if (!hasLedger) issues.push({ severity: "medium", area: "Contributions", message: "No ledger/deposit data — SIP contributions are estimated from purchases." });
  if (ser.uncoveredDays) issues.push({ severity: "medium", area: "Prices", message: `Historical prices missing for ${ser.gaps.reduce((a, g) => a + g.symbols.length, 0)} symbol-gaps; TWR incomplete.` });
  const noSector = stocks.filter((h) => h.sector === "Unclassified").length;
  if (noSector) issues.push({ severity: "medium", area: "Sectors", message: `${noSector} stock(s) lack a sector — add to the security master.` });
  const noCap = stocks.filter((h) => h.cap.category === "Unclassified").length;
  if (noCap) issues.push({ severity: "medium", area: "Market cap", message: `${noCap} stock(s) lack market-cap / AMFI data.` });
  const noFund = stocks.filter((h) => !fundMap.has(h.symbol)).length;
  if (noFund) issues.push({ severity: "low", area: "Fundamentals", message: `${noFund} stock(s) have no fundamentals imported; research scores incomplete.` });
  const mism = reconciliation.filter((r) => r.status !== "ok").length;
  if (mism) issues.push({ severity: "medium", area: "Reconciliation", message: `${mism} holding(s) do not reconcile between snapshot and tradebook.` });
  if (ledger.warnings.length) issues.push({ severity: "medium", area: "Ledger", message: `${ledger.warnings.length} ledger warning(s) (e.g. sells exceeding imported buys).` });
  const unknownCharges = trades.filter((t) => !t.chargesKnown).length;
  if (unknownCharges) issues.push({ severity: "low", area: "Charges", message: `${unknownCharges} trade(s) without charges — cost basis excludes brokerage/STT/GST/stamp duty for these.` });
  const lastPrice = d.prices.map((p) => p.date).sort().pop() ?? null;

  const stats = returnStats(portMonthly.map((m) => m.ret!), s.riskFreeRatePct / 100);

  // ---------- V2: standardised metric registry ----------
  const secStart = pts[0]?.date;
  const secDays = secStart ? daysBetween(secStart, asOf) : 0;
  const acctDays = acct?.length ? daysBetween(acct[0].date, asOf) : 0;
  const liquidSyms = holdings.filter((h) => h.assetType === "CASH_EQUIVALENT").map((h) => h.symbol).join(", ") || "none held";
  const lastRolling = rollingReturns(monthly, 12).filter((r) => r.ret !== null).pop();
  const metrics: MetricDef[] = [
    { id: "accountXirr", label: "Account XIRR (since inception)", value: xAcc, start: firstDeposit, end: asOf, scope: "Whole Zerodha account: securities + broker cash", flows: "External deposits (−), payouts (+), dividends paid to bank (+); terminal = securities value + available cash", annualisation: "XIRR, actual/365" + (acctDays < 365 ? " — history under 1 year, unstable" : ""), fees: FEES_NOTE, dividends: "Included (bank-paid as inflows; ledger-credited via cash)", taxes: TAX_NOTE, cash: "Included — idle cash dilutes this return (cash drag)", liquid: `Included at market value (${liquidSyms})`, note: hasLedger ? undefined : "Requires the funds ledger." },
    { id: "securitiesXirr", label: "Securities XIRR (since first trade)", value: xSec, start: secStart, end: asOf, scope: "Securities only (stocks, ETFs, MFs, Liquid BeES); broker cash excluded", flows: "Purchases (−), sale proceeds (+), all dividends (+); terminal = securities value", annualisation: "XIRR, actual/365" + (secDays < 365 ? " — history under 1 year, unstable" : ""), fees: FEES_NOTE, dividends: "Included as inflows", taxes: TAX_NOTE, cash: "Excluded", liquid: "Included as a security" },
    { id: "accountTwr", label: "Portfolio TWR — account (cumulative)", value: acctTwr, start: acct?.[0]?.date, end: asOf, scope: "Securities + broker cash", flows: "Daily sub-periods; external deposits/payouts at start of day; bank-paid dividends as distributions", annualisation: annualisationNote(acctDays), fees: FEES_NOTE, dividends: "Included as income", taxes: TAX_NOTE, cash: "Included (cash earns 0 — creates drag)", liquid: "Included" },
    { id: "securitiesTwr", label: "Portfolio TWR — invested securities (cumulative)", value: twr, start: secStart, end: asOf, scope: "Securities only", flows: "Daily sub-periods around every purchase/sale (start of day)", annualisation: annualisationNote(secDays), fees: FEES_NOTE, dividends: "Included as income", taxes: TAX_NOTE, cash: "Excluded", liquid: "Included" },
    { id: "inceptionTwrAnn", label: "Since-inception annualised TWR (securities)", value: twrAnn, start: secStart, end: asOf, scope: "Securities only", flows: "As above", annualisation: secDays >= 365 ? "Geometric annualisation (1+r)^(365/days)−1" : "Withheld: under 1 year", fees: FEES_NOTE, dividends: "Included", taxes: TAX_NOTE, cash: "Excluded", liquid: "Included" },
    { id: "calendarTwr", label: `Calendar ${asOf.slice(0, 4)} TWR (YTD)`, value: ytd, start: inception && inception > yStart ? inception : yStart, end: asOf, scope: "Securities only", flows: "Daily sub-periods", annualisation: "Not annualised (calendar-year-to-date)", fees: FEES_NOTE, dividends: "Included", taxes: TAX_NOTE, cash: "Excluded", liquid: "Included" },
    { id: "rolling12Twr", label: "Rolling 12-month TWR (latest)", value: lastRolling?.ret ?? null, end: lastRolling?.key ?? asOf, scope: "Securities only, 12 complete months", flows: "Compounded complete monthly TWRs", annualisation: "12-month period = annual", fees: FEES_NOTE, dividends: "Included", taxes: TAX_NOTE, cash: "Excluded", liquid: "Included" },
    { id: "absolutePnl", label: "Absolute investment P/L (₹)", value: bridgeAll.available ? bridgeAll.totalInvestmentGain : totalGain, start: secStart, end: asOf, scope: bridgeAll.available ? "Market gain + all dividends/interest − non-trade charges" : "Unrealised + realised + dividends", flows: "Contributions excluded", annualisation: "None (₹ amount)", fees: FEES_NOTE, dividends: "Included", taxes: TAX_NOTE, cash: "Cash itself is not a gain", liquid: "Gains on Liquid BeES included" },
  ];
  const differences: CapitalSection["differences"] = [
    { a: "Account XIRR", b: "Securities XIRR", diff: xAcc !== null && xSec !== null ? xAcc - xSec : null, explanation: "Account XIRR includes idle broker cash (0% return) and is measured from the first deposit; securities XIRR measures only money actually invested. The gap is mostly cash drag." },
    { a: "Securities XIRR", b: "Securities TWR (annualised)", diff: xSec !== null && twrAnn !== null ? xSec - twrAnn : null, explanation: "Same scope; XIRR weights periods by the money invested, TWR weights each period equally. A positive gap means your contributions happened to arrive before stronger periods (timing), not better stock picking." },
    { a: "Account TWR", b: "Securities TWR", diff: acctTwr !== null && twr !== null ? acctTwr - twr : null, explanation: "Cumulative. The difference isolates the effect of holding uninvested broker cash." },
  ];

  // ---------- V2: why ahead / behind (additive, measured decomposition) ----------
  const blend = benchmarks.find((b) => b.code === "BLEND");
  const decomp: CapitalSection["decomposition"] = { window: null, terms: [], total: null, note: "" };
  if (pts.length && twr !== null) {
    const from = acct?.[0]?.date ?? pts[0].date, days = daysBetween(from, asOf), ann = days >= 365;
    const conv = (cum: number | null) => (cum === null ? null : ann ? Math.pow(1 + cum, 365 / days) - 1 : cum);
    const X = xAcc ?? xSec; // annualised
    const Xp = X === null ? null : ann ? X : Math.pow(1 + X, days / 365) - 1;
    const A = acctTwr !== null ? conv(acctTwr) : null, S = conv(twr), E = conv(eqTwr);
    const bCum = blend?.available && blend.cumulative.length ? (blend.cumulative[blend.cumulative.length - 1].value ?? 0) / (blend.cumulative[0].value || 1) - 1 : null;
    const B = conv(bCum);
    const T = ann ? targetRate : Math.pow(1 + targetRate, days / 365) - 1;
    const terms: DecompositionTerm[] = [];
    const add = (key: string, label: string, v: number | null, evidence: string) => terms.push({ key, label, value: v, evidence });
    const A_ = A ?? S, E_ = E ?? S;
    add("timing", "Timing of contributions", Xp !== null && A_ !== null ? Xp - A_ : null, "Money-weighted (XIRR) minus time-weighted return of the same scope.");
    add("cash", "Cash drag (idle broker cash)", A !== null && S !== null ? A - S : null, A === null ? "Needs the funds ledger." : "Account TWR minus securities TWR.");
    add("reserve", "Liquid BeES reserve drag", S !== null && E !== null ? S - E : null, "Securities TWR minus equity-only TWR (excluding cash-equivalents).");
    if (B !== null) {
      add("selection", "Stock selection, sector & market-cap tilts vs blended benchmark", E_ !== null ? E_ - B : null, "Equity-sleeve TWR minus blended target-mix TRI benchmark.");
      add("market", "Market conditions (benchmark vs 40% aspiration)", B - T, "Blended benchmark return minus the aspiration over the same window.");
    } else add("selection", "Equity sleeve vs aspiration (benchmark not imported)", E_ !== null ? E_ - T : null, "Cannot separate market conditions from selection without benchmark TRI data.");
    const total = Xp !== null ? Xp - T : null;
    decomp.window = { from, to: asOf, days, annualised: ann };
    decomp.terms = terms;
    decomp.total = total;
    decomp.note = `${ann ? "Annualised" : "Cumulative (window under 1 year; target pro-rated)"} percentage-point contributions. Terms telescope exactly: XIRR − target = timing + cash + reserve + selection + market. Each term is measured, not inferred; small residuals arise only where a component is missing.`;
  }
  const stockRows = holdings.filter((h) => h.assetType === "STOCK");
  const gainOf = (h: HoldingRow) => (h.unrealized ?? 0) + h.realized + h.dividends;
  const attr = (key: (h: HoldingRow) => string) => {
    const m = new Map<string, { gain: number; value: number }>();
    for (const h of stockRows) { const k = key(h); const e = m.get(k) ?? { gain: 0, value: 0 }; e.gain += gainOf(h); e.value += h.value ?? 0; m.set(k, e); }
    const tg = [...m.values()].reduce((x, e) => x + Math.abs(e.gain), 0) || 1;
    return [...m].map(([k, e]) => ({ key: k, gain: e.gain, share: e.gain / tg, weight: sv > 0 ? e.value / sv : 0 })).sort((x, y) => y.gain - x.gain);
  };
  const posGains = contributions.map((c) => c.gain).filter((g) => g > 0).sort((x, y) => y - x);
  const totPos = posGains.reduce((x, g) => x + g, 0) || 1;
  let cumG = 0, half = 0;
  for (const g of posGains) { cumG += g; half++; if (cumG >= totPos / 2) break; }
  const byType = Object.fromEntries((["STOCK", "ETF", "MF", "CASH_EQUIVALENT"] as AssetType[]).map((t) => { const hs = holdings.filter((h) => h.assetType === t); return [t, { value: hs.reduce((x, h) => x + (h.value ?? 0), 0), cost: hs.reduce((x, h) => x + h.invested, 0), count: hs.length }]; })) as CapitalSection["measures"]["byType"];
  // Monthly deployment vs guide
  const guideTotal = Object.values(s.deploymentGuide).reduce((x, v) => x + v, 0) || 1;
  const deployment = sip.months.filter((m) => m.inPlan).map((m) => {
    const byCap: Record<string, number> = {};
    let sb = 0, ss = 0;
    for (const t of trades) {
      if (monthKey(t.date) !== m.month || assetTypeOf(t.symbol) !== "STOCK") continue;
      const v = t.quantity * t.price + (t.side === "BUY" ? t.charges : -t.charges);
      if (t.side === "BUY") { sb += v; const c = classifyAt(secMap.get(t.symbol), t.date, s.thresholds).category; byCap[c] = (byCap[c] ?? 0) + v; } else ss += v;
    }
    const dev = sb > 0 ? (["Mid", "Small", "Micro", "Nano"] as const).reduce((x, k) => x + Math.abs((byCap[k] ?? 0) / sb - s.deploymentGuide[k] / guideTotal), 0) / 2 : null;
    return { month: m.month, target: m.target, contribution: m.contribution, parkedInReserve: m.liquidNet, stockBuys: sb, stockSells: ss, byCap, contributionAch: m.target > 0 ? m.contribution / m.target : null, deploymentAch: m.contribution > 0 ? sb / m.contribution : null, allocationAch: dev === null ? null : 1 - dev };
  });
  const yearsList = [...new Set(pts.map((p) => p.date.slice(0, 4)))];
  const bridgeByYear = yearsList.map((y) => valueBridge(acct, pts, cashPts, `${Number(y) - 1}-12-31`, [`${y}-12-31`, asOf].sort()[0], null));
  const capital: CapitalSection = {
    measures: { totalMarketValue: cashBal !== null ? mv + cashBal : null, securitiesValue: mv, brokerCash: cashBal, byType, investedTotal: inv, netContributions: hasLedger ? deposits - withdrawals : null, deposits, withdrawals },
    reserve: { availableCash: cashBal, liquidBees: liquidReserve, combined: (cashBal ?? 0) + liquidReserve, buyingPower: cashRes.buyingPower, collateral: cashRes.collateral, source: cashRes.source, warnings: cashRes.warnings,
      liquidNote: "Liquid BeES is a liquid ETF (cash-management instrument), not bank cash: selling it settles T+1, its price includes accrued yield, and pledging it gives collateral margin only after a haircut. Buying power shown is the broker's figure." },
    bridge: bridgeAll, bridgeByYear,
    account: (acct ?? []).map((p) => ({ date: p.date, value: p.value, securities: p.securities, cash: p.cash, contributions: p.cumContrib, twrIndex: p.twrIndex })),
    accountTwr: acctTwr, accountTwrAnnualised: acctTwrAnn, equitySleeveTwr: eqTwr,
    metrics, differences, decomposition: decomp,
    attributionByCap: attr((h) => h.cap.category), attributionBySector: attr((h) => h.sector),
    concentrationOfGains: { top1: (posGains[0] ?? 0) / totPos, top3: posGains.slice(0, 3).reduce((x, g) => x + g, 0) / totPos, top5: posGains.slice(0, 5).reduce((x, g) => x + g, 0) / totPos, positions: posGains.length, winnersForHalf: half },
    deployment,
    limitDenominator: { kind: s.positionLimitDenominator, label: DENOM_LABEL[s.positionLimitDenominator], value: limitDenominator },
  };
  void acctStart; void acctTwrAnn;

  return {
    asOf, generatedAt: new Date().toISOString(),
    valuationSource: latestSnap ? { kind: "snapshot", at: latestSnap.takenAt, source: latestSnap.source, quality: latestSnap.quality } : holdings.length ? { kind: "reconstructed", quality: "RECONSTRUCTED" } : { kind: "none", quality: "MISSING" },
    holdings,
    summary: {
      marketValue: mv, invested: inv, unrealized, realized, dividends: divTotal, totalGain, totalReturnPct, netSecurityFlows,
      netContributions: hasLedger ? deposits - withdrawals : null, cash: cashBal, cashSource, liquidReserve, totalPortfolio: mv + (cashBal ?? 0),
      counts: { stocks: stocks.length, etfs: holdings.filter((h) => h.assetType === "ETF").length, mfs: holdings.filter((h) => h.assetType === "MF").length, liquid: holdings.filter((h) => h.assetType === "CASH_EQUIVALENT").length },
      xirrSecurities: xSec, xirrAccount: xAcc, xirrNote, twrSinceInception: twr, twrAnnualised: twrAnn, twrNote, ytd, ytdNote,
      inceptionDate: inception, yearsSinceInception: years, targetRate, gapVsTarget: gap, gapNote, status, statusDetail, targetReferenceValue: tRef,
    },
    series: pts, seriesGaps: ser.gaps, targetSeries, monthly, calendar,
    rolling12: rollingReturns(monthly, 12), rolling36: rollingReturns(monthly, 36),
    benchmarks, stats, maxDrawdown: maxDrawdown(pts.map((p) => p.twrIndex)), sip, capital,
    allocation: { directEquity, assetTypes, lookThrough, lookThroughCoverage: mv > 0 ? covered / mv : 0, etfs: holdings.filter((h) => h.assetType === "ETF" || h.assetType === "CASH_EQUIVALENT"), mfs: holdings.filter((h) => h.assetType === "MF") },
    sectors, sectorHistory, contributions,
    risk: { concentration: concentration(rh.filter((x) => x.assetType === "STOCK")), stress: stressTest(rh), flags, microNanoPct: sv > 0 ? microNano / sv : 0, liquidity: rh.filter((x) => x.assetType === "STOCK").map((x) => ({ symbol: x.symbol, value: x.value, adtv: x.avgDailyTurnoverInr ?? null, days: daysToLiquidate(x.value, x.avgDailyTurnoverInr) })) },
    multibaggers,
    dataQuality: {
      counts, issues, reconciliation, ledgerWarnings: ledger.warnings,
      freshness: [
        { item: "Holdings snapshot", at: latestSnap?.takenAt ?? null },
        { item: "Latest price", at: lastPrice },
        { item: "Latest trade", at: trades.map((t) => t.date).sort().pop() ?? null },
        { item: "Latest ledger entry", at: cash.map((c) => c.date).sort().pop() ?? null },
        { item: "Latest fundamentals", at: d.fundamentals.map((f) => f.asOf).sort().pop() ?? null },
      ],
    },
  };
}
