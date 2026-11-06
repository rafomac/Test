import "server-only";
import { NextResponse } from "next/server";

/** Same-origin check for state-changing requests (CSRF defence in depth; cookie is SameSite=Lax). */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser clients / same-origin navigations
  try { return new URL(origin).host === (req.headers.get("x-forwarded-host") ?? req.headers.get("host")); } catch { return false; }
}

export function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

/** Error message safe to show (never includes tokens). */
export function errMsg(e: unknown) {
  const m = e instanceof Error ? e.message : String(e);
  return m.replace(/token\s+[\w:]+/gi, "token [redacted]").slice(0, 300);
}
