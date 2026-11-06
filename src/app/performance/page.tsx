import { pageCtx } from "@/lib/server/page";
import { Badge, Card, Empty, Note, PageHeader, Stat, T, tone } from "@/components/ui";
import { Bars, LineSeries } from "@/components/charts";

export default function Performance() {
  const { a, s, nf, inr, pct, pp } = pageCtx();
  const S = a.summary;
  const tgt = s.targetCagrPct / 100;
  const tgtM = Math.pow(1 + tgt, 1 / 12) - 1;
  if (!a.series.length) return (<><PageHeader title="Annual Performance Goal" /><Empty title="No transaction history">Import your tradebook to measure performance against the {s.targetCagrPct}% aspiration.</Empty></>);

  const step = Math.max(1, Math.floor(a.series.length / 400));
  const pathData = a.series.map((p, i) => ({ date: p.date, actual: p.covered ? p.value : null, target: a.targetSeries[i]?.target, invested: p.cumNetInvested })).filter((_, i, arr) => i % step === 0 || i === arr.length - 1);
  // Growth of ₹1 (TWR index) vs 40% compounding of ₹1 over the same covered run
  let runStart: string | null = null;
  const idx = a.series.map((p) => {
    if (p.twrIndex === null) { runStart = null; return { date: p.date, twr: null, tgt: null }; }
    if (runStart === null) runStart = p.date;
    const yrs = (Date.parse(p.date) - Date.parse(runStart)) / 86_400_000 / 365;
    return { date: p.date, twr: p.twrIndex, tgt: Math.pow(1 + tgt, yrs) };
  }).filter((_, i, arr) => i % step === 0 || i === arr.length - 1);
  const blend = a.benchmarks.find((b) => b.code === "BLEND");
  const monthly = a.monthly.map((m) => ({ key: m.key, ret: m.ret, target: tgtM, bench: blend?.monthly.find((x) => x.key === m.key)?.ret ?? null }));
  const cal = a.calendar.map((c) => {
    const partial = c.days < 240;
    return { key: c.key + (partial ? " (partial)" : ""), ret: c.ret, target: partial ? Math.pow(1 + tgt, c.days / 252) - 1 : tgt };
  });
  const best = S.xirrAccount ?? S.xirrSecurities;
  const statusTone = S.status === "Ahead" ? "pos" : S.status === "Behind" ? "neg" : S.status === "Near" ? "warn" : "muted";
  const benchRel = a.benchmarks.filter((b) => b.available);

  return (
    <>
      <PageHeader title="Annual Performance Goal" subtitle={`Actual investment performance versus the ${s.targetCagrPct}% aspirational annualised return. Returns exclude the effect of your monthly contributions.`} right={<Badge tone={statusTone}>{S.status} the target reference</Badge>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Stat label="XIRR (money-weighted)" value={pct(best)} tone={tone(best)} sub={S.yearsSinceInception < 1 ? "History < 1 year — treat with caution" : "Annualised, actual dated cash flows"} />
        <Stat label="TWR (time-weighted)" value={pct(S.twrAnnualised ?? S.twrSinceInception)} sub={S.twrAnnualised !== null ? "Annualised" : "Cumulative, not annualised"} tone={tone(S.twrSinceInception)} />
        <Stat label="Target" value={`${s.targetCagrPct}%`} sub="Stretch aspiration" />
        <Stat label="Gap (XIRR − target)" value={S.gapVsTarget !== null ? pp(S.gapVsTarget) : "n/a"} tone={tone(S.gapVsTarget)} sub={S.gapNote} />
        <Stat label="Target reference value" value={inr(S.targetReferenceValue)} sub="Your dated net investments compounded at target" />
        <Stat label="Actual vs reference" value={S.targetReferenceValue ? pct(S.marketValue / S.targetReferenceValue - 1) : "—"} tone={S.targetReferenceValue ? tone(S.marketValue - S.targetReferenceValue) : null} sub={S.statusDetail} />
      </div>
      <Note>Ahead/near/behind compares market value with the reference path within ±5%. Annualised comparisons are only shown once there is at least one year of history; shorter periods use the reference path or pro-rata target.</Note>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card title="1 · Actual portfolio value vs target-growth reference path" subtitle="Reference = Σ each dated net purchase × (1 + target)^(years since that date). Same contributions, target-rate growth.">
          <LineSeries nf={nf} data={pathData} xKey="date" lines={[{ key: "actual", name: "Actual value", area: true }, { key: "target", name: `${s.targetCagrPct}% reference`, color: "var(--c3)", dash: true }, { key: "invested", name: "Net invested", color: "var(--c9)" }]} />
        </Card>
        <Card title="2/3 · Growth of ₹1 (TWR) vs target compounding" subtitle="Measures management performance independent of contribution timing.">
          <LineSeries nf={nf} y="num" data={idx} xKey="date" lines={[{ key: "twr", name: "Portfolio TWR index" }, { key: "tgt", name: `${s.targetCagrPct}% compounding`, color: "var(--c3)", dash: true }]} />
          {S.twrNote && <Note tone="warn">{S.twrNote}</Note>}
        </Card>
        <Card title="4 · Monthly returns (TWR)" subtitle={`Pro-rata monthly target = ${pct(tgtM, 2)}. Incomplete months (missing prices) are omitted.`}>
          <Bars nf={nf} y="pct" data={monthly} xKey="key" bars={[{ key: "ret", name: "Portfolio" }]} signColor refY={tgtM} />
        </Card>
        <Card title="5 · Calendar-year returns vs target" subtitle="Partial years are compared to a pro-rata target, not the full-year 40%.">
          <Bars nf={nf} y="pct" data={cal} xKey="key" bars={[{ key: "ret", name: "Portfolio TWR" }, { key: "target", name: "Target", color: "var(--c3)" }]} />
        </Card>
        <Card title="6 · Rolling 12-month return">
          {a.rolling12.some((r) => r.ret !== null) ? <LineSeries nf={nf} y="pct" data={a.rolling12.map((r) => ({ ...r, target: tgt }))} xKey="key" lines={[{ key: "ret", name: "Rolling 12M" }, { key: "target", name: "Target", color: "var(--c3)", dash: true }]} /> : <Empty title="Needs ≥ 12 complete months" />}
        </Card>
        <Card title="7 · Rolling 3-year annualised return">
          {a.rolling36.some((r) => r.ret !== null) ? <LineSeries nf={nf} y="pct" data={a.rolling36.map((r) => ({ ...r, target: tgt }))} xKey="key" lines={[{ key: "ret", name: "Rolling 3Y ann." }, { key: "target", name: "Target", color: "var(--c3)", dash: true }]} /> : <Empty title="Needs ≥ 36 complete months of priced history" />}
        </Card>
        <Card title="8 · Benchmark-relative performance" subtitle="Total-return indices (import TRI series on Settings). Blended = your target cap mix.">
          {benchRel.length ? (
            <>
              <LineSeries nf={nf} y="num" data={a.series.map((p, i) => ({ date: p.date, Portfolio: p.twrIndex, ...Object.fromEntries(benchRel.map((b) => [b.name, b.cumulative[i]?.value ?? null])) })).filter((_, i, arr) => i % step === 0 || i === arr.length - 1)} xKey="date" lines={[{ key: "Portfolio", name: "Portfolio (TWR)" }, ...benchRel.map((b, i) => ({ key: b.name, name: b.name, color: `var(--c${i + 2})`, dash: b.code === "BLEND" }))]} />
              <T className="mt-3" head={["Benchmark", "Bench ann.", "Tracking diff.", "Tracking error", "Info ratio", "Months"]} align={["l", "r", "r", "r", "r", "r"]} rows={benchRel.map((b) => [b.name, pct(b.stats?.benchmarkAnnualised), pp(b.stats?.trackingDifference), pct(b.stats?.trackingError), b.stats?.informationRatio?.toFixed(2) ?? "—", b.stats?.months ?? 0])} />
              {benchRel[0].stats?.note && <Note>{benchRel[0].stats.note}</Note>}
            </>
          ) : <Empty title="No benchmark data">Import Nifty TRI series (niftyindices.com → Historical Data → Total Returns Index) under Settings → Imports → Prices with symbol e.g. IDX:NIFTY_SMALLCAP_250_TRI.</Empty>}
        </Card>
        <Card title="9 · Return contribution by stock" subtitle="Unrealised + realised + dividends, ₹.">
          <Bars nf={nf} horizontal height={Math.max(220, Math.min(14, a.contributions.length) * 22)} data={[...a.contributions.slice(0, 7), ...a.contributions.slice(-7)].filter((v, i, arr) => arr.findIndex((x) => x.symbol === v.symbol) === i)} xKey="symbol" bars={[{ key: "gain", name: "Gain" }]} signColor />
        </Card>
        <Card title="10 · Return contribution by sector" subtitle="Direct equity only.">
          <Bars nf={nf} horizontal height={Math.max(220, a.sectors.length * 24)} data={[...a.sectors].sort((x, y) => y.gain - x.gain)} xKey="sector" bars={[{ key: "gain", name: "Gain" }]} signColor />
        </Card>
      </div>

      <Card className="mt-4" title="Risk-adjusted statistics" subtitle="Computed from complete monthly TWR returns.">
        <T head={["Months", "Ann. return", "Volatility", "Max drawdown", "Sharpe", "Sortino", "Best month", "Worst month", "Positive months"]} align={["r", "r", "r", "r", "r", "r", "r", "r", "r"]} rows={[[a.stats.months, pct(a.stats.annualisedReturn), pct(a.stats.volatility), pct(a.maxDrawdown), a.stats.sharpe?.toFixed(2) ?? "—", a.stats.sortino?.toFixed(2) ?? "—", pct(a.stats.bestMonth), pct(a.stats.worstMonth), pct(a.stats.positiveMonthsPct, 0)]]} />
        {a.stats.note && <Note>{a.stats.note}</Note>}
        <Note>Sharpe/Sortino use a {s.riskFreeRatePct}% risk-free rate (configurable). These are descriptive of the past only.</Note>
      </Card>
    </>
  );
}
