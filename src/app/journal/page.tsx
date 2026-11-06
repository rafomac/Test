import Link from "next/link";
import { pageCtx } from "@/lib/server/page";
import { loadData, loadJournal } from "@/lib/server/repo";
import { Badge, Card, Empty, Note, PageHeader, T } from "@/components/ui";
import { JournalForm } from "@/components/JournalForm";
import { addDays } from "@/lib/engine/dates";
import { buildPriceBook } from "@/lib/engine/series";

export default async function Journal({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { a, inr, pct } = pageCtx();
  const d = loadData();
  const j = loadJournal();
  const book = buildPriceBook(d.prices);
  const fm = new Map(d.fundamentals.map((f) => [f.symbol, f]));
  // Purchases without a journal entry
  const buys = d.trades.filter((t) => t.side === "BUY" && a.holdings.find((h) => h.symbol === t.symbol)?.assetType !== "CASH_EQUIVALENT" && a.holdings.find((h) => h.symbol === t.symbol)?.assetType !== "ETF");
  const missing = buys.filter((t) => !j.some((x) => x.symbol === t.symbol && x.date === t.date)).sort((x, y) => (x.date < y.date ? 1 : -1)).slice(0, 15);
  const review = (e: (typeof j)[number], months: number) => {
    const d1 = addDays(e.date, Math.round(months * 30.44));
    if (d1 > a.asOf) return null;
    const p1 = book.get(e.symbol, d1, 10);
    return e.priceAtEntry && p1 ? p1 / e.priceAtEntry - 1 : null;
  };
  return (
    <>
      <PageHeader title="Investment Decision Journal" subtitle="Record why you bought, what would make you add, and what would make you exit — then compare the original thesis with actual results after 6, 12, 24 and 36 months." />
      <Card title="New entry"><JournalForm preset={sp.symbol ? { symbol: sp.symbol, date: sp.date, amount: sp.amount ? Number(sp.amount) : undefined, kind: (sp.kind as "Initial" | "Addition") ?? "Initial" } : undefined} /></Card>
      {missing.length > 0 && (
        <Card className="mt-4" title={`Purchases without a journal entry (${missing.length}${missing.length === 15 ? "+" : ""})`}>
          <T head={["Date", "Company", "Amount", ""]} align={["l", "l", "r", "l"]} rows={missing.map((t) => { const first = !d.trades.some((x) => x.symbol === t.symbol && x.side === "BUY" && x.date < t.date); return [t.date, t.symbol, inr(t.quantity * t.price), <Link key="l" className="text-accent" href={`/journal?symbol=${encodeURIComponent(t.symbol)}&date=${t.date}&amount=${Math.round(t.quantity * t.price)}&kind=${first ? "Initial" : "Addition"}`}>Write entry ({first ? "initial" : "addition"})</Link>]; })} />
        </Card>
      )}
      <Card className="mt-4" title="Timeline & thesis review">
        {j.length ? (
          <div className="space-y-3">
            {j.map((e) => {
              const f = fm.get(e.symbol);
              const revNow = f?.ttmRevenue;
              return (
                <div key={e.id} className="rounded-lg border border-line p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2"><span className="num text-muted">{e.date}</span><Link className="font-semibold text-accent" href={`/holdings/${encodeURIComponent(e.symbol)}`}>{e.symbol}</Link><Badge tone={e.kind === "Initial" ? "accent" : e.kind === "Addition" ? "pos" : "warn"}>{e.kind}</Badge><span className="num">{inr(e.amount)}</span>{e.conviction && <Badge>{e.conviction}</Badge>}{e.basis?.map((b) => <Badge key={b} tone="muted">{b}</Badge>)}</div>
                  <p className="mt-1">{e.reason}</p>
                  <div className="mt-1 grid gap-x-4 text-xs text-muted sm:grid-cols-2">{e.evidence && <p>Evidence: {e.evidence}</p>}{e.valuation && <p>Valuation: {e.valuation}</p>}{e.expectedGrowth && <p>Expected growth: {e.expectedGrowth}</p>}{e.risks && <p>Risks: {e.risks}</p>}{e.addConditions && <p>Add if: {e.addConditions}</p>}{e.exitConditions && <p>Exit if: {e.exitConditions}</p>}</div>
                  <T className="mt-2" head={["Checkpoint", "Price return", "Note"]} align={["l", "r", "l"]} rows={[6, 12, 24, 36].map((m) => [`${m} months`, review(e, m) === null ? (addDays(e.date, m * 30) > a.asOf ? "not yet" : "no price") : pct(review(e, m)), ""]).concat([["Fundamentals since entry", "", e.revenueTtmAtEntry && revNow ? `TTM revenue ${e.revenueTtmAtEntry} → ${revNow} cr (${pct(revNow / e.revenueTtmAtEntry - 1)}); P/E ${e.peAtEntry ?? "—"} → ${f?.pe ?? "—"}` : "Import fundamentals to compare"]])} />
                </div>
              );
            })}
          </div>
        ) : <Empty title="No journal entries yet" />}
        <Note>Price return alone does not validate a thesis — compare against the business results you expected.</Note>
      </Card>
    </>
  );
}
