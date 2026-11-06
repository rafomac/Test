import Link from "next/link";
import { pageCtx } from "@/lib/server/page";
import { loadData } from "@/lib/server/repo";
import { Badge, Card, Empty, Note, PageHeader, T } from "@/components/ui";
import { CATEGORY_LABEL, criteriaCheck, peBand } from "@/lib/engine/research";
import { addDays } from "@/lib/engine/dates";

export default function Research() {
  const { a, s, pct } = pageCtx();
  const d = loadData();
  const stocks = a.holdings.filter((h) => h.assetType === "STOCK").sort((x, y) => (y.score.score ?? -1) - (x.score.score ?? -1));
  const resMap = new Map(d.research.map((r) => [r.symbol, r]));
  const fundMap = new Map(d.fundamentals.map((f) => [f.symbol, f]));
  const due = d.research.filter((r) => r.nextReview && r.nextReview <= addDays(a.asOf, 30)).sort((x, y) => (x.nextReview! < y.nextReview! ? -1 : 1));
  const meets = stocks.filter((h) => criteriaCheck(fundMap.get(h.symbol), h.marketCapCr).every((c) => c.result !== "fail"));
  return (
    <>
      <PageHeader title="Research Scorecard" subtitle={<>Weighted 100-point score: {Object.entries(s.scoreWeights).map(([k, w]) => `${CATEGORY_LABEL[k as keyof typeof CATEGORY_LABEL]} ${w}`).join(" · ")}. Missing evidence earns zero points; completeness and confidence are shown separately. Scores are not buy/sell recommendations.</>} />
      {!stocks.length ? <Empty title="No direct-equity holdings" /> : (
        <Card title="Holdings scorecard">
          <T head={["Company", "Score", "Completeness", "Confidence (verified)", "Conviction", "Valuation band", "Fundamental trend", "Criteria", "Last review", "Next review"]} align={["l", "r", "r", "r", "l", "l", "l", "l", "l", "l"]}
            rows={stocks.map((h) => {
              const r = resMap.get(h.symbol), f = fundMap.get(h.symbol);
              const crit = criteriaCheck(f, h.marketCapCr);
              const fails = crit.filter((c) => c.result === "fail").length, unk = crit.filter((c) => c.result === "unknown").length;
              const trend = h.rev3y === null ? "unknown" : h.rev5y !== null && h.rev3y < h.rev5y - 0.05 ? "decelerating" : h.rev5y !== null && h.rev3y > h.rev5y + 0.05 ? "accelerating" : "steady";
              return [
                <Link key="s" className="text-accent" href={`/holdings/${encodeURIComponent(h.symbol)}`}>{h.symbol}</Link>,
                h.score.score !== null ? h.score.score.toFixed(0) : "—", pct(h.score.completeness, 0), pct(h.score.confidence, 0), r?.conviction ?? "not set",
                <span key="v" className="text-xs">{peBand(f?.pe, f?.ttmNetProfit).split(":")[0]}</span>, trend,
                <span key="c">{fails ? <Badge tone="neg">{fails} fail</Badge> : null} {unk ? <Badge>{unk} unknown</Badge> : null} {!fails && !unk ? <Badge tone="pos">all pass</Badge> : null}</span>,
                r?.lastReviewed ?? "—", r?.nextReview ? <span key="n" className={r.nextReview <= a.asOf ? "text-warn" : ""}>{r.nextReview}</span> : "—",
              ];
            })} />
          <Note>Confidence = share of score weight backed by verified data (vs. analyst interpretation or your own conviction).</Note>
        </Card>
      )}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Meets all known selection criteria" subtitle="No failed criterion (unknowns allowed — see each company).">
          {meets.length ? <ul className="space-y-1 text-sm">{meets.map((h) => <li key={h.symbol}><Link className="text-accent" href={`/holdings/${encodeURIComponent(h.symbol)}`}>{h.symbol}</Link> <span className="text-xs text-muted">{criteriaCheck(fundMap.get(h.symbol), h.marketCapCr).filter((c) => c.result === "unknown").length} unknown</span></li>)}</ul> : <Empty title="None yet" />}
        </Card>
        <Card title="Reviews due (next 30 days)">
          {due.length ? <T head={["Company", "Next review", "Thesis"]} rows={due.map((r) => [r.symbol, r.nextReview, <span key="t" className="whitespace-normal text-xs">{r.thesis ?? ""}</span>])} /> : <Empty title="Nothing due" />}
        </Card>
      </div>
      <Note>Initial position rule: ₹{s.positionLimits.initialPositionInr.toLocaleString("en-IN")} per newly researched company. Research universe ₹100–2,000 cr (priority ₹100–500 cr). Edit ratings, notes and conviction on each company&apos;s page; import fundamentals via Settings.</Note>
    </>
  );
}
