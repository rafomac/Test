import { NextResponse } from "next/server";
import { logoutKite } from "@/lib/server/kite-service";
import { bad, sameOrigin } from "@/lib/server/http";
export async function POST(req: Request) {
  if (!sameOrigin(req)) return bad("Bad origin", 403);
  await logoutKite();
  return NextResponse.json({ ok: true });
}
