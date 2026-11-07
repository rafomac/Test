/**
 * Parsers for official exchange end-of-day "bhavcopy" files (free, public, unauthenticated):
 *
 *  NSE_FULL   sec_bhavdata_full_DDMMYYYY.csv  — SYMBOL, SERIES, DATE1, CLOSE_PRICE, TTL_TRD_QNTY, TURNOVER_LACS, DELIV_PER …
 *  NSE_CM     cmDDMONYYYYbhav.csv (legacy)    — SYMBOL, SERIES, CLOSE, TOTTRDQTY, TOTTRDVAL, TIMESTAMP, ISIN
 *  UDIFF      BhavCopy_{NSE|BSE}_CM_0_0_0_YYYYMMDD_F_0000.csv (NSE/BSE since 2024) — TradDt, ISIN, TckrSymb, SctySrs, ClsPric, TtlTradgVol, TtlTrfVal
 *  BSE_OLD    EQ_ISINCODE_DDMMYY.csv (legacy BSE) — SC_CODE, SC_NAME, CLOSE, NO_OF_SHRS, NET_TURNOV, ISIN_CODE, TRADING_DATE
 *
 * Bhavcopy closes are ACTUAL (unadjusted) prices — exactly what the position ledger needs, because it
 * replays real share counts and applies splits/bonuses itself.
 */
import Papa from "papaparse";
import { unzipSync, strFromU8 } from "fflate";
import { parseDate } from "../engine/dates";
import type { PricePoint } from "../types";

export type BhavFormat = "NSE_FULL" | "NSE_CM" | "UDIFF" | "BSE_OLD";

export interface BhavRow {
  exchange: "NSE" | "BSE";
  symbol: string;
  isin?: string;
  series?: string;
  date: string;
  close: number;
  volume?: number;
  tradedValue?: number;
  deliveryPct?: number;
}

/** NSE series we keep: equity, trade-for-trade, SME. (ETFs such as Liquid BeES trade in EQ.) */
const NSE_SERIES = new Set(["EQ", "BE", "BZ", "BL", "SM", "ST", "SZ", "IT"]);
export const SME_SERIES = new Set(["SM", "ST", "SZ"]);

const num = (v: unknown) => {
  const s = String(v ?? "").trim().replace(/,/g, "");
  if (!s || s === "-") return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
};

/** Dates such as 05-Nov-2024, 05-NOV-2024, 2024-11-05, 05-Nov-24 (two-digit year → 20yy). */
function bhavDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  const m = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2})$/);
  if (m) return parseDate(`${m[1]}-${m[2]}-20${m[3]}`);
  return parseDate(s);
}

/** Date from a bhavcopy filename, used when rows carry none. */
export function dateFromFileName(name: string): string | null {
  let m = name.match(/(\d{4})(\d{2})(\d{2})_F_/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = name.match(/sec_bhavdata_full_(\d{2})(\d{2})(\d{4})/i);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = name.match(/EQ_ISINCODE_(\d{2})(\d{2})(\d{2})/i);
  if (m) return `20${m[3]}-${m[2]}-${m[1]}`;
  m = name.match(/cm(\d{2})([A-Za-z]{3})(\d{4})bhav/i);
  if (m) return parseDate(`${m[1]}-${m[2]}-${m[3]}`);
  return null;
}

export function detectFormat(header: string[]): BhavFormat | null {
  const h = new Set(header.map((x) => x.trim().toUpperCase()));
  if (h.has("TRADDT") && h.has("CLSPRIC")) return "UDIFF";
  if (h.has("CLOSE_PRICE") && h.has("DATE1")) return "NSE_FULL";
  if (h.has("SC_CODE") && h.has("CLOSE")) return "BSE_OLD";
  if (h.has("SYMBOL") && h.has("CLOSE") && h.has("TOTTRDQTY")) return "NSE_CM";
  return null;
}

export interface BhavParse { format: BhavFormat | null; exchange?: "NSE" | "BSE"; rows: BhavRow[]; skipped: number; date: string | null }

export function parseBhavcopy(text: string, fileName = ""): BhavParse {
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim().toUpperCase() });
  const header = parsed.meta.fields ?? [];
  const format = detectFormat(header);
  const fileDate = dateFromFileName(fileName);
  const rows: BhavRow[] = [];
  let skipped = 0;
  if (!format) return { format, rows, skipped: parsed.data.length, date: fileDate };
  const isBse = format === "BSE_OLD" || (format === "UDIFF" && /BSE/i.test(fileName)) || (format === "UDIFF" && parsed.data[0]?.SRC?.trim().toUpperCase() === "BSE");
  const exchange: "NSE" | "BSE" = isBse ? "BSE" : "NSE";
  for (const r0 of parsed.data) {
    const r: Record<string, string> = {};
    for (const [k, v] of Object.entries(r0)) r[k] = typeof v === "string" ? v.trim() : v;
    let row: BhavRow | null = null;
    if (format === "NSE_FULL") {
      const series = r.SERIES?.toUpperCase();
      if (!series || !NSE_SERIES.has(series)) { skipped++; continue; }
      const turnoverLacs = num(r.TURNOVER_LACS);
      row = { exchange, symbol: r.SYMBOL?.toUpperCase(), series, date: bhavDate(r.DATE1) ?? fileDate ?? "", close: num(r.CLOSE_PRICE) ?? NaN, volume: num(r.TTL_TRD_QNTY), tradedValue: turnoverLacs !== undefined ? turnoverLacs * 1e5 : undefined, deliveryPct: num(r.DELIV_PER) };
    } else if (format === "NSE_CM") {
      const series = r.SERIES?.toUpperCase();
      if (!series || !NSE_SERIES.has(series)) { skipped++; continue; }
      row = { exchange, symbol: r.SYMBOL?.toUpperCase(), isin: r.ISIN || undefined, series, date: bhavDate(r.TIMESTAMP) ?? fileDate ?? "", close: num(r.CLOSE) ?? NaN, volume: num(r.TOTTRDQTY), tradedValue: num(r.TOTTRDVAL) };
    } else if (format === "UDIFF") {
      if (r.FININSTRMTP && !["STK", "ETF", ""].includes(r.FININSTRMTP.toUpperCase())) { skipped++; continue; }
      const series = r.SCTYSRS?.toUpperCase();
      if (exchange === "NSE" && series && !NSE_SERIES.has(series)) { skipped++; continue; }
      row = { exchange, symbol: r.TCKRSYMB?.toUpperCase(), isin: r.ISIN || undefined, series, date: bhavDate(r.TRADDT) ?? fileDate ?? "", close: num(r.CLSPRIC) ?? NaN, volume: num(r.TTLTRADGVOL), tradedValue: num(r.TTLTRFVAL) };
    } else {
      row = { exchange, symbol: (r.SC_NAME ?? r.SC_CODE)?.toUpperCase(), isin: r.ISIN_CODE || undefined, series: r.SC_GROUP, date: bhavDate(r.TRADING_DATE) ?? fileDate ?? "", close: num(r.CLOSE) ?? NaN, volume: num(r.NO_OF_SHRS), tradedValue: num(r.NET_TURNOV) };
    }
    if (!row.symbol || !row.date || !(row.close > 0)) { skipped++; continue; }
    rows.push(row);
  }
  return { format, exchange, rows, skipped, date: rows[0]?.date ?? fileDate };
}

/** Expand an uploaded file: CSV text, or a ZIP containing one or more CSVs. */
export function expandFile(name: string, bytes: Uint8Array): { name: string; text: string }[] {
  if (/\.zip$/i.test(name) || (bytes[0] === 0x50 && bytes[1] === 0x4b)) {
    const files = unzipSync(bytes);
    return Object.entries(files).filter(([n]) => /\.csv$/i.test(n)).map(([n, b]) => ({ name: n, text: strFromU8(b) }));
  }
  return [{ name, text: strFromU8(bytes) }];
}

export interface UniverseItem { symbol: string; isin?: string; exchange?: string }

/**
 * Map exchange rows onto the portfolio's own symbols. ISIN match first (works across NSE/BSE symbol
 * differences), then NSE symbol, then BSE symbol for BSE-listed holdings. When both exchanges price the
 * same security on the same day, NSE wins.
 */
export function matchRows(rows: BhavRow[], universe: UniverseItem[]): { points: PricePoint[]; matched: Set<string>; delivery: Map<string, { date: string; pct: number }[]>; sme: Set<string> } {
  const byIsin = new Map<string, string>(), byNse = new Map<string, string>(), byBse = new Map<string, string>();
  for (const u of universe) {
    if (u.isin) byIsin.set(u.isin.toUpperCase(), u.symbol);
    if (u.exchange === "BSE") byBse.set(u.symbol.toUpperCase(), u.symbol); else byNse.set(u.symbol.toUpperCase(), u.symbol);
  }
  const chosen = new Map<string, { row: BhavRow; sym: string }>();
  const delivery = new Map<string, { date: string; pct: number }[]>();
  const sme = new Set<string>();
  for (const r of rows) {
    const sym = (r.isin && byIsin.get(r.isin.toUpperCase())) || (r.exchange === "NSE" ? byNse.get(r.symbol) : byBse.get(r.symbol) ?? byNse.get(r.symbol));
    if (!sym) continue;
    const key = `${sym}@${r.date}`;
    const ex = chosen.get(key);
    if (ex && ex.row.exchange === "NSE" && r.exchange === "BSE") continue;
    if (ex && ex.row.exchange === r.exchange && ex.row.series === "EQ") continue; // prefer EQ series row
    chosen.set(key, { row: r, sym });
    if (r.series && SME_SERIES.has(r.series) && r.exchange === "NSE") sme.add(sym);
  }
  for (const { row, sym } of chosen.values()) if (row.deliveryPct !== undefined) { const a = delivery.get(sym) ?? []; a.push({ date: row.date, pct: row.deliveryPct }); delivery.set(sym, a); }
  const points: PricePoint[] = [...chosen.values()].map(({ row, sym }) => ({ symbol: sym, date: row.date, close: row.close, volume: row.volume, source: row.exchange === "NSE" ? "NSE_BHAVCOPY" : "BSE_BHAVCOPY" }));
  return { points, matched: new Set([...chosen.values()].map((x) => x.sym)), delivery, sme };
}

// ---------------- Download URLs (public exchange archives) ----------------
export function nseFullUrl(date: string): string[] {
  const [y, m, d] = date.split("-");
  const f = `sec_bhavdata_full_${d}${m}${y}.csv`;
  return [`https://nsearchives.nseindia.com/products/content/${f}`, `https://archives.nseindia.com/products/content/${f}`];
}
export function bseUrl(date: string): string {
  const [y, m, d] = date.split("-");
  // BSE publishes the UDiFF CSV from 2024 onwards; earlier days use the legacy zipped EQ_ISINCODE file.
  return date >= "2024-01-01" ? `https://www.bseindia.com/download/BhavCopy/Equity/BhavCopy_BSE_CM_0_0_0_${y}${m}${d}_F_0000.CSV` : `https://www.bseindia.com/download/BhavCopy/Equity/EQ_ISINCODE_${d}${m}${y.slice(2)}.zip`;
}
