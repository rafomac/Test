import Link from "next/link";
import { pageCtx } from "@/lib/server/page";
import { loadData } from "@/lib/server/repo";
import { Badge, Card, Empty, Note, PageHeader, Stat, T } from "@/components/ui";
import { Bars } from "@/components/charts";
import { MULTIPLE_TIERS, revenueCagr } from "@/lib/engine/research";

export default function Multibaggers() {
  const { a, nf, cmp, pct } = pageCtx();
  const d = loadData();
  const mb = a.multibaggers.filter((m) => m.multiple !== null);
  const fundMap = new Map(d.fundamentals.map((f) => [f.symbol, f]));
  const fyBefore = (date: string) => { const y = Number(date.slice(0, 4)), m = Number(date.slice(5, 7)); return `FY${m >= 4 ? y : y - 1}`; };
  const attrib = a.holdings.filter((h) => h.assetType === "STOCK" && h.lastPrice && h.firstBuyDate).flatMap((h) => {
    const f = fundMap.get(h.symbol); const np = f?.netProfitAnnual; if (!np) return [];
    const k0 = fyBefore(h.firstBuyDate!); const keys = Object.keys(np).sort(); const k1 = keys[keys.length - 1];
    if (!(np[k0] > 0) || !(np[k1] > 0) || k1 <= k0) return [];
    const t0 = d.trades.filter((t) => t.symbol === h.symbol && t.side === "BUY").sort((x, y) => (x.date < y.date ? -1 : 1))[0];
    const price = Math.log(h.lastPrice! / t0.price), earn = Math.log(np[k1] / np[k0]);
    const rv = f?.revenueAnnual; const rev = rv && rv[k0] > 0 && rv[k1] > 0 ? rv[k1] / rv[k0] - 1 : null;
    return [{ symbol: h.symbol, price: Math.exp(price) - 1, earn: Math.exp(earn) - 1, val: Math.exp(price - earn) - 1, rev, span: `${k0} → ${k1}` }];
  });
  const tiers = [...MULTIPLE_TIERS].reverse().map((t) => ({ tier: `${t}×`, count: mb.filter((m) => (m.multiple ?? 0) >= t).length }));
  return (
    <>
      <PageHeader title="Multibaggers" subtitle="Return multiple = (current value + sale proceeds + dividends) ÷ total capital invested (corporate-action adjusted, FIFO). Partial sales are neither penalised nor flattered. Past multibaggers do not predict future returns." />
      <div className="grid grid-cols-3 gap-3 md:grid-cols-7">{tiers.map((t) => <Stat key={t.tier} label={`≥ ${t.tier}`} value={t.count} />)}</div>
      {!mb.length ? <div className="mt-4"><Empty title="No positions with cost data" /></div> : (
        <>
          <Card className="mt-4" title="Wealth created by position"><Bars nf={nf} horizontal height={Math.max(240, Math.min(15, mb.length) * 22)} data={[...mb].sort((x, y) => y.wealth - x.wealth).slice(0, 15)} xKey="symbol" bars={[{ key: "wealth", name: "Wealth created" }]} signColor /></Card>
          <Card className="mt-4" title="Positions by return multiple">
            <T head={["Company", "Tier", "Multiple", "Invested (total)", "Current value", "Sold", "Dividends", "Wealth created", "Share of wealth", "Holding period", "Revenue 3Y CAGR", "Status"]} align={["l", "l", "r", "r", "r", "r", "r", "r", "r", "r", "r", "l"]}
              rows={mb.map((m) => [<Link key="s" className="text-accent" href={`/holdings/${encodeURIComponent(m.symbol)}`}>{m.symbol}</Link>, m.tier ? <Badge key="t" tone={m.tier >= 2 ? "pos" : "accent"}>{m.tier}×</Badge> : "", `${m.multiple!.toFixed(2)}×`, cmp(m.grossBought), cmp(m.value), cmp(m.grossSold), cmp(m.dividends), <span key="w" className={m.wealth >= 0 ? "text-pos" : "text-neg"}>{cmp(m.wealth)}</span>, pct(m.wealthShare), m.holdingYears !== null ? `${m.holdingYears.toFixed(1)} y` : "—", pct(revenueCagr(fundMap.get(m.symbol)?.revenueAnnual, 3)), m.open ? "Open" : "Closed"])} />
          </Card>
          <Card className="mt-4" title="Source of returns" subtitle="Evidence-based attribution requires EPS/P/E at purchase and today.">
            {attrib.length ? <T head={["Company", "Price return", "Earnings growth (profit proxy)", "Valuation re-rating", "Revenue growth (same span)", "Span"]} align={["l", "r", "r", "r", "r", "l"]} rows={attrib.map((x) => [x.symbol, pct(x.price), pct(x.earn), pct(x.val), pct(x.rev), x.span])} /> : <Empty title="No holdings with profit history spanning the purchase date" />}
            <Note>Decomposition used: ln(P₁/P₀) = ln(EPS₁/EPS₀) [earnings growth] + ln(PE₁/PE₀) [valuation re-rating]. Revenue growth and margin change jointly drive EPS growth. ESTIMATE: net-profit growth is used as an EPS proxy (assumes a stable share count — dilution or buybacks distort it), from the last full fiscal year reported before your first purchase to the latest fiscal year, against price change from first purchase price to today. Holdings without both endpoints are omitted rather than estimated.</Note>
          </Card>
        </>
      )}
    </>
  );
}
