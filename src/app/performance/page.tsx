import { pageCtx } from "@/lib/server/page";
import { Badge, Card, Empty, Note, PageHeader, Stat, T, tone } from "@/components/ui";
import { Bars, LineSeries } from "@/components/charts";
import { Bridge, MetricInfo, PortfolioHealth, ViewToggle, viewFrom } from "@/components/v2";

export default async function Performance({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { a, s, nf, inr, cmp, pct, pp } = pageCtx();
  const view = viewFrom(sp, s);
  const C = a.capital;
  const S = a.summary;
  const tgt = s.targetCagrPct / 100;
  const tgtM = Math.pow(1 + tgt, 1 / 12) - 1;
  if (!a.series.length) return (<><PageHeader title="Annual Performance Goal" /><Empty title="No transaction history">Import your tradebook to measure performance against the {s.targetCagrPct}% aspiration.</Empty></>);

  const step = Math.max(1, Math.floor(a.series.length / 400));
  const useAcct = C.account.length > 0;
  const pathData = a.series.map((p, i) => ({ date: p.date, actual: useAcct ? a.targetSeries[i]?.accountActual : p.covered ? p.value : null, target: useAcct ? a.targetSeries[i]?.accountTarget : a.targetSeries[i]?.target, invested: useAcct ? a.targetSeries[i]?.contributions : p.cumNetInvested })).filter((_, i, arr) => i % step === 0 || i === arr.length - 1);
  const yearly = C.bridgeByYear.filter((b) => b.available).map((b) => ({ year: b.to.slice(0, 4) + (b.to.slice(5) !== "12-31" ? " YTD" : ""), contributions: b.contributions - b.withdrawals, gains: b.totalInvestmentGain }));
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
      <PageHeader title="Annual Performance Goal" subtitle={`Actual investment performance versus the ${s.targetCagrPct}% aspirational annualised return. Returns exclude the effect of your monthly contributions.`} right={<div className="flex items-center gap-2"><ViewToggle mode={view} path="/performance" /><Badge tone={statusTone}>{S.status} the target reference</Badge></div>} />
      <PortfolioHealth a={a} s={s} nf={nf} />
      <Card title="Wealth creation, not just 40%" subtitle="The aspiration is a stretch reference, not a yearly requirement. These comparisons ask whether the strategy is creating wealth efficiently.">
        <div className="grid gap-3 text-sm md:grid-cols-4">
          <div><div className="text-xs text-muted">Wealth created (₹)</div><div className="num text-lg font-semibold">{cmp(C.bridge.available ? C.bridge.totalInvestmentGain : S.totalGain)}</div></div>
          <div><div className="text-xs text-muted">vs blended benchmark (selection, ann.)</div><div className="num text-lg font-semibold">{pp(C.decomposition.terms.find((t) => t.key === "selection")?.value)}</div></div>
          <div><div className="text-xs text-muted">Risk-adjusted (Sharpe)</div><div className="num text-lg font-semibold">{a.stats.sharpe?.toFixed(2) ?? "—"}</div></div>
          <div><div className="text-xs text-muted">vs 12% / 15% / 20% planning rates</div><div className="num text-sm font-semibold">{[0.12, 0.15, 0.2].map((r) => (best === null ? "—" : pp(best - r))).join(" · ")}</div></div>
        </div>
        <Note>Leverage, derivatives or extra concentration are never suggested to close a gap to the aspiration.</Note>
      </Card>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Stat label="XIRR (money-weighted)" value={pct(best)} tone={tone(best)} sub={S.yearsSinceInception < 1 ? "History < 1 year — treat with caution" : "Annualised, actual dated cash flows"} />
        <Stat label="TWR (time-weighted)" value={pct(S.twrAnnualised ?? S.twrSinceInception)} sub={S.twrAnnualised !== null ? "Annualised" : "Cumulative, not annualised"} tone={tone(S.twrSinceInception)} />
        <Stat label="Target" value={`${s.targetCagrPct}%`} sub="Stretch aspiration" />
        <Stat label="Gap (XIRR − target)" value={S.gapVsTarget !== null ? pp(S.gapVsTarget) : "n/a"} tone={tone(S.gapVsTarget)} sub={S.gapNote} />
        <Stat label="Target reference value" value={inr(S.targetReferenceValue)} sub="Your dated net investments compounded at target" />
        <Stat label="Actual vs reference" value={S.targetReferenceValue ? pct(S.marketValue / S.targetReferenceValue - 1) : "—"} tone={S.targetReferenceValue ? tone(S.marketValue - S.targetReferenceValue) : null} sub={S.statusDetail} />
      </div>
      <h2 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wider text-muted">Standardised return metrics (click ⓘ for exact window, scope and treatment)</h2>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{C.metrics.filter((m) => view === "advanced" || ["accountXirr", "securitiesXirr", "inceptionTwrAnn", "calendarTwr"].includes(m.id)).map((m) => <MetricInfo key={m.id} m={m} inr={m.id === "absolutePnl"} />)}</div>
      {view === "simple" && <Note>Simple view shows the four headline metrics. Switch to Advanced for all seven standardised metrics, the value bridge and benchmark statistics.</Note>}
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card title="Why am I ahead or behind?" subtitle={C.decomposition.window ? `${C.decomposition.window.from} → ${C.decomposition.window.to} (${C.decomposition.window.days} days)` : "Needs transaction and price history"}>
          {C.decomposition.terms.length ? (
            <>
              <ul className="space-y-2.5 text-sm">
                {C.decomposition.terms.map((t) => {
                  const v = t.value ?? 0, w = Math.min(50, Math.abs(v) * 100);
                  return (
                    <li key={t.key}>
                      <div className="flex items-baseline justify-between gap-3"><span>{t.label}</span><span className={`num font-semibold ${v >= 0 ? "text-pos" : "text-neg"}`}>{pp(t.value)}</span></div>
                      <div className="relative mt-1 h-1.5 rounded bg-panel-2"><div className={`absolute top-0 h-1.5 rounded ${v >= 0 ? "left-1/2 bg-pos" : "right-1/2 bg-neg"}`} style={{ width: `${w}%` }} /><div className="absolute left-1/2 top-[-2px] h-2.5 w-px bg-muted" /></div>
                      <div className="mt-0.5 text-[11px] text-muted">{t.evidence}</div>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-3 flex justify-between border-t border-line pt-2 text-sm font-semibold"><span>Total: return − {s.targetCagrPct}% aspiration</span><span className="num">{pp(C.decomposition.total)}</span></div>
              <Note>{C.decomposition.note}</Note>
              <Note>Concentration: top holding produced {pct(C.concentrationOfGains.top1, 0)} of gains, top 3 {pct(C.concentrationOfGains.top3, 0)}; {C.concentrationOfGains.winnersForHalf} of {C.concentrationOfGains.positions} winners account for half of all gains.</Note>
            </>
          ) : <p className="text-sm text-muted">Unavailable.</p>}
        </Card>
        <Card title="Why do the return numbers differ?" subtitle="All are correct for their own scope and window.">
          <ul className="space-y-3 text-sm">{C.differences.map((x) => <li key={x.a + x.b}><div className="flex justify-between gap-3"><span className="font-medium">{x.a} vs {x.b}</span><span className="num">{pp(x.diff)}</span></div><p className="mt-0.5 text-xs text-muted">{x.explanation}</p></li>)}</ul>
          <Note>Overview “selected-period” figures use the window chosen in the date filter; since-inception figures start at the first deposit (account) or first trade (securities).</Note>
        </Card>
      </div>
      <Note>Ahead/near/behind compares market value with the reference path within ±5%. Annualised comparisons are only shown once there is at least one year of history; shorter periods use the reference path or pro-rata target.</Note>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card title={`A · Actual wealth vs ${s.targetCagrPct}% reference path`} subtitle={useAcct ? "Account value (securities + cash) vs each dated EXTERNAL contribution compounded at the target from its own date." : "Securities value vs each dated net purchase compounded at the target (import the ledger for the contribution-based path)."}>
          <LineSeries nf={nf} data={pathData} xKey="date" lines={[{ key: "actual", name: "Actual value", area: true }, { key: "target", name: `${s.targetCagrPct}% reference`, color: "var(--c3)", dash: true }, { key: "invested", name: useAcct ? "Net contributions" : "Net invested", color: "var(--c9)" }]} />
        </Card>
        <Card title="2/3 · Growth of ₹1 (TWR) vs target compounding" subtitle="Measures management performance independent of contribution timing.">
          <LineSeries nf={nf} y="num" data={idx} xKey="date" lines={[{ key: "twr", name: "Portfolio TWR index" }, { key: "tgt", name: `${s.targetCagrPct}% compounding`, color: "var(--c3)", dash: true }]} />
          {S.twrNote && <Note tone="warn">{S.twrNote}</Note>}
        </Card>
        <Card title="4 · Monthly returns (TWR)" subtitle={`Pro-rata monthly target = ${pct(tgtM, 2)}. Incomplete months (missing prices) are omitted.`}>
          <Bars nf={nf} y="pct" data={monthly} xKey="key" bars={[{ key: "ret", name: "Portfolio" }]} signColor refY={tgtM} />
        </Card>
        <Card title="5 · Calendar-year returns vs target" subtitle="Partial years are compared to a pro-rata target, not the full-year 40%.">
          <Bars nf={nf} y="pct" data={cal} xKey="key" bars={[{ key: "ret", name: "Portfolio TWR" }, { key: "target", name: "Target (pro-rata if partial)", color: "var(--c3)" }]} />
          <Note>Calendar-year TWR is not the same as since-inception annualised return. The current year is year-to-date with a pro-rata reference; short periods are not extrapolated.</Note>
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
        <Card title="E · Annual investment gains vs external contributions" subtitle="Separates money you added from money the portfolio earned.">
          {yearly.length ? <Bars nf={nf} data={yearly} xKey="year" bars={[{ key: "contributions", name: "Net contributions", color: "var(--c9)" }, { key: "gains", name: "Investment gains" }]} /> : <p className="text-sm text-muted">Needs the funds ledger and price history.</p>}
        </Card>
        <Card title="F · Return attribution by market cap" subtitle="Direct equity, ₹ gain (unrealised + realised + dividends), current classification.">
          <Bars nf={nf} horizontal height={Math.max(200, C.attributionByCap.length * 30)} data={C.attributionByCap} xKey="key" bars={[{ key: "gain", name: "Gain" }]} signColor />
          <T head={["Category", "Gain", "Share of gains", "Value weight"]} align={["l", "r", "r", "r"]} rows={C.attributionByCap.map((r) => [r.key, cmp(r.gain), pct(r.share), pct(r.weight)])} />
        </Card>
        <Card title="9 · Return contribution by stock" subtitle="Unrealised + realised + dividends, ₹.">
          <Bars nf={nf} horizontal height={Math.max(220, Math.min(14, a.contributions.length) * 22)} data={[...a.contributions.slice(0, 7), ...a.contributions.slice(-7)].filter((v, i, arr) => arr.findIndex((x) => x.symbol === v.symbol) === i)} xKey="symbol" bars={[{ key: "gain", name: "Gain" }]} signColor />
        </Card>
        <Card title="10 · Return contribution by sector" subtitle="Direct equity only.">
          <Bars nf={nf} horizontal height={Math.max(220, a.sectors.length * 24)} data={[...a.sectors].sort((x, y) => y.gain - x.gain)} xKey="sector" bars={[{ key: "gain", name: "Gain" }]} signColor />
        </Card>
      </div>

      {view === "advanced" && <Card className="mt-4" title="Value bridge (since inception)"><Bridge b={C.bridge} inr={(x) => inr(x)} /></Card>}
      <Card className="mt-4" title="Risk-adjusted statistics" subtitle="Computed from complete monthly TWR returns.">
        <T head={["Months", "Ann. return", "Volatility", "Max drawdown", "Sharpe", "Sortino", "Best month", "Worst month", "Positive months"]} align={["r", "r", "r", "r", "r", "r", "r", "r", "r"]} rows={[[a.stats.months, pct(a.stats.annualisedReturn), pct(a.stats.volatility), pct(a.maxDrawdown), a.stats.sharpe?.toFixed(2) ?? "—", a.stats.sortino?.toFixed(2) ?? "—", pct(a.stats.bestMonth), pct(a.stats.worstMonth), pct(a.stats.positiveMonthsPct, 0)]]} />
        {a.stats.note && <Note>{a.stats.note}</Note>}
        <Note>Sharpe/Sortino use a {s.riskFreeRatePct}% risk-free rate (configurable). These are descriptive of the past only.</Note>
      </Card>
    </>
  );
}
