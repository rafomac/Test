import { pageCtx } from "@/lib/server/page";
import { loadData } from "@/lib/server/repo";
import { Badge, Card, Empty, Note, PageHeader, Stat, T } from "@/components/ui";
import { chargesSummary, classifyGains, summariseByFy } from "@/lib/engine/tax";
import { inferAssetType } from "@/lib/engine/classify";

export default function Tax() {
  const { s, inr, cmp } = pageCtx();
  const d = loadData();
  const secMap = new Map(d.securities.map((x) => [x.symbol, x]));
  const at = (sym: string) => secMap.get(sym)?.assetType ?? inferAssetType(sym, "", s.liquidSymbols);
  const rows = classifyGains(d.trades, d.actions, at, s.tax);
  const fy = summariseByFy(rows, s.tax);
  const ch = chargesSummary(d.trades);
  const divs = d.cash.filter((c) => c.kind === "DIVIDEND");
  const divFy = new Map<string, number>();
  for (const c of divs) { const y = Number(c.date.slice(0, 4)), m = Number(c.date.slice(5, 7)); const k = m >= 4 ? `FY${y}-${String((y + 1) % 100).padStart(2, "0")}` : `FY${y - 1}-${String(y % 100).padStart(2, "0")}`; divFy.set(k, (divFy.get(k) ?? 0) + c.amount); }
  return (
    <>
      <PageHeader title="Tax & Transaction Costs" subtitle="Optional, indicative analytics. Not tax advice and not authoritative — your broker's tax P&L statement and a qualified adviser prevail." />
      <Card title="Important — NRI status" className="border-warn/40">
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>Residency is set to <b>{s.tax.residency}</b>. Resident-individual treatment is <b>not</b> assumed.</li>
          <li>For NRIs, tax is generally deducted at source (TDS) by the broker on capital gains, and treaty (DTAA) relief, PIS/NRE/NRO account type and the country of residence all matter.</li>
          <li>Classification uses holding period (&gt; {s.tax.equityLtcgMonths} months = long-term for listed equity and equity ETFs). Liquid BeES and other debt-oriented funds are treated as slab-rate “specified” funds — verify per scheme. Mutual funds are left unclassified until you confirm equity vs debt orientation.</li>
          <li>Rates are blank by default; enter rates you have verified for the relevant financial year in Settings → Tax to see an indicative figure. {s.tax.rulesAsOf ? `Rules verified as of ${s.tax.rulesAsOf}.` : "No verification date recorded."}</li>
          <li>Bonus/split cost here is the portfolio convention (cost spread over new shares), which differs from the income-tax cost of bonus shares.</li>
        </ul>
      </Card>
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Charges recorded" value={inr(ch.total)} sub={`${ch.tradesWithCharges} trades with charges · ${ch.tradesWithoutCharges} without`} tone={ch.tradesWithoutCharges ? "warn" : null} />
        <Stat label="Charges / turnover" value={ch.bps !== null ? `${ch.bps.toFixed(1)} bps` : "—"} />
        <Stat label="Dividends recorded" value={inr(divs.reduce((x, c) => x + c.amount, 0))} sub="Gross/net as per the imported report" />
        <Stat label="Realised gain events" value={rows.length} />
      </div>
      {ch.tradesWithoutCharges > 0 && <Note tone="warn">Console tradebooks don&apos;t include charges. Import a contract-note export with brokerage/STT/exchange/GST/stamp/SEBI columns (the tradebook importer recognises them) for complete cost basis.</Note>}
      <Card className="mt-4" title="Charges breakdown">
        {Object.keys(ch.breakdown).length ? <T head={["Charge", "Amount"]} align={["l", "r"]} rows={Object.entries(ch.breakdown).map(([k, v]) => [k.toUpperCase(), inr(v, 2)])} /> : <Empty title="No itemised charges imported" />}
      </Card>
      <Card className="mt-4" title="Realised gains by financial year (indicative classification)">
        {fy.length ? <T head={["FY", "STCG (equity)", "LTCG (equity)", "Slab-rate funds", "Unclassified", "Dividends", "Indicative equity tax"]} align={["l", "r", "r", "r", "r", "r", "r"]} rows={fy.map((r) => [r.fy, cmp(r["STCG (equity)"]), cmp(r["LTCG (equity)"]), cmp(r["Slab-rate (specified fund / debt)"]), cmp(r["Unclassified (verify)"]), cmp(divFy.get(r.fy) ?? 0), r.indicativeEquityTax === null ? <Badge key="n">rates not set</Badge> : inr(r.indicativeEquityTax)])} /> : <Empty title="No realised gains" />}
      </Card>
      <Card className="mt-4" title="Realised lots">
        {rows.length ? <T head={["Date", "FY", "Company", "Qty", "Proceeds", "Cost", "Gain", "Days held", "Class"]} align={["l", "l", "l", "r", "r", "r", "r", "r", "l"]} rows={[...rows].reverse().slice(0, 200).map((r) => [r.date, r.fy, r.symbol, r.qty, cmp(r.proceeds), cmp(r.cost), <span key="g" className={r.pnl >= 0 ? "text-pos" : "text-neg"}>{cmp(r.pnl)}</span>, r.holdingDays, r.cls])} /> : <Empty title="None" />}
      </Card>
    </>
  );
}
