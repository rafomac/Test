import Link from "next/link";
import { pageCtx } from "@/lib/server/page";
import { Badge, Card, Empty, Note, PageHeader, T } from "@/components/ui";
import { Donut, Bars } from "@/components/charts";
import { AllocationSim } from "@/components/AllocationSim";

const TYPE_LABEL: Record<string, string> = { STOCK: "Direct equity", ETF: "Equity ETFs", MF: "Mutual funds", CASH_EQUIVALENT: "Liquid BeES (cash-equivalent)", CASH: "Zerodha cash" };

export default async function Allocation({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const basis = sp.basis === "value" || sp.basis === "both" ? sp.basis : "cost";
  const { a, s, nf, inr, cmp, pct, pp } = pageCtx();
  const de = a.allocation.directEquity;
  const t = s.thresholds;
  const tgtSum = s.targetAllocation.Mid + s.targetAllocation.Small + s.targetAllocation.Micro + s.targetAllocation.Nano;
  const target = { Mid: s.targetAllocation.Mid / tgtSum, Small: s.targetAllocation.Small / tgtSum, Micro: s.targetAllocation.Micro / tgtSum, Nano: s.targetAllocation.Nano / tgtSum };
  const current = Object.fromEntries(de.map((r) => [r.key, r.value]));
  const etfV = a.holdings.filter((h) => h.assetType === "ETF").reduce((x, h) => x + (h.value ?? 0), 0);
  const stocks = a.holdings.filter((h) => h.assetType === "STOCK");
  const totalCost = de.reduce((x, r) => x + r.cost, 0), totalValue = de.reduce((x, r) => x + r.value, 0);
  const unrl = (k: string) => stocks.filter((h) => h.cap.category === k).reduce((x, h) => x + (h.unrealized ?? 0), 0);
  const largest = (k: string) => stocks.filter((h) => h.cap.category === k).sort((x, y) => (y.value ?? 0) - (x.value ?? 0))[0];
  const toggle = (k: string, label: string) => <Link href={`/allocation?basis=${k}`} className={`px-3 py-1 ${basis === k ? "bg-accent text-white" : "text-muted hover:text-fg"}`}>{label}</Link>;
  const costTable = (
    <Card title="System A — Invested-cost allocation (allocation discipline)" subtitle={`Denominator: direct-equity invested cost ${inr(totalCost)}. Liquid BeES, ETFs and cash excluded. “Remaining capacity” = target cost − current cost at today's total.`}>
      <T head={["Category", "Basis", "Target", "Actual (cost)", "Gap", "Invested", "Target invested", "Shortfall / excess", "Remaining capacity", "Companies"]} align={["l", "l", "r", "r", "r", "r", "r", "r", "r", "r"]}
        rows={de.map((r) => { const tc = r.target !== null ? r.target * totalCost : null; return [r.key, r.key === "Micro" || r.key === "Nano" ? <Badge key="c" tone="warn">custom</Badge> : r.key === "Unclassified" ? <Badge key="u">no data</Badge> : <Badge key="o" tone="accent">official</Badge>, r.target !== null ? pct(r.target, 0) : "—", pct(r.costPct), r.target !== null ? <span key="g" className={Math.abs(r.costPct - r.target) < 0.03 ? "" : r.costPct < r.target ? "text-warn" : "text-accent"}>{pp(r.costPct - r.target)}</span> : "—", inr(r.cost), tc !== null ? inr(tc) : "—", tc !== null ? (tc - r.cost >= 0 ? `${inr(tc - r.cost)} under` : `${inr(r.cost - tc)} over`) : "—", tc !== null ? inr(Math.max(0, tc - r.cost)) : "—", r.count]; })} />
      <Bars nf={nf} y="pct" data={de.filter((r) => r.target !== null)} xKey="key" bars={[{ key: "target", name: "Target", color: "var(--c3)" }, { key: "costPct", name: "Actual (invested cost)" }]} height={200} />
      <Note>This is the primary discipline measure: it reflects where you chose to commit capital. Monthly guide: {Object.entries(s.deploymentGuide).map(([k, v]) => `${k} ${cmp(v)}`).join(" · ")} (<Link className="text-accent" href="/deployment">planner</Link>).</Note>
    </Card>
  );
  const valueTable = (
    <Card title="System B — Market-value allocation (exposure & risk monitoring)" subtitle={`Denominator: direct-equity market value ${inr(totalValue)}. Winners are not auto-sold to restore targets — this shows the resulting exposure.`}>
      <T head={["Category", "Target", "Actual (value)", "Deviation", "Current value", "Unrealised gain", "Largest holding", "Impact of −30% / −50%"]} align={["l", "r", "r", "r", "r", "r", "l", "r"]}
        rows={de.map((r) => { const L = largest(r.key); return [r.key, r.target !== null ? pct(r.target, 0) : "—", pct(r.valuePct), r.gapPP !== null ? pp(r.gapPP) : "—", inr(r.value), <span key="u" className={unrl(r.key) >= 0 ? "text-pos" : "text-neg"}>{cmp(unrl(r.key))}</span>, L ? `${L.symbol} (${pct(L.weight)})` : "—", `${cmp(-0.3 * r.value)} / ${cmp(-0.5 * r.value)}`]; })} />
      <Bars nf={nf} y="pct" data={de.filter((r) => r.target !== null)} xKey="key" bars={[{ key: "target", name: "Target", color: "var(--c3)" }, { key: "valuePct", name: "Actual (market value)", color: "var(--c2)" }]} height={200} />
    </Card>
  );
  return (
    <>
      <PageHeader title="Market-Cap Allocation" subtitle={<>Direct-equity target: Mid {s.targetAllocation.Mid}% · Small {s.targetAllocation.Small}% · Micro {s.targetAllocation.Micro}% · Nano {s.targetAllocation.Nano}%. Large/Mid/Small = official SEBI/AMFI rank; Micro (₹{t.nanoMaxCr}–{t.microMaxCr.toLocaleString("en-IN")} cr) and Nano (&lt; ₹{t.nanoMaxCr} cr) are <b>custom</b> subdivisions of Small-cap. Classification history is kept, so past allocations are not rewritten when a company changes category.</>}
        right={<div className="no-print inline-flex overflow-hidden rounded-md border border-line text-xs">{toggle("cost", "Invested cost")}{toggle("value", "Market value")}{toggle("both", "Compare both")}</div>} />
      {!de.length ? <Empty title="No direct-equity holdings" /> : (
        <>
          {basis === "both" ? (
            <>
              <Card title="Side by side" subtitle="Cost shows discipline; value shows today's exposure. The difference is appreciation/depreciation.">
                <Bars nf={nf} y="pct" data={de.filter((r) => r.target !== null)} xKey="key" bars={[{ key: "target", name: "Target", color: "var(--c3)" }, { key: "costPct", name: "Invested cost" }, { key: "valuePct", name: "Market value", color: "var(--c2)" }]} />
                <T head={["Category", "Target", "Cost %", "Value %", "Drift from appreciation"]} align={["l", "r", "r", "r", "r"]} rows={de.map((r) => [r.key, r.target !== null ? pct(r.target, 0) : "—", pct(r.costPct), pct(r.valuePct), pp(r.valuePct - r.costPct)])} />
              </Card>
              <div className="mt-4 grid gap-4 xl:grid-cols-2">{costTable}{valueTable}</div>
            </>
          ) : (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                <Card title={basis === "cost" ? "By invested cost" : "By current market value"}><Donut nf={nf} data={de.map((r) => ({ name: r.key, value: basis === "cost" ? r.cost : r.value }))} /></Card>
                <Card title={basis === "cost" ? "By market value (for reference)" : "By invested cost (for reference)"}><Donut nf={nf} data={de.map((r) => ({ name: r.key, value: basis === "cost" ? r.value : r.cost }))} /></Card>
              </div>
              <div className="mt-4">{basis === "cost" ? costTable : valueTable}</div>
            </>
          )}
          {de.some((r) => r.key === "Unclassified") && <Note tone="warn">Unclassified stocks lack AMFI rank and market cap — add them on each holding&apos;s page or import the AMFI list + security master.</Note>}
        </>
      )}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Total portfolio by asset class" subtitle="Cash & cash equivalents = Zerodha cash + Liquid BeES. Mode A — nothing assumed sold.">
          <Donut nf={nf} data={a.allocation.assetTypes.map((r) => ({ name: TYPE_LABEL[r.key] ?? r.key, value: r.value }))} />
          <T head={["Class", "Value", "%"]} align={["l", "r", "r"]} rows={[...a.allocation.assetTypes.filter((r) => r.key !== "CASH_EQUIVALENT" && r.key !== "CASH").map((r) => [TYPE_LABEL[r.key] ?? r.key, inr(r.value), pct(r.valuePct)]), [<b key="c">Cash & cash equivalents</b>, inr(a.allocation.assetTypes.filter((r) => r.key === "CASH_EQUIVALENT" || r.key === "CASH").reduce((x, r) => x + r.value, 0)), pct(a.allocation.assetTypes.filter((r) => r.key === "CASH_EQUIVALENT" || r.key === "CASH").reduce((x, r) => x + r.valuePct, 0))], ...a.allocation.assetTypes.filter((r) => r.key === "CASH_EQUIVALENT" || r.key === "CASH").map((r) => [<span key="s" className="pl-3 text-muted">{TYPE_LABEL[r.key]}</span>, inr(r.value), pct(r.valuePct)])]} />
        </Card>
        <Card title="Look-through allocation" subtitle={`ETFs/MFs where constituent data is known (${pct(a.allocation.lookThroughCoverage, 0)} of value covered).`}>
          <Donut nf={nf} data={a.allocation.lookThrough.map((r) => ({ name: r.key, value: r.value }))} />
          <Note>Index ETFs use index-methodology estimates. ETFs are never counted as direct small-cap stocks; Liquid BeES is never counted in any equity category.</Note>
        </Card>
        <Card title="ETF, MF & reserve holdings">
          <T head={["Symbol", "Class", "Value", "Cost"]} align={["l", "l", "r", "r"]} rows={[...a.allocation.etfs, ...a.allocation.mfs].map((h) => [h.symbol, h.assetType === "CASH_EQUIVALENT" ? "Cash-equivalent" : h.assetType, cmp(h.value), cmp(h.invested)])} />
        </Card>
      </div>
      <Card className="mt-4" title="Mode B — target direct-equity simulation" subtitle="Gradual reallocation from ETFs/reserve/future contributions into researched stocks. User-controlled; nothing is executed.">
        <AllocationSim nf={nf} current={current} target={target} etfValue={etfV} reserve={a.capital.reserve.combined} monthly={s.monthlyTarget} />
      </Card>
    </>
  );
}
