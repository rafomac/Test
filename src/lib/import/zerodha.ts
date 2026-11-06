/**
 * Parsers for official Zerodha exports (Console / Kite / Coin) plus canonical templates.
 * Header rows are located automatically (Console reports have preamble lines), and columns are
 * matched by aliases, so minor format changes do not break imports. Rows that cannot be parsed
 * are reported, never guessed.
 */
import Papa from "papaparse";
import { parseDate } from "../engine/dates";
import type { CashEntry, CashKind, CorporateAction, DataSource, Fundamentals, PricePoint, Security, SnapshotItem, Trade } from "../types";
import { inferAssetType } from "../engine/classify";

export type ImportKind =
  | "tradebook"
  | "holdings"
  | "ledger"
  | "dividends"
  | "mf_tradebook"
  | "prices"
  | "corporate_actions"
  | "securities"
  | "fundamentals"
  | "amfi"
  | "deposits";

export interface ParseResult<T> {
  records: T[];
  rowsRead: number;
  skipped: { row: number; reason: string }[];
  warnings: string[];
  detectedColumns: string[];
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9%]/g, "");

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/[₹,\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  if (s === "" || s === "-") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Find header row (first row containing >= `minHits` of the expected aliases) and return objects. */
export function tableFromCsv(text: string, expect: string[][], minHits = 2): { header: string[]; rows: Record<string, string>[]; headerRow: number } {
  const parsed = Papa.parse<string[]>(text.replace(/^﻿/, ""), { skipEmptyLines: true });
  const all = parsed.data as string[][];
  const aliases = expect.map((a) => a.map(norm));
  let headerRow = -1;
  for (let i = 0; i < Math.min(all.length, 40); i++) {
    const cells = all[i].map((c) => norm(String(c)));
    const hits = aliases.filter((al) => al.some((a) => cells.includes(a))).length;
    if (hits >= minHits) { headerRow = i; break; }
  }
  if (headerRow < 0) return { header: [], rows: [], headerRow };
  const header = all[headerRow].map((h) => String(h).trim());
  const rows = all.slice(headerRow + 1).map((r) => Object.fromEntries(header.map((h, j) => [h, r[j] ?? ""])));
  return { header, rows, headerRow };
}

function pick(row: Record<string, string>, aliases: string[]): string | undefined {
  const keys = Object.keys(row);
  for (const a of aliases) {
    const k = keys.find((x) => norm(x) === norm(a));
    if (k !== undefined && row[k] !== undefined && String(row[k]).trim() !== "") return String(row[k]).trim();
  }
  return undefined;
}

const A = {
  symbol: ["symbol", "tradingsymbol", "instrument", "scrip", "stock", "trading symbol"],
  isin: ["isin"],
  date: ["trade_date", "trade date", "date", "posting_date", "posting date", "ex-date", "ex date", "exdate", "order_execution_time"],
  side: ["trade_type", "trade type", "type", "buy/sell", "side", "transaction type"],
  qty: ["quantity", "qty", "qty.", "quantity available", "units"],
  price: ["price", "trade price", "rate", "nav"],
  exchange: ["exchange"],
  segment: ["segment"],
  tradeId: ["trade_id", "trade id"],
  orderId: ["order_id", "order id"],
  charges: ["charges", "total charges", "brokerage+taxes", "total_charges"],
};

// ---------------- Tradebook (Console > Reports > Tradebook, Equity) ----------------
export function parseTradebook(text: string, source: DataSource = "CONSOLE_TRADEBOOK"): ParseResult<Trade> {
  const { header, rows, headerRow } = tableFromCsv(text, [A.symbol, A.date, A.side, A.qty, A.price], 4);
  const out: ParseResult<Trade> = { records: [], rowsRead: rows.length, skipped: [], warnings: [], detectedColumns: header };
  if (headerRow < 0) { out.warnings.push("Could not find a tradebook header (expected symbol, trade_date, trade_type, quantity, price)."); return out; }
  const hasCharges = header.some((h) => A.charges.map(norm).includes(norm(h)));
  if (!hasCharges) out.warnings.push("Tradebook has no charges column: brokerage/STT/GST/stamp duty are NOT in cost basis. Import ledger or contract-note charges to include them.");
  rows.forEach((r, i) => {
    const seg = pick(r, A.segment);
    if (seg && !/^(eq|equity|mf|cash)$/i.test(seg)) { out.skipped.push({ row: i + headerRow + 2, reason: `Segment ${seg} ignored (equity delivery only)` }); return; }
    const symbol = pick(r, A.symbol)?.toUpperCase().replace(/-(EQ|BE|BZ|SM|ST)$/, "");
    const date = parseDate(pick(r, ["trade_date", "trade date", "date", "order_execution_time"]));
    const sideRaw = pick(r, A.side)?.toLowerCase();
    const qty = num(pick(r, A.qty));
    const price = num(pick(r, A.price));
    if (!symbol || !date || !sideRaw || qty === null || price === null) { out.skipped.push({ row: i + headerRow + 2, reason: "Missing symbol/date/type/quantity/price" }); return; }
    const side = sideRaw.startsWith("b") ? "BUY" : sideRaw.startsWith("s") ? "SELL" : null;
    if (!side) { out.skipped.push({ row: i + headerRow + 2, reason: `Unknown trade type "${sideRaw}"` }); return; }
    const charges = num(pick(r, A.charges));
    const tradeId = pick(r, A.tradeId);
    out.records.push({
      id: tradeId ? `T-${pick(r, A.exchange) ?? ""}-${tradeId}` : `T-${symbol}-${date}-${side}-${qty}-${price}-${i}`,
      date, symbol, isin: pick(r, A.isin), exchange: pick(r, A.exchange), side, quantity: Math.abs(qty), price,
      charges: charges ?? 0, chargesKnown: charges !== null, tradeId, orderId: pick(r, A.orderId), source, quality: "VERIFIED",
    });
  });
  return out;
}

// ---------------- Holdings (Console holdings export / Kite holdings CSV) ----------------
export function parseHoldings(text: string, liquidSymbols: string[] = []): ParseResult<SnapshotItem> & { source: DataSource } {
  const { header, rows, headerRow } = tableFromCsv(text, [A.symbol, A.qty, ["average price", "avg. cost", "avg cost", "average_price", "avg price"], ["previous closing price", "ltp", "last price", "close price", "last_price"]], 3);
  const source: DataSource = header.some((h) => /avg\. cost/i.test(h)) ? "KITE_HOLDINGS_CSV" : "CONSOLE_HOLDINGS";
  const out = { records: [] as SnapshotItem[], rowsRead: rows.length, skipped: [] as { row: number; reason: string }[], warnings: [] as string[], detectedColumns: header, source };
  if (headerRow < 0) { out.warnings.push("Could not find holdings header (expected Symbol, Quantity, Average Price, LTP/Previous Close)."); return out; }
  rows.forEach((r, i) => {
    const symbol = pick(r, A.symbol)?.toUpperCase();
    const qty = num(pick(r, ["quantity available", "qty.", "quantity", "qty"]));
    const lt = num(pick(r, ["quantity long term"])) ?? 0;
    const pledged = (num(pick(r, ["quantity pledged (margin)"])) ?? 0) + (num(pick(r, ["quantity pledged (loan)"])) ?? 0);
    const avg = num(pick(r, ["average price", "avg. cost", "avg cost", "average_price", "avg price"]));
    const ltp = num(pick(r, ["ltp", "last price", "last_price", "previous closing price", "close price"]));
    if (!symbol || qty === null || avg === null || ltp === null) { if (symbol && !/^total/i.test(symbol)) out.skipped.push({ row: i + headerRow + 2, reason: "Missing quantity/average/price" }); return; }
    const totalQty = source === "CONSOLE_HOLDINGS" ? qty + pledged + (num(pick(r, ["quantity discrepant"])) ?? 0) : qty;
    void lt;
    out.records.push({ symbol, isin: pick(r, A.isin), assetType: inferAssetType(symbol, "", liquidSymbols), quantity: totalQty, averagePrice: avg, lastPrice: ltp, sector: pick(r, ["sector"]) });
  });
  if (source === "CONSOLE_HOLDINGS") out.warnings.push("Console holdings prices are previous closing prices; snapshot date set to the price date you confirm.");
  return out;
}

// ---------------- Ledger (Console > Funds > Statement) ----------------
const LEDGER_RULES: { re: RegExp; kind: CashKind | "SKIP" }[] = [
  { re: /funds? added|payin|pay-in|razorpay|upi|neft.*(cr|received)|imps.*received|deposit/i, kind: "DEPOSIT" },
  { re: /payout|withdraw|funds? withdrawn|pay-out/i, kind: "WITHDRAWAL" },
  { re: /dividend/i, kind: "DIVIDEND" },
  { re: /interest|delayed payment/i, kind: "INTEREST" },
  { re: /dp charges|amc|account maintenance|call ?& ?trade|pledge charges|gst on/i, kind: "CHARGE" },
  { re: /net settlement|net obligation|bill|contract note|settlement/i, kind: "SKIP" }, // trade settlements: already in tradebook
  { re: /opening balance|closing balance/i, kind: "SKIP" },
];

export function classifyLedger(particulars: string, voucher?: string): CashKind | "SKIP" | "OTHER" {
  const s = `${particulars} ${voucher ?? ""}`;
  for (const r of LEDGER_RULES) if (r.re.test(s)) return r.kind;
  return "OTHER";
}

export function parseLedger(text: string): ParseResult<CashEntry> {
  const { header, rows, headerRow } = tableFromCsv(text, [["particulars", "description", "narration"], ["posting_date", "posting date", "date"], ["debit"], ["credit"]], 3);
  const out: ParseResult<CashEntry> = { records: [], rowsRead: rows.length, skipped: [], warnings: [], detectedColumns: header };
  if (headerRow < 0) { out.warnings.push("Could not find ledger header (particulars, posting_date, debit, credit)."); return out; }
  let other = 0;
  rows.forEach((r, i) => {
    const part = pick(r, ["particulars", "description", "narration"]) ?? "";
    const date = parseDate(pick(r, ["posting_date", "posting date", "date"]));
    const debit = num(pick(r, ["debit"])) ?? 0, credit = num(pick(r, ["credit"])) ?? 0;
    if (!date) { if (part && !/opening|closing/i.test(part)) out.skipped.push({ row: i + headerRow + 2, reason: "No date" }); return; }
    const kind = classifyLedger(part, pick(r, ["voucher_type", "voucher type"]));
    if (kind === "SKIP") return;
    if (kind === "OTHER") other++;
    const amount = kind === "DEPOSIT" || kind === "DIVIDEND" || kind === "INTEREST" ? credit - debit : debit - credit;
    if (Math.abs(amount) < 0.005) return;
    const k: CashKind = amount < 0 && kind === "DEPOSIT" ? "WITHDRAWAL" : kind;
    out.records.push({ id: `L-${date}-${norm(part).slice(0, 40)}-${debit}-${credit}`, date, kind: k, amount: Math.abs(amount), description: part, source: "CONSOLE_LEDGER", quality: "VERIFIED" });
  });
  if (other) out.warnings.push(`${other} ledger rows had unrecognised particulars and were stored as OTHER (not counted as contributions). Review them on the Data Quality screen.`);
  return out;
}

// ---------------- Dividends (Console > Reports > Dividends) ----------------
export function parseDividends(text: string): ParseResult<CashEntry> {
  const { header, rows, headerRow } = tableFromCsv(text, [A.symbol, ["ex-date", "ex date", "exdate", "date"], ["net dividend amount", "dividend amount", "amount", "net amount"]], 3);
  const out: ParseResult<CashEntry> = { records: [], rowsRead: rows.length, skipped: [], warnings: [], detectedColumns: header };
  if (headerRow < 0) { out.warnings.push("Could not find dividends header (Symbol, Ex-date, Net Dividend Amount)."); return out; }
  rows.forEach((r, i) => {
    const symbol = pick(r, A.symbol)?.toUpperCase();
    const date = parseDate(pick(r, ["ex-date", "ex date", "exdate", "date"]));
    const amt = num(pick(r, ["net dividend amount", "dividend amount", "net amount", "amount"]));
    if (!symbol || !date || amt === null) { if (symbol && !/^total/i.test(symbol)) out.skipped.push({ row: i + headerRow + 2, reason: "Missing symbol/date/amount" }); return; }
    out.records.push({ id: `D-${symbol}-${date}`, date, kind: "DIVIDEND", amount: amt, symbol, description: "Dividend", source: "CONSOLE_DIVIDENDS", quality: "VERIFIED" });
  });
  return out;
}

// ---------------- Mutual fund tradebook (Console > Tradebook > MF / Coin) ----------------
export function parseMfTradebook(text: string): ParseResult<Trade> {
  const r = parseTradebook(text.replace(/\bnav\b/gi, "price"), "COIN_MF");
  r.records.forEach((t) => { t.chargesKnown = true; });
  r.warnings = r.warnings.filter((w) => !w.startsWith("Tradebook has no charges"));
  return r;
}

// ---------------- Canonical templates ----------------
/** Deposits template: date, amount, type (DEPOSIT/WITHDRAWAL), note */
export function parseDeposits(text: string): ParseResult<CashEntry> {
  const { header, rows } = tableFromCsv(text, [["date"], ["amount"], ["type"]], 2);
  const out: ParseResult<CashEntry> = { records: [], rowsRead: rows.length, skipped: [], warnings: [], detectedColumns: header };
  rows.forEach((r, i) => {
    const date = parseDate(pick(r, ["date"])), amt = num(pick(r, ["amount"]));
    const t = (pick(r, ["type"]) ?? "DEPOSIT").toUpperCase();
    if (!date || amt === null) { out.skipped.push({ row: i + 2, reason: "Missing date/amount" }); return; }
    const kind: CashKind = t.startsWith("W") || amt < 0 ? "WITHDRAWAL" : "DEPOSIT";
    out.records.push({ id: `M-${date}-${kind}-${Math.abs(amt)}-${i}`, date, kind, amount: Math.abs(amt), description: pick(r, ["note", "description"]), source: "MANUAL", quality: "VERIFIED" });
  });
  return out;
}

/** Prices template: symbol, date, close[, volume]. Index series use symbol "IDX:<CODE>". Also accepts niftyindices TRI export (Date, Total Returns Index). */
export function parsePrices(text: string, symbolOverride?: string): ParseResult<PricePoint> {
  const { header, rows } = tableFromCsv(text, [["date", "index date", "historicaldate"], ["close", "total returns index", "totalreturnsindex", "tri", "closing index value", "close price"]], 2);
  const out: ParseResult<PricePoint> = { records: [], rowsRead: rows.length, skipped: [], warnings: [], detectedColumns: header };
  rows.forEach((r, i) => {
    const symbol = (symbolOverride || pick(r, A.symbol) || "").toUpperCase();
    const date = parseDate(pick(r, ["date", "index date", "historicaldate"]));
    const close = num(pick(r, ["close", "total returns index", "totalreturnsindex", "tri", "closing index value", "close price"]));
    if (!symbol || !date || close === null || close <= 0) { out.skipped.push({ row: i + 2, reason: "Missing symbol/date/close" }); return; }
    out.records.push({ symbol, date, close, volume: num(pick(r, ["volume", "shares traded"])) ?? undefined, source: "CSV_IMPORT" });
  });
  return out;
}

/** Corporate actions template: symbol, ex_date, kind, ratio_from, ratio_to, new_symbol, cost_allocation_pct, notes */
export function parseCorporateActions(text: string): ParseResult<CorporateAction> {
  const { header, rows } = tableFromCsv(text, [A.symbol, ["ex_date", "ex date", "exdate"], ["kind", "type", "action"]], 3);
  const out: ParseResult<CorporateAction> = { records: [], rowsRead: rows.length, skipped: [], warnings: [], detectedColumns: header };
  rows.forEach((r, i) => {
    const symbol = pick(r, A.symbol)?.toUpperCase();
    const exDate = parseDate(pick(r, ["ex_date", "ex date", "exdate"]));
    const kind = pick(r, ["kind", "type", "action"])?.toUpperCase().replace(/\s+/g, "_") as CorporateAction["kind"];
    const from = num(pick(r, ["ratio_from", "from"])), to = num(pick(r, ["ratio_to", "to"]));
    if (!symbol || !exDate || !["SPLIT", "BONUS", "MERGER", "DEMERGER", "SYMBOL_CHANGE"].includes(kind) || !from || !to) { out.skipped.push({ row: i + 2, reason: "Missing/invalid symbol, ex_date, kind or ratio" }); return; }
    out.records.push({ id: `CA-${symbol}-${exDate}-${kind}`, symbol, exDate, kind, ratioFrom: from, ratioTo: to, newSymbol: pick(r, ["new_symbol", "new symbol"])?.toUpperCase(), costAllocationPct: num(pick(r, ["cost_allocation_pct", "cost allocation %"])) ?? undefined, notes: pick(r, ["notes"]), source: "MANUAL" });
  });
  return out;
}

/** Security master: symbol, name, isin, asset_type, sector, industry, market_cap_cr, market_cap_as_of */
export function parseSecurities(text: string): ParseResult<Security> {
  const { header, rows } = tableFromCsv(text, [A.symbol, ["sector", "industry", "asset_type", "market_cap_cr", "name"]], 2);
  const out: ParseResult<Security> = { records: [], rowsRead: rows.length, skipped: [], warnings: [], detectedColumns: header };
  const now = new Date().toISOString();
  rows.forEach((r, i) => {
    const symbol = pick(r, A.symbol)?.toUpperCase();
    if (!symbol) { out.skipped.push({ row: i + 2, reason: "No symbol" }); return; }
    const at = (pick(r, ["asset_type", "asset type", "type"]) ?? "").toUpperCase();
    out.records.push({
      symbol, name: pick(r, ["name", "company", "company name"]), isin: pick(r, A.isin),
      assetType: (["STOCK", "ETF", "MF", "CASH_EQUIVALENT"].includes(at) ? at : inferAssetType(symbol, pick(r, ["name"]) ?? "")) as Security["assetType"],
      sector: pick(r, ["sector"]), industry: pick(r, ["industry"]),
      marketCapCr: num(pick(r, ["market_cap_cr", "market cap (cr)", "market cap", "mcap"])) ?? undefined,
      marketCapAsOf: parseDate(pick(r, ["market_cap_as_of", "as_of", "as of"])) ?? undefined,
      source: "CSV_IMPORT", updatedAt: now,
    });
  });
  return out;
}

/** AMFI half-yearly categorisation list: Sr. No (rank), Company name, ISIN, NSE Symbol, average market cap, Categorization */
export function parseAmfi(text: string): ParseResult<{ isin?: string; symbol?: string; rank: number; category: "Large" | "Mid" | "Small"; avgMcapCr?: number }> {
  const { header, rows } = tableFromCsv(text, [["sr. no.", "sr no", "rank", "srno"], ["isin"], ["categorization as per sebi circular dated oct 6, 2017", "categorization", "category"]], 2);
  const out: ReturnType<typeof parseAmfi> = { records: [], rowsRead: rows.length, skipped: [], warnings: [], detectedColumns: header };
  rows.forEach((r, i) => {
    const rank = num(pick(r, ["sr. no.", "sr no", "rank", "srno", "sr.no."]));
    const catRaw = Object.entries(r).find(([k]) => /categori|category/i.test(k))?.[1] ?? "";
    const category = /large/i.test(catRaw) ? "Large" : /mid/i.test(catRaw) ? "Mid" : /small/i.test(catRaw) ? "Small" : null;
    if (!rank || !category) { out.skipped.push({ row: i + 2, reason: "Missing rank/category" }); return; }
    const mc = Object.entries(r).find(([k]) => /average.*market|avg.*mcap|market cap/i.test(k))?.[1];
    out.records.push({ rank, category, isin: pick(r, A.isin), symbol: pick(r, ["nse symbol", "symbol"])?.toUpperCase(), avgMcapCr: num(mc) ?? undefined });
  });
  return out;
}

/**
 * Fundamentals template (one row per company). Columns: symbol, as_of, source, rev_FY2016..rev_FY2026,
 * ttm_revenue, ttm_net_profit, pe, roce, roe, debt_equity, interest_coverage, ocf, fcf, op_margin, net_margin,
 * ev_ebitda, ps, pb, promoter_pct, pledge_pct_of_promoter, pledge_pct_of_total, promoter_YYYYQn..., website, website_quality.
 */
export function parseFundamentals(text: string): ParseResult<Fundamentals> {
  const { header, rows } = tableFromCsv(text, [A.symbol, ["as_of", "asof", "date"]], 1);
  const out: ParseResult<Fundamentals> = { records: [], rowsRead: rows.length, skipped: [], warnings: [], detectedColumns: header };
  rows.forEach((r, i) => {
    const symbol = pick(r, A.symbol)?.toUpperCase();
    if (!symbol) { out.skipped.push({ row: i + 2, reason: "No symbol" }); return; }
    const f: Fundamentals = { symbol, asOf: parseDate(pick(r, ["as_of", "asof", "date"])) ?? new Date().toISOString().slice(0, 10), source: pick(r, ["source"]) ?? "CSV import (source not stated)" };
    const rev: Record<string, number> = {}, prof: Record<string, number> = {}, prom: Record<string, number> = {}, q: Record<string, number> = {};
    for (const [k, v] of Object.entries(r)) {
      const n = num(v);
      if (n === null) continue;
      let m = k.match(/^rev(?:enue)?_?(FY\d{4})$/i); if (m) rev[m[1].toUpperCase()] = n;
      m = k.match(/^(?:np|profit|net_profit)_?(FY\d{4})$/i); if (m) prof[m[1].toUpperCase()] = n;
      m = k.match(/^promoter_?(\d{4}Q[1-4])$/i); if (m) prom[m[1].toUpperCase()] = n;
      m = k.match(/^revq_?(\d{4}Q[1-4])$/i); if (m) q[m[1].toUpperCase()] = n;
    }
    if (Object.keys(rev).length) f.revenueAnnual = rev;
    if (Object.keys(prof).length) f.netProfitAnnual = prof;
    if (Object.keys(prom).length) f.promoterHistory = prom;
    if (Object.keys(q).length) f.revenueQuarterly = q;
    const map: [keyof Fundamentals, string[]][] = [
      ["ttmRevenue", ["ttm_revenue"]], ["ttmNetProfit", ["ttm_net_profit", "ttm_profit"]], ["pe", ["pe", "p/e"]], ["forwardPe", ["forward_pe"]],
      ["rocePct", ["roce"]], ["roePct", ["roe"]], ["roicPct", ["roic"]], ["debtToEquity", ["debt_equity", "d/e", "debt to equity"]],
      ["interestCoverage", ["interest_coverage"]], ["operatingCashFlowCr", ["ocf", "operating_cash_flow"]], ["freeCashFlowCr", ["fcf", "free_cash_flow"]],
      ["capexCr", ["capex"]], ["operatingMarginPct", ["op_margin", "opm"]], ["ebitdaMarginPct", ["ebitda_margin"]], ["netMarginPct", ["net_margin", "npm"]],
      ["evToEbitda", ["ev_ebitda"]], ["evToSales", ["ev_sales"]], ["priceToSales", ["ps", "price_to_sales"]], ["priceToBook", ["pb", "price_to_book"]],
      ["totalDebtCr", ["total_debt", "debt"]], ["cashCr", ["cash"]], ["promoterHoldingPct", ["promoter_pct", "promoter holding"]],
      ["promoterPledgePctOfPromoter", ["pledge_pct_of_promoter"]], ["promoterPledgePctOfTotal", ["pledge_pct_of_total"]], ["epsGrowth3yPct", ["eps_growth_3y"]],
    ];
    for (const [field, al] of map) { const n = num(pick(r, al)); if (n !== null) (f as unknown as Record<string, number>)[field] = n; }
    const w = pick(r, ["website"]); if (w) f.website = w;
    const wq = num(pick(r, ["website_quality"])); if (wq !== null) f.websiteQuality = Math.max(0, Math.min(3, Math.round(wq))) as 0 | 1 | 2 | 3;
    const pledgeCol = pick(r, ["pledge_pct"]);
    if (pledgeCol && f.promoterPledgePctOfPromoter === undefined && f.promoterPledgePctOfTotal === undefined)
      out.warnings.push(`${symbol}: "pledge_pct" is ambiguous — use pledge_pct_of_promoter or pledge_pct_of_total. Not imported.`);
    out.records.push(f);
  });
  return out;
}

export const TEMPLATES: Record<string, string> = {
  deposits: "date,amount,type,note\n2026-01-05,200000,DEPOSIT,January SIP\n",
  prices: "symbol,date,close,volume\nIDX:NIFTY_SMALLCAP_250_TRI,2026-01-01,0,\n",
  corporate_actions: "symbol,ex_date,kind,ratio_from,ratio_to,new_symbol,cost_allocation_pct,notes\nABC,2026-03-15,SPLIT,1,5,,,Face value 10 -> 2\n",
  securities: "symbol,name,isin,asset_type,sector,industry,market_cap_cr,market_cap_as_of\n",
  fundamentals: "symbol,as_of,source,rev_FY2021,rev_FY2022,rev_FY2023,rev_FY2024,rev_FY2025,rev_FY2026,ttm_revenue,ttm_net_profit,pe,roce,roe,debt_equity,interest_coverage,ocf,fcf,op_margin,net_margin,ev_ebitda,ps,pb,promoter_pct,pledge_pct_of_promoter,promoter_2025Q3,promoter_2026Q2,website,website_quality\n",
};
