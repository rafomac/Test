"use client";
import { useState } from "react";
import { simulateAllocation } from "@/lib/engine/rebalance";
import { formatCompact, formatPct, type NumberFormat } from "@/lib/format";
import { Bars } from "./charts";

export function AllocationSim({ current, target, etfValue, reserve, monthly, nf }: { current: Record<string, number>; target: Record<string, number>; etfValue: number; reserve: number; monthly: number; nf: NumberFormat }) {
  const [etf, setEtf] = useState(0);
  const [res, setRes] = useState(0.5);
  const [months, setMonths] = useState(6);
  const [share, setShare] = useState(0.8);
  const r = simulateAllocation({ current, target, etfValue, etfSellFraction: etf, reserve, reserveUseFraction: res, monthlyContribution: monthly, months, directShareOfContribution: share });
  const cur = Object.values(current).reduce((s, x) => s + x, 0);
  const rows = Object.keys({ ...current, ...target }).map((k) => ({ k, now: cur > 0 ? (current[k] ?? 0) / cur : 0, after: r.afterPct[k] ?? 0, target: target[k] ?? 0 }));
  const slider = (label: string, v: number, set: (n: number) => void, max = 1, stepV = 0.05, show = (x: number) => formatPct(x, 0)) => (
    <label className="flex flex-col gap-1 text-xs"><span className="text-muted">{label}: <b className="text-fg">{show(v)}</b></span><input type="range" min={0} max={max} step={stepV} value={v} onChange={(e) => set(Number(e.target.value))} /></label>
  );
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-3">
        {slider(`Sell ETFs (of ${formatCompact(etfValue, nf)})`, etf, setEtf)}
        {slider(`Deploy existing reserve (of ${formatCompact(reserve, nf)})`, res, setRes)}
        {slider("Months of future contributions", months, setMonths, 60, 1, (x) => `${x}`)}
        {slider("Share of each contribution to direct equity", share, setShare)}
        <p className="text-xs text-muted">New capital deployed: <b className="text-fg">{formatCompact(r.newCapital, nf)}</b>. Directed to under-weight categories first. Simulation only — no trades are placed, and ETFs are not sold unless you move the slider.</p>
      </div>
      <div className="lg:col-span-2">
        <Bars nf={nf} y="pct" data={rows} xKey="k" bars={[{ key: "now", name: "Now", color: "var(--c9)" }, { key: "after", name: "After simulation" }, { key: "target", name: "Target", color: "var(--c3)" }]} />
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">{Object.entries(r.alloc).map(([k, v]) => <div key={k} className="rounded border border-line p-2"><div className="text-muted">{k}</div><div className="num font-semibold">+{formatCompact(v, nf)}</div></div>)}</div>
      </div>
    </div>
  );
}
