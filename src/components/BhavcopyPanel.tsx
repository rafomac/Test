"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { BhavJob } from "@/lib/server/bhav";

export function BhavcopyPanel({ defaultFrom, defaultTo, universe, initialJob }: { defaultFrom: string; defaultTo: string; universe: number; initialJob: BhavJob | null }) {
  const r = useRouter();
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [job, setJob] = useState<BhavJob | null>(initialJob);
  const [err, setErr] = useState<string | null>(null);
  const [upload, setUpload] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(async () => {
      const j = (await (await fetch("/api/bhavcopy")).json()).job as BhavJob | null;
      setJob(j);
      if (!j || j.status !== "running") { if (timer.current) clearInterval(timer.current); r.refresh(); }
    }, 1500);
  };
  useEffect(() => { if (initialJob?.status === "running") poll(); return () => { if (timer.current) clearInterval(timer.current); }; }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async () => {
    setErr(null);
    const res = await fetch("/api/bhavcopy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ from, to }) });
    const j = await res.json();
    if (!res.ok) { setErr(j.error); return; }
    setJob(j); poll();
  };
  const cancel = () => fetch("/api/bhavcopy", { method: "DELETE" });
  const onUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setBusy(true); setUpload(null); setErr(null);
    const res = await fetch("/api/bhavcopy", { method: "POST", body: new FormData(e.currentTarget) });
    const j = await res.json(); setBusy(false);
    if (!res.ok) setErr(j.error); else { setUpload(j); r.refresh(); }
  };
  const pctDone = job && job.totalDays ? Math.round((job.doneDays / job.totalDays) * 100) : 0;
  const mins = job && job.status === "running" ? Math.ceil(((job.totalDays - job.doneDays) * 0.9) / 60) : 0;

  return (
    <div className="space-y-4 text-sm">
      <p className="text-xs text-muted">Free official end-of-day files from NSE (and BSE for BSE-only stocks). Only prices for the {universe} securities you hold or have held are kept. Prices are actual (unadjusted) closes with volume and NSE delivery %, which unlocks TWR, benchmarks, 200-DMA, liquidity and sector history. Already-downloaded days are skipped on later runs.</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1"><span className="text-xs text-muted">From</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="flex flex-col gap-1"><span className="text-xs text-muted">To</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <button disabled={job?.status === "running"} onClick={start} className="rounded-md bg-accent px-3 py-1.5 font-medium text-white disabled:opacity-50">Download exchange prices</button>
        {job?.status === "running" && <button onClick={cancel} className="rounded-md border border-line px-3 py-1.5">Cancel</button>}
      </div>
      {job && (
        <div className="rounded-lg border border-line p-3">
          <div className="flex justify-between text-xs"><span>{job.status === "running" ? `Downloading… ${job.doneDays}/${job.totalDays} trading days (~${mins} min left)` : `Finished: ${job.status}`}</span><span className="num">{pctDone}%</span></div>
          <div className="mt-1 h-2 rounded bg-panel-2"><div className="h-2 rounded bg-accent" style={{ width: `${pctDone}%` }} /></div>
          <div className="mt-2 grid grid-cols-2 gap-1 text-xs text-muted sm:grid-cols-6">
            <span>Files: <b className="text-fg">{job.filesFound}</b></span><span>Holidays / not published: {job.holidays}</span><span className={job.failedDays ? "text-warn" : ""}>Failed (will retry): {job.failedDays}</span><span>Prices stored: <b className="text-fg">{job.pricesStored.toLocaleString("en-IN")}</b></span><span>BSE days: {job.bseDays}</span><span>Kite prices replaced: {job.superseded}</span>
          </div>
          {job.message && <p className="mt-2 text-xs text-warn">{job.message}</p>}
          {job.unmatched.length > 0 && job.status !== "running" && <p className="mt-2 text-xs text-warn">Not found on the latest file: {job.unmatched.slice(0, 15).join(", ")}{job.unmatched.length > 15 ? "…" : ""}. These may be delisted, renamed, mutual funds, or missing an ISIN.</p>}
          {job.errors.length > 0 && <details className="mt-2 text-xs"><summary className="cursor-pointer text-warn">{job.errors.length} download error(s)</summary><ul className="mt-1 list-disc pl-4 text-muted">{job.errors.map((x) => <li key={x}>{x}</li>)}</ul></details>}
        </div>
      )}
      <form onSubmit={onUpload} className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
        <label className="flex flex-col gap-1"><span className="text-xs text-muted">Or upload bhavcopy files you downloaded (CSV or ZIP, many at once)</span><input name="file" type="file" multiple accept=".csv,.zip,text/csv,application/zip" required /></label>
        <button disabled={busy} className="rounded-md border border-line px-3 py-1.5">{busy ? "Importing…" : "Import files"}</button>
      </form>
      {upload && <p className="text-xs text-muted">Imported {String((upload.files as unknown[]).length)} file(s): {String(upload.inserted)} new and {String(upload.updated)} updated prices for {String(upload.matchedSymbols)} securities.</p>}
      {err && <p className="text-xs text-neg">{err}</p>}
      <p className="text-[11px] text-muted">Sources: nsearchives.nseindia.com (sec_bhavdata_full) and bseindia.com (BhavCopy). Requests are made from your computer, about one per second, only for days not yet stored. Official closes replace same-day intraday Kite prices (each replacement is logged).</p>
    </div>
  );
}
