import Link from "next/link";
import { pageCtx } from "@/lib/server/page";
import { loadData } from "@/lib/server/repo";
import { list } from "@/lib/store/db";
import { Badge, Card, Note, PageHeader, Stat, T } from "@/components/ui";
import { Planner, SizingSimulator } from "@/components/Planner";
import { liquidityProfile } from "@/lib/engine/liquidity";
import type { ComplianceSnapshot } from "@/lib/types";

export default function Deployment() {
  const { a, s, nf, inr, cmp, pct } = pageCtx();
  const d = loadData();
  const C = a.capital;
  const stocks = a.holdings.filter((h) => h.assetType === "STOCK");
  const tgtSum = s.targetAllocation.Mid + s.targetAllocation.Small + s.targetAllocation.Micro + s.targetAllocation.Nano;
  const targets = { Mid: s.targetAllocation.Mid / tgtSum, Small: s.targetAllocation.Small / tgtSum, Micro: s.targetAllocation.Micro / tgtSum, Nano: s.targetAllocation.Nano / tgtSum };
  const secMap = new Map(d.securities.map((x) => [x.symbol, x]));
  const compliance = list<ComplianceSnapshot>("compliance").sort((x, y) => (x.date < y.date ? 1 : -1)).slice(0, 12);
  const deficits = a.allocation.directEquity.filter((r) => r.target !== null).map((r) => ({ k: r.key, gap: (r.target ?? 0) * C.limitDenominator.value - r.cost }));
  const ach = (x: number | null) => (x === null ? "—" : pct(x, 0));
  return (
    <>
      <PageHeader title="Capital Deployment & Position Sizing" subtitle="Plan how the reserve and new contributions could be deployed against cost-based targets and conviction limits. Simulation only — never places orders." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Combined reserve" value={inr(C.reserve.combined)} sub="Zerodha cash + Liquid BeES" />
        <Stat label="Zerodha available cash" value={C.reserve.availableCash !== null ? inr(C.reserve.availableCash) : "unknown"} />
        <Stat label="Liquid BeES (market value)" value={inr(C.reserve.liquidBees)} sub="T+1 to convert to cash" />
        <Stat label="Broker buying power" value={C.reserve.buyingPower !== null ? inr(C.reserve.buyingPower) : "—"} sub="Authoritative from Kite funds" />
        <Stat label="Limit denominator" value={cmp(C.limitDenominator.value)} sub={C.limitDenominator.label} />
      </div>
      <Card className="mt-4" title="Current cost-based allocation deficits" subtitle="₹ needed in each category to reach its target share of today's direct-equity invested cost.">
        <div className="flex flex-wrap gap-2">{deficits.map((x) => <Badge key={x.k} tone={x.gap > 0 ? "warn" : "accent"}>{x.k}: {x.gap >= 0 ? `${cmp(x.gap)} under` : `${cmp(-x.gap)} over`}</Badge>)}</div>
      </Card>
      <Card className="mt-4" title="Deployment planner">
        <Planner nf={nf} holdings={stocks.map((h) => ({ symbol: h.symbol, cap: h.cap.category, cost: h.invested, limitPct: h.limitPct }))} targets={targets} cash={C.reserve.availableCash ?? 0} liquid={C.reserve.liquidBees} hardLimitPct={s.positionLimits.hardLimitPct} monthly={s.monthlyTarget} guide={s.deploymentGuide} initial={s.positionLimits.initialPositionInr} />
      </Card>
      <Card className="mt-4" title="Contribution vs deployment vs allocation achievement" subtitle="Contribution = external deposits ÷ target. Deployment = stock purchases ÷ contribution (can exceed 100% when the reserve is used). Allocation = 1 − half the absolute deviation of the month's stock purchases from the cap guide.">
        <T head={["Month", "Target", "Contributed", "Contribution", "Parked in reserve", "Stock buys", "Deployment", "Mid / Small / Micro / Nano buys", "Allocation"]} align={["l", "r", "r", "r", "r", "r", "r", "r", "r"]}
          rows={[...C.deployment].reverse().slice(0, 18).map((m) => [m.month, cmp(m.target), cmp(m.contribution), <Badge key="c" tone={(m.contributionAch ?? 0) >= 1 ? "pos" : "warn"}>{ach(m.contributionAch)}</Badge>, cmp(m.parkedInReserve), cmp(m.stockBuys), ach(m.deploymentAch), ["Mid", "Small", "Micro", "Nano"].map((k) => cmp(m.byCap[k] ?? 0)).join(" / "), ach(m.allocationAch)])} />
        <Note>Investing the whole month in Liquid BeES still achieves the contribution target; deployment into stocks can happen later.</Note>
      </Card>
      <Card className="mt-4" title="Conviction-based position sizing" subtitle={`Cost-based limits use ${C.limitDenominator.label} (${inr(C.limitDenominator.value)}). Market-value weights shown for exposure only — no automatic sell instructions.`}>
        <T head={["Company", "Conviction", "Invested", "Cost %", "Value", "Value %", "Limit", "Limit ₹", "Remaining capacity", "Above limit", "Hard-limit room", "Risk-adj. exposure*"]} align={["l", "l", "r", "r", "r", "r", "r", "r", "r", "r", "r", "r"]}
          rows={stocks.map((h) => {
            const lp = liquidityProfile(h.symbol, d.prices, secMap.get(h.symbol), h.value ?? 0, s.positionLimits.initialPositionInr);
            const imp = lp.exits[1].impactPct;
            return [<Link key="s" className="text-accent" href={`/holdings/${encodeURIComponent(h.symbol)}`}>{h.symbol}</Link>, h.conviction, inr(h.invested), pct(h.limitWeight), inr(h.value), pct(h.weight), `${h.limitPct}%`, inr((h.limitPct / 100) * C.limitDenominator.value), <span key="c" className={(h.limitCapacity ?? 0) < 0 ? "text-warn" : ""}>{inr(Math.max(0, h.limitCapacity ?? 0))}</span>, h.aboveLimit > 0 ? <span key="a" className="text-warn">{inr(h.aboveLimit)}</span> : "—", inr(h.hardCapacity), imp !== null ? inr((h.value ?? 0) * (1 - imp)) : "unknown"];
          })} />
        <Note>* Risk-adjusted exposure = market value × (1 − estimated exit impact at 10% of daily volume). An estimate from price/volume history.</Note>
      </Card>
      <Card className="mt-4" title="Position-sizing simulator"><SizingSimulator nf={nf} denominator={C.limitDenominator.value} limits={s.positionLimits} /></Card>
      <Card className="mt-4" title="Compliance history" subtitle="Immutable snapshots recorded at each sync/import, stored with the denominator in force — changing the setting later does not rewrite them.">
        {compliance.length ? <T head={["Date", "Denominator", "Value", "Over limit"]} align={["l", "l", "r", "l"]} rows={compliance.map((c) => [c.date, c.denominator, inr(c.denominatorValue), c.rows.filter((r) => r.over).map((r) => r.symbol).join(", ") || "none"])} /> : <p className="text-sm text-muted">No snapshots yet (created on the next Kite sync or import).</p>}
      </Card>
    </>
  );
}
