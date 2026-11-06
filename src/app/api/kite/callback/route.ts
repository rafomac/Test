import { NextResponse, type NextRequest } from "next/server";
import { completeLogin } from "@/lib/server/kite-service";
import { errMsg } from "@/lib/server/http";

/** Register this URL (https://<your-host>/api/kite/callback) as the redirect URL in the Kite developer console. */
export async function GET(req: NextRequest) {
  const u = req.nextUrl;
  const back = (q: string) => NextResponse.redirect(new URL(`/settings?kite=${encodeURIComponent(q)}`, req.url));
  if (u.searchParams.get("status") !== "success") return back("Login cancelled or failed");
  const state = u.searchParams.get("state");
  if (!state || state !== req.cookies.get("kite_state")?.value) return back("State mismatch — login rejected");
  const rt = u.searchParams.get("request_token");
  if (!rt) return back("No request token");
  try {
    await completeLogin(rt);
    const res = back("connected");
    res.cookies.delete("kite_state");
    return res;
  } catch (e) {
    return back("Token exchange failed: " + errMsg(e));
  }
}
