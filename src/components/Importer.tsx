"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

const KINDS: { kind: string; label: string; where: string; template?: string; extra?: "asOf" | "symbol" }[] = [
  { kind: "tradebook", label: "Equity tradebook", where: "Console → Reports → Tradebook → Segment: Equity → Download CSV (repeat per financial year)" },
  { kind: "holdings", label: "Holdings export", where: "Console → Portfolio → Holdings → Download, or Kite → Holdings → Download CSV", extra: "asOf" },
  { kind: "ledger", label: "Funds ledger (deposits/payouts)", where: "Console → Funds → Statement → Segment: Equity → CSV" },
  { kind: "dividends", label: "Dividends", where: "Console → Reports → Dividends (per FY)" },
  { kind: "mf_tradebook", label: "Mutual fund tradebook", where: "Console → Reports → Tradebook → Segment: Mutual funds" },
  { kind: "corporate_actions", label: "Corporate actions", where: "Manual template (splits, bonuses, mergers, demergers)", template: "corporate_actions" },
  { kind: "prices", label: "Historical prices / TRI index", where: "symbol,date,close[,volume] — or niftyindices TRI export with symbol below", template: "prices", extra: "symbol" },
  { kind: "securities", label: "Security master", where: "symbol, name, sector, industry, market_cap_cr …", template: "securities" },
  { kind: "amfi", label: "AMFI market-cap list", where: "amfiindia.com → Research → Average market capitalisation (half-yearly), saved as CSV", extra: "asOf" },
  { kind: "fundamentals", label: "Fundamentals", where: "One row per company; state the source", template: "fundamentals" },
  { kind: "deposits", label: "Deposits (manual)", where: "date, amount, type — if you can't export the ledger", template: "deposits" },
];

export function Importer() {
  const r = useRouter();
  const [kind, setKind] = useState("tradebook");
  const [asOf, setAsOf] = useState("");
  const [symbol, setSymbol] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const k = KINDS.find((x) => x.kind === kind)!;
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("kind", kind); if (asOf) fd.set("asOfDate", asOf); if (symbol) fd.set("symbol", symbol);
    setBusy(true); setResult(null);
    const res = await fetch("/api/import", { method: "POST", body: fd });
    setResult(await res.json()); setBusy(false); r.refresh();
  }
  return (
    <form onSubmit={submit} className="space-y-3 text-sm">
      <div className="grid gap-3 md:grid-cols-3">
        <label className="flex flex-col gap-1"><span className="text-xs text-muted">Report type</span><select value={kind} onChange={(e) => setKind(e.target.value)}>{KINDS.map((x) => <option key={x.kind} value={x.kind}>{x.label}</option>)}</select></label>
        <label className="flex flex-col gap-1 md:col-span-2"><span className="text-xs text-muted">CSV file</span><input name="file" type="file" accept=".csv,text/csv" required /></label>
        {k.extra === "asOf" && <label className="flex flex-col gap-1"><span className="text-xs text-muted">{kind === "amfi" ? "List date" : "Prices as of (trading date)"}</span><input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} required={kind === "holdings"} /></label>}
        {k.extra === "symbol" && <label className="flex flex-col gap-1"><span className="text-xs text-muted">Symbol (if file has none), e.g. IDX:NIFTY_SMALLCAP_250_TRI</span><input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} /></label>}
      </div>
      <p className="text-xs text-muted">{k.where}{k.template && <> · <a className="text-accent" href={`/api/template?kind=${k.template}`}>download template</a></>}</p>
      <button disabled={busy} className="rounded-md bg-accent px-3 py-1.5 font-medium text-white disabled:opacity-50">{busy ? "Importing…" : "Import"}</button>
      {result && (
        <div className="rounded-md border border-line bg-panel-2 p-3 text-xs">
          {"error" in result ? <span className="text-neg">{String(result.error)}</span> : <>
            <div>Read {String(result.rowsRead)} · imported {String(result.rowsImported)} · duplicates {String(result.duplicates)} · skipped {String(result.rowsSkipped)} · <b className={Number(result.conflicts) ? "text-warn" : ""}>conflicts {String(result.conflicts)}</b></div>
            <ul className="mt-1 list-disc pl-4 text-muted">{(result.warnings as string[]).map((w, i) => <li key={i}>{w}</li>)}</ul>
          </>}
        </div>
      )}
    </form>
  );
}
