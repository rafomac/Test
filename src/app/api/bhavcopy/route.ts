import { NextResponse } from "next/server";
import { cancelJob, defaultRange, importBhavFiles, jobStatus, startDownload, universe } from "@/lib/server/bhav";
import { bad, errMsg, sameOrigin } from "@/lib/server/http";
import { dataMode, syntheticInventory } from "@/lib/store/db";

/** GET: download job status. POST JSON {from?, to?}: start one-click download. POST multipart: upload files. DELETE: cancel. */
export async function GET() {
  return NextResponse.json({ job: jobStatus(), range: defaultRange(), universe: universe().length });
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return bad("Bad origin", 403);
  if (dataMode() === "demo") return bad("Exchange price import is disabled in demo mode.", 403);
  if (syntheticInventory().total > 0) return bad("Remove synthetic sample data first (Settings → Data quality).", 409);
  try {
    if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const fd = await req.formData();
      const files = fd.getAll("file").filter((f): f is File => f instanceof File);
      if (!files.length) return bad("No files");
      if (files.reduce((s, f) => s + f.size, 0) > 200 * 1024 * 1024) return bad("Upload at most 200 MB at a time");
      return NextResponse.json(importBhavFiles(await Promise.all(files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })))));
    }
    const body = await req.json().catch(() => ({}));
    const ok = (d?: string) => !d || /^\d{4}-\d{2}-\d{2}$/.test(d);
    if (!ok(body.from) || !ok(body.to)) return bad("Dates must be YYYY-MM-DD");
    if (!universe().length) return bad("Import your tradebook or sync holdings first — the downloader only keeps prices for securities you hold or held.");
    return NextResponse.json(startDownload({ from: body.from, to: body.to, includeBse: body.includeBse !== false }));
  } catch (e) { return bad(errMsg(e), 500); }
}

export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return bad("Bad origin", 403);
  cancelJob();
  return NextResponse.json({ ok: true });
}
