import { NextResponse } from "next/server";
import { backupDb, purgeSynthetic, syntheticInventory, dataMode } from "@/lib/store/db";
import { invalidate } from "@/lib/server/repo";
import { bad, errMsg, sameOrigin } from "@/lib/server/http";

/** Synthetic-data migration: GET = inventory; POST {step:"backup"|"purge"}. Purge always backs up first. */
export async function GET() {
  return NextResponse.json({ mode: dataMode(), inventory: syntheticInventory() });
}
export async function POST(req: Request) {
  if (!sameOrigin(req)) return bad("Bad origin", 403);
  const { step } = await req.json();
  try {
    if (step === "backup") return NextResponse.json({ backup: backupDb("manual") });
    if (step === "purge") {
      const backup = backupDb("pre-synthetic-purge");
      const removed = purgeSynthetic();
      invalidate();
      return NextResponse.json({ backup, removed, inventory: syntheticInventory() });
    }
    return bad("Unknown step");
  } catch (e) { return bad(errMsg(e), 500); }
}
