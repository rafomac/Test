import { NextResponse } from "next/server";
import { generateSample } from "@/lib/sample";
import { insertMany, put, upsertPrices, audit, dataMode, list } from "@/lib/store/db";
import { invalidate, saveSettings } from "@/lib/server/repo";
import { todayIST } from "@/lib/engine/dates";
import { bad, sameOrigin } from "@/lib/server/http";

/** Synthetic sample: ONLY in DATA_MODE=demo (separate demo.db). Never loadable into the live database. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return bad("Bad origin", 403);
  if (dataMode() !== "demo") return bad("Synthetic data can only be loaded in demo mode (npm run demo), which uses a separate database. The live database never accepts it.", 403);
  if (list("trades").some((t) => (t as { quality?: string }).quality !== "SYNTHETIC")) return bad("Demo database contains non-synthetic records; refusing to mix.", 409);
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
