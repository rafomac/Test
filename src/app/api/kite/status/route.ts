import { NextResponse } from "next/server";
import { kiteStatus } from "@/lib/server/kite-service";
export async function GET() { return NextResponse.json(kiteStatus()); }
