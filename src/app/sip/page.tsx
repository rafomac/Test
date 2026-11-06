import { pageCtx } from "@/lib/server/page";
import { Badge, Card, Empty, Note, PageHeader, Stat, T } from "@/components/ui";
import { Bars, LineSeries } from "@/components/charts";
import { SipTargets } from "@/components/SipTargets";
import { monthKey } from "@/lib/engine/dates";

const stTone = (s: string) => (s === "Met" || s === "Surplus" ? "pos" : s === "Partial" ? "warn" : s === "Missed" ? "neg" : "muted") as "pos" | "warn" | "neg" | "muted";

export default function Sip() {
  const { a, s, nf, inr, cmp, pct } = pageCtx();
  const sip = a.sip;
  const cur = sip.months.find((m) => m.month === monthKey(a.asOf));
  const inPlan = sip.months.filter((m) => m.inPlan);
  const last = inPlan[inPlan.length - 1];
  const year = a.asOf.slice(0, 4);
  const yr = sip.annual.find((y) => y.year === year);
  const rows = [...sip.months].reverse();
  return (
    <>
      <PageHeader title="Monthly ₹2 Lakh SIP" subtitle={<>Tracks EXTERNAL contributions only. Moving money from Liquid BeES or ETFs into stocks is internal deployment and never counts as a contribution. <Badge tone={sip.basis === "ledger" ? "pos" : "warn"}>{sip.basis === "ledger" ? "Ledger-verified" : sip.basis === "estimate" ? "Estimated" : "No data"}</Badge></>} />
      <Note tone={sip.basis === "ledger" ? "muted" : "warn"}>{sip.basisNote}</Note>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="This month target" value={inr(cur?.target ?? s.monthlyTarget)} sub={cur?.month} />
        <Stat label="This month contributed" value={inr(cur?.contribution ?? 0)} sub={cur ? <Badge tone={stTone(cur.status)}>{cur.status}</Badge> : undefined} />
        <Stat label="This month shortfall" value={inr(Math.max(0, (cur?.target ?? 0) - (cur?.contribution ?? 0)))} tone={(cur?.target ?? 0) > (cur?.contribution ?? 0) ? "neg" : "pos"} />
        <Stat label={`${year} contributed / target`} value={`${cmp(yr?.actual ?? 0)} / ${cmp(yr?.target ?? 0)}`} sub={yr ? `Gap ${cmp(yr.gap)}` : "Annual target ₹24 L"} />
        <Stat label="Cumulative gap since plan start" value={inr(last?.cumGap ?? 0)} tone={(last?.cumGap ?? 0) < 0 ? "neg" : "pos"} sub={`Since ${s.planStartMonth}`} />
        <Stat label="Consistency" value={sip.consistency.hitRate !== null ? pct(sip.consistency.hitRate, 0) : "—"} sub={`${sip.consistency.monthsMet}/${sip.consistency.monthsInPlan} months met · streak ${sip.consistency.streak}`} />
      </div>
      {!sip.months.length ? <div className="mt-4"><Empty title="No transactions yet">Import the Console ledger (Funds → Statement) and tradebook.</Empty></div> : (
        <>
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <Card title="1 · Planned vs actual monthly contributions"><Bars nf={nf} data={sip.months.filter((m) => m.inPlan)} xKey="month" bars={[{ key: "target", name: "Target", color: "var(--c9)" }, { key: "contribution", name: "Actual" }]} /></Card>
            <Card title="2 · Cumulative SIP progress"><LineSeries nf={nf} data={sip.months.filter((m) => m.inPlan)} xKey="month" lines={[{ key: "cumTarget", name: "Cumulative target", color: "var(--c9)", dash: true }, { key: "cumActual", name: "Cumulative actual", area: true }]} /></Card>
            <Card title="3 · Deployment: stocks vs ETFs vs MFs vs reserve" subtitle="Gross purchases by destination (includes internal switches)."><Bars nf={nf} data={sip.months.map((m) => ({ month: m.month, Stocks: m.buys.STOCK, ETFs: m.buys.ETF, MFs: m.buys.MF, "Liquid reserve": m.buys.CASH_EQUIVALENT }))} xKey="month" bars={[{ key: "Stocks", name: "Stocks", stack: "a" }, { key: "ETFs", name: "ETFs", stack: "a" }, { key: "MFs", name: "MFs", stack: "a" }, { key: "Liquid reserve", name: "Liquid reserve", stack: "a" }]} /></Card>
            <Card title="4 · Monthly contribution consistency" subtitle="Contribution minus target (green = met)."><Bars nf={nf} data={sip.months.filter((m) => m.inPlan)} xKey="month" bars={[{ key: "difference", name: "Difference" }]} signColor /></Card>
            <Card title="5 · Annual contribution progress"><Bars nf={nf} data={sip.annual} xKey="year" bars={[{ key: "target", name: "Target", color: "var(--c9)" }, { key: "actual", name: "Actual" }]} /></Card>
            <Card title="6 · Unallocated capital history" subtitle="Ledger cash balance and net Liquid BeES parking.">
              {sip.basis === "ledger" ? <LineSeries nf={nf} data={sip.months.map((m) => ({ month: m.month, cash: m.cashBalance, liquid: m.liquidNet }))} xKey="month" lines={[{ key: "cash", name: "Cash balance", area: true }, { key: "liquid", name: "Net parked in Liquid BeES (month)", bar: true, color: "var(--c2)" }]} /> : <Empty title="Requires ledger import" />}
            </Card>
          </div>
          <Card className="mt-4" title="Monthly SIP table" right={<a className="text-xs text-accent" href="/api/export?type=sip&format=csv">Export CSV</a>}>
            <T head={["Month", "Target", "Actual contribution", "Difference", "Stock buys", "ETF buys", "Liquid BeES (net)", "Cash balance", "Cum. target", "Cum. actual", "Status"]} align={["l", "r", "r", "r", "r", "r", "r", "r", "r", "r", "l"]}
              rows={rows.map((m) => [m.month, m.inPlan ? inr(m.target) : "—", inr(m.contribution), m.inPlan ? <span className={m.difference < 0 ? "text-neg" : "text-pos"}>{inr(m.difference)}</span> : "—", inr(m.buys.STOCK), inr(m.buys.ETF), inr(m.liquidNet), m.cashBalance !== null ? inr(m.cashBalance) : "—", inr(m.cumTarget), inr(m.cumActual), <Badge key="s" tone={stTone(m.status)}>{m.status}</Badge>])} />
          </Card>
        </>
      )}
      <Card className="mt-4" title="Targets" subtitle="Historical months can be adjusted. Months before the plan start are not assumed to have had a ₹2 lakh commitment.">
        <SipTargets monthlyTarget={s.monthlyTarget} planStartMonth={s.planStartMonth} overrides={s.monthlyTargetOverrides} />
      </Card>
    </>
  );
}
