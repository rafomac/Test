import { NextResponse } from "next/server";
import { list, resolveConflict } from "@/lib/store/db";
import { invalidate } from "@/lib/server/repo";
import { bad, sameOrigin } from "@/lib/server/http";
export async function GET() { return NextResponse.json(list("conflicts")); }
export async function POST(req: Request) {
  if (!sameOrigin(req)) return bad("Bad origin", 403);
  const { id, action } = await req.json();
  if (!["kept-existing", "accepted-incoming"].includes(action)) return bad("bad action");
  const ok = resolveConflict(id, action);
  invalidate();
  return NextResponse.json({ ok });
}
