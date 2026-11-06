import "server-only";
import { syntheticInventory, audit, getDb, insertMany, kvGet, kvSet, list, listPrices, logImport, put, upsertPrices } from "../store/db";
import type { CashEntry, CorporateAction, Fundamentals, HoldingsSnapshot, ImportLog, ResearchEntry, Security, Settings, Trade } from "../types";
import { mergeSettings } from "../settings";
import { analyse, type PortfolioAnalytics, type PortfolioData } from "../engine/portfolio";
import { todayIST } from "../engine/dates";
import {
  parseAmfi, parseCorporateActions, parseDeposits, parseDividends, parseFundamentals, parseHoldings, parseLedger, parseMfTradebook,
  parsePrices, parseSecurities, parseTradebook, parseGovernanceEvents, type ImportKind,
} from "../import/zerodha";
import { inferAssetType, withCapHistory } from "../engine/classify";

export function getSettings(): Settings {
  const raw = kvGet("settings");
  return mergeSettings(raw ? JSON.parse(raw) : undefined);
}
export function saveSettings(s: Partial<Settings>) {
  const merged = mergeSettings({ ...getSettings(), ...s });
  kvSet("settings", JSON.stringify(merged));
  audit("settings.update", Object.keys(s).join(","));
  return merged;
}

export function loadData(): PortfolioData {
  getDb();
  return {
    trades: list<Trade>("trades"),
    cash: list<CashEntry>("cash"),
    actions: list<CorporateAction>("actions"),
    securities: list<Security>("securities"),
    fundamentals: list<Fundamentals>("fundamentals"),
    research: list<ResearchEntry>("research"),
    snapshots: list<HoldingsSnapshot>("snapshots"),
    prices: listPrices(),
  };
}

let cache: { key: string; at: number; a: PortfolioAnalytics } | null = null;
export function invalidate() { cache = null; }

export function getAnalytics(asOf = todayIST()): PortfolioAnalytics {
  const s = getSettings();
  const key = asOf + JSON.stringify(s);
  if (cache && cache.key === key && Date.now() - cache.at < 60_000) return cache.a;
  const a = analyse(loadData(), s, asOf);
  cache = { key, at: Date.now(), a };
  return a;
}

export function hasSynthetic(): boolean {
  return syntheticInventory().total > 0;
}

export interface ImportOutcome extends ImportLog { conflicts: number }

export function importFile(kind: ImportKind, text: string, fileName: string, opts: { symbol?: string; asOfDate?: string } = {}): ImportOutcome {
  const s = getSettings();
  const base = { id: `${Date.now()}-${kind}`, at: new Date().toISOString(), kind, fileName };
  let rowsRead = 0, imported = 0, skipped = 0, duplicates = 0, conflicts = 0;
  let warnings: string[] = [];
  const done = () => {
    const l: ImportOutcome = { ...base, rowsRead, rowsImported: imported, rowsSkipped: skipped, duplicates, warnings, conflicts };
    logImport(l);
    audit("import." + kind, `${fileName}: ${imported} imported, ${duplicates} dup, ${conflicts} conflicts`);
    invalidate();
    return l;
  };
  const take = <T extends { id: string }>(coll: "trades" | "cash" | "actions", r: { records: T[]; rowsRead: number; skipped: unknown[]; warnings: string[] }) => {
    const res = insertMany(coll, r.records);
    rowsRead = r.rowsRead; skipped = r.skipped.length; warnings = [...r.warnings, ...(r.skipped as { row: number; reason: string }[]).slice(0, 20).map((x) => `Row ${x.row}: ${x.reason}`)];
    imported = res.inserted; duplicates = res.duplicates; conflicts = res.conflicts;
  };
  switch (kind) {
    case "tradebook": take("trades", parseTradebook(text)); break;
    case "mf_tradebook": take("trades", parseMfTradebook(text)); break;
    case "ledger": take("cash", parseLedger(text)); break;
    case "dividends": take("cash", parseDividends(text)); break;
    case "deposits": take("cash", parseDeposits(text)); break;
    case "corporate_actions": take("actions", parseCorporateActions(text)); break;
    case "holdings": {
      const r = parseHoldings(text, s.liquidSymbols);
      rowsRead = r.rowsRead; skipped = r.skipped.length; warnings = r.warnings;
      if (!r.records.length) break;
      const asOfDate = opts.asOfDate || todayIST();
      const snap: HoldingsSnapshot = { id: `SNAP-${r.source}-${asOfDate}-${Date.now()}`, takenAt: new Date().toISOString(), asOfDate, source: r.source, quality: "VERIFIED", items: r.records };
      put("snapshots", snap.id, snap);
      upsertPrices(r.records.map((i) => ({ symbol: i.symbol, date: asOfDate, close: i.lastPrice, source: r.source })));
      ensureSecurities(r.records.map((i) => ({ symbol: i.symbol, isin: i.isin, sector: i.sector, assetType: i.assetType })));
      imported = r.records.length;
      break;
    }
    case "prices": {
      const r = parsePrices(text, opts.symbol);
      rowsRead = r.rowsRead; skipped = r.skipped.length; warnings = r.warnings;
      const u = upsertPrices(r.records);
      imported = u.inserted + u.updated; conflicts = u.flagged;
      break;
    }
    case "securities": {
      const r = parseSecurities(text);
      rowsRead = r.rowsRead; skipped = r.skipped.length; warnings = r.warnings;
      const existing = new Map(list<Security>("securities").map((x) => [x.symbol, x]));
      for (const sec of r.records) {
        const ex = existing.get(sec.symbol);
        const merged = { ...ex, ...Object.fromEntries(Object.entries(sec).filter(([, v]) => v !== undefined)) } as Security;
        put("securities", sec.symbol, withCapHistory(ex, merged, merged.marketCapAsOf ?? todayIST(), "Security master import"));
      }
      imported = r.records.length;
      break;
    }
    case "amfi": {
      const r = parseAmfi(text);
      rowsRead = r.rowsRead; skipped = r.skipped.length; warnings = r.warnings;
      const secs = list<Security>("securities");
      const byIsin = new Map(r.records.filter((x) => x.isin).map((x) => [x.isin!, x]));
      const bySym = new Map(r.records.filter((x) => x.symbol).map((x) => [x.symbol!, x]));
      const listDate = opts.asOfDate || todayIST();
      for (const sec of secs) {
        const m = (sec.isin && byIsin.get(sec.isin)) || bySym.get(sec.symbol);
        if (!m) continue;
        put("securities", sec.symbol, withCapHistory(sec, { ...sec, amfiRank: m.rank, amfiCategory: m.category, amfiListDate: listDate, updatedAt: new Date().toISOString() }, listDate, "AMFI list"));
        imported++;
      }
      kvSet("amfi_list", JSON.stringify({ date: listDate, rows: r.records.length }));
      warnings.push(`${imported} of your securities matched the AMFI list (${r.records.length} rows).`);
      break;
    }
    case "governance_events": {
      const r = parseGovernanceEvents(text);
      rowsRead = r.rowsRead; skipped = r.skipped.length; warnings = [...r.warnings, ...r.skipped.slice(0, 10).map((x) => `Row ${x.row}: ${x.reason}`)];
      const fm = new Map(list<Fundamentals>("fundamentals").map((f) => [f.symbol, f]));
      for (const { symbol, event } of r.records) {
        const f = fm.get(symbol) ?? { symbol, asOf: event.date, source: "Governance events import" };
        const ev = f.governanceEvents ?? [];
        if (!ev.some((e) => e.date === event.date && e.type === event.type && e.description === event.description)) { ev.push(event); imported++; } else duplicates++;
        f.governanceEvents = ev;
        fm.set(symbol, f);
        put("fundamentals", symbol, f);
      }
      break;
    }
    case "fundamentals": {
      const r = parseFundamentals(text);
      rowsRead = r.rowsRead; skipped = r.skipped.length; warnings = r.warnings;
      const existing = new Map(list<Fundamentals>("fundamentals").map((f) => [f.symbol, f]));
      // Keep governance events across fundamentals refreshes; keep previous P/E for valuation-change alerts.
      for (const f of r.records) { const ex = existing.get(f.symbol); put("fundamentals", f.symbol, { ...f, governanceEvents: ex?.governanceEvents, previous: ex ? { asOf: ex.asOf, pe: ex.pe, ttmRevenue: ex.ttmRevenue, promoterPledgePctOfPromoter: ex.promoterPledgePctOfPromoter, promoterPledgePctOfTotal: ex.promoterPledgePctOfTotal, debt: ex.totalDebtCr } : undefined }); }
      imported = r.records.length;
      break;
    }
  }
  return done();
}

/** Create minimal security-master rows for symbols we have never seen, never overwriting user edits. */
export function ensureSecurities(items: { symbol: string; isin?: string; name?: string; sector?: string; assetType?: Security["assetType"]; exchange?: string }[]) {
  const s = getSettings();
  const existing = new Set(list<Security>("securities").map((x) => x.symbol));
  for (const i of items) {
    if (existing.has(i.symbol)) continue;
    put("securities", i.symbol, { symbol: i.symbol, isin: i.isin, name: i.name, exchange: i.exchange, sector: i.sector, assetType: i.assetType ?? inferAssetType(i.symbol, i.name, s.liquidSymbols), source: "KITE_API", updatedAt: new Date().toISOString() } satisfies Security);
  }
}
