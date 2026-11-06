/**
 * Stateless signed session cookie (HMAC-SHA256). Verification for page requests happens in
 * middleware.ts using Web Crypto; this module issues cookies on the Node side.
 */
import { hmac } from "./crypto";

export const SESSION_COOKIE = "zpi_session";
export const SESSION_TTL_S = 12 * 3600;

export function sessionSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set (>= 32 chars). Generate: openssl rand -base64 48");
  return s;
}

export function issueSession(now = Date.now()): string {
  const exp = Math.floor(now / 1000) + SESSION_TTL_S;
  const payload = `v1.${exp}`;
  return `${payload}.${hmac(payload, sessionSecret())}`;
}
