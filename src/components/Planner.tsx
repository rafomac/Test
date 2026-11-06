"use client";
import { useMemo, useState } from "react";
import { planDeployment, sizingCapacity, type PlannerHolding, type Proposal } from "@/lib/engine/planner";
import { formatINR, formatPct, type NumberFormat } from "@/lib/format";
import { Bars } from "./charts";

export function Planner({ holdings, targets, cash, liquid, hardLimitPct, monthly, guide, initial, nf }: { holdings: PlannerHolding[]; targets: Record<string, number>; cash: number; liquid: number; hardLimitPct: number; monthly: number; guide: Record<string, number>; initial: number; nf: NumberFormat }) {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [contrib, setContrib] = useState(0);
  const [sym, setSym] = useState(""); const [cap, setCap] = useState("Small"); const [amt, setAmt] = useState(initial); const [src, setSrc] = useState<"cash" | "liquid">("cash");
  const r = useMemo(() => planDeployment({ holdings, targets, availableCash: cash, liquidBees: liquid, proposals, hardLimitPct, newContribution: contrib }), [holdings, targets, cash, liquid, proposals, hardLimitPct, contrib]);
  const inr = (x: number) => formatINR(x, { fmt: nf });
  const add = () => { if (!sym || amt <= 0) return; const h = holdings.find((x) => x.symbol === sym.toUpperCase()); setProposals([...proposals, { symbol: sym.toUpperCase(), cap: h?.cap ?? cap, amount: amt, fromReserve: src }]); setSym(""); };
  const fillGuide = () => setContrib(monthly);
  const rows = Object.keys(targets).map((k) => ({ k, before: r.before[k]?.pct ?? 0, after: r.after[k]?.pct ?? 0, target: targets[k] }));
  return (
    <div className="space-y-4 text-sm">
      <div className="grid gap-3 md:grid-cols-6">
        <label className="flex flex-col gap-1 md:col-span-2"><span className="text-xs text-muted">Company (existing or new)</span><input list="hold-syms" value={sym} onChange={(e) => setSym(e.target.value)} placeholder="Symbol" /><datalist id="hold-syms">{holdings.map((h) => <option key={h.symbol} value={h.symbol} />)}</datalist></label>
        <label className="flex flex-col gap-1"><span className="text-xs text-muted">Category (new names)</span><select value={cap} onChange={(e) => setCap(e.target.value)}>{Object.keys(targets).map((k) => <option key={k}>{k}</option>)}</select></label>
        <label className="flex flex-col gap-1"><span className="text-xs text-muted">Amount ₹</span><input type="number" step={1000} value={amt} onChange={(e) => setAmt(Number(e.target.value))} /></label>
        <label className="flex flex-col gap-1"><span className="text-xs text-muted">Funded from</span><select value={src} onChange={(e) => setSrc(e.target.value as "cash" | "liquid")}><option value="cash">Cash / new contribution</option><option value="liquid">Sell Liquid BeES (internal)</option></select></label>
        <div className="flex items-end gap-2"><button onClick={add} className="rounded-md bg-accent px-3 py-1.5 font-medium text-white">Add</button></div>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <label className="flex items-center gap-1">Expected new contribution ₹ <input type="number" step={10000} className="w-28" value={contrib} onChange={(e) => setContrib(Number(e.target.value))} /></label>
        <button onClick={fillGuide} className="rounded border border-line px-2 py-1">Use monthly target ({inr(monthly)})</button>
        <span className="text-muted">Monthly guide: {Object.entries(guide).map(([k, v]) => `${k} ${inr(v)}`).join(" · ")} — guides, not compulsory purchases.</span>
      </div>
      {proposals.length > 0 && (
        <table className="w-full text-sm"><thead><tr className="border-b border-line text-left text-[11px] uppercase text-muted"><th>Company</th><th>Category</th><th className="text-right">Amount</th><th>Funding</th><th className="text-right">Cost after</th><th className="text-right">Weight after</th><th>Limit check</th><th /></tr></thead>
          <tbody>{proposals.map((p, i) => { const c = r.checks[i]; return <tr key={i} className="border-b border-line/60"><td className="py-1">{p.symbol}</td><td>{p.cap}</td><td className="num text-right">{inr(p.amount)}</td><td>{p.fromReserve === "liquid" ? "Liquid BeES" : "Cash"}</td><td className="num text-right">{inr(c.costAfter)}</td><td className="num text-right">{formatPct(c.weightAfter, 1)}</td><td className={c.hardOk && c.ok ? "text-pos" : "text-warn"}>{c.message}{Number.isFinite(c.limitPct) ? ` (${c.limitPct}%)` : ""}</td><td><button className="text-xs text-muted" onClick={() => setProposals(proposals.filter((_, j) => j !== i))}>remove</button></td></tr>; })}</tbody></table>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-line p-3">
          <div className="text-xs text-muted">Proposed purchases</div><div className="num text-lg font-semibold">{inr(r.proposed)}</div>
          <div className="mt-2 text-xs text-muted">Remaining cash</div><div className="num">{inr(r.remainingCash)}</div>
          <div className="mt-1 text-xs text-muted">Remaining Liquid BeES</div><div className="num">{inr(r.remainingLiquid)}</div>
          <div className="mt-1 text-xs text-muted">Remaining reserve</div><div className="num font-semibold">{inr(r.remainingReserve)}</div>
          {r.warnings.map((w) => <p key={w} className="mt-2 text-xs text-warn">{w}</p>)}
        </div>
        <div className="lg:col-span-2">
          <Bars nf={nf} y="pct" height={220} data={rows} xKey="k" bars={[{ key: "before", name: "Cost % now", color: "var(--c9)" }, { key: "after", name: "Cost % after plan" }, { key: "target", name: "Target", color: "var(--c3)" }]} />
          <p className="text-xs text-muted">Remaining deficits after plan (₹ to target at post-plan total): {Object.entries(r.deficits).map(([k, v]) => `${k} ${v >= 0 ? inr(v) : "over " + inr(-v)}`).join(" · ")}</p>
        </div>
      </div>
      <p className="text-xs text-muted">Simulation only. Nothing is ordered. Deposits count toward the ₹2 lakh contribution target; selling Liquid BeES to buy stocks is internal deployment.</p>
    </div>
  );
}

export function SizingSimulator({ denominator, limits, nf }: { denominator: number; limits: { standardPct: number; highPct: number; exceptionalPct: number; hardLimitPct: number }; nf: NumberFormat }) {
  const [cost, setCost] = useState(50_000);
  const [lim, setLim] = useState(limits.highPct);
  const [den, setDen] = useState(Math.round(denominator));
  const c = sizingCapacity(cost, lim, den);
  const inr = (x: number) => formatINR(x, { fmt: nf });
  return (
    <div className="grid gap-3 text-sm md:grid-cols-4">
      <label className="flex flex-col gap-1"><span className="text-xs text-muted">Current invested cost ₹</span><input type="number" value={cost} onChange={(e) => setCost(Number(e.target.value))} /></label>
      <label className="flex flex-col gap-1"><span className="text-xs text-muted">Conviction limit %</span><select value={lim} onChange={(e) => setLim(Number(e.target.value))}><option value={limits.standardPct}>Standard {limits.standardPct}%</option><option value={limits.highPct}>High {limits.highPct}%</option><option value={limits.exceptionalPct}>Exceptional {limits.exceptionalPct}%</option><option value={limits.hardLimitPct}>Hard {limits.hardLimitPct}%</option></select></label>
      <label className="flex flex-col gap-1"><span className="text-xs text-muted">Denominator ₹ (direct-equity cost)</span><input type="number" value={den} onChange={(e) => setDen(Number(e.target.value))} /></label>
      <div className="rounded-lg border border-line p-2 text-xs"><div>Maximum cumulative cost: <b className="num">{inr(c.maxCost)}</b></div><div>Remaining capacity: <b className="num">{inr(c.capacity)}</b></div><div className="text-muted">If the purchase also grows the denominator: {inr(c.capacityIfDenominatorGrows)}</div></div>
    </div>
  );
}
