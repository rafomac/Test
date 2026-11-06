import { NextResponse } from "next/server";
import { importFile } from "@/lib/server/repo";
import { bad, errMsg, sameOrigin } from "@/lib/server/http";
import type { ImportKind } from "@/lib/import/zerodha";
import { rateLimit } from "@/lib/security/ratelimit";

const KINDS: ImportKind[] = ["tradebook", "holdings", "ledger", "dividends", "mf_tradebook", "prices", "corporate_actions", "securities", "fundamentals", "amfi", "deposits"];
const MAX = 15 * 1024 * 1024;

export async function POST(req: Request) {
  if (!sameOrigin(req)) return bad("Bad origin", 403);
  if (!rateLimit("import", 60, 60_000).ok) return bad("Rate limited", 429);
  const form = await req.formData();
  const kind = String(form.get("kind")) as ImportKind;
  if (!KINDS.includes(kind)) return bad("Unknown import kind");
  const file = form.get("file");
  if (!(file instanceof File)) return bad("No file");
  if (file.size > MAX) return bad("File too large (15 MB max)");
  if (/\.xlsx?$/i.test(file.name)) return bad("Please export/save the report as CSV (Console offers CSV for all reports).");
  try {
    const text = await file.text();
    const r = importFile(kind, text, file.name, { symbol: String(form.get("symbol") ?? "") || undefined, asOfDate: String(form.get("asOfDate") ?? "") || undefined });
    return NextResponse.json(r);
  } catch (e) {
    return bad(errMsg(e), 500);
  }
}
