import { pageCtx } from "@/lib/server/page";
import { Badge, Card, Empty, Note, PageHeader, T } from "@/components/ui";
import { Donut, Bars } from "@/components/charts";
import { AllocationSim } from "@/components/AllocationSim";

const TYPE_LABEL: Record<string, string> = { STOCK: "Direct equity", ETF: "ETFs", MF: "Mutual funds", CASH_EQUIVALENT: "Liquid BeES / cash-equivalent", CASH: "Cash (broker)" };

export default function Allocation() {
  const { a, s, nf, inr, cmp, pct, pp } = pageCtx();
  const de = a.allocation.directEquity;
  const t = s.thresholds;
  const tgtSum = s.targetAllocation.Mid + s.targetAllocation.Small + s.targetAllocation.Micro + s.targetAllocation.Nano;
  const target = { Mid: s.targetAllocation.Mid / tgtSum, Small: s.targetAllocation.Small / tgtSum, Micro: s.targetAllocation.Micro / tgtSum, Nano: s.targetAllocation.Nano / tgtSum };
  const current = Object.fromEntries(de.map((r) => [r.key, r.value]));
  const etfV = a.holdings.filter((h) => h.assetType === "ETF").reduce((x, h) => x + (h.value ?? 0), 0);
  return (
    <>
      <PageHeader title="Market-Cap Allocation" subtitle={<>Direct-equity target: Mid {s.targetAllocation.Mid}% · Small {s.targetAllocation.Small}% · Micro {s.targetAllocation.Micro}% · Nano {s.targetAllocation.Nano}% (excludes ETFs and cash reserve). Large/Mid/Small use the official SEBI/AMFI rank; Micro (₹{t.nanoMaxCr}–{t.microMaxCr.toLocaleString("en-IN")} cr) and Nano (&lt; ₹{t.nanoMaxCr} cr) are <b>custom</b> subdivisions of Small-cap.</>} />
      {!de.length ? <Empty title="No direct-equity holdings" /> : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="By current market value"><Donut nf={nf} data={de.map((r) => ({ name: r.key, value: r.value }))} /></Card>
            <Card title="By invested cost"><Donut nf={nf} data={de.map((r) => ({ name: r.key, value: r.cost }))} /></Card>
          </div>
          <Card className="mt-4" title="Target vs actual (direct equity)">
            <T head={["Category", "Basis", "Target %", "Actual (value) %", "Actual (cost) %", "Gap", "Current value", "Target value", "Shortfall / excess", "Companies"]} align={["l", "l", "r", "r", "r", "r", "r", "r", "r", "r"]}
              rows={de.map((r) => [r.key, r.key === "Micro" || r.key === "Nano" ? <Badge key="c" tone="warn">custom</Badge> : r.key === "Unclassified" ? <Badge key="u">no data</Badge> : <Badge key="o" tone="accent">official</Badge>, r.target !== null ? pct(r.target, 0) : "—", pct(r.valuePct), pct(r.costPct), r.gapPP !== null ? <span className={Math.abs(r.gapPP) < 0.03 ? "" : r.gapPP < 0 ? "text-warn" : "text-accent"}>{pp(r.gapPP)}</span> : "—", inr(r.value), r.targetValue !== null ? inr(r.targetValue) : "—", r.shortfall !== null ? (r.shortfall > 0 ? `${inr(r.shortfall)} under` : `${inr(-r.shortfall)} over`) : "—", r.count])} />
            {de.some((r) => r.key === "Unclassified") && <Note tone="warn">Unclassified stocks lack AMFI rank and market cap — add them on each holding&apos;s page or import the AMFI list + security master.</Note>}
            <Bars nf={nf} y="pct" data={de.filter((r) => r.target !== null)} xKey="key" bars={[{ key: "target", name: "Target", color: "var(--c3)" }, { key: "valuePct", name: "Actual (value)" }, { key: "costPct", name: "Actual (cost)", color: "var(--c2)" }]} height={220} />
          </Card>
        </>
      )}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Total portfolio by asset type" subtitle="Mode A — current portfolio, nothing assumed sold.">
          <Donut nf={nf} data={a.allocation.assetTypes.map((r) => ({ name: TYPE_LABEL[r.key] ?? r.key, value: r.value }))} />
          <T head={["Type", "Value", "%"]} align={["l", "r", "r"]} rows={a.allocation.assetTypes.map((r) => [TYPE_LABEL[r.key] ?? r.key, inr(r.value), pct(r.valuePct)])} />
        </Card>
        <Card title="Look-through allocation" subtitle={`Includes ETFs/MFs where constituent data is known (${pct(a.allocation.lookThroughCoverage, 0)} of value covered).`}>
          <Donut nf={nf} data={a.allocation.lookThrough.map((r) => ({ name: r.key, value: r.value }))} />
          <Note>Index ETFs use index-methodology estimates (e.g. Nifty 50 → large-cap). Enter look-through weights for other funds in the security master. ETFs are never counted as direct small-cap stocks.</Note>
        </Card>
        <Card title="ETF & mutual fund holdings">
          <T head={["Symbol", "Type", "Value", "Cost"]} align={["l", "l", "r", "r"]} rows={[...a.allocation.etfs, ...a.allocation.mfs].map((h) => [h.symbol, h.assetType === "CASH_EQUIVALENT" ? "Reserve" : h.assetType, cmp(h.value), cmp(h.invested)])} />
        </Card>
      </div>
      <Card className="mt-4" title="Mode B — target direct-equity simulation" subtitle="Gradual reallocation from ETFs/reserve/future contributions into researched stocks. User-controlled; nothing is executed.">
        <AllocationSim nf={nf} current={current} target={target} etfValue={etfV} reserve={a.summary.liquidReserve + (a.summary.cash ?? 0)} monthly={s.monthlyTarget} />
      </Card>
    </>
  );
}
