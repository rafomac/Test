import { NextResponse } from "next/server";
import { getAnalytics } from "@/lib/server/repo";
export async function GET(req: Request) {
  const asOf = new URL(req.url).searchParams.get("asOf") ?? undefined;
  return NextResponse.json(getAnalytics(asOf && /^\d{4}-\d{2}-\d{2}$/.test(asOf) ? asOf : undefined));
}
