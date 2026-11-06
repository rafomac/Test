import Link from "next/link";
import { pageCtx } from "@/lib/server/page";
import { Badge, Card, Empty, Note, PageHeader, T } from "@/components/ui";
import { Bars, Donut, LineSeries, TreemapChart, PALETTE } from "@/components/charts";

const CAPS = ["Large", "Mid", "Small", "Micro", "Nano", "Unclassified"] as const;
const THEMES: [string, RegExp][] = [["Banking & financial services", /bank|financ|nbfc|insur|capital market|broking|amc/i], ["Technology", /tech|software|it |it$|internet|digital/i], ["Healthcare & pharma", /health|pharma|hospital|diagnost/i], ["Industrials & capital goods", /capital goods|industrial|engineer|machin|manufactur|defen[cs]e|auto comp/i], ["Energy & renewables", /energy|power|renewab|solar|oil|gas/i], ["Infra & real estate", /infra|construct|real estate|cement|logistic/i], ["Consumer", /consumer|fmcg|food|retail|apparel|staple/i], ["Chemicals & materials", /chemic|metal|material|fertili/i]];

import { loadData } from "@/lib/server/repo";

export default async function Sectors({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const basis = sp.basis === "cost" ? "cost" : "value";
  const { a, s, nf, inr, cmp, pct } = pageCtx();
  const dd = loadData();
  const sec = a.sectors;
  if (!sec.length) return (<><PageHeader title="Sector Analysis" /><Empty title="No direct-equity holdings with sectors" /></>);
  const maxAbs = Math.max(...sec.map((x) => Math.abs(x.returnPct ?? 0)), 0.01);
  const heat = (v: number | null) => v === null ? "transparent" : v >= 0 ? `color-mix(in srgb, var(--pos) ${Math.round((Math.abs(v) / maxAbs) * 70) + 10}%, transparent)` : `color-mix(in srgb, var(--neg) ${Math.round((Math.abs(v) / maxAbs) * 70) + 10}%, transparent)`;
  const sectorsInHist = [...new Set(a.sectorHistory.flatMap((r) => Object.keys(r).filter((k) => k !== "month")))];
  // Economic-theme overlap: sectors + industries mapped to broader correlated exposures
  const stocks = a.holdings.filter((h) => h.assetType === "STOCK");
  const sv = stocks.reduce((x, h) => x + (h.value ?? 0), 0);
  const themes = THEMES.map(([name, re]) => { const hs = stocks.filter((h) => re.test(`${h.sector} ${h.industry}`)); return { name, count: hs.length, weight: sv ? hs.reduce((x, h) => x + (h.value ?? 0), 0) / sv : 0, names: hs.map((h) => h.symbol) }; }).filter((t) => t.count > 0).sort((x, y) => y.weight - x.weight);
  const tagMap = new Map<string, { names: string[]; value: number }>();
  for (const h of stocks) for (const t of dd.securities.find((x) => x.symbol === h.symbol)?.exposureTags ?? []) { const e = tagMap.get(t) ?? { names: [], value: 0 }; e.names.push(h.symbol); e.value += h.value ?? 0; tagMap.set(t, e); }
  const tagRows = [...tagMap].filter(([, e]) => e.names.length >= 2).map(([tag, e]) => ({ tag, names: e.names, weight: sv ? e.value / sv : 0 })).sort((x, y) => y.weight - x.weight);
  return (
    <>
      <PageHeader title="Sector Analysis" subtitle={`Direct equity only. Sector limit ${s.sectorLimitPct}% of direct-equity value (configurable). Weight reflects economic exposure, not the number of stocks.`} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={`1 · Sector allocation by ${basis === "cost" ? "invested cost" : "market value"}`} right={<div className="no-print inline-flex overflow-hidden rounded-md border border-line text-xs"><Link href="/sectors?basis=cost" className={`px-2 py-0.5 ${basis === "cost" ? "bg-accent text-white" : "text-muted"}`}>Cost</Link><Link href="/sectors?basis=value" className={`px-2 py-0.5 ${basis === "value" ? "bg-accent text-white" : "text-muted"}`}>Value</Link></div>}><Donut nf={nf} data={sec.map((x) => ({ name: x.sector, value: basis === "cost" ? x.invested : x.value }))} height={280} /></Card>
        <Card title="2 · Sector treemap"><TreemapChart data={sec.map((x) => ({ name: x.sector, value: basis === "cost" ? x.invested : x.value }))} /></Card>
        <Card title="3 · Sector return (unrealised, on cost)"><Bars nf={nf} y="pct" horizontal height={Math.max(220, sec.length * 26)} data={sec} xKey="sector" bars={[{ key: "returnPct", name: "Return" }]} signColor /></Card>
        <Card title="4 · Sector performance heatmap" subtitle="Colour intensity = return on cost.">
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {sec.map((x) => <div key={x.sector} className="rounded-md border border-line p-2 text-xs" style={{ background: heat(x.returnPct) }}><div className="font-medium">{x.sector}</div><div className="num">{pct(x.returnPct)} · {pct(x.weight)}</div></div>)}
          </div>
        </Card>
      </div>
      <Card className="mt-4" title="Sector table">
        <T head={["Sector", "Holdings", "Invested", "Value", "Weight", "Cost wt", "Gain (U+R+D)", "Return", "Contribution", "Largest", "Industries", "Limit"]} align={["l", "r", "r", "r", "r", "r", "r", "r", "r", "l", "l", "l"]}
          rows={sec.map((x) => [x.sector, x.count, inr(x.invested), inr(x.value), pct(x.weight), pct(x.costWeight), <span key="g" className={x.gain >= 0 ? "text-pos" : "text-neg"}>{cmp(x.gain)}</span>, pct(x.returnPct), pct(x.contribution), <Link key="l" className="text-accent" href={`/holdings/${encodeURIComponent(x.largest)}`}>{x.largest}</Link>, Object.keys(x.industries).join(", "), x.overLimit ? <Badge key="o" tone="warn">over</Badge> : ""])} />
      </Card>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="5 · Sector × market-cap matrix" subtitle="% of direct-equity value.">
          <T head={["Sector", ...CAPS]} align={["l", "r", "r", "r", "r", "r", "r"]} rows={sec.map((x) => [x.sector, ...CAPS.map((c) => (x.byCap[c] ? pct(x.byCap[c]! / (sv || 1)) : ""))])} />
        </Card>
        <Card title="Shared-exposure warnings" subtitle="From exposure tags in the security master (customer:, commodity:, regulator:, financing:). Holding many companies is not diversification if they share these.">
          {tagRows.length ? <T head={["Shared exposure", "Companies", "Value weight", "Holdings", ""]} align={["l", "r", "r", "l", "l"]} rows={tagRows.map((t) => [t.tag, t.names.length, pct(t.weight), t.names.join(", "), t.weight * 100 > s.sectorLimitPct ? <Badge key="w" tone="warn">above {s.sectorLimitPct}%</Badge> : t.names.length >= 3 ? <Badge key="m" tone="warn">≥ 3 companies</Badge> : ""])} /> : <Empty title="No exposure tags entered">Add tags such as customer:Maruti or commodity:copper on each company&apos;s page.</Empty>}
        </Card>
        <Card title="Correlated economic exposure" subtitle="Groups related sectors/industries that tend to move together (e.g. banks, NBFCs and insurers).">
          <T head={["Theme", "Stocks", "Weight", "Holdings"]} align={["l", "r", "r", "l"]} rows={themes.map((t) => [t.name, t.count, pct(t.weight), t.names.join(", ")])} />
          <Note>Theme mapping is a keyword heuristic on your sector/industry labels — review it; a company can belong to several themes.</Note>
        </Card>
      </div>
      <Card className="mt-4" title="6 · Sector concentration over time" subtitle="Month-end weights, reconstructed from trades × historical prices.">
        {a.sectorHistory.length ? <LineSeries nf={nf} y="pct" data={a.sectorHistory} xKey="month" lines={sectorsInHist.map((k, i) => ({ key: k, name: k, color: PALETTE[i % 9] }))} /> : <Empty title="Needs historical prices" />}
      </Card>
    </>
  );
}
