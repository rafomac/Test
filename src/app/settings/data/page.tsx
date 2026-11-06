import { pageCtx } from "@/lib/server/page";
import { list, listAudit, priceCoverage } from "@/lib/store/db";
import { loadData } from "@/lib/server/repo";
import { Badge, Card, Empty, PageHeader, QualityBadge, T, Note } from "@/components/ui";
import { ConflictButtons } from "@/components/SettingsForm";
import type { Conflict, DataQuality } from "@/lib/types";

export default function DataQualityPage() {
  const { a, inr } = pageCtx();
  const dq = a.dataQuality;
  const conflicts = list<Conflict>("conflicts").filter((c) => c.status === "open");
  const d = loadData();
  const other = d.cash.filter((c) => c.kind === "OTHER");
  const cov = priceCoverage();
  const held = new Set(a.holdings.map((h) => h.symbol));
  // Sanity check for split-adjusted price feeds: big single-day jumps around corporate-action dates
  const jumps: { symbol: string; date: string; change: number }[] = [];
  const bySym = new Map<string, { date: string; close: number }[]>();
  for (const p of d.prices) { if (!bySym.has(p.symbol)) bySym.set(p.symbol, []); bySym.get(p.symbol)!.push(p); }
  for (const [sym, ps] of bySym) for (let i = 1; i < ps.length; i++) { const c = ps[i].close / ps[i - 1].close - 1; if (Math.abs(c) > 0.4) jumps.push({ symbol: sym, date: ps[i].date, change: c }); }
  return (
    <>
      <PageHeader title="Data Quality, Reconciliation & Audit" subtitle="Every figure is labelled Verified, Reconstructed, Estimated, Missing or Synthetic. Conflicts are never silently overwritten." />
      <div className="mb-4 flex flex-wrap gap-2">{(Object.entries(dq.counts) as [DataQuality, number][]).map(([q, n]) => <span key={q} className="flex items-center gap-1 text-sm"><QualityBadge q={q} /> {n} holdings</span>)}</div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Issues">{dq.issues.length ? <ul className="space-y-1.5 text-sm">{dq.issues.map((i, k) => <li key={k}><Badge tone={i.severity === "high" ? "neg" : i.severity === "medium" ? "warn" : "muted"}>{i.area}</Badge> {i.message}</li>)}</ul> : <Empty title="No issues detected" />}</Card>
        <Card title="Freshness"><T head={["Item", "Latest"]} rows={dq.freshness.map((f) => [f.item, f.at ? new Date(f.at.length === 10 ? f.at + "T00:00:00" : f.at).toLocaleString("en-IN") : <span key="m" className="text-neg">missing</span>])} /></Card>
      </div>
      <Card className="mt-4" title="Holdings ↔ tradebook reconciliation" subtitle="Snapshot quantity vs quantity replayed from trades + corporate actions.">
        {dq.reconciliation.length ? <T head={["Symbol", "Snapshot qty", "Ledger qty", "Difference", "Broker avg", "FIFO avg", "Status"]} align={["l", "r", "r", "r", "r", "r", "l"]} rows={dq.reconciliation.map((r) => [r.symbol, r.snapshotQty ?? "—", r.ledgerQty ?? "—", r.diff ? <span key="d" className="text-warn">{r.diff}</span> : 0, inr(r.snapshotAvg, 2), inr(r.ledgerAvg, 2), <Badge key="s" tone={r.status === "ok" ? "pos" : "warn"}>{r.status}</Badge>])} /> : <Empty title="Nothing to reconcile yet" />}
        <Note>Typical causes of mismatch: tradebook years not imported, a split/bonus not entered, shares transferred in from another demat (off-market), or IPO allotments (not in tradebook — add them as BUY rows at the issue price).</Note>
      </Card>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card title={`Open conflicts (${conflicts.length})`}>
          {conflicts.length ? <T head={["Entity", "Key", "Existing", "Incoming", ""]} rows={conflicts.slice(0, 50).map((c) => [c.entity, c.key, <code key="e" className="block max-w-64 truncate text-[10px]">{JSON.stringify(c.existing)}</code>, <code key="i" className="block max-w-64 truncate text-[10px]">{JSON.stringify(c.incoming)}</code>, <ConflictButtons key="b" id={c.id} />])} /> : <Empty title="No open conflicts" />}
        </Card>
        <Card title="Ledger warnings">{dq.ledgerWarnings.length ? <T head={["Symbol", "Date", "Message"]} rows={dq.ledgerWarnings.map((w) => [w.symbol, w.date, <span key="m" className="whitespace-normal text-xs">{w.message}</span>])} /> : <Empty title="None" />}</Card>
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card title="Price coverage" subtitle="Held symbols without history block TWR.">
          <T head={["Symbol", "From", "To", "Points", ""]} align={["l", "l", "l", "r", "l"]} rows={[...a.holdings.filter((h) => !cov.find((c) => c.symbol === h.symbol)).map((h) => [h.symbol, "—", "—", 0, <Badge key="m" tone="neg">missing</Badge>]), ...cov.map((c) => [c.symbol, c.first, c.last, c.n, held.has(c.symbol) ? <Badge key="h" tone="accent">held</Badge> : ""])]} />
        </Card>
        <Card title="Possible split-adjusted prices / data errors" subtitle="Daily moves beyond ±40%. Valuation uses actual (unadjusted) share counts, so price series must be unadjusted, or the corporate action must be entered.">
          {jumps.length ? <T head={["Symbol", "Date", "Move"]} rows={jumps.slice(0, 30).map((j) => [j.symbol, j.date, `${(j.change * 100).toFixed(1)}%`])} /> : <Empty title="No suspicious jumps" />}
        </Card>
      </div>
      <Card className="mt-4" title={`Unclassified ledger entries (${other.length})`} subtitle="Not counted as contributions. If any are deposits/payouts, re-enter them via the Deposits template.">
        {other.length ? <T head={["Date", "Amount", "Description"]} rows={other.slice(0, 50).map((o) => [o.date, inr(o.amount), o.description ?? ""])} /> : <Empty title="None" />}
      </Card>
      <Card className="mt-4" title="Audit log (latest 100)" subtitle="Actions only — never tokens or credentials.">
        <T head={["When", "Action", "Detail"]} rows={listAudit(100).map((l) => [new Date(l.at).toLocaleString("en-IN"), l.action, l.detail])} />
      </Card>
    </>
  );
}
