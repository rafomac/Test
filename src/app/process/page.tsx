import { pageCtx } from "@/lib/server/page";
import { loadData, loadJournal } from "@/lib/server/repo";
import { Card, Empty, Note, PageHeader, Stat, T } from "@/components/ui";
import { Bars } from "@/components/charts";
import { additionTiming, gainConcentration, groupStats, holdingBucket, lotAnalysis, sampleNote } from "@/lib/engine/process";

export default function Process() {
  const { a, s, nf, cmp, pct } = pageCtx();
  const d = loadData();
  const lots = lotAnalysis(d.trades, d.actions, d.prices, d.securities, d.research, loadJournal(), s, a.asOf);
  if (!lots.length) return (<><PageHeader title="Process Effectiveness" /><Empty title="No stock purchases to analyse">Import your tradebook.</Empty></>);
  const conc = gainConcentration(lots);
  const timing = additionTiming(lots);
  const scoreMap = new Map(a.holdings.map((h) => [h.symbol, h.score.score]));
  const valued = lots.filter((l) => l.ret !== null);
  const tbl = (g: ReturnType<typeof groupStats>) => <T head={["Group", "Lots", "Invested", "Gain", "Median return", "Mean return", "Win rate", "Mean excess vs benchmark", "t-stat", "Sample"]} align={["l", "r", "r", "r", "r", "r", "r", "r", "r", "l"]} rows={g.map((x) => [x.key, x.n, cmp(x.invested), <span key="g" className={x.gain >= 0 ? "text-pos" : "text-neg"}>{cmp(x.gain)}</span>, pct(x.median), pct(x.mean), pct(x.winRate, 0), pct(x.meanExcess), x.tStat?.toFixed(2) ?? "—", <span key="s" className="text-xs text-muted">{x.sampleNote}</span>])} />;
  const scoreBuckets = groupStats(valued.map((l) => ({ ...l, scoreAtEntry: l.scoreAtEntry ?? scoreMap.get(l.symbol) ?? null })), (l) => { const sc = l.scoreAtEntry; return sc === null ? "No score" : sc >= 70 ? "Score ≥ 70" : sc >= 50 ? "Score 50–69" : "Score < 50"; });
  const peBuckets = groupStats(valued, (l) => (l.peAtEntry === null ? "P/E at entry not journalled" : l.peAtEntry < 15 ? "P/E < 15" : l.peAtEntry < 30 ? "P/E 15–30" : l.peAtEntry < 50 ? "P/E 30–50" : "P/E ≥ 50"));
  const dist = [-1, -0.5, 0, 0.5, 1, 2, 4, 9].map((lo, i, arr) => ({ bucket: i === arr.length - 1 ? `≥ ${lo * 100 + 100}%` : `${Math.round(lo * 100)}% to ${Math.round(arr[i + 1] * 100)}%`, lots: valued.filter((l) => l.ret! >= lo && (i === arr.length - 1 || l.ret! < arr[i + 1])).length }));
  const overall = groupStats(valued, () => "All lots")[0];
  return (
    <>
      <PageHeader title="Process Effectiveness" subtitle="Measures the quality of decisions, not just outcomes. Every buy lot is analysed (FIFO for sales) and compared with the Nifty Smallcap 250 TRI over the same holding window to separate market exposure from selection." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <Stat label="Buy lots analysed" value={valued.length} sub={sampleNote(valued.length)} />
        <Stat label="Win rate" value={pct(overall?.winRate, 0)} sub="Not a measure of skill on its own" />
        <Stat label="Median lot return" value={pct(overall?.median)} />
        <Stat label="Mean excess vs benchmark" value={pct(overall?.meanExcess)} sub={overall?.tStat !== null && overall?.tStat !== undefined ? `t = ${overall.tStat.toFixed(2)} ${Math.abs(overall.tStat) < 2 ? "(not distinguishable from luck)" : ""}` : "Needs benchmark data"} />
        <Stat label="Top 10% of lots → share of gains" value={pct(conc.top10pct, 0)} sub={`${conc.top10pctN} lot(s); top 3 = ${pct(conc.top3, 0)}`} />
        <Stat label="Days to first addition" value={timing.avgDaysToFirstAddition !== null ? timing.avgDaysToFirstAddition.toFixed(0) : "—"} sub={`median ${timing.medianDays ?? "—"} · ${timing.companiesWithAdditions} companies`} />
      </div>
      <Note>Skill vs luck: with fewer than ~30 independent decisions, or |t| &lt; 2, results cannot be distinguished from market exposure and chance. Lots in the same company are not independent.</Note>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card title="Initial ₹10,000 research positions vs subsequent additions">{tbl(groupStats(valued, (l) => l.kind))}</Card>
        <Card title="Return distribution (per lot)"><Bars nf={nf} y="num" data={dist} xKey="bucket" bars={[{ key: "lots", name: "Lots" }]} /></Card>
        <Card title="By conviction at purchase" subtitle="From the journal entry at purchase when present; otherwise current conviction (labelled).">{tbl(groupStats(valued, (l) => `${l.conviction}${l.convictionSource === "current research" ? " (current)" : ""}`))}</Card>
        <Card title="By market-cap category at purchase">{tbl(groupStats(valued, (l) => l.cap))}</Card>
        <Card title="Research score vs subsequent returns" subtitle="Score at entry from the journal, else today's score (hindsight-biased).">{tbl(scoreBuckets)}</Card>
        <Card title="Valuation at purchase vs future returns" subtitle="Requires P/E at entry (captured automatically in journal entries).">{tbl(peBuckets)}</Card>
        <Card title="By holding period">{tbl(groupStats(valued, (l) => holdingBucket(l.days)))}</Card>
        <Card title="Losses">
          <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
            <dt className="text-muted">Realised losses (closed lots)</dt><dd className="num text-right text-neg">{cmp(conc.realisedLosses)}</dd>
            <dt className="text-muted">Unrealised losses (open lots)</dt><dd className="num text-right text-neg">{cmp(conc.unrealisedLosses)}</dd>
            <dt className="text-muted">Losing lots</dt><dd className="num text-right">{conc.losers} of {conc.lots}</dd>
            <dt className="text-muted">Largest single lot's share of gains</dt><dd className="num text-right">{pct(conc.top1, 0)}</dd>
          </dl>
          <Note>Long-term small-cap returns are typically driven by a few large winners; a low win rate can coexist with strong results, and vice versa.</Note>
        </Card>
      </div>
      <Card className="mt-4" title="All lots">
        <T head={["Date", "Company", "Kind", "Amount", "Value now (+ proceeds)", "Return", "Annualised", "Benchmark", "Excess", "Conviction", "Cap", "Status"]} align={["l", "l", "l", "r", "r", "r", "r", "r", "r", "l", "l", "l"]}
          rows={[...lots].reverse().map((l) => [l.date, l.symbol, l.kind, cmp(l.amount), cmp(l.currentValue), <span key="r" className={(l.ret ?? 0) >= 0 ? "text-pos" : "text-neg"}>{pct(l.ret)}</span>, pct(l.annualised), pct(l.benchmarkRet), pct(l.excess), l.conviction, l.cap, l.closed ? "Closed" : "Open"])} />
        <Note>Dividends are not allocated to lots. Corporate actions: splits and bonuses are applied; mergers/demergers are not traced across symbols here.</Note>
      </Card>
    </>
  );
}
