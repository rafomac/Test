import { pageCtx } from "@/lib/server/page";
import { loadData } from "@/lib/server/repo";
import { Badge, Card, Empty, Note, PageHeader, T } from "@/components/ui";
import { PrintButton } from "@/components/PrintButton";
import { monthlyReport, annualReport } from "@/lib/engine/reports";
import { monthKey } from "@/lib/engine/dates";

export default async function Reports({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { a, s, inr, cmp, pct, pp } = pageCtx();
  const d = loadData();
  const months = a.sip.months.map((m) => m.month).reverse();
  if (!months.length) return (<><PageHeader title="Reports" /><Empty title="No history to report on" /></>);
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : monthKey(a.asOf);
  const years = [...new Set(months.map((m) => m.slice(0, 4)))];
  const year = sp.year && /^\d{4}$/.test(sp.year) ? sp.year : years[0];
  const m = monthlyReport(a, d, s, month);
  const y = annualReport(a, d, s, year);
  const capKeys = [...new Set([...Object.keys(m.capStart), ...Object.keys(m.capEnd)])];
  const secKeys = [...new Set([...Object.keys(m.sectorStart), ...Object.keys(m.sectorEnd)])];
  const dl = (type: string, extra: string) => <span className="no-print space-x-2 text-xs"><a className="text-accent" href={`/api/export?type=${type}&format=csv&${extra}`}>CSV</a><a className="text-accent" href={`/api/export?type=${type}&format=xlsx&${extra}`}>Excel</a></span>;
  return (
    <>
      <PageHeader title="Reports" subtitle="Monthly and annual investment reports. Snapshots are immutable; re-running a report uses the same imported records." right={<div className="flex items-center gap-2"><PrintButton /><a className="no-print rounded-md border border-line px-2 py-1 text-xs" href="/api/export?type=all&format=xlsx">Full workbook (Excel)</a></div>} />
      <form className="no-print mb-4 flex flex-wrap gap-2 text-sm">
        <select name="month" defaultValue={month}>{months.map((x) => <option key={x}>{x}</option>)}</select>
        <select name="year" defaultValue={year}>{years.map((x) => <option key={x}>{x}</option>)}</select>
        <button className="rounded-md bg-accent px-3 py-1 text-white">Show</button>
      </form>

      <Card title={`Monthly report — ${month}`} right={dl("monthly-report", `month=${month}`)}>
        <div className="grid gap-4 lg:grid-cols-3">
          <T head={["Item", "Value"]} align={["l", "r"]} rows={[
            ["1. Opening value", inr(m.opening)], ["2. Closing value", inr(m.closing)], ["3. New contributions", m.contributions !== null ? inr(m.contributions) : "— (no ledger)"],
            ["4. Withdrawals", m.withdrawals !== null ? inr(m.withdrawals) : "—"], ["Net purchases (incl. internal)", inr(m.netFlows)], ["5. Investment return (₹)", inr(m.pnl)],
            ["6. TWR for month", pct(m.twr, 2)], ["Pro-rata 40% monthly target", pct(m.targetMonthly, 2)], ["7. Realised P/L", inr(m.realized)], ["8. Dividends", inr(m.dividends)],
            ["9. SIP", m.sip ? `${inr(m.sip.contribution)} / ${inr(m.sip.target)} (${m.sip.status})` : "—"],
          ]} />
          <div>
            <h3 className="mb-1 text-xs font-semibold">10. Market-cap allocation change</h3>
            <T head={["Cap", "Start", "End", "Δ"]} align={["l", "r", "r", "r"]} rows={capKeys.map((k) => [k, pct(m.capStart[k] ?? 0), pct(m.capEnd[k] ?? 0), pp((m.capEnd[k] ?? 0) - (m.capStart[k] ?? 0))])} />
            <h3 className="mb-1 mt-3 text-xs font-semibold">11. Sector allocation change</h3>
            <T head={["Sector", "Start", "End", "Δ"]} align={["l", "r", "r", "r"]} rows={secKeys.map((k) => [k, pct(m.sectorStart[k] ?? 0), pct(m.sectorEnd[k] ?? 0), pp((m.sectorEnd[k] ?? 0) - (m.sectorStart[k] ?? 0))])} />
          </div>
          <div>
            <h3 className="mb-1 text-xs font-semibold">12. Best and worst contributors</h3>
            <T head={["Holding", "Gain"]} align={["l", "r"]} rows={[...m.best.map((b) => [b.symbol, <span key="g" className="text-pos">{cmp(b.gain)}</span>]), ...m.worst.map((b) => [b.symbol, <span key="g" className="text-neg">{cmp(b.gain)}</span>])]} />
            <h3 className="mb-1 mt-3 text-xs font-semibold">13. Risk (current)</h3>
            <p className="text-xs text-muted">Top-5 {pct(a.risk.concentration.top5Value)} · micro/nano {pct(a.risk.microNanoPct)} · {a.risk.flags.filter((f) => f.severity === "high").length} high-severity flags</p>
            <h3 className="mb-1 mt-3 text-xs font-semibold">14. Annual target progress</h3>
            <p className="text-xs text-muted">{a.summary.gapNote} Status: <Badge>{a.summary.status}</Badge></p>
            <h3 className="mb-1 mt-3 text-xs font-semibold">15. Research follow-ups</h3>
            <p className="text-xs text-muted">{m.followUps.length ? m.followUps.map((f) => `${f.symbol} (${f.nextReview})`).join(", ") : "None due"}</p>
          </div>
        </div>
        {m.twr === null && <Note tone="warn">TWR unavailable for this month — price history incomplete.</Note>}
      </Card>

      <Card className="mt-4" title={`Annual report — ${year}`} right={dl("annual-report", `year=${year}`)}>
        <div className="grid gap-4 lg:grid-cols-3">
          <T head={["Item", "Value"]} align={["l", "r"]} rows={[
            ["Annual TWR", pct(y.pm.twr)], [`Money-weighted ${y.pm.mwrAnnualised ? "(ann.)" : "(period)"}`, pct(y.pm.mwr)], ["Wealth created (investment P/L)", inr(y.wealthCreated)],
            ["Contributions", y.contributions !== null ? inr(y.contributions) : "— (no ledger)"], ["SIP target", inr(y.sipTarget)], ["Months target met", `${y.monthsMet} / ${y.monthsInPlan}`],
            ["Versus 40% aspiration", y.pm.twr !== null ? pp(y.pm.twr - (y.pm.days >= 360 ? y.targetReturn : Math.pow(1 + y.targetReturn, y.pm.days / 365) - 1)) : "—"],
          ]} />
          <div><h3 className="mb-1 text-xs font-semibold">Benchmarks</h3>{y.benchmarks.length ? <T head={["Index", "Return"]} align={["l", "r"]} rows={y.benchmarks.map((b) => [b.name, pct(b.ret)])} /> : <Empty title="No benchmark data" />}</div>
          <div>
            <h3 className="mb-1 text-xs font-semibold">Sector attribution (₹)</h3>
            <T head={["Sector", "Gain"]} align={["l", "r"]} rows={y.sectorAttribution.map((x) => [x.key, cmp(x.gain)])} />
            <h3 className="mb-1 mt-3 text-xs font-semibold">Market-cap attribution (₹)</h3>
            <T head={["Cap", "Gain"]} align={["l", "r"]} rows={y.capAttribution.map((x) => [x.key, cmp(x.gain)])} />
          </div>
        </div>
        <Note>Investment discipline: {y.monthsMet}/{y.monthsInPlan} SIP months met. Major risks and goal progress: see Risk and Annual Performance Goal tabs. Partial years compare against a pro-rata target.</Note>
      </Card>
      <p className="mt-4 text-xs text-muted">Generated {new Date(a.generatedAt).toLocaleString("en-IN")} · valuation {a.valuationSource.kind} ({a.valuationSource.quality}). Data-quality issues: {a.dataQuality.issues.length}.</p>
    </>
  );
}
