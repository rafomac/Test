import { NextResponse, type NextRequest } from "next/server";

/**
 * Every route except /login and /api/auth/login requires a valid signed session cookie.
 * If APP_PASSWORD_HASH is unset: allowed only in development (with a banner); production is locked.
 */
const PUBLIC = ["/login", "/api/auth/login"];

function b64url(buf: ArrayBuffer) {
  let s = "";
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function valid(cookie: string | undefined, secret: string | undefined): Promise<boolean> {
  if (!cookie || !secret) return false;
  const [v, exp, sig] = cookie.split(".");
  if (v !== "v1" || !exp || !sig || Number(exp) * 1000 < Date.now()) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = b64url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${v}.${exp}`)));
  if (mac.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < mac.length; i++) diff |= mac.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p)) return NextResponse.next();
  const hash = process.env.APP_PASSWORD_HASH;
  if (!hash) {
    if (process.env.NODE_ENV !== "production") return NextResponse.next();
    return new NextResponse("Dashboard locked: set APP_PASSWORD_HASH and SESSION_SECRET (see README).", { status: 503 });
  }
  if (await valid(req.cookies.get("zpi_session")?.value, process.env.SESSION_SECRET)) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
