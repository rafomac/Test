import { NextResponse } from "next/server";
import { getDoc, put, audit } from "@/lib/store/db";
import { invalidate } from "@/lib/server/repo";
import { bad, sameOrigin } from "@/lib/server/http";
import type { Security } from "@/lib/types";
import { withCapHistory } from "@/lib/engine/classify";
import { todayIST } from "@/lib/engine/dates";

export async function PUT(req: Request) {
  if (!sameOrigin(req)) return bad("Bad origin", 403);
  const b = (await req.json()) as Partial<Security> & { symbol: string };
  if (!b.symbol) return bad("symbol required");
  const ex = getDoc<Security>("securities", b.symbol);
  const merged: Security = { ...(ex ?? { assetType: "STOCK", source: "MANUAL" }), ...b, source: "MANUAL", updatedAt: new Date().toISOString() } as Security;
  put("securities", b.symbol, withCapHistory(ex, merged, merged.marketCapAsOf ?? todayIST(), "Manual edit"));
  audit("security.edit", b.symbol);
  invalidate();
  return NextResponse.json(merged);
}
