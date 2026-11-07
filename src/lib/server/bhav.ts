import "server-only";
import { audit, getDb, kvGet, kvSet, list, put, upsertPrices } from "../store/db";
import { expandFile, matchRows, nseFullUrl, bseUrl, parseBhavcopy, type BhavRow, type UniverseItem } from "../import/bhavcopy";
import { invalidate, loadData } from "./repo";
import { addDays, todayIST } from "../engine/dates";
import type { Security } from "../types";

const SUPERSEDES = ["KITE_API", "KITE_HOLDINGS_CSV", "CONSOLE_HOLDINGS"];

/** Every security the portfolio has ever touched (trades, snapshots, security master) — except MFs/indices. */
export function universe(): UniverseItem[] {
  const d = loadData();
  const m = new Map<string, UniverseItem>();
  const add = (symbol: string, isin?: string, exchange?: string) => {
    if (!symbol || symbol.startsWith("IDX:") || /^INF[A-Z0-9]{9}$/.test(symbol)) return;
    const e = m.get(symbol) ?? { symbol };
    e.isin = e.isin ?? isin; e.exchange = e.exchange ?? exchange;
    m.set(symbol, e);
  };
  for (const s of d.securities) if (s.assetType !== "MF") add(s.symbol, s.isin, s.exchange);
  for (const t of d.trades) add(t.symbol, t.isin, t.exchange);
  for (const sn of d.snapshots) for (const i of sn.items) if (i.assetType !== "MF") add(i.symbol, i.isin, i.exchange);
  return [...m.values()];
}

/** Store matched prices; refresh delivery % (20-session average) and SME flags in the security master. */
export function storeBhavRows(rows: BhavRow[], uni: UniverseItem[] = universe()) {
  const { points, matched, delivery, sme } = matchRows(rows, uni);
  const res = upsertPrices(points, { supersedes: SUPERSEDES });
  const secs = new Map(list<Security>("securities").map((s) => [s.symbol, s]));
  for (const [sym, arr] of delivery) {
    const allDel = [...(JSON.parse(kvGet(`deliv:${sym}`) ?? "[]") as { date: string; pct: number }[]), ...arr];
    const byDate = new Map(allDel.map((x) => [x.date, x.pct]));
    const last20 = [...byDate].sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(-20);
    kvSet(`deliv:${sym}`, JSON.stringify(last20.map(([date, pct]) => ({ date, pct }))));
    const sec = secs.get(sym);
    if (sec && last20.length) put("securities", sym, { ...sec, deliveryPct: Math.round((last20.reduce((s, [, p]) => s + p, 0) / last20.length) * 10) / 10, updatedAt: new Date().toISOString() });
  }
  for (const sym of sme) { const sec = secs.get(sym); if (sec && !sec.isSME) put("securities", sym, { ...sec, isSME: true, updatedAt: new Date().toISOString() }); }
  return { ...res, matchedSymbols: matched.size, rows: rows.length, universe: uni.length, unmatched: uni.filter((u) => !matched.has(u.symbol)).map((u) => u.symbol) };
}

/** Manual upload: any number of CSV/ZIP bhavcopy files. */
export function importBhavFiles(files: { name: string; bytes: Uint8Array }[]) {
  const all: BhavRow[] = [];
  const perFile: { name: string; format: string | null; date: string | null; rows: number }[] = [];
  for (const f of files) for (const x of expandFile(f.name, f.bytes)) {
    const p = parseBhavcopy(x.text, x.name);
    perFile.push({ name: x.name, format: p.format, date: p.date, rows: p.rows.length });
    all.push(...p.rows);
  }
  const r = storeBhavRows(all);
  audit("import.bhavcopy", `${perFile.length} file(s), ${r.inserted + r.updated} prices`);
  invalidate();
  return { files: perFile, ...r };
}

// ---------------- One-click downloader (background job, polite rate limit) ----------------
export interface BhavJob { id: string; status: "running" | "done" | "cancelled" | "error"; from: string; to: string; totalDays: number; doneDays: number; filesFound: number; holidays: number; failedDays: number; pricesStored: number; superseded: number; bseDays: number; errors: string[]; unmatched: string[]; startedAt: string; finishedAt?: string; message?: string }

let job: BhavJob | null = null;
let cancel = false;
export type Fetcher = (url: string) => Promise<{ status: number; bytes: Uint8Array }>;

const defaultFetcher: Fetcher = async (url) => {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (personal portfolio dashboard; end-of-day bhavcopy)", Accept: "text/csv,application/zip,*/*" }, signal: AbortSignal.timeout(20_000), cache: "no-store" });
  return { status: res.status, bytes: new Uint8Array(await res.arrayBuffer()) };
};

function weekdays(from: string, to: string) {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) { const w = new Date(d + "T00:00:00Z").getUTCDay(); if (w !== 0 && w !== 6) out.push(d); }
  return out;
}

export function jobStatus() { return job; }
export function cancelJob() { cancel = true; }

/** Default window: 300 days before the first trade (enough for a 200-day average) up to today. */
export function defaultRange(): { from: string; to: string } {
  const first = loadData().trades.map((t) => t.date).sort()[0];
  return { from: first ? addDays(first, -300) : addDays(todayIST(), -400), to: todayIST() };
}

export function startDownload(opts: { from?: string; to?: string; includeBse?: boolean; delayMs?: number; fetcher?: Fetcher } = {}): BhavJob {
  if (job?.status === "running") return job;
  const r = defaultRange();
  const from = opts.from ?? r.from, to = opts.to ?? r.to;
  const fetcher = opts.fetcher ?? defaultFetcher;
  const delay = opts.delayMs ?? 700;
  const doneKey = "bhav_done_dates";
  const done = new Set<string>(JSON.parse(kvGet(doneKey) ?? "[]"));
  // Re-check the latest week each run (files can be published late).
  const recent = addDays(todayIST(), -7);
  const days = weekdays(from, to).filter((d) => !done.has(d) || d >= recent);
  job = { id: String(Date.now()), status: "running", from, to, totalDays: days.length, doneDays: 0, filesFound: 0, holidays: 0, failedDays: 0, pricesStored: 0, superseded: 0, bseDays: 0, errors: [], unmatched: [], startedAt: new Date().toISOString() };
  cancel = false;
  const j = job;
  getDb();
  const uni = universe();
  (async () => {
    let lastUnmatched: string[] = [];
    try {
      for (const d of days) {
        if (cancel) { j.status = "cancelled"; break; }
        const rows: BhavRow[] = [];
        let found = false;
        for (const url of nseFullUrl(d)) {
          try {
            const res = await fetcher(url);
            if (res.status === 200 && res.bytes.length > 100) {
              const p = parseBhavcopy(new TextDecoder().decode(res.bytes), url.split("/").pop()!);
              if (p.format) { rows.push(...p.rows); found = true; break; } // an HTML error page is not a file
            }
            if (res.status === 404) break;
          } catch (e) { if (j.errors.length < 30) j.errors.push(`${d} NSE: ${(e as Error).message}`); }
        }
        // Decide per day: fetch BSE only when some held security is not priced by today's NSE file.
        const nseMatched = found ? matchRows(rows, uni).matched : new Set<string>();
        const unmatchedToday = uni.filter((u) => !nseMatched.has(u.symbol));
        const wantBse = (opts.includeBse ?? true) && (found ? unmatchedToday.length > 0 : lastUnmatched.length > 0 || uni.some((u) => u.exchange === "BSE"));
        if (wantBse) {
          try {
            const url = bseUrl(d);
            const res = await fetcher(url);
            if (res.status === 200 && res.bytes.length > 100) {
              let ok = false;
              try { for (const x of expandFile(url.split("/").pop()!, res.bytes)) { const p = parseBhavcopy(x.text, /BSE|EQ_ISINCODE/i.test(x.name) ? x.name : "BSE_" + x.name); if (p.format) { rows.push(...p.rows); ok = true; } } } catch { /* not a valid file */ }
              if (ok) { j.bseDays++; found = true; }
            }
          } catch (e) { if (j.errors.length < 30) j.errors.push(`${d} BSE: ${(e as Error).message}`); }
          await new Promise((r2) => setTimeout(r2, delay));
        }
        if (found) {
          const res = storeBhavRows(rows, uni);
          j.filesFound++; j.pricesStored += res.inserted + res.updated; j.superseded += res.superseded;
          lastUnmatched = res.unmatched; j.unmatched = res.unmatched;
          done.add(d);
        } else if (j.errors.some((x) => x.startsWith(d))) j.failedDays++; // network failure: retried on the next run
        else { j.holidays++; done.add(d); }
        j.doneDays++;
        if (j.doneDays % 20 === 0) { kvSet(doneKey, JSON.stringify([...done])); invalidate(); }
        await new Promise((r2) => setTimeout(r2, delay));
      }
      if (j.status === "running") j.status = "done";
      if (j.filesFound === 0 && j.totalDays > 0) { j.status = "error"; j.message = "No files could be downloaded. The exchange site may be blocking requests or unreachable — download the files in a browser and upload them instead (Settings → Import → Exchange bhavcopy)."; }
    } catch (e) { j.status = "error"; j.message = (e as Error).message; }
    kvSet(doneKey, JSON.stringify([...done]));
    j.finishedAt = new Date().toISOString();
    audit("bhavcopy.download", `${j.filesFound} files, ${j.pricesStored} prices, ${j.holidays} holidays/missing, status ${j.status}`);
    invalidate();
  })();
  return job;
}
