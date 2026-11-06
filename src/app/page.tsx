import Link from "next/link";
import { Suspense } from "react";
import { pageCtx } from "@/lib/server/page";
import { Card, Freshness, Note, PageHeader, QualityBadge, Stat, tone, Badge, T } from "@/components/ui";
import { LineSeries, Donut } from "@/components/charts";
import { RangeFilter } from "@/components/RangeFilter";
import { periodMetrics, rangeDates, type RangeKey } from "@/lib/engine/reports";
import { monthKey } from "@/lib/engine/dates";
import { Bridge, MetricInfo, PortfolioHealth, ViewToggle, viewFrom } from "@/components/v2";
import { getAlerts, loadData } from "@/lib/server/repo";
import { kiteStatus } from "@/lib/server/kite-service";
import { dataMode } from "@/lib/store/db";

function Onboarding() {
  const d = loadData();
  const ks = kiteStatus();
  const steps: [string, boolean, string][] = [
    ["Set KITE_API_KEY / KITE_API_SECRET and log in with Zerodha", ks.connected || d.snapshots.length > 0, "/settings"],
    ["Sync holdings & funds (or import a Console holdings export)", d.snapshots.length > 0, "/settings"],
    ["Import Console equity tradebook(s) for every year since you restarted", d.trades.length > 0, "/settings"],
    ["Import the funds statement (ledger) — verified ₹2 lakh contributions", d.cash.some((c) => c.kind === "DEPOSIT"), "/settings"],
    ["Import dividends report", d.cash.some((c) => c.kind === "DIVIDEND"), "/settings"],
    ["Fetch historical prices (Kite) or import price CSVs — enables TWR", d.prices.length > 0, "/settings"],
    ["Import AMFI market-cap list + Nifty TRI benchmarks", d.securities.some((s) => s.amfiRank) || d.prices.some((p) => p.symbol.startsWith("IDX:")), "/settings"],
    ["Import fundamentals (template) for your companies", d.fundamentals.length > 0, "/settings"],
  ];
  return (
    <Card title="Get started — connect your real data" subtitle="Nothing is displayed until real data is available. No figures are invented, and production never falls back to sample data.">
      <ol className="space-y-2 text-sm">
        {steps.map(([t, done, href], i) => <li key={i} className="flex items-start gap-2"><span className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${done ? "bg-pos text-white" : "border border-line text-muted"}`}>{done ? "✓" : i + 1}</span><Link href={href} className="hover:text-accent">{t}</Link></li>)}
      </ol>
      {dataMode() === "live" && <Note>Want to explore first? Run <code>npm run demo</code> — it opens a separate demo database with fictional companies, isolated from your live data.</Note>}
    </Card>
  );
}

export default async function Overview({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { a, s, nf, inr, cmp, pct, pp } = pageCtx();
  const S = a.summary, C = a.capital;
  const view = viewFrom(sp, s);
  const range = (sp.range ?? "all") as RangeKey;
  const rd = rangeDates(range, a.asOf, S.inceptionDate, { from: sp.from, to: sp.to });
  const pm = periodMetrics(a, rd.from, rd.to, rd.label);
  const thisMonth = a.sip.months.find((m) => m.month === monthKey(a.asOf));
  if (!a.holdings.length && !a.series.length) return (<><PageHeader title="Overview" /><Onboarding /></>);

  const step = Math.max(1, Math.floor(a.series.length / 400));
  const useAcct = C.account.length > 0;
  const chart = a.series.map((p, i) => ({
    date: p.date,
    value: useAcct ? a.targetSeries[i]?.accountActual : p.covered ? p.value : null,
    base: useAcct ? a.targetSeries[i]?.contributions : p.cumNetInvested,
    target: useAcct ? a.targetSeries[i]?.accountTarget : a.targetSeries[i]?.target,
  })).filter((_, i, arr) => i % step === 0 || i === arr.length - 1);
  const alerts = getAlerts().active.slice(0, 5);
  const xAcc = C.metrics.find((m) => m.id === "accountXirr")!, xSec = C.metrics.find((m) => m.id === "securitiesXirr")!;
  const short = S.yearsSinceInception < 1;

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle={<>Valuation: <QualityBadge q={a.valuationSource.quality} /> {a.valuationSource.kind === "snapshot" ? `${a.valuationSource.source} snapshot` : a.valuationSource.kind} · <Freshness at={a.valuationSource.at ?? a.asOf} /></>}
        right={<div className="flex flex-wrap items-center gap-2"><ViewToggle mode={view} path="/" /><Suspense><RangeFilter /></Suspense></div>}
      />
      <PortfolioHealth a={a} s={s} nf={nf} />

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2" title={useAcct ? "Account value vs external contributions vs 40% reference" : "Securities value vs net invested vs 40% reference"} subtitle={useAcct ? "Value = securities + Zerodha cash. Reference = each dated external contribution compounded at the target rate from its own date." : "Import the funds ledger to switch to the account-level (contribution-based) view."}>
          <LineSeries nf={nf} data={chart} xKey="date" lines={[{ key: "value", name: useAcct ? "Account value" : "Market value", area: true }, { key: "base", name: useAcct ? "Net contributions" : "Net invested", color: "var(--c9)" }, { key: "target", name: `${s.targetCagrPct}% reference`, color: "var(--c3)", dash: true }]} />
          {a.seriesGaps.length > 0 && <Note tone="warn">Gaps in price history: value is not drawn for {a.seriesGaps.length} period(s).</Note>}
        </Card>
        <Card title="Investment reserve" subtitle="Available Zerodha cash + Liquid BeES market value" right={<Link href="/deployment" className="text-xs text-accent">Plan deployment →</Link>}>
          <div className="num text-2xl font-semibold">{inr(C.reserve.combined)}</div>
          <dl className="mt-2 grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-muted">Zerodha available cash</dt><dd className="num text-right">{C.reserve.availableCash !== null ? inr(C.reserve.availableCash) : "unknown"}</dd>
            <dt className="text-muted">Liquid BeES (market value)</dt><dd className="num text-right">{inr(C.reserve.liquidBees)}</dd>
            <dt className="text-muted">Immediate buying power (broker)</dt><dd className="num text-right">{C.reserve.buyingPower !== null ? inr(C.reserve.buyingPower) : "—"}</dd>
            {C.reserve.collateral ? <><dt className="text-muted">of which collateral margin</dt><dd className="num text-right">{inr(C.reserve.collateral)}</dd></> : null}
          </dl>
          <Note>{C.reserve.source}.</Note>
          {C.reserve.warnings.map((w) => <Note key={w} tone="warn">{w}</Note>)}
          <Note>{C.reserve.liquidNote}</Note>
        </Card>
      </div>

      {view === "simple" ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <Card title="Contributions this month" right={<Link href="/sip" className="text-xs text-accent">SIP →</Link>}>
            <div className="num text-xl font-semibold">{inr(thisMonth?.contribution ?? 0)} <span className="text-sm font-normal text-muted">of {inr(thisMonth?.target ?? s.monthlyTarget)}</span></div>
            <p className="mt-1 text-sm">{thisMonth ? <Badge tone={thisMonth.status === "Met" || thisMonth.status === "Surplus" ? "pos" : thisMonth.status === "In progress" ? "warn" : "neg"}>{thisMonth.status}</Badge> : null} {a.sip.basis !== "ledger" && <Badge tone="warn">estimate</Badge>}</p>
            <Note>Deposits count; switching Liquid BeES into stocks does not.</Note>
          </Card>
          <Card title="Top wealth contributors" right={<Link href="/multibaggers" className="text-xs text-accent">More →</Link>}>
            <ul className="space-y-1.5 text-sm">{a.contributions.slice(0, 5).map((c) => <li key={c.symbol} className="flex justify-between"><Link href={`/holdings/${encodeURIComponent(c.symbol)}`} className="hover:text-accent">{c.symbol}</Link><span className={`num ${c.gain >= 0 ? "text-pos" : "text-neg"}`}>{cmp(c.gain)}</span></li>)}</ul>
          </Card>
          <Card title="Needs attention" right={<Link href="/alerts" className="text-xs text-accent">All alerts →</Link>}>
            {alerts.length ? <ul className="space-y-1.5 text-sm">{alerts.map((x) => <li key={x.id}><Badge tone={x.severity === "high" ? "neg" : x.severity === "medium" ? "warn" : "muted"}>{x.symbol ?? x.rule}</Badge> {x.title}</li>)}</ul> : <p className="text-sm text-muted">No material alerts.</p>}
          </Card>
        </div>
      ) : (
        <>
          <h2 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wider text-muted">Three capital measures</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Stat label="A · Total portfolio market value" value={C.measures.totalMarketValue !== null ? inr(C.measures.totalMarketValue) : inr(C.measures.securitiesValue)} sub={`Securities ${cmp(C.measures.securitiesValue)} + cash ${C.measures.brokerCash !== null ? cmp(C.measures.brokerCash) : "unknown"}`} />
            <Stat label="B · Invested capital (cost)" value={inr(C.measures.investedTotal)} sub={`Stocks ${cmp(C.measures.byType.STOCK.cost)} · ETFs ${cmp(C.measures.byType.ETF.cost)} · MFs ${cmp(C.measures.byType.MF.cost)} · Liquid ${cmp(C.measures.byType.CASH_EQUIVALENT.cost)}`} />
            <Stat label="C · Net external contributions" value={C.measures.netContributions !== null ? inr(C.measures.netContributions) : "—"} sub={C.measures.netContributions !== null ? `Deposits ${cmp(C.measures.deposits)} − withdrawals ${cmp(C.measures.withdrawals)}` : "Import the ledger"} />
            <Stat label="Unrealised P/L" value={inr(S.unrealized)} tone={tone(S.unrealized)} sub={pct(S.invested ? S.unrealized / S.invested : null)} />
            <Stat label="Realised P/L" value={inr(S.realized)} tone={tone(S.realized)} sub={`Dividends ${cmp(S.dividends)}`} />
            <Stat label="Absolute investment P/L" value={inr(C.bridge.available ? C.bridge.totalInvestmentGain : S.totalGain)} tone={tone(S.totalGain)} sub={C.bridge.available ? "From the value bridge" : "U + R + dividends"} />
          </div>
          <h2 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wider text-muted">Returns (each with its own scope — click ⓘ)</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {C.metrics.filter((m) => m.id !== "absolutePnl").map((m) => <MetricInfo key={m.id} m={m} />)}
          </div>
          {short && <Note tone="warn">Less than one year of history: annualised figures (XIRR) extrapolate a short period and are unstable. Use the reference-path comparison.</Note>}
          <div className="mt-4 grid gap-4 xl:grid-cols-3">
            <Card title={`Selected period: ${rd.label}`} subtitle={`${rd.from} → ${rd.to}`}>
              <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
                <dt className="text-muted">Account start → end</dt><dd className="num text-right">{inr(pm.accountStart)} → {inr(pm.accountEnd)}</dd>
                <dt className="text-muted">External contributions</dt><dd className="num text-right">{inr(pm.externalFlows)}</dd>
                <dt className="text-muted">Account XIRR {pm.mwrAnnualised ? "(ann.)" : "(period)"}</dt><dd className="num text-right">{pct(pm.accountMwr)}</dd>
                <dt className="text-muted">Securities start → end</dt><dd className="num text-right">{inr(pm.startValue)} → {inr(pm.endValue)}</dd>
                <dt className="text-muted">Net purchases</dt><dd className="num text-right">{inr(pm.netFlows)}</dd>
                <dt className="text-muted">Securities XIRR {pm.mwrAnnualised ? "(ann.)" : "(period)"}</dt><dd className="num text-right">{pct(pm.mwr)}</dd>
                <dt className="text-muted">Securities TWR</dt><dd className="num text-right">{pct(pm.twr)}</dd>
                <dt className="text-muted">Investment P/L (securities)</dt><dd className={`num text-right ${pm.pnl !== null && pm.pnl < 0 ? "text-neg" : "text-pos"}`}>{inr(pm.pnl)}</dd>
              </dl>
              {pm.note && <Note tone="warn">{pm.note}</Note>}
              <Note>Account figures include idle cash; securities figures measure only invested money. See “Why do the numbers differ?” on the Annual Performance Goal tab.</Note>
            </Card>
            <Card title="Value bridge (since inception)" className="xl:col-span-2"><Bridge b={C.bridge} inr={(x) => inr(x)} /></Card>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Card title="Direct-equity mix (invested cost)" right={<Link href="/allocation" className="text-xs text-accent">Both systems →</Link>}>
              <Donut nf={nf} data={a.allocation.directEquity.map((r) => ({ name: `${r.key}${r.target !== null ? ` (tgt ${(r.target * 100).toFixed(0)}%)` : ""}`, value: r.cost }))} />
              <div className="mt-2 flex flex-wrap gap-1.5">{a.allocation.directEquity.filter((r) => r.target !== null).map((r) => <Badge key={r.key} tone={Math.abs(r.costPct - r.target!) < 0.03 ? "muted" : r.costPct < r.target! ? "warn" : "accent"}>{r.key} {pp(r.costPct - r.target!)}</Badge>)}</div>
            </Card>
            <Card title="Return metrics compared">
              <ul className="space-y-2 text-sm">{C.differences.map((x) => <li key={x.a + x.b}><div className="flex justify-between gap-2"><span>{x.a} − {x.b}</span><span className="num font-medium">{pp(x.diff)}</span></div><p className="text-[11px] text-muted">{x.explanation}</p></li>)}</ul>
            </Card>
            <Card title="Risk & data quality" right={<Link href="/settings/data" className="text-xs text-accent">Audit →</Link>}>
              <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
                <dt className="text-muted">Top 5 / Top 10 (value)</dt><dd className="num text-right">{pct(a.risk.concentration.top5Value)} / {pct(a.risk.concentration.top10Value)}</dd>
                <dt className="text-muted">Micro + nano</dt><dd className="num text-right">{pct(a.risk.microNanoPct)}</dd>
                <dt className="text-muted">Stocks / ETFs / MFs</dt><dd className="num text-right">{S.counts.stocks} / {S.counts.etfs} / {S.counts.mfs}</dd>
              </dl>
              <ul className="mt-3 space-y-1 border-t border-line pt-2 text-xs">{a.dataQuality.issues.slice(0, 4).map((i, k) => <li key={k} className={i.severity === "high" ? "text-neg" : i.severity === "medium" ? "text-warn" : "text-muted"}>• {i.message}</li>)}</ul>
            </Card>
          </div>
        </>
      )}
      <p className="mt-4 text-xs text-muted">{xAcc.value !== null ? `Account XIRR ${pct(xAcc.value)} (${xAcc.start} → ${xAcc.end})` : ""}{xSec.value !== null ? ` · Securities XIRR ${pct(xSec.value)} (${xSec.start} → ${xSec.end})` : ""}. Switch to Advanced for full definitions.</p>
    </>
  );
}
