import Link from "next/link";
import { Suspense } from "react";
import { pageCtx } from "@/lib/server/page";
import { Card, Empty, Freshness, Note, PageHeader, QualityBadge, Stat, tone, Badge } from "@/components/ui";
import { LineSeries, Donut } from "@/components/charts";
import { RangeFilter } from "@/components/RangeFilter";
import { periodMetrics, rangeDates, type RangeKey } from "@/lib/engine/reports";
import { monthKey } from "@/lib/engine/dates";

export default async function Overview({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { a, s, nf, inr, cmp, pct, pp } = pageCtx();
  const S = a.summary;
  const range = (sp.range ?? "all") as RangeKey;
  const rd = rangeDates(range, a.asOf, S.inceptionDate, { from: sp.from, to: sp.to });
  const pm = periodMetrics(a, rd.from, rd.to, rd.label);
  const thisMonth = a.sip.months.find((m) => m.month === monthKey(a.asOf));
  const empty = !a.holdings.length && !a.series.length;

  if (empty)
    return (
      <>
        <PageHeader title="Overview" subtitle="Your portfolio at a glance." />
        <Empty title="No portfolio data yet">
          Connect Zerodha (Kite Connect, read-only) or import your Console reports in <Link className="text-accent underline" href="/settings">Settings &amp; Data Quality</Link>.
          Nothing is shown until real data is available — no figures are invented. To explore the interface first, you can load a clearly-labelled synthetic sample there.
        </Empty>
      </>
    );

  const step = Math.max(1, Math.floor(a.series.length / 400));
  const chart = a.series.map((p, i) => ({ date: p.date, value: p.covered ? p.value : null, invested: p.cumNetInvested, target: a.targetSeries[i]?.target ?? null }))
    .filter((_, i, arr) => i % step === 0 || i === arr.length - 1);
  const best = S.xirrAccount ?? S.xirrSecurities;
  const shortTerm = S.yearsSinceInception < 1;

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle={<>Valuation: <QualityBadge q={a.valuationSource.quality} /> {a.valuationSource.kind === "snapshot" ? `${a.valuationSource.source} snapshot` : a.valuationSource.kind} · <Freshness at={a.valuationSource.at ?? a.asOf} /></>}
        right={<Suspense><RangeFilter /></Suspense>}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Portfolio market value" value={inr(S.marketValue)} sub={S.cash !== null ? `+ cash ${cmp(S.cash)} = ${cmp(S.totalPortfolio)}` : "Cash balance unknown"} />
        <Stat label="Invested capital (cost)" value={inr(S.invested)} sub="Cost basis of current holdings" />
        <Stat label="Unrealised P/L" value={inr(S.unrealized)} tone={tone(S.unrealized)} sub={pct(S.invested ? S.unrealized / S.invested : null)} />
        <Stat label="Realised P/L" value={inr(S.realized)} tone={tone(S.realized)} sub={`Dividends ${cmp(S.dividends)}`} />
        <Stat label="Total return" value={pct(S.totalReturnPct)} tone={tone(S.totalReturnPct)} sub="(Value + dividends − net invested) ÷ net invested" />
        <Stat label="Net contributions" value={S.netContributions !== null ? inr(S.netContributions) : "—"} sub={S.netContributions === null ? "Import ledger for verified figure" : "Deposits − withdrawals (ledger)"} />

        <Stat label="Portfolio XIRR" value={pct(best)} tone={tone(best)} sub={shortTerm ? "< 1 year: annualised figure is unstable" : S.xirrAccount !== null ? "Account-level (deposits)" : "Security-level (trades)"} hint={S.xirrNote} />
        <Stat label="Portfolio TWR" value={pct(S.twrAnnualised ?? S.twrSinceInception)} tone={tone(S.twrSinceInception)} sub={S.twrAnnualised !== null ? "Annualised" : S.twrSinceInception !== null ? "Cumulative (period < 1y)" : "Needs price history"} hint={S.twrNote} />
        <Stat label={`Calendar ${a.asOf.slice(0, 4)} return`} value={pct(S.ytd)} tone={tone(S.ytd)} sub={S.ytdNote} />
        <Stat label="Annualised since inception" value={pct(shortTerm ? null : best)} sub={S.inceptionDate ? `Since ${S.inceptionDate} (${S.yearsSinceInception.toFixed(1)} y)` : "—"} />
        <Stat label="Annual return target" value={`${s.targetCagrPct}%`} sub="Aspirational stretch, not an expectation" />
        <Stat label="Gap vs target" value={S.gapVsTarget !== null ? pp(S.gapVsTarget) : S.status} tone={S.gapVsTarget !== null ? tone(S.gapVsTarget) : S.status === "Ahead" ? "pos" : S.status === "Behind" ? "neg" : null} sub={S.gapVsTarget !== null ? S.gapNote : S.statusDetail} />

        <Stat label="Monthly SIP target" value={inr(thisMonth?.target ?? s.monthlyTarget)} sub={`Plan from ${s.planStartMonth}`} />
        <Stat label="This month's contribution" value={inr(thisMonth?.contribution ?? 0)} sub={a.sip.basis === "ledger" ? "From ledger deposits" : "ESTIMATE (no ledger)"} tone={a.sip.basis === "ledger" ? null : "warn"} />
        <Stat label="This month's shortfall" value={inr(Math.max(0, (thisMonth?.target ?? 0) - (thisMonth?.contribution ?? 0)))} tone={(thisMonth?.target ?? 0) > (thisMonth?.contribution ?? 0) ? "neg" : "pos"} sub={thisMonth?.status} />
        <Stat label="Investment reserve" value={inr(S.liquidReserve + (S.cash ?? 0))} sub={`Liquid BeES ${cmp(S.liquidReserve)} · cash ${S.cash !== null ? cmp(S.cash) : "unknown"}`} />
        <Stat label="Companies" value={S.counts.stocks} sub={`ETFs ${S.counts.etfs} · reserve ETFs ${S.counts.liquid}`} />
        <Stat label="Mutual funds" value={S.counts.mfs} sub={`ETFs ${S.counts.etfs}`} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2" title="Value vs invested vs 40% reference path" subtitle="Reference path compounds each dated net investment at the target rate from its own date — contributions are not counted as returns.">
          {a.series.length ? <LineSeries data={chart} xKey="date" nf={nf} lines={[{ key: "value", name: "Market value", area: true }, { key: "invested", name: "Net invested (buys − sales)", color: "var(--c9)" }, { key: "target", name: `${s.targetCagrPct}% reference`, color: "var(--c3)", dash: true }]} /> : <Empty title="No valuation history">Import the tradebook and historical prices.</Empty>}
          {a.seriesGaps.length > 0 && <Note tone="warn">Gaps in price history: market value is not drawn for {a.seriesGaps.length} period(s). See Settings → Data quality.</Note>}
        </Card>
        <Card title={`Selected period: ${rd.label}`} subtitle={`${rd.from} → ${rd.to}`}>
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-muted">Start value</dt><dd className="num text-right">{inr(pm.startValue)}</dd>
            <dt className="text-muted">End value</dt><dd className="num text-right">{inr(pm.endValue)}</dd>
            <dt className="text-muted">Net purchases</dt><dd className="num text-right">{inr(pm.netFlows)}</dd>
            <dt className="text-muted">Contributions</dt><dd className="num text-right">{pm.contributions !== null ? inr(pm.contributions) : "—"}</dd>
            <dt className="text-muted">Dividends</dt><dd className="num text-right">{inr(pm.dividends)}</dd>
            <dt className="text-muted">Investment P/L</dt><dd className={`num text-right ${pm.pnl !== null && pm.pnl < 0 ? "text-neg" : "text-pos"}`}>{inr(pm.pnl)}</dd>
            <dt className="text-muted">TWR</dt><dd className="num text-right">{pct(pm.twr)}</dd>
            <dt className="text-muted">Money-weighted{pm.mwrAnnualised ? " (ann.)" : " (period)"}</dt><dd className="num text-right">{pct(pm.mwr)}</dd>
          </dl>
          {pm.note && <Note tone="warn">{pm.note}</Note>}
          <Note>Growth from new deposits is excluded from TWR and P/L.</Note>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Direct-equity market-cap mix" right={<Link href="/allocation" className="text-xs text-accent">Details →</Link>}>
          <Donut nf={nf} data={a.allocation.directEquity.map((r) => ({ name: `${r.key}${r.target !== null ? ` (tgt ${(r.target * 100).toFixed(0)}%)` : ""}`, value: r.value }))} />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {a.allocation.directEquity.filter((r) => r.gapPP !== null).map((r) => <Badge key={r.key} tone={Math.abs(r.gapPP!) < 0.03 ? "muted" : r.gapPP! < 0 ? "warn" : "accent"}>{r.key} {pp(r.gapPP)}</Badge>)}
          </div>
        </Card>
        <Card title="Top wealth contributors" right={<Link href="/multibaggers" className="text-xs text-accent">Multibaggers →</Link>}>
          <ul className="space-y-1.5 text-sm">
            {a.contributions.slice(0, 6).map((c) => <li key={c.symbol} className="flex justify-between"><Link href={`/holdings/${encodeURIComponent(c.symbol)}`} className="hover:text-accent">{c.symbol}</Link><span className={`num ${c.gain >= 0 ? "text-pos" : "text-neg"}`}>{cmp(c.gain)}</span></li>)}
          </ul>
          <div className="mt-3 border-t border-line pt-2 text-xs text-muted">Largest detractors: {a.contributions.slice(-3).filter((c) => c.gain < 0).map((c) => `${c.symbol} ${cmp(c.gain)}`).join(", ") || "none"}</div>
        </Card>
        <Card title="Risk & data quality" right={<Link href="/settings/data" className="text-xs text-accent">Audit →</Link>}>
          <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
            <dt className="text-muted">Largest stock (value)</dt><dd className="num text-right">{a.risk.concentration.largestByValue ? `${a.risk.concentration.largestByValue.symbol} ${pct(a.risk.concentration.largestByValue.weight)}` : "—"}</dd>
            <dt className="text-muted">Top 5 / Top 10</dt><dd className="num text-right">{pct(a.risk.concentration.top5Value)} / {pct(a.risk.concentration.top10Value)}</dd>
            <dt className="text-muted">Micro + nano</dt><dd className="num text-right">{pct(a.risk.microNanoPct)}</dd>
            <dt className="text-muted">Risk flags</dt><dd className="num text-right">{a.risk.flags.filter((f) => f.severity === "high").length} high · {a.risk.flags.filter((f) => f.severity === "medium").length} med</dd>
          </dl>
          <ul className="mt-3 space-y-1 border-t border-line pt-2 text-xs">
            {a.dataQuality.issues.slice(0, 4).map((i, k) => <li key={k} className={i.severity === "high" ? "text-neg" : i.severity === "medium" ? "text-warn" : "text-muted"}>• {i.message}</li>)}
          </ul>
        </Card>
      </div>
    </>
  );
}
