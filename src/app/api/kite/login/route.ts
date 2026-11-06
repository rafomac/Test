import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { kiteConfig, loginUrl } from "@/lib/kite/client";

import { dataMode, syntheticInventory } from "@/lib/store/db";

export async function GET() {
  if (dataMode() === "demo") return NextResponse.json({ error: "Broker connection is disabled in demo mode." }, { status: 403 });
  if (syntheticInventory().total > 0) return NextResponse.json({ error: "Remove synthetic sample data before connecting Zerodha (Settings → Data quality)." }, { status: 409 });
  const { apiKey, configured } = kiteConfig();
  if (!configured || !apiKey) return NextResponse.json({ error: "Set KITE_API_KEY and KITE_API_SECRET in the server environment." }, { status: 400 });
  const state = crypto.randomBytes(16).toString("hex");
  const res = NextResponse.redirect(loginUrl(apiKey, state));
  res.cookies.set("kite_state", state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/kite", maxAge: 600 });
  return res;
}
