/** Pure Kite Connect auth helpers (no I/O). */
import crypto from "node:crypto";

export const KITE_LOGIN = "https://kite.zerodha.com/connect/login";

/** checksum = SHA-256 hex of api_key + request_token + api_secret (Kite Connect v3 /session/token). */
export function checksum(apiKey: string, requestToken: string, apiSecret: string): string {
  return crypto.createHash("sha256").update(apiKey + requestToken + apiSecret).digest("hex");
}

export function loginUrl(apiKey: string, state: string): string {
  return `${KITE_LOGIN}?v=3&api_key=${encodeURIComponent(apiKey)}&redirect_params=${encodeURIComponent("state=" + state)}`;
}

/** Kite access tokens expire at ~06:00 IST the next morning. Returns the next 06:00 IST after `now`. */
export function tokenExpiry(now = new Date()): Date {
  const ist = new Date(now.getTime() + 5.5 * 3600_000);
  const six = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), 6, 0, 0) - 5.5 * 3600_000;
  return new Date(six > now.getTime() ? six : six + 86_400_000);
}
