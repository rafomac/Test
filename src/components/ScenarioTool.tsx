"use client";
import { useState } from "react";
import { runScenario, DEFAULT_SCENARIOS } from "@/lib/engine/valuation";
import type { ValuationScenario } from "@/lib/types";
import { formatPct } from "@/lib/format";
import { useApi } from "./JsonForm";

export function ScenarioTool({ symbol, revenue0, mcap0, saved, requiredDefault }: { symbol: string; revenue0: number | null; mcap0: number | null; saved?: ValuationScenario[]; requiredDefault: number }) {
  const { send, busy, msg } = useApi();
  const [sc, setSc] = useState<ValuationScenario[]>(saved?.length ? saved : DEFAULT_SCENARIOS);
  const [rev, setRev] = useState(revenue0 ?? 0);
  const [mc, setMc] = useState(mcap0 ?? 0);
  const [req, setReq] = useState(requiredDefault);
  const upd = (i: number, k: keyof ValuationScenario, v: number) => setSc(sc.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const res = sc.map((x) => runScenario(x, rev, mc, req));
  const fields: [keyof ValuationScenario, string][] = [["revenueGrowthPct", "Revenue growth %/yr"], ["netMarginPct", "Terminal net margin %"], ["dilutionPct", "Dilution %/yr"], ["exitPe", "Exit P/E"], ["years", "Years"]];
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap gap-3 text-xs">
        <label className="flex items-center gap-1">Base revenue (TTM, ₹ cr) <input type="number" className="w-24" value={rev} onChange={(e) => setRev(Number(e.target.value))} /></label>
        <label className="flex items-center gap-1">Market cap today (₹ cr) <input type="number" className="w-24" value={mc} onChange={(e) => setMc(Number(e.target.value))} /></label>
        <label className="flex items-center gap-1">Required return % <input type="number" className="w-16" value={Math.round(req * 100)} onChange={(e) => setReq(Number(e.target.value) / 100)} /></label>
      </div>
      <div className="overflow-x-auto"><table className="w-full text-sm">
        <thead><tr className="border-b border-line text-left text-[11px] uppercase text-muted"><th className="py-1">Assumption</th>{sc.map((x) => <th key={x.name} className="text-right">{x.name}</th>)}</tr></thead>
        <tbody>
          {fields.map(([k, l]) => <tr key={k} className="border-b border-line/50"><td className="py-1 text-muted">{l}</td>{sc.map((x, i) => <td key={i} className="text-right"><input type="number" className="w-20 text-right" value={x[k] as number} onChange={(e) => upd(i, k, Number(e.target.value))} /></td>)}</tr>)}
          <tr className="border-t border-line"><td className="py-1 font-medium">Revenue in year N (₹ cr)</td>{res.map((r) => <td key={r.name} className="num text-right">{r.revenueT.toFixed(0)}</td>)}</tr>
          <tr><td className="py-1 font-medium">Implied market cap (₹ cr)</td>{res.map((r) => <td key={r.name} className="num text-right">{r.marketCapT.toFixed(0)}</td>)}</tr>
          <tr><td className="py-1 font-medium">Per-share multiple</td>{res.map((r) => <td key={r.name} className="num text-right">{r.multiple?.toFixed(2) ?? "—"}×</td>)}</tr>
          <tr><td className="py-1 font-medium">Implied annual return</td>{res.map((r) => <td key={r.name} className={`num text-right ${(r.impliedCagr ?? 0) >= 0 ? "text-pos" : "text-neg"}`}>{formatPct(r.impliedCagr, 1)}</td>)}</tr>
          <tr><td className="py-1 font-medium">Value today at required return</td>{res.map((r) => <td key={r.name} className="num text-right">{r.presentValueCr?.toFixed(0)} cr ({formatPct(r.upsideVsToday, 0)})</td>)}</tr>
        </tbody></table></div>
      <p className="text-xs text-muted">ASSUMPTIONS, not forecasts. Implied values follow mechanically from your inputs and are not an objective fair value. For loss-making companies, use the bear case to test cash runway and dilution.</p>
      <button disabled={busy} onClick={() => send("/api/research", "PUT", { symbol, scenarios: sc })} className="rounded-md border border-line px-3 py-1.5">Save scenarios</button> {msg && <span className="text-xs text-muted">{msg}</span>}
    </div>
  );
}
