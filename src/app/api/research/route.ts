import { NextResponse } from "next/server";
import { put, audit, getDoc } from "@/lib/store/db";
import { invalidate } from "@/lib/server/repo";
import { bad, sameOrigin } from "@/lib/server/http";
import type { ResearchEntry } from "@/lib/types";

export async function PUT(req: Request) {
  if (!sameOrigin(req)) return bad("Bad origin", 403);
  const b = (await req.json()) as ResearchEntry;
  if (!b.symbol) return bad("symbol required");
  const ex = getDoc<ResearchEntry>("research", b.symbol);
  const merged = { ...(ex ?? { ratings: {}, evidence: {}, conviction: "Research" }), ...b, updatedAt: new Date().toISOString() };
  put("research", b.symbol, merged);
  audit("research.edit", b.symbol);
  invalidate();
  return NextResponse.json(merged);
}
