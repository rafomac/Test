import "server-only";
import { audit, kvDelete, kvGet, kvSet, put, upsertPrices, list } from "../store/db";
import { decrypt, encrypt } from "../security/crypto";
import { kite, kiteConfig, KiteError, tokenExpiry } from "../kite/client";
import type { HoldingsSnapshot, SnapshotItem, Trade } from "../types";
import { ensureSecurities, getSettings, invalidate, recordCompliance } from "./repo";
import { inferAssetType } from "../engine/classify";
import { addDays, todayIST } from "../engine/dates";

interface StoredSession { tokenEnc: string; userId: string; userName: string; loginTime: string; expiresAt: string }

export function kiteStatus() {
  const cfg = kiteConfig();
  const raw = kvGet("kite_session");
  const sess = raw ? (JSON.parse(raw) as StoredSession) : null;
  const valid = !!sess && new Date(sess.expiresAt).getTime() > Date.now();
  const lastSync = kvGet("kite_last_sync");
  return { configured: cfg.configured, connected: valid, userId: sess?.userId, userName: sess?.userName, expiresAt: sess?.expiresAt, expired: !!sess && !valid, lastSync: lastSync ? JSON.parse(lastSync) : null };
}

export async function completeLogin(requestToken: string) {
  const { apiKey, apiSecret } = kiteConfig();
  if (!apiKey || !apiSecret) throw new Error("KITE_API_KEY / KITE_API_SECRET not configured");
  const s = await kite.exchangeToken(apiKey, apiSecret, requestToken);
  const stored: StoredSession = { tokenEnc: encrypt(s.access_token), userId: s.user_id, userName: s.user_name, loginTime: s.login_time, expiresAt: tokenExpiry().toISOString() };
  kvSet("kite_session", JSON.stringify(stored));
  audit("kite.login", `user ${s.user_id}`); // never log the token
}

function token(): { apiKey: string; accessToken: string } {
  const { apiKey } = kiteConfig();
  const raw = kvGet("kite_session");
  if (!apiKey || !raw) throw new KiteError("Not connected to Kite", 401);
  const sess = JSON.parse(raw) as StoredSession;
  if (new Date(sess.expiresAt).getTime() <= Date.now()) throw new KiteError("Kite session expired (tokens expire ~6 AM IST daily). Please log in again.", 403, "TokenException");
  return { apiKey, accessToken: decrypt(sess.tokenEnc) };
}

function onAuthError(e: unknown) {
  if (e instanceof KiteError && (e.status === 403 || e.errorType === "TokenException")) kvDelete("kite_session");
}

export async function logoutKite() {
  try { const t = token(); await kite.invalidate(t.apiKey, t.accessToken); } catch { /* ignore */ }
  kvDelete("kite_session");
  audit("kite.logout");
}

/** Pull holdings, MF holdings and funds; store an immutable VERIFIED snapshot. Read-only. */
export async function syncKite() {
  const t = token();
  const s = getSettings();
  try {
    const [holdings, mf, margins] = await Promise.all([
      kite.holdings(t.apiKey, t.accessToken),
      kite.mfHoldings(t.apiKey, t.accessToken).catch(() => [] as Awaited<ReturnType<typeof kite.mfHoldings>>),
      kite.margins(t.apiKey, t.accessToken).catch(() => ({} as Awaited<ReturnType<typeof kite.margins>>)),
    ]);
    const asOfDate = todayIST();
    const items: SnapshotItem[] = [
      ...holdings.map((h) => ({
        symbol: h.tradingsymbol, isin: h.isin, exchange: h.exchange, assetType: inferAssetType(h.tradingsymbol, "", s.liquidSymbols),
        // quantity + T1 (bought, not yet settled). Collateral/pledged shares remain in `quantity` on Kite.
        quantity: h.quantity + (h.t1_quantity ?? 0), averagePrice: h.average_price, lastPrice: h.last_price, pnl: h.pnl,
      })),
      ...mf.filter((m) => m.quantity > 0).map((m) => ({ symbol: m.tradingsymbol, assetType: "MF" as const, quantity: m.quantity, averagePrice: m.average_price, lastPrice: m.last_price })),
    ];
    // Known asset types from the security master win over inference
    const secs = new Map(list<{ symbol: string; assetType: SnapshotItem["assetType"] }>("securities").map((x) => [x.symbol, x.assetType]));
    for (const i of items) i.assetType = secs.get(i.symbol) ?? i.assetType;
    const snap: HoldingsSnapshot = { id: `SNAP-KITE-${Date.now()}`, takenAt: new Date().toISOString(), asOfDate, source: "KITE_API", quality: "VERIFIED", items,
      funds: margins.equity ? { cash: margins.equity.available.cash, liveBalance: margins.equity.available.live_balance, collateral: margins.equity.available.collateral, net: margins.equity.net, openingBalance: margins.equity.available.opening_balance } : undefined };
    put("snapshots", snap.id, snap);
    upsertPrices(items.map((i) => ({ symbol: i.symbol, date: asOfDate, close: i.lastPrice, source: "KITE_API" as const })));
    ensureSecurities([
      ...holdings.map((h) => ({ symbol: h.tradingsymbol, isin: h.isin, exchange: h.exchange })),
      ...mf.map((m) => ({ symbol: m.tradingsymbol, name: m.fund, assetType: "MF" as const })),
    ]);
    kvSet("kite_instruments", JSON.stringify(Object.fromEntries(holdings.map((h) => [h.tradingsymbol, h.instrument_token]))));
    const info = { at: snap.takenAt, holdings: holdings.length, mf: mf.length, cash: margins.equity?.available.cash ?? null, buyingPower: margins.equity?.net ?? null };
    kvSet("kite_last_sync", JSON.stringify(info));
    audit("kite.sync", `${holdings.length} holdings, ${mf.length} MF`);
    invalidate();
    try { recordCompliance(); } catch { /* ignore */ }
    return info;
  } catch (e) { onAuthError(e); throw e; }
}

/**
 * Daily candles for held instruments (needs a Kite Connect plan that includes historical data).
 * Fetches in ≤ 2000-day windows, paced to stay under the 3 req/s historical rate limit.
 */
export async function syncHistorical(fromDate?: string) {
  const t = token();
  const tokens: Record<string, number> = JSON.parse(kvGet("kite_instruments") ?? "{}");
  const trades = list<Trade>("trades");
  const start = fromDate ?? (trades.map((x) => x.date).sort()[0] ? addDays(trades.map((x) => x.date).sort()[0], -300) : addDays(todayIST(), -400));
  const end = todayIST();
  let points = 0;
  const errors: string[] = [];
  for (const [sym, tok] of Object.entries(tokens)) {
    for (let from = start; from <= end; from = addDays(from, 2000)) {
      const to = [addDays(from, 1999), end].sort()[0];
      try {
        const r = await kite.historical(t.apiKey, t.accessToken, tok, from, to);
        const u = upsertPrices(r.candles.map((c) => ({ symbol: sym, date: c[0].slice(0, 10), close: c[4], volume: c[5], source: "KITE_API" as const })));
        points += u.inserted + u.updated;
      } catch (e) {
        onAuthError(e);
        errors.push(`${sym}: ${(e as Error).message}`);
        if (e instanceof KiteError && e.status === 403) break;
      }
      await new Promise((res) => setTimeout(res, 400));
    }
  }
  audit("kite.historical", `${points} points, ${errors.length} errors`);
  invalidate();
  return { points, errors: errors.slice(0, 20), note: "Historical prices for symbols no longer held (closed positions) must be imported via CSV." };
}
