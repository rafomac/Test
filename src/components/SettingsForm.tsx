"use client";
import { useState } from "react";
import { useApi } from "./JsonForm";
import type { Settings } from "@/lib/types";

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
      <button disabled={busy} onClick={() => send("/api/settings", "PUT", s)} className="rounded-md bg-accent px-3 py-1.5 font-medium text-white disabled:opacity-50">Save settings</button> {msg && <span className="text-xs text-muted">{msg}</span>}
    </div>
  );
}

export function SampleButtons({ loaded }: { loaded: boolean }) {
  const { send, busy, msg } = useApi();
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {!loaded && <button disabled={busy} onClick={() => send("/api/sample", "POST")} className="rounded-md border border-line px-3 py-1.5">Load synthetic sample</button>}
      {loaded && <button disabled={busy} onClick={() => send("/api/sample", "DELETE")} className="rounded-md bg-neg px-3 py-1.5 font-medium text-white">Remove synthetic sample</button>}
      {msg && <span className="text-xs text-muted">{msg}</span>}
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
