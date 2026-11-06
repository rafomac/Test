"use client";
import { useState } from "react";
import { useApi } from "./JsonForm";
import type { Settings } from "@/lib/types";
import { ALERT_RULES } from "@/lib/engine/alerts";

export function SettingsForm({ initial }: { initial: Settings }) {
  const { send, busy, msg } = useApi();
  const [s, setS] = useState(initial);
  const n = (label: string, get: () => number, set: (v: number) => void, step = 1) => (
    <label key={label} className="flex flex-col gap-1"><span className="text-xs text-muted">{label}</span><input type="number" step={step} value={get()} onChange={(e) => set(Number(e.target.value))} /></label>
  );
  const ta = s.targetAllocation, th = s.thresholds, pl = s.positionLimits;
  const sum = ta.Mid + ta.Small + ta.Micro + ta.Nano;
  return (
    <div className="space-y-5 text-sm">
      <section><h3 className="mb-2 text-xs font-semibold uppercase text-muted">Goals</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {n("Aspirational CAGR %", () => s.targetCagrPct, (v) => setS({ ...s, targetCagrPct: v }))}
          {n("Risk-free rate % (Sharpe)", () => s.riskFreeRatePct, (v) => setS({ ...s, riskFreeRatePct: v }), 0.1)}
          {n("Sector limit % of direct equity", () => s.sectorLimitPct, (v) => setS({ ...s, sectorLimitPct: v }))}
          <label className="flex flex-col gap-1"><span className="text-xs text-muted">Number format</span><select value={s.numberFormat} onChange={(e) => setS({ ...s, numberFormat: e.target.value as Settings["numberFormat"] })}><option value="indian">Indian (₹1,00,000 · lakh/crore)</option><option value="international">International (₹100,000 · M/B)</option></select></label>
          <label className="col-span-2 flex flex-col gap-1 md:col-span-4"><span className="text-xs text-muted">Milestones (₹, comma-separated)</span><input value={s.milestones.join(",")} onChange={(e) => setS({ ...s, milestones: e.target.value.split(",").map((x) => Number(x.trim())).filter((x) => x > 0) })} /></label>
        </div></section>
      <section><h3 className="mb-2 text-xs font-semibold uppercase text-muted">Target direct-equity allocation (sum {sum}%)</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {(["Mid", "Small", "Micro", "Nano"] as const).map((k) => n(`${k} %`, () => ta[k], (v) => setS({ ...s, targetAllocation: { ...ta, [k]: v } })))}
        </div>{sum !== 100 && <p className="mt-1 text-xs text-warn">Targets are normalised to 100% when compared.</p>}</section>
      <section><h3 className="mb-2 text-xs font-semibold uppercase text-muted">Market-cap classification</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={th.useAmfiRank} onChange={(e) => setS({ ...s, thresholds: { ...th, useAmfiRank: e.target.checked } })} /> Use official AMFI rank when available</label>
          {n("Large-cap max rank (official 100)", () => th.largeMaxRank, (v) => setS({ ...s, thresholds: { ...th, largeMaxRank: v } }))}
          {n("Mid-cap max rank (official 250)", () => th.midMaxRank, (v) => setS({ ...s, thresholds: { ...th, midMaxRank: v } }))}
          {n("Fallback: large-cap floor ₹cr", () => th.largeMinCr, (v) => setS({ ...s, thresholds: { ...th, largeMinCr: v } }))}
          {n("Fallback: mid-cap floor ₹cr", () => th.midMinCr, (v) => setS({ ...s, thresholds: { ...th, midMinCr: v } }))}
          {n("Custom: micro-cap ceiling ₹cr", () => th.microMaxCr, (v) => setS({ ...s, thresholds: { ...th, microMaxCr: v } }))}
          {n("Custom: nano-cap ceiling ₹cr", () => th.nanoMaxCr, (v) => setS({ ...s, thresholds: { ...th, nanoMaxCr: v } }))}
        </div>
        <p className="mt-1 text-xs text-muted">Hierarchy is exclusive: Large ≥ Mid ≥ Small ≥ Micro ≥ Nano. Micro/Nano are custom subdivisions of SEBI small-cap; fallbacks apply only when no AMFI rank is present and should be refreshed every half-year.</p></section>
      <section><h3 className="mb-2 text-xs font-semibold uppercase text-muted">Position sizing (% of invested cost)</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {n("Initial position ₹", () => pl.initialPositionInr, (v) => setS({ ...s, positionLimits: { ...pl, initialPositionInr: v } }), 1000)}
          {n("Standard %", () => pl.standardPct, (v) => setS({ ...s, positionLimits: { ...pl, standardPct: v } }), 0.5)}
          {n("High %", () => pl.highPct, (v) => setS({ ...s, positionLimits: { ...pl, highPct: v } }), 0.5)}
          {n("Exceptional %", () => pl.exceptionalPct, (v) => setS({ ...s, positionLimits: { ...pl, exceptionalPct: v } }), 0.5)}
          {n("Hard limit %", () => pl.hardLimitPct, (v) => setS({ ...s, positionLimits: { ...pl, hardLimitPct: v } }), 0.5)}
        </div></section>
      <section><h3 className="mb-2 text-xs font-semibold uppercase text-muted">Research score weights</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-7">
          {(Object.keys(s.scoreWeights) as (keyof Settings["scoreWeights"])[]).map((k) => n(k, () => s.scoreWeights[k], (v) => setS({ ...s, scoreWeights: { ...s.scoreWeights, [k]: v } })))}
        </div></section>
      <section><h3 className="mb-2 text-xs font-semibold uppercase text-muted">Benchmark blend & reserve symbols</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1"><span className="text-xs text-muted">Blend (INDEX=weight, one per line)</span><textarea rows={3} value={Object.entries(s.benchmarkBlend).map(([k, v]) => `${k}=${v}`).join("\n")} onChange={(e) => setS({ ...s, benchmarkBlend: Object.fromEntries(e.target.value.split("\n").map((l) => l.split("=")).filter((p) => p.length === 2 && p[0].trim()).map(([k, v]) => [k.trim(), Number(v)])) })} /></label>
          <label className="flex flex-col gap-1"><span className="text-xs text-muted">Cash-equivalent symbols (Liquid BeES etc.)</span><textarea rows={3} value={s.liquidSymbols.join(", ")} onChange={(e) => setS({ ...s, liquidSymbols: e.target.value.split(/[,\s]+/).filter(Boolean).map((x) => x.toUpperCase()) })} /></label>
        </div></section>
      <section><h3 className="mb-2 text-xs font-semibold uppercase text-muted">Position-limit denominator & deployment guide</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <label className="col-span-2 flex flex-col gap-1"><span className="text-xs text-muted">Cost-based limits are measured against</span><select value={s.positionLimitDenominator} onChange={(e) => setS({ ...s, positionLimitDenominator: e.target.value as Settings["positionLimitDenominator"] })}><option value="directEquityCost">Direct-equity invested cost (default)</option><option value="totalInvestedCost">Total invested cost (all assets)</option><option value="netContributions">Net external contributions</option></select></label>
          {(["Mid", "Small", "Micro", "Nano"] as const).map((k) => n(`Monthly guide ${k} ₹`, () => s.deploymentGuide[k], (v) => setS({ ...s, deploymentGuide: { ...s.deploymentGuide, [k]: v } }), 1000))}
        </div>
        <p className="mt-1 text-xs text-muted">Changing the denominator affects current views only; recorded compliance snapshots keep the denominator they were measured with.</p></section>
      <section><h3 className="mb-2 text-xs font-semibold uppercase text-muted">Alerts</h3>
        <div className="mb-2 flex flex-wrap gap-3 text-xs">{ALERT_RULES.map((r) => <label key={r.id} className="flex items-center gap-1"><input type="checkbox" checked={s.alerts.enabled[r.id] !== false} onChange={(e) => setS({ ...s, alerts: { ...s.alerts, enabled: { ...s.alerts.enabled, [r.id]: e.target.checked } } })} />{r.label}</label>)}</div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {([["revenueDecelPP", "Revenue decel. (pp below 3Y CAGR)"], ["dilutionPct", "Dilution threshold %"], ["valuationChangePct", "Valuation change %"], ["scoreDropPts", "Score drop (pts)"], ["concentrationPct", "Concentration % (value)"], ["liquidityDropPct", "Liquidity drop %"], ["staleSnapshotDays", "Stale snapshot (days)"], ["stalePriceDays", "Stale prices (days)"], ["staleFundamentalsDays", "Stale fundamentals (days)"]] as const).map(([k, l]) => n(l, () => s.alerts[k], (v) => setS({ ...s, alerts: { ...s.alerts, [k]: v } })))}
        </div></section>
      <section><h3 className="mb-2 text-xs font-semibold uppercase text-muted">Tax (indicative only)</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
          <label className="flex flex-col gap-1"><span className="text-xs text-muted">Residency</span><select value={s.tax.residency} onChange={(e) => setS({ ...s, tax: { ...s.tax, residency: e.target.value as "NRI" | "Resident" } })}><option>NRI</option><option>Resident</option></select></label>
          {n("Equity LTCG after (months)", () => s.tax.equityLtcgMonths, (v) => setS({ ...s, tax: { ...s.tax, equityLtcgMonths: v } }))}
          {([["stcgRatePct", "STCG rate % (verified)"], ["ltcgRatePct", "LTCG rate % (verified)"], ["ltcgExemption", "LTCG exemption ₹"]] as const).map(([k, l]) => <label key={k} className="flex flex-col gap-1"><span className="text-xs text-muted">{l}</span><input type="number" value={s.tax[k] ?? ""} placeholder="blank = not set" onChange={(e) => setS({ ...s, tax: { ...s.tax, [k]: e.target.value === "" ? null : Number(e.target.value) } })} /></label>)}
          <label className="flex flex-col gap-1"><span className="text-xs text-muted">Rules verified as of</span><input type="date" value={s.tax.rulesAsOf} onChange={(e) => setS({ ...s, tax: { ...s.tax, rulesAsOf: e.target.value } })} /></label>
        </div></section>
      <section><h3 className="mb-2 text-xs font-semibold uppercase text-muted">Default view</h3>
        <select value={s.viewMode} onChange={(e) => setS({ ...s, viewMode: e.target.value as Settings["viewMode"] })}><option value="simple">Simple</option><option value="advanced">Advanced</option></select></section>
      <button disabled={busy} onClick={() => send("/api/settings", "PUT", s)} className="rounded-md bg-accent px-3 py-1.5 font-medium text-white disabled:opacity-50">Save settings</button> {msg && <span className="text-xs text-muted">{msg}</span>}
    </div>
  );
}

export function SampleButtons({ loaded, mode }: { loaded: boolean; mode: "live" | "demo" }) {
  const { send, busy, msg } = useApi();
  if (mode === "live") return <p className="text-sm text-muted">Live mode: synthetic data cannot be loaded here. Run <code>npm run demo</code> to explore with fictional companies in a separate demo database.{loaded && <> Synthetic records are present — use the <a className="text-accent" href="/settings/data#migration">migration</a> to remove them.</>}</p>;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {!loaded && <button disabled={busy} onClick={() => send("/api/sample", "POST")} className="rounded-md border border-line px-3 py-1.5">Load synthetic sample (demo database)</button>}
      {loaded && <span className="text-muted">Demo database contains the synthetic sample.</span>}
      {msg && <span className="text-xs text-muted">{msg}</span>}
    </div>
  );
}

export function MigrationPanel({ inventory }: { inventory: Record<string, number> }) {
  const { send, busy, msg } = useApi();
  const [result, setResult] = useState<string | null>(null);
  const run = async (step: "backup" | "purge") => {
    if (step === "purge" && !confirm("Back up the database, then permanently remove all synthetic records? Settings are kept.")) return;
    const j = await send("/api/migration", "POST", { step });
    if (j) setResult(step === "backup" ? `Backup written: ${j.backup}` : `Backup ${j.backup}; removed ${j.removed} synthetic records.`);
  };
  return (
    <div className="space-y-2 text-sm">
      <ol className="list-decimal space-y-1 pl-5 text-xs text-muted">
        <li>Back up the existing database (SQLite VACUUM INTO, timestamped file next to it).</li>
        <li>Identify synthetic securities, transactions, prices, financial statements, contributions, research scores and benchmarks (inventory below).</li>
        <li>Remove them in one transaction, preserving settings and configuration.</li>
        <li>Import verified Zerodha data (imports and Kite sync are blocked until step 3 is done).</li>
      </ol>
      <div className="flex flex-wrap gap-2 text-xs">{Object.entries(inventory).map(([k, v]) => <span key={k} className={`rounded border px-2 py-0.5 ${v ? "border-neg/40 text-neg" : "border-line text-muted"}`}>{k}: {v}</span>)}</div>
      <div className="flex gap-2"><button disabled={busy} onClick={() => run("backup")} className="rounded-md border border-line px-3 py-1.5">1 · Back up now</button><button disabled={busy || !inventory.total} onClick={() => run("purge")} className="rounded-md bg-neg px-3 py-1.5 font-medium text-white disabled:opacity-40">2–3 · Back up & remove synthetic data</button></div>
      {(result || msg) && <p className="text-xs text-muted">{result ?? msg}</p>}
    </div>
  );
}

export function ConflictButtons({ id }: { id: string }) {
  const { send, busy } = useApi();
  return (
    <span className="space-x-1">
      <button disabled={busy} onClick={() => send("/api/conflicts", "POST", { id, action: "kept-existing" })} className="rounded border border-line px-1.5 py-0.5 text-xs">Keep existing</button>
      <button disabled={busy} onClick={() => send("/api/conflicts", "POST", { id, action: "accepted-incoming" })} className="rounded border border-line px-1.5 py-0.5 text-xs">Accept incoming</button>
    </span>
  );
}
