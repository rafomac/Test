import Link from "next/link";
import { pageCtx } from "@/lib/server/page";
import { Badge, Card, Empty, Note, PageHeader, Stat, T } from "@/components/ui";
import { Bars } from "@/components/charts";
import { loadData } from "@/lib/server/repo";
import { liquidityProfile } from "@/lib/engine/liquidity";

export default function Risk() {
  const { a, s, nf, inr, cmp, pct } = pageCtx();
  const r = a.risk, c = r.concentration;
  if (!a.holdings.length) return (<><PageHeader title="Portfolio Risk & Liquidity" /><Empty title="No holdings" /></>);
  const stocks = a.holdings.filter((h) => h.assetType === "STOCK");
  const dd = loadData();
  const secMap = new Map(dd.securities.map((x) => [x.symbol, x]));
  const liq = stocks.map((h) => ({ h, p: liquidityProfile(h.symbol, dd.prices, secMap.get(h.symbol), h.value ?? 0, s.positionLimits.initialPositionInr) })).sort((x, y) => (x.p.score ?? -1) - (y.p.score ?? -1));
  const sevTone = (x: string) => (x === "high" ? "neg" : x === "medium" ? "warn" : "muted") as "neg" | "warn" | "muted";
  return (
    <>
      <PageHeader title="Portfolio Risk & Liquidity" subtitle="Concentration, scenario stress tests and risk flags. Large positions created by appreciation are shown for awareness — there are no automatic sell instructions." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Stat label="Largest (value)" value={c.largestByValue ? pct(c.largestByValue.weight) : "—"} sub={c.largestByValue?.symbol} />
        <Stat label="Largest (cost)" value={c.largestByCost ? pct(c.largestByCost.weight) : "—"} sub={c.largestByCost?.symbol} />
        <Stat label="Top 5 value / cost" value={`${pct(c.top5Value, 0)} / ${pct(c.top5Cost, 0)}`} />
        <Stat label="Top 10 value / cost" value={`${pct(c.top10Value, 0)} / ${pct(c.top10Cost, 0)}`} />
        <Stat label="Effective no. of stocks" value={c.effectiveN.toFixed(1)} sub={`HHI ${c.hhiValue.toFixed(3)} · ${stocks.length} held`} />
        <Stat label="Micro + nano exposure" value={pct(r.microNanoPct)} sub="of direct equity" />
        <Stat label="Max drawdown (TWR)" value={pct(a.maxDrawdown)} tone={a.maxDrawdown ? "neg" : null} />
        <Stat label="Volatility (ann.)" value={pct(a.stats.volatility)} sub={a.stats.note ?? "monthly returns"} />
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card title="Stress tests" subtitle="Estimated impact on current securities value. Scenarios, not predictions.">
          <T head={["Scenario", "Description", "Impact", "% of portfolio", "Value after"]} align={["l", "l", "r", "r", "r"]} rows={r.stress.map((x) => [x.name, <span key="d" className="whitespace-normal text-xs text-muted">{x.description}</span>, <span key="l" className="text-neg">{cmp(x.loss)}</span>, pct(x.lossPct), cmp(x.after)])} />
        </Card>
        <Card title="Concentration: value vs invested cost" subtitle="Cost-based weight is what position limits apply to.">
          <Bars nf={nf} y="pct" horizontal height={Math.max(220, Math.min(15, stocks.length) * 22)} data={stocks.slice(0, 15).map((h) => ({ symbol: h.symbol, value: h.weight, cost: h.costWeight }))} xKey="symbol" bars={[{ key: "value", name: "Market-value weight" }, { key: "cost", name: "Invested-cost weight", color: "var(--c3)" }]} />
          <Note>Limits (cost): standard {s.positionLimits.standardPct}% · high {s.positionLimits.highPct}% · exceptional {s.positionLimits.exceptionalPct}% · hard {s.positionLimits.hardLimitPct}%.</Note>
        </Card>
      </div>
      <Card className="mt-4" title="Risk flags" subtitle="Valuation, governance, debt, liquidity, sizing and sector concentration. Based only on imported data — missing data raises no flag, so check Data Quality.">
        {r.flags.length ? <T head={["Holding", "Type", "Severity", "Detail"]} align={["l", "l", "l", "l"]} rows={r.flags.sort((x, y) => ["high", "medium", "low"].indexOf(x.severity) - ["high", "medium", "low"].indexOf(y.severity)).map((f) => [<Link key="s" href={`/holdings/${encodeURIComponent(f.symbol)}`} className="text-accent">{f.symbol}</Link>, f.kind, <Badge key="b" tone={sevTone(f.severity)}>{f.severity}</Badge>, <span key="d" className="whitespace-normal">{f.detail}</span>])} /> : <Empty title="No flags raised from available data" />}
      </Card>
      <Card className="mt-4" title="Small/micro-cap liquidity risk" subtitle="Score 0–100 from traded value, exit time, no-trade days, spread, circuits and suspensions. Conservative exit scenarios — market value is not assumed realisable.">
        <T head={["Holding", "Cap", "Value", "Score", "ADTV 20d", "No-trade days (90)", "Exit @5%", "Exit @10%", "Exit @20%", "Est. realisable @10%", "Trend", "Flags"]} align={["l", "l", "r", "r", "r", "r", "r", "r", "r", "r", "r", "l"]}
          rows={liq.map(({ h, p }) => [<Link key="s" className="text-accent" href={`/holdings/${encodeURIComponent(h.symbol)}`}>{h.symbol}</Link>, h.cap.category, cmp(h.value), p.score !== null ? <span key="sc" className={p.score < 40 ? "text-neg" : p.score < 60 ? "text-warn" : ""}>{p.score.toFixed(0)}</span> : "unknown", cmp(p.adtv20), p.zeroVolumeDays90 ?? "—", ...p.exits.map((x) => (x.days !== null ? `${x.days.toFixed(1)} d` : "—")), cmp(p.exits[1].realisable), pct(p.deterioration), [p.isSME ? "SME" : "", p.smeBlocksInitialRule ? "lot > ₹10k" : "", p.suspended ? "suspension" : ""].filter(Boolean).join(", ") || "—"])} />
        <Note>Micro- and nano-caps can become illiquid exactly when prices fall; a liquidity-driven collapse is distinct from fundamental deterioration.</Note>
      </Card>
    </>
  );
}
