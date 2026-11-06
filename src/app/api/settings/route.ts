import { NextResponse } from "next/server";
import { getSettings, invalidate, saveSettings } from "@/lib/server/repo";
import { bad, sameOrigin } from "@/lib/server/http";
import { validateThresholds } from "@/lib/engine/classify";
import { mergeSettings } from "@/lib/settings";

export async function GET() { return NextResponse.json(getSettings()); }
export async function PUT(req: Request) {
  if (!sameOrigin(req)) return bad("Bad origin", 403);
  const body = await req.json();
  const merged = mergeSettings({ ...getSettings(), ...body });
  const errs = validateThresholds(merged.thresholds);
  if (errs.length) return bad(errs.join(" "));
  const s = saveSettings(body);
  invalidate();
  return NextResponse.json(s);
}
