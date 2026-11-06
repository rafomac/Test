import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { put, remove, audit, dataMode } from "@/lib/store/db";
import { getAnalytics, invalidate, loadData } from "@/lib/server/repo";
import { bad, sameOrigin } from "@/lib/server/http";
import type { JournalEntry } from "@/lib/types";

/** Create/update a journal entry. Facts at entry (price, P/E, TTM revenue, research score) are captured automatically. */
export async function PUT(req: Request) {
  if (!sameOrigin(req)) return bad("Bad origin", 403);
  const b = (await req.json()) as Partial<JournalEntry>;
  if (!b.symbol || !b.date || !b.reason) return bad("symbol, date and reason are required");
  const d = loadData();
  const f = d.fundamentals.find((x) => x.symbol === b.symbol);
  const px = d.trades.filter((t) => t.symbol === b.symbol && t.date === b.date && t.side === "BUY")[0]?.price ?? d.prices.filter((p) => p.symbol === b.symbol && p.date <= b.date!).pop()?.close;
  const h = getAnalytics().holdings.find((x) => x.symbol === b.symbol);
  const e: JournalEntry = {
    id: b.id ?? crypto.randomUUID(), symbol: b.symbol.toUpperCase(), date: b.date, amount: Number(b.amount ?? 0), kind: b.kind ?? "Initial", reason: b.reason,
    evidence: b.evidence, valuation: b.valuation, conviction: b.conviction, expectedGrowth: b.expectedGrowth, risks: b.risks, holdingPeriod: b.holdingPeriod,
    addConditions: b.addConditions, exitConditions: b.exitConditions, basis: b.basis,
    priceAtEntry: b.priceAtEntry ?? px, peAtEntry: b.peAtEntry ?? f?.pe, revenueTtmAtEntry: b.revenueTtmAtEntry ?? f?.ttmRevenue,
    researchScoreAtEntry: b.researchScoreAtEntry ?? h?.score.score ?? null, createdAt: b.createdAt ?? new Date().toISOString(),
  };
  put("journal", e.id, e);
  audit("journal.save", `${e.symbol} ${e.date} (${dataMode()})`);
  invalidate();
  return NextResponse.json(e);
}
export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return bad("Bad origin", 403);
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return bad("id required");
  remove("journal", id);
  audit("journal.delete", id);
  return NextResponse.json({ ok: true });
}
