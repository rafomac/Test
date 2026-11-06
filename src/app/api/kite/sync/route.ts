import { NextResponse } from "next/server";
import { syncKite } from "@/lib/server/kite-service";
import { bad, errMsg, sameOrigin } from "@/lib/server/http";
import { rateLimit } from "@/lib/security/ratelimit";
export async function POST(req: Request) {
  if (!sameOrigin(req)) return bad("Bad origin", 403);
  if (!rateLimit("kite-sync", 6, 60_000).ok) return bad("Rate limited", 429);
  try { return NextResponse.json(await syncKite()); } catch (e) { return bad(errMsg(e), 502); }
}
