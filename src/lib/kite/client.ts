/**
 * Minimal READ-ONLY Kite Connect v3 client.
 *
 * Deliberately implements only: session exchange/invalidate, profile, holdings, positions,
 * margins, MF holdings, MF orders, instruments (for tokens) and historical candles.
 * There is NO order placement, modification, cancellation, GTT, fund transfer or alert code.
 *
 * Authentication (per Kite Connect docs):
 *   1. Redirect user to https://kite.zerodha.com/connect/login?v=3&api_key=API_KEY
 *   2. Zerodha redirects back to the registered URL with ?request_token=…&status=success
 *   3. Server POSTs /session/token with checksum = SHA-256(api_key + request_token + api_secret)
 *   4. access_token is valid until ~6:00 AM IST the next day; there is no refresh token for
 *      individual apps, so the user must log in again daily.
 */
import "server-only";
import { checksum } from "./auth";
export { checksum, loginUrl, tokenExpiry, KITE_LOGIN } from "./auth";

const ROOT = process.env.KITE_API_ROOT || "https://api.kite.trade";

export class KiteError extends Error {
  constructor(message: string, public status: number, public errorType?: string) { super(message); }
}

export function kiteConfig() {
  const apiKey = process.env.KITE_API_KEY;
  const apiSecret = process.env.KITE_API_SECRET;
  return { apiKey, apiSecret, configured: Boolean(apiKey && apiSecret) };
}

async function call<T>(method: "GET" | "POST" | "DELETE", path: string, opts: { apiKey: string; accessToken?: string; form?: Record<string, string>; query?: Record<string, string> }): Promise<T> {
  const url = new URL(ROOT + path);
  for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);
  const headers: Record<string, string> = { "X-Kite-Version": "3" };
  if (opts.accessToken) headers.Authorization = `token ${opts.apiKey}:${opts.accessToken}`;
  let body: string | undefined;
  if (opts.form) { headers["Content-Type"] = "application/x-www-form-urlencoded"; body = new URLSearchParams(opts.form).toString(); }
  const res = await fetch(url, { method, headers, body, cache: "no-store" });
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("json")) {
    if (!res.ok) throw new KiteError(`Kite HTTP ${res.status}`, res.status);
    return (await res.text()) as unknown as T;
  }
  const j = (await res.json()) as { status: string; data?: T; message?: string; error_type?: string };
  if (!res.ok || j.status !== "success") throw new KiteError(j.message || `Kite HTTP ${res.status}`, res.status, j.error_type);
  return j.data as T;
}

export interface KiteHolding {
  tradingsymbol: string; exchange: string; instrument_token: number; isin: string; product: string;
  quantity: number; t1_quantity: number; realised_quantity?: number; collateral_quantity?: number; used_quantity?: number;
  average_price: number; last_price: number; close_price: number; pnl: number; day_change: number; day_change_percentage: number;
}
export interface KiteMfHolding { folio: string; fund: string; tradingsymbol: string; average_price: number; last_price: number; last_price_date?: string; pnl: number; quantity: number }
export interface KiteMargins { equity?: { net: number; available: { cash: number; live_balance: number; opening_balance: number; collateral: number } } }

export const kite = {
  exchangeToken: (apiKey: string, apiSecret: string, requestToken: string) =>
    call<{ user_id: string; user_name: string; access_token: string; login_time: string }>("POST", "/session/token", { apiKey, form: { api_key: apiKey, request_token: requestToken, checksum: checksum(apiKey, requestToken, apiSecret) } }),
  invalidate: (apiKey: string, accessToken: string) => call<boolean>("DELETE", "/session/token", { apiKey, query: { api_key: apiKey, access_token: accessToken } }),
  profile: (apiKey: string, accessToken: string) => call<{ user_id: string; user_name: string; email?: string }>("GET", "/user/profile", { apiKey, accessToken }),
  holdings: (apiKey: string, accessToken: string) => call<KiteHolding[]>("GET", "/portfolio/holdings", { apiKey, accessToken }),
  positions: (apiKey: string, accessToken: string) => call<{ net: unknown[]; day: unknown[] }>("GET", "/portfolio/positions", { apiKey, accessToken }),
  margins: (apiKey: string, accessToken: string) => call<KiteMargins>("GET", "/user/margins", { apiKey, accessToken }),
  mfHoldings: (apiKey: string, accessToken: string) => call<KiteMfHolding[]>("GET", "/mf/holdings", { apiKey, accessToken }),
  /** Daily candles; Kite limits day-interval requests to ~2000 days per call. Requires a plan with historical data. */
  historical: (apiKey: string, accessToken: string, token: number, from: string, to: string) =>
    call<{ candles: [string, number, number, number, number, number][] }>("GET", `/instruments/historical/${token}/day`, { apiKey, accessToken, query: { from, to } }),
};
