import Link from "next/link";
import { pageCtx } from "@/lib/server/page";
import { loadData, loadJournal } from "@/lib/server/repo";
import { Badge, Card, Empty, Note, PageHeader, T } from "@/components/ui";
import { PIPELINE_STAGES, type PipelineStage } from "@/lib/types";
import { AddToPipeline } from "@/components/AddToPipeline";

export default function Pipeline() {
  const { a, inr } = pageCtx();
  const d = loadData();
  const journal = loadJournal();
  const hMap = new Map(a.holdings.map((h) => [h.symbol, h]));
  const syms = new Set([...d.research.map((r) => r.symbol), ...a.holdings.filter((h) => h.assetType === "STOCK").map((h) => h.symbol)]);
  const rows = [...syms].map((sym) => {
    const r = d.research.find((x) => x.symbol === sym);
    const h = hMap.get(sym);
    const buys = d.trades.filter((t) => t.symbol === sym && t.side === "BUY").sort((x, y) => (x.date < y.date ? -1 : 1));
    const derived: PipelineStage = h && h.quantity > 0 ? (buys.length > 1 ? "Adding capital" : "Initial position") : buys.length ? "Exited" : "Watchlist";
    return { sym, r, h, buys, stage: r?.stage ?? derived, stageDerived: !r?.stage };
  });
  const byStage = (st: PipelineStage) => rows.filter((x) => x.stage === st);
  const events = [
    ...d.research.flatMap((r) => (r.stageHistory ?? []).map((e) => ({ date: e.date, sym: r.symbol, text: `Stage → ${e.stage}`, kind: "stage" }))),
    ...d.research.filter((r) => r.discoveryDate).map((r) => ({ date: r.discoveryDate!, sym: r.symbol, text: "Discovered", kind: "stage" })),
    ...d.trades.filter((t) => d.research.some((r) => r.symbol === t.symbol) || hMap.has(t.symbol)).filter((t) => hMap.get(t.symbol)?.assetType === "STOCK" || d.research.some((r) => r.symbol === t.symbol)).map((t) => ({ date: t.date, sym: t.symbol, text: `${t.side} ₹${Math.round(t.quantity * t.price).toLocaleString("en-IN")}`, kind: "trade" })),
    ...journal.map((j) => ({ date: j.date, sym: j.symbol, text: `Journal: ${j.kind} — ${j.reason.slice(0, 80)}`, kind: "journal" })),
  ].sort((x, y) => (x.date < y.date ? 1 : -1)).slice(0, 60);
  return (
    <>
      <PageHeader title="Investment Pipeline" subtitle="Discovery → screening → research → watchlist → ₹10,000 initial position → monitoring → valuation reassessment → conviction → additional capital → long-term hold → thesis review / exit. Price appreciation alone is never treated as evidence the thesis is right." />
      <Card title="Add a company"><AddToPipeline /></Card>
      <div className="mt-4 overflow-x-auto">
        <div className="flex min-w-max gap-2">
          {PIPELINE_STAGES.map((st) => (
            <div key={st} className="w-44 shrink-0 rounded-lg border border-line bg-panel p-2">
              <div className="mb-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-muted"><span>{st}</span><span>{byStage(st).length}</span></div>
              <div className="space-y-1">{byStage(st).map((x) => <Link key={x.sym} href={`/holdings/${encodeURIComponent(x.sym)}`} className="block rounded border border-line px-2 py-1 text-xs hover:border-accent"><span className="font-medium">{x.sym}</span>{x.stageDerived && <span className="ml-1 text-[10px] text-muted">(auto)</span>}<div className="text-[10px] text-muted">{x.h?.value ? inr(x.h.value) : "not held"}</div></Link>)}</div>
            </div>
          ))}
        </div>
      </div>
      <Card className="mt-4" title="Company records">
        {rows.length ? <T head={["Company", "Stage", "Discovered", "Research start", "Initial score", "Initial investment", "Initial ₹", "Invested now", "Value", "Additions", "Conviction", "Last review", "Next review", "Thesis", "Invalidation"]} align={["l", "l", "l", "l", "r", "l", "r", "r", "r", "r", "l", "l", "l", "l", "l"]}
          rows={rows.map((x) => [<Link key="s" className="text-accent" href={`/holdings/${encodeURIComponent(x.sym)}`}>{x.sym}</Link>, <Badge key="b" tone={x.stageDerived ? "muted" : "accent"}>{x.stage}</Badge>, x.r?.discoveryDate ?? "—", x.r?.researchStartDate ?? "—", x.r?.initialScore?.toFixed(0) ?? "—", x.buys[0]?.date ?? "—", x.buys[0] ? inr(x.buys[0].quantity * x.buys[0].price) : "—", inr(x.h?.invested), inr(x.h?.value), Math.max(0, x.buys.length - 1), x.r?.conviction ?? "—", x.r?.lastReviewed ?? "—", x.r?.nextReview ?? "—", <span key="t" className="block max-w-48 truncate text-xs" title={x.r?.thesis}>{x.r?.thesis ?? "—"}</span>, <span key="i" className={`block max-w-48 truncate text-xs ${x.r?.invalidation ? "" : "text-warn"}`} title={x.r?.invalidation}>{x.r?.invalidation ?? "not recorded"}</span>])} /> : <Empty title="No companies yet" />}
        <Note>“(auto)” stages are inferred from trades until you set one. Initial position rule: {inr(10000)}; first buys above it are visible in the “Initial ₹” column. Companies with low research completeness should be researched before capital is added.</Note>
      </Card>
      <Card className="mt-4" title="Research timeline">
        {events.length ? <ul className="space-y-1 text-sm">{events.map((e, i) => <li key={i} className="flex gap-3"><span className="num w-24 shrink-0 text-muted">{e.date}</span><Badge tone={e.kind === "trade" ? "accent" : e.kind === "journal" ? "pos" : "muted"}>{e.sym}</Badge><span>{e.text}</span></li>)}</ul> : <Empty title="No events" />}
      </Card>
    </>
  );
}
