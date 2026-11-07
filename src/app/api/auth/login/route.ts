import { NextResponse } from "next/server";
import { verifyPassword } from "@/lib/security/crypto";
import { issueSession, SESSION_COOKIE, SESSION_TTL_S } from "@/lib/security/session";
import { rateLimit } from "@/lib/security/ratelimit";
import { bad, isHttps, sameOrigin } from "@/lib/server/http";
import { audit } from "@/lib/store/db";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return bad("Bad origin", 403);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  const rl = rateLimit("login:" + ip, 5, 15 * 60_000);
  if (!rl.ok) return bad(`Too many attempts. Retry in ${rl.retryAfterS}s.`, 429);
  const form = await req.formData();
  const pw = String(form.get("password") ?? "");
  const hash = process.env.APP_PASSWORD_HASH;
  if (!hash || !verifyPassword(pw, hash)) { audit("auth.fail", ip); return bad("Invalid password", 401); }
  audit("auth.ok", ip);
  const next = String(form.get("next") ?? "/");
  const res = NextResponse.redirect(new URL(next.startsWith("/") && !next.startsWith("//") ? next : "/", req.url), 303);
  res.cookies.set(SESSION_COOKIE, issueSession(), { httpOnly: true, secure: isHttps(req), sameSite: "lax", path: "/", maxAge: SESSION_TTL_S });
  return res;
}
