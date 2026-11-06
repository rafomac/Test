import { NextResponse } from "next/server";
import { put, audit, getDoc } from "@/lib/store/db";
import { invalidate, loadData, getSettings } from "@/lib/server/repo";
import { researchScore } from "@/lib/engine/research";
import { todayIST } from "@/lib/engine/dates";
import { bad, sameOrigin } from "@/lib/server/http";
import type { ResearchEntry } from "@/lib/types";

export async function PUT(req: Request) {
  if (!sameOrigin(req)) return bad("Bad origin", 403);
  const b = (await req.json()) as ResearchEntry;
  if (!b.symbol) return bad("symbol required");
  const ex = getDoc<ResearchEntry>("research", b.symbol);
  const today = todayIST();
  const merged: ResearchEntry = { ...(ex ?? { ratings: {}, evidence: {}, conviction: "Research" }), ...b, updatedAt: new Date().toISOString() } as ResearchEntry;
  // Stage history: append when the pipeline stage changes.
  if (merged.stage && merged.stage !== ex?.stage) merged.stageHistory = [...(ex?.stageHistory ?? []), { stage: merged.stage, date: today }];
  else merged.stageHistory = ex?.stageHistory ?? merged.stageHistory;
  if (merged.stage && !merged.discoveryDate) merged.discoveryDate = today;
  // Score history for deterioration alerts.
  const f = loadData().fundamentals.find((x) => x.symbol === b.symbol);
  const sc = researchScore(merged, f, getSettings().scoreWeights);
  const hist = (ex?.scoreHistory ?? []).filter((x) => x.date !== today);
  merged.scoreHistory = [...hist, { date: today, score: sc.score, completeness: sc.completeness }].slice(-60);
  if (merged.initialScore === undefined && sc.score !== null) merged.initialScore = sc.score;
  put("research", b.symbol, merged);
  audit("research.edit", b.symbol);
  invalidate();
  return NextResponse.json(merged);
}
