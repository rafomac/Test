import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { kiteConfig, loginUrl } from "@/lib/kite/client";

export async function GET() {
  const { apiKey, configured } = kiteConfig();
  if (!configured || !apiKey) return NextResponse.json({ error: "Set KITE_API_KEY and KITE_API_SECRET in the server environment." }, { status: 400 });
  const state = crypto.randomBytes(16).toString("hex");
  const res = NextResponse.redirect(loginUrl(apiKey, state));
  res.cookies.set("kite_state", state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/kite", maxAge: 600 });
  return res;
}
