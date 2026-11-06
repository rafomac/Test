"use client";
import { useMemo, useState } from "react";
import { monteCarlo, monthsToTarget, project, SCENARIOS } from "@/lib/engine/projection";
import { formatCompact, formatPct, type NumberFormat } from "@/lib/format";
import { LineSeries } from "./charts";

function yrs(m: number | null) { return m === null ? "not within 40 y" : m === 0 ? "reached" : `${Math.floor(m / 12)}y ${m % 12}m`; }

export function Projections({ startValue, monthly, milestones, nf, valueSource }: { startValue: number; monthly: number; milestones: number[]; nf: NumberFormat; valueSource: string }) {
  const [sv, setSv] = useState(Math.round(startValue));
  const [sip, setSip] = useState(monthly);
  const [years, setYears] = useState(15);
  const [ret, setRet] = useState(0.15);
  const [inf, setInf] = useState(0.05);
  const [step, setStep] = useState(0);
  const [mc, setMc] = useState(false);
  const [vol, setVol] = useState(0.28);
  const [df, setDf] = useState(4);
  const base = { startValue: sv, monthlySip: sip, inflation: inf, stepUpPct: step };
  const rows = useMemo(() => project({ ...base, years, annualReturn: ret }), [sv, sip, years, ret, inf, step]); // eslint-disable-line react-hooks/exhaustive-deps
  const yearly = rows.filter((r) => r.month % 12 === 0).map((r) => ({ year: `Y${r.year}`, value: r.value, real: r.real, contributed: r.contributed }));
  const scen = SCENARIOS.map((s) => { const p = project({ ...base, years, annualReturn: s.rate }); const end = p[p.length - 1]; return { ...s, end, ms: [5e6, 1e7, 5e7, 1e8].map((m) => monthsToTarget({ ...base, annualReturn: s.rate }, m)) }; });
  const mcr = useMemo(() => (mc ? monteCarlo({ ...base, years, annualReturn: ret, volatility: vol, df, paths: 2000, seed: 2026, stressProb: 0.02, stressStay: 0.75, stressVolMult: 1.8, stressDriftAnnual: -0.35, milestones }) : null), [mc, sv, sip, years, ret, inf, step, vol, df, milestones]); // eslint-disable-line react-hooks/exhaustive-deps
  const end = rows[rows.length - 1];
  const num = (label: string, v: number, set: (n: number) => void, opts: { step?: number; pct?: boolean; min?: number; max?: number } = {}) => (
    <label className="flex flex-col gap-1 text-xs"><span className="text-muted">{label}</span>
      <input type="number" step={opts.step ?? 1} min={opts.min} max={opts.max} value={opts.pct ? Math.round(v * 1000) / 10 : v} onChange={(e) => set(opts.pct ? Number(e.target.value) / 100 : Number(e.target.value))} /></label>
  );
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 rounded-xl border border-line bg-panel p-4 md:grid-cols-4 xl:grid-cols-7">
        {num(`Starting value (₹) — ${valueSource}`, sv, setSv, { step: 10000 })}
        {num("Monthly SIP (₹)", sip, setSip, { step: 10000 })}
        <label className="flex flex-col gap-1 text-xs"><span className="text-muted">Horizon: {years} years</span><input type="range" min={5} max={15} value={years} onChange={(e) => setYears(Number(e.target.value))} /></label>
        {num("Expected annual return %", ret, setRet, { step: 0.5, pct: true })}
        {num("Inflation %", inf, setInf, { step: 0.5, pct: true })}
        {num("Annual SIP step-up %", step, setStep, { step: 1, pct: true })}
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={mc} onChange={(e) => setMc(e.target.checked)} /> Monte Carlo</label>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[["Total contributed", end.contributed], ["Estimated gains", end.gains], ["Estimated value", end.value], ["Inflation-adjusted value", end.real]].map(([l, v]) => (
          <div key={l as string} className="rounded-xl border border-line bg-panel p-3.5"><div className="text-[11px] uppercase tracking-wide text-muted">{l}</div><div className="num mt-1 text-lg font-semibold">{formatCompact(v as number, nf)}</div><div className="text-xs text-muted">after {years} years at {formatPct(ret, 1)}</div></div>
        ))}
      </div>
      <div className="rounded-xl border border-line bg-panel p-4">
        <h2 className="mb-2 text-sm font-semibold">Deterministic path</h2>
        <LineSeries nf={nf} data={yearly} xKey="year" lines={[{ key: "value", name: "Nominal value", area: true }, { key: "real", name: "Inflation-adjusted", color: "var(--c2)" }, { key: "contributed", name: "Contributed", color: "var(--c9)", dash: true }]} />
        <p className="mt-2 text-xs text-muted">Assumptions: monthly compounding at (1+r)^(1/12)−1; SIP invested at the start of each month; step-up applied every 12 months; inflation deflator (1+i)^(t/12). Deterministic paths are illustrations, not probability forecasts.</p>
      </div>
      <div className="rounded-xl border border-line bg-panel p-4">
        <h2 className="mb-2 text-sm font-semibold">Return scenarios ({years}-year horizon)</h2>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-line text-left text-[11px] uppercase text-muted"><th className="py-1.5">Return</th><th>Character</th><th className="text-right">Value</th><th className="text-right">Real value</th><th className="text-right">→ ₹50 L</th><th className="text-right">→ ₹1 Cr</th><th className="text-right">→ ₹5 Cr</th><th className="text-right">→ ₹10 Cr</th></tr></thead>
          <tbody>{scen.map((s) => <tr key={s.label} className="border-b border-line/60"><td className="num py-1.5 font-medium">{s.label}</td><td className={`text-xs ${s.rate >= 0.25 ? "text-warn" : "text-muted"}`}>{s.note}</td><td className="num text-right">{formatCompact(s.end.value, nf)}</td><td className="num text-right">{formatCompact(s.end.real, nf)}</td>{s.ms.map((m, i) => <td key={i} className="num text-right">{yrs(m)}</td>)}</tr>)}</tbody></table></div>
        <p className="mt-2 text-xs text-muted">Higher scenarios are increasingly aggressive and uncertain. Sustained 40% compounding over 10–15 years is rare even among concentrated small-cap investors — treat it as a stretch aspiration.</p>
      </div>
      {mc && mcr && (
        <div className="rounded-xl border border-line bg-panel p-4">
          <div className="mb-2 flex flex-wrap items-end gap-3"><h2 className="text-sm font-semibold">Monte Carlo (2,000 paths)</h2>
            <label className="text-xs text-muted">Volatility % <input type="number" className="w-16" value={Math.round(vol * 100)} onChange={(e) => setVol(Number(e.target.value) / 100)} /></label>
            <label className="text-xs text-muted">Tail df <input type="number" className="w-14" min={3} max={30} value={df} onChange={(e) => setDf(Number(e.target.value))} /></label></div>
          <LineSeries nf={nf} data={mcr.years.map((y, i) => ({ year: `Y${y}`, p10: mcr.p10[i], p25: mcr.p25[i], p50: mcr.p50[i], p75: mcr.p75[i], p90: mcr.p90[i], contributed: mcr.contributed[i] }))} xKey="year" lines={[{ key: "p90", name: "90th pct", color: "var(--c2)", dash: true }, { key: "p75", name: "75th", color: "var(--c2)" }, { key: "p50", name: "Median", color: "var(--c1)" }, { key: "p25", name: "25th", color: "var(--c8)" }, { key: "p10", name: "10th pct", color: "var(--c5)", dash: true }, { key: "contributed", name: "Contributed", color: "var(--c9)", dash: true }]} />
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <table className="text-sm"><thead><tr className="text-left text-[11px] uppercase text-muted"><th>Milestone</th><th className="text-right">P(reached in {years}y)</th><th className="text-right">Median time</th></tr></thead><tbody>{mcr.milestoneProb.map((m) => <tr key={m.milestone}><td>{formatCompact(m.milestone, nf)}</td><td className="num text-right">{formatPct(m.prob, 0)}</td><td className="num text-right">{yrs(m.medianMonths)}</td></tr>)}</tbody></table>
            <table className="text-sm"><thead><tr className="text-left text-[11px] uppercase text-muted"><th>Path CAGR (TWR) ≥</th><th className="text-right">Probability</th></tr></thead><tbody>{mcr.cagrAbove.map((c) => <tr key={c.rate}><td>{formatPct(c.rate, 0)}</td><td className="num text-right">{formatPct(c.prob, 0)}</td></tr>)}</tbody></table>
          </div>
          <p className="mt-2 text-xs text-muted">Model: Student-t monthly log-returns (df {df}, fat tails) at {formatPct(vol, 0)} annual volatility with a two-state regime — 2%/month chance of entering a stress regime (−35% annual drift, 1.8× volatility, 75% persistence) that creates crash clustering across months and correlation across holdings at the portfolio level. Median path is set to the expected return before stress drag. These probabilities depend entirely on the assumptions.</p>
        </div>
      )}
    </div>
  );
}
