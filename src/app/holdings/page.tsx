import { pageCtx } from "@/lib/server/page";
import { Empty, PageHeader, Freshness } from "@/components/ui";
import { HoldingsTable, type HRow } from "@/components/HoldingsTable";

export default function Holdings() {
  const { a, nf } = pageCtx();
  const rows: HRow[] = a.holdings.map((h) => ({
    symbol: h.symbol, name: h.name, exchange: h.exchange, assetType: h.assetType, sector: h.sector, industry: h.industry, marketCapCr: h.marketCapCr,
    cap: h.cap.category, capOfficial: h.cap.official, quantity: h.quantity, avgPrice: h.avgPrice, invested: h.invested, lastPrice: h.lastPrice, value: h.value,
    unrealized: h.unrealized, unrealizedPct: h.unrealizedPct, weight: h.weight, costWeight: h.costWeight, rev3y: h.rev3y, rev5y: h.rev5y, rev10y: h.rev10y,
    pe: h.pe, peg: h.peg, roce: h.roce, debtEquity: h.debtEquity, promoter: h.promoter, unpledged: h.unpledgedPromoter, score: h.score.score,
    completeness: h.score.completeness, conviction: h.conviction, vs200: h.tech?.vs200 ?? null, lastReviewed: h.lastReviewed, quality: h.quality, overLimit: h.overLimit, limitPct: h.limitPct,
  }));
  return (
    <>
      <PageHeader title="Holdings" subtitle={<>Click a company for its research and performance page. <Freshness at={a.valuationSource.at ?? a.asOf} label="Prices as of" /></>} />
      {rows.length ? <HoldingsTable rows={rows} nf={nf} /> : <Empty title="No holdings">Connect Kite or import a Console holdings export.</Empty>}
    </>
  );
}
