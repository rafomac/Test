import { NextResponse } from "next/server";
import { generateSample } from "@/lib/sample";
import { insertMany, put, upsertPrices, purgeSource, audit } from "@/lib/store/db";
import { invalidate, saveSettings } from "@/lib/server/repo";
import { todayIST } from "@/lib/engine/dates";
import { bad, sameOrigin } from "@/lib/server/http";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return bad("Bad origin", 403);
  const d = generateSample(todayIST());
  insertMany("trades", d.trades); insertMany("cash", d.cash);
  for (const s of d.securities) put("securities", s.symbol, s);
  for (const f of d.fundamentals) put("fundamentals", f.symbol, f);
  for (const r of d.research) put("research", r.symbol, r);
  for (const s of d.snapshots) put("snapshots", s.id, s);
  upsertPrices(d.prices);
  saveSettings({ planStartMonth: "2024-12" });
  audit("sample.load");
  invalidate();
  return NextResponse.json({ ok: true });
}
export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return bad("Bad origin", 403);
  const n = purgeSource("SYNTHETIC_SAMPLE");
  audit("sample.remove", String(n));
  invalidate();
  return NextResponse.json({ removed: n });
}
