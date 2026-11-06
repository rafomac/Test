import { NextResponse } from "next/server";
import { put, audit } from "@/lib/store/db";
import { getAlerts } from "@/lib/server/repo";
import { bad, sameOrigin } from "@/lib/server/http";
import type { AlertState } from "@/lib/types";

export async function GET() { return NextResponse.json(getAlerts()); }
export async function POST(req: Request) {
  if (!sameOrigin(req)) return bad("Bad origin", 403);
  const { id, status, until } = await req.json();
  if (!id || !["acknowledged", "snoozed", "active"].includes(status)) return bad("id and status required");
  const st: AlertState = { id, status: status === "active" ? "snoozed" : status, until: status === "active" ? "0000-00-00" : until, at: new Date().toISOString() };
  put("alertStates", id, st);
  audit("alert." + status, id);
  return NextResponse.json(st);
}
