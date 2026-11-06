/**
 * Server-only persistence on SQLite (Node's built-in node:sqlite, no native build step).
 * Records are stored as JSON documents per collection. Snapshots are append-only.
 * Upserts never silently overwrite a different existing record: they create a Conflict instead.
 *
 * The schema is intentionally simple so it maps 1:1 onto PostgreSQL (jsonb) — see docs/ARCHITECTURE.md.
 */
import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { Conflict, ImportLog, PricePoint } from "../types";

type SqliteMod = typeof import("node:sqlite");
type DB = InstanceType<SqliteMod["DatabaseSync"]>;

let db: DB | null = null;

/**
 * DATA_MODE=live (default) uses data/portfolio.db and NEVER accepts synthetic data.
 * DATA_MODE=demo uses a separate data/demo.db and refuses broker connections and real imports.
 */
export function dataMode(): "live" | "demo" {
  return process.env.DATA_MODE === "demo" ? "demo" : "live";
}
export function dbFile(): string {
  const dir = process.env.DATA_DIR || path.join(process.cwd(), "data");
  return process.env.DB_FILE || path.join(dir, dataMode() === "demo" ? "demo.db" : "portfolio.db");
}

export function getDb(): DB {
  if (db) return db;
  // process.getBuiltinModule avoids bundler resolution of the node:sqlite builtin.
  const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as SqliteMod;
  const file = dbFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS docs (collection TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (collection, id));
    CREATE TABLE IF NOT EXISTS prices (symbol TEXT NOT NULL, date TEXT NOT NULL, close REAL NOT NULL, volume REAL, source TEXT NOT NULL, PRIMARY KEY (symbol, date));
    CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, action TEXT NOT NULL, detail TEXT);
  `);
  return db;
}

export type Collection = "trades" | "cash" | "actions" | "securities" | "fundamentals" | "research" | "snapshots" | "imports" | "conflicts";

export function list<T>(collection: Collection): T[] {
  const rows = getDb().prepare("SELECT data FROM docs WHERE collection = ? ORDER BY id").all(collection) as { data: string }[];
  return rows.map((r) => JSON.parse(r.data) as T);
}

export function getDoc<T>(collection: Collection, id: string): T | undefined {
  const r = getDb().prepare("SELECT data FROM docs WHERE collection = ? AND id = ?").get(collection, id) as { data: string } | undefined;
  return r ? (JSON.parse(r.data) as T) : undefined;
}

/** Unconditional write — only for user-edited reference data (securities, research, settings). */
export function put<T extends { id?: string; symbol?: string }>(collection: Collection, id: string, doc: T) {
  getDb().prepare("INSERT INTO docs (collection, id, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at").run(collection, id, JSON.stringify(doc), new Date().toISOString());
}

export function remove(collection: Collection, id: string) {
  getDb().prepare("DELETE FROM docs WHERE collection = ? AND id = ?").run(collection, id);
}

function stable(o: unknown): string {
  if (o === null || typeof o !== "object") return JSON.stringify(o);
  if (Array.isArray(o)) return "[" + o.map(stable).join(",") + "]";
  return "{" + Object.keys(o as object).sort().filter((k) => (o as Record<string, unknown>)[k] !== undefined).map((k) => JSON.stringify(k) + ":" + stable((o as Record<string, unknown>)[k])).join(",") + "}";
}

/** Insert new records; identical duplicates are skipped; differing records with the same id become Conflicts. */
export function insertMany<T extends { id: string }>(collection: Collection, records: T[], compareIgnore: string[] = []) {
  const d = getDb();
  const sel = d.prepare("SELECT data FROM docs WHERE collection = ? AND id = ?");
  const ins = d.prepare("INSERT INTO docs (collection, id, data, updated_at) VALUES (?, ?, ?, ?)");
  let inserted = 0, duplicates = 0, conflicts = 0;
  const now = new Date().toISOString();
  const strip = (x: object) => Object.fromEntries(Object.entries(x).filter(([k]) => !compareIgnore.includes(k)));
  d.exec("BEGIN");
  try {
    for (const r of records) {
      const ex = sel.get(collection, r.id) as { data: string } | undefined;
      if (!ex) { ins.run(collection, r.id, JSON.stringify(r), now); inserted++; continue; }
      const existing = JSON.parse(ex.data);
      if (stable(strip(existing)) === stable(strip(r))) { duplicates++; continue; }
      const c: Conflict = { id: `${collection}:${r.id}:${now}`, at: now, entity: collection, key: r.id, existing, incoming: r, status: "open" };
      ins.run("conflicts", c.id, JSON.stringify(c), now);
      conflicts++;
    }
    d.exec("COMMIT");
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
  return { inserted, duplicates, conflicts };
}

export function resolveConflict(id: string, action: "kept-existing" | "accepted-incoming") {
  const c = getDoc<Conflict>("conflicts", id);
  if (!c || c.status !== "open") return false;
  if (action === "accepted-incoming") put(c.entity as Collection, c.key, c.incoming as { id: string });
  put("conflicts", id, { ...c, status: action });
  audit("conflict." + action, `${c.entity}:${c.key}`);
  return true;
}

export function upsertPrices(points: PricePoint[]) {
  const d = getDb();
  const sel = d.prepare("SELECT close, source FROM prices WHERE symbol = ? AND date = ?");
  const up = d.prepare("INSERT INTO prices (symbol, date, close, volume, source) VALUES (?, ?, ?, ?, ?) ON CONFLICT(symbol, date) DO UPDATE SET close = excluded.close, volume = excluded.volume, source = excluded.source");
  let inserted = 0, updated = 0, flagged = 0;
  d.exec("BEGIN");
  try {
    for (const p of points) {
      const ex = sel.get(p.symbol, p.date) as { close: number; source: string } | undefined;
      if (ex && Math.abs(ex.close / p.close - 1) > 0.01 && ex.source !== p.source) {
        // Material disagreement between sources: keep existing, record conflict.
        const now = new Date().toISOString();
        const c: Conflict = { id: `prices:${p.symbol}:${p.date}:${now}`, at: now, entity: "prices", key: `${p.symbol}@${p.date}`, existing: ex, incoming: p, status: "open" };
        d.prepare("INSERT INTO docs (collection, id, data, updated_at) VALUES ('conflicts', ?, ?, ?)").run(c.id, JSON.stringify(c), now);
        flagged++;
        continue;
      }
      up.run(p.symbol, p.date, p.close, p.volume ?? null, p.source);
      ex ? updated++ : inserted++;
    }
    d.exec("COMMIT");
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
  return { inserted, updated, flagged };
}

export function listPrices(symbol?: string): PricePoint[] {
  const q = symbol
    ? getDb().prepare("SELECT symbol, date, close, volume, source FROM prices WHERE symbol = ? ORDER BY date").all(symbol)
    : getDb().prepare("SELECT symbol, date, close, volume, source FROM prices ORDER BY symbol, date").all();
  return (q as unknown as PricePoint[]).map((p) => ({ ...p, volume: p.volume ?? undefined }));
}

export function priceCoverage(): { symbol: string; first: string; last: string; n: number }[] {
  return getDb().prepare("SELECT symbol, MIN(date) AS first, MAX(date) AS last, COUNT(*) AS n FROM prices GROUP BY symbol ORDER BY symbol").all() as { symbol: string; first: string; last: string; n: number }[];
}

export function kvGet(key: string): string | undefined {
  const r = getDb().prepare("SELECT value FROM kv WHERE key = ?").get(key) as { value: string } | undefined;
  return r?.value;
}
export function kvSet(key: string, value: string) {
  getDb().prepare("INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").run(key, value, new Date().toISOString());
}
export function kvDelete(key: string) {
  getDb().prepare("DELETE FROM kv WHERE key = ?").run(key);
}

/** Audit trail. Never pass secrets or tokens here. */
export function audit(action: string, detail = "") {
  getDb().prepare("INSERT INTO audit (at, action, detail) VALUES (?, ?, ?)").run(new Date().toISOString(), action, detail.slice(0, 500));
}
export function listAudit(limit = 200) {
  return getDb().prepare("SELECT at, action, detail FROM audit ORDER BY id DESC LIMIT ?").all(limit) as { at: string; action: string; detail: string }[];
}

export function logImport(l: ImportLog) {
  put("imports", l.id, l);
}

/** Delete everything with a given source tag (used to remove the synthetic sample). */
export function purgeSource(source: string) {
  const d = getDb();
  const rows = d.prepare("SELECT collection, id, data FROM docs").all() as { collection: string; id: string; data: string }[];
  let n = 0;
  for (const r of rows) {
    const doc = JSON.parse(r.data);
    if (doc.source === source) { d.prepare("DELETE FROM docs WHERE collection = ? AND id = ?").run(r.collection, r.id); n++; }
  }
  n += Number(d.prepare("DELETE FROM prices WHERE source = ?").run(source).changes);
  return n;
}

export function wipeAll() {
  getDb().exec("DELETE FROM docs; DELETE FROM prices; DELETE FROM kv WHERE key NOT LIKE 'settings%';");
}

/** Consistent online backup (SQLite VACUUM INTO). Returns the backup path. */
export function backupDb(label = "backup"): string {
  const file = dbFile();
  const out = file.replace(/\.db$/, "") + `.${label}-${new Date().toISOString().replace(/[:.]/g, "-")}.db`;
  getDb().exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`);
  audit("db.backup", path.basename(out));
  return out;
}

export interface SyntheticInventory { securities: number; trades: number; cash: number; fundamentals: number; research: number; snapshots: number; other: number; prices: number; priceSymbols: number; benchmarkSeries: number; total: number }

export function syntheticInventory(source = "SYNTHETIC_SAMPLE"): SyntheticInventory {
  const d = getDb();
  const rows = d.prepare("SELECT collection, data FROM docs").all() as { collection: string; data: string }[];
  const inv: SyntheticInventory = { securities: 0, trades: 0, cash: 0, fundamentals: 0, research: 0, snapshots: 0, other: 0, prices: 0, priceSymbols: 0, benchmarkSeries: 0, total: 0 };
  for (const r of rows) {
    const doc = JSON.parse(r.data);
    const synthetic = doc.source === source || doc.quality === "SYNTHETIC" || (r.collection === "fundamentals" && /SYNTHETIC/i.test(String(doc.source))) || (typeof doc.symbol === "string" && /^ZZ/.test(doc.symbol) && r.collection === "research");
    if (!synthetic) continue;
    if (r.collection in inv) (inv as unknown as Record<string, number>)[r.collection]++; else inv.other++;
  }
  const p = d.prepare("SELECT COUNT(*) AS n, COUNT(DISTINCT symbol) AS s, COUNT(DISTINCT CASE WHEN symbol LIKE 'IDX:%' THEN symbol END) AS b FROM prices WHERE source = ?").get(source) as { n: number; s: number; b: number };
  inv.prices = p.n; inv.priceSymbols = p.s; inv.benchmarkSeries = p.b;
  inv.total = inv.securities + inv.trades + inv.cash + inv.fundamentals + inv.research + inv.snapshots + inv.other + inv.prices;
  return inv;
}

/** Remove synthetic records (incl. fundamentals/research tagged synthetic). Settings are preserved. */
export function purgeSynthetic(source = "SYNTHETIC_SAMPLE") {
  const d = getDb();
  const rows = d.prepare("SELECT collection, id, data FROM docs").all() as { collection: string; id: string; data: string }[];
  let n = 0;
  d.exec("BEGIN");
  try {
    for (const r of rows) {
      const doc = JSON.parse(r.data);
      const synthetic = doc.source === source || doc.quality === "SYNTHETIC" || (r.collection === "fundamentals" && /SYNTHETIC/i.test(String(doc.source))) || (r.collection === "research" && typeof doc.symbol === "string" && /^ZZ/.test(doc.symbol));
      if (synthetic) { d.prepare("DELETE FROM docs WHERE collection = ? AND id = ?").run(r.collection, r.id); n++; }
    }
    n += Number(d.prepare("DELETE FROM prices WHERE source = ?").run(source).changes);
    d.exec("COMMIT");
  } catch (e) { d.exec("ROLLBACK"); throw e; }
  audit("synthetic.purge", String(n));
  return n;
}
