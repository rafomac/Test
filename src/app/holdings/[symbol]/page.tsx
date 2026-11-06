import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { pageCtx } from "@/lib/server/page";
import { loadData } from "@/lib/server/repo";
import { Badge, Card, Empty, Note, PageHeader, QualityBadge, Stat, T, tone } from "@/components/ui";
import { Bars, LineSeries } from "@/components/charts";
import { ResearchForm, SecurityForm } from "@/components/EditForms";
import { criteriaCheck, CATEGORY_LABEL, growthQuality, peBand, promoterTrend, revenueCagr, sma, unpledgedPromoter, yoyGrowth, digitalScore } from "@/lib/engine/research";
import { runLedger } from "@/lib/engine/positions";
import { buildPriceBook } from "@/lib/engine/series";
import { liquidityProfile } from "@/lib/engine/liquidity";
import { governanceAlerts, promoterChanges } from "@/lib/engine/governance";
import { ScenarioTool } from "@/components/ScenarioTool";
import { loadJournal } from "@/lib/server/repo";
import { sizingCapacity } from "@/lib/engine/planner";

export default async function HoldingDetail({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol: raw } = await params;
  const symbol = decodeURIComponent(raw);
  const { a, s, nf, inr, cmp, pct } = pageCtx();
  const d = loadData();
  const h = a.holdings.find((x) => x.symbol === symbol);
  const trades = d.trades.filter((t) => t.symbol === symbol).sort((x, y) => (x.date < y.date ? -1 : 1));
  const mb = a.multibaggers.find((m) => m.symbol === symbol);
  if (!h && !trades.length && !d.research.some((x) => x.symbol === symbol) && !d.fundamentals.some((x) => x.symbol === symbol)) notFound();
  const sec = d.securities.find((x) => x.symbol === symbol);
  const f = d.fundamentals.find((x) => x.symbol === symbol);
  const r = d.research.find((x) => x.symbol === symbol);
  const prices = d.prices.filter((p) => p.symbol === symbol);
  const closes = prices.map((p) => p.close);
  const s50 = sma(closes, 50), s200 = sma(closes, 200);
  // Investment value history: replay quantity & running average cost per price date
  const book = buildPriceBook(prices);
  const evDates = [...new Set([...trades.map((t) => t.date), ...prices.map((p) => p.date)])].sort();
  const step = Math.max(1, Math.floor(evDates.length / 300));
  const hist = evDates.filter((_, i, arr) => i % step === 0 || i === arr.length - 1).map((dt) => {
    const pos = runLedger(trades, d.actions.filter((x) => x.symbol === symbol || x.newSymbol === symbol), dt).positions.get(symbol);
    const px = book.get(symbol, dt);
    return { date: dt, value: pos && px !== undefined ? pos.quantity * px : null, cost: pos?.costBasis ?? 0, avg: pos?.avgCost || null, qty: pos?.quantity ?? 0 };
  });
  const priceData = prices.map((p, i) => ({ date: p.date, close: p.close, sma50: s50[i], sma200: s200[i], avg: hist.length ? [...hist].reverse().find((x) => x.date <= p.date)?.avg ?? null : null })).filter((_, i, arr) => i % Math.max(1, Math.floor(arr.length / 400)) === 0 || i === arr.length - 1);
  const rev = f?.revenueAnnual ? Object.entries(f.revenueAnnual).sort().map(([k, v]) => ({ year: k, revenue: v, profit: f.netProfitAnnual?.[k] ?? null, era: Number(k.slice(2)) <= 2024 ? "Baseline (≤ FY2024)" : "Updated (FY2025+)" })) : [];
  const yoy = yoyGrowth(f?.revenueAnnual);
  const gq = growthQuality(f?.revenueAnnual);
  const baseline3 = revenueCagr(f?.revenueAnnual, 3, "FY2024"), baseline5 = revenueCagr(f?.revenueAnnual, 5, "FY2024");
  const latest3 = revenueCagr(f?.revenueAnnual, 3), latest5 = revenueCagr(f?.revenueAnnual, 5);
  const up = f ? unpledgedPromoter(f) : null;
  const pt = promoterTrend(f?.promoterHistory);
  const crit = criteriaCheck(f, sec?.marketCapCr);
  const tech = h?.tech;
  const dig = digitalScore(f);
  const liq = liquidityProfile(symbol, d.prices, sec, h?.value ?? 0, s.positionLimits.initialPositionInr);
  const pch = promoterChanges(f);
  const gov = governanceAlerts(f);
  const jr = loadJournal().filter((e) => e.symbol === symbol);
  const cap = h?.assetType === "STOCK" ? sizingCapacity(h.invested, h.limitPct, a.capital.limitDenominator.value) : null;
  const ser = f?.annualSeries ?? {};
  const years = [...new Set([...Object.keys(f?.revenueAnnual ?? {}), ...Object.values(ser).flatMap((m) => Object.keys(m))])].sort();
  const seriesRows = Object.keys(ser).length ? years.map((y) => ({ year: y, revenue: f?.revenueAnnual?.[y] ?? null, ocf: ser.ocf?.[y] ?? null, fcf: ser.fcf?.[y] ?? null, debt: ser.debt?.[y] ?? null, opm: ser.opm?.[y] ?? null, npm: ser.npm?.[y] ?? null, roce: ser.roce?.[y] ?? null, pe: ser.pe?.[y] ?? null, shares: ser.shares?.[y] ?? null })) : [];

  return (
    <>
      <PageHeader title={`${symbol}${sec?.name ? " · " + sec.name : ""}`} subtitle={<>{h?.sector ?? sec?.sector ?? "—"} · {h?.industry ?? "—"} · {h?.cap.category} <span className="text-xs">({h?.cap.basis})</span> {h && <QualityBadge q={h.quality} />}</>} right={<Link href="/holdings" className="text-sm text-accent">← Holdings</Link>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Stat label="Value" value={inr(h?.value)} sub={`${h?.quantity ?? 0} @ ${inr(h?.lastPrice, 2)}`} />
        <Stat label="Invested (cost)" value={inr(h?.invested)} sub={`Avg ${inr(h?.avgPrice, 2)}`} />
        <Stat label="Unrealised" value={inr(h?.unrealized)} tone={tone(h?.unrealized)} sub={pct(h?.unrealizedPct)} />
        <Stat label="Realised + dividends" value={inr((h?.realized ?? 0) + (h?.dividends ?? 0))} />
        <Stat label="Return multiple" value={mb?.multiple ? mb.multiple.toFixed(2) + "×" : "—"} sub="(value + sales + divs) ÷ total invested" />
        <Stat label="Weight value / cost" value={`${pct(h?.weight)} / ${pct(h?.costWeight)}`} tone={h?.overLimit ? "warn" : null} sub={`${h?.conviction ?? "—"} limit ${h?.limitPct ?? "—"}% of cost`} />
        <Stat label="Research score" value={h?.score.score !== null && h?.score.score !== undefined ? h.score.score.toFixed(0) + "/100" : "—"} sub={`Completeness ${pct(h?.score.completeness, 0)} · confidence ${pct(h?.score.confidence, 0)}`} />
        <Stat label="vs 200 DMA" value={pct(tech?.vs200)} tone={tone(tech?.vs200)} sub={tech?.trend ?? "No price history"} />
      </div>
      {h?.qualityNotes.length ? <Note tone="warn">{h.qualityNotes.join(" ")}</Note> : null}

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card title="Investment value vs cost" subtitle="Your position's market value against your running cost basis (investment performance).">
          {hist.some((x) => x.value !== null) ? <LineSeries nf={nf} data={hist} xKey="date" lines={[{ key: "value", name: "Position value", area: true }, { key: "cost", name: "Cost basis", color: "var(--c9)" }]} /> : <Empty title="Needs price history" />}
        </Card>
        <Card title="Price history, moving averages & average acquisition price" subtitle="Stock price performance (independent of your position size).">
          {prices.length ? <LineSeries nf={nf} data={priceData} xKey="date" lines={[{ key: "close", name: "Close" }, { key: "sma50", name: "50 DMA", color: "var(--c2)" }, { key: "sma200", name: "200 DMA", color: "var(--c3)" }, { key: "avg", name: "Your avg cost", color: "var(--c5)", dash: true }]} /> : <Empty title="No price history imported" />}
        </Card>
        <Card title="Position growth (quantity held)"><LineSeries nf={nf} y="num" data={hist} xKey="date" lines={[{ key: "qty", name: "Shares held", area: true }]} height={200} /></Card>
        <Card title="Technical context" subtitle="Entry-timing aid only — never a prediction. Fundamentals take priority.">
          {tech ? (
            <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
              <dt className="text-muted">50 / 200 DMA</dt><dd className="num text-right">{inr(tech.sma50, 2)} / {inr(tech.sma200, 2)}</dd>
              <dt className="text-muted">52-week high / low</dt><dd className="num text-right">{inr(tech.high52, 2)} / {inr(tech.low52, 2)}</dd>
              <dt className="text-muted">Drawdown from 52w high</dt><dd className="num text-right">{pct(tech.drawdownFromHigh)}</dd>
              <dt className="text-muted">Trend</dt><dd className="text-right">{tech.trend}</dd>
              <dt className="text-muted">Volume trend (20d vs 100d)</dt><dd className="num text-right">{pct(tech.volumeTrend)}</dd>
              <dt className="text-muted">Relative strength 6M vs Smallcap 250</dt><dd className="num text-right">{pct(tech.relativeStrength6m)}</dd>
              <dt className="text-muted">Bars of history</dt><dd className="num text-right">{tech.bars}</dd>
            </dl>
          ) : <Empty title="No price history" />}
          <Note>Distinguishing fundamental deterioration from a market-wide correction: compare the stock&apos;s drawdown with the benchmark&apos;s over the same window (relative strength), and check whether revenue/margins changed in the latest results. A price fall with stable fundamentals and a falling benchmark suggests a broad correction; a fall on very low turnover may be liquidity-driven.</Note>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2" title="Revenue & earnings history" subtitle={f ? `Source: ${f.source} (as of ${f.asOf})` : "No fundamentals imported"}>
          {rev.length ? (
            <>
              <Bars nf={nf} y="num" data={rev} xKey="year" bars={[{ key: "revenue", name: "Revenue (₹ cr)" }, { key: "profit", name: "Net profit (₹ cr)", color: "var(--c2)" }]} />
              <T className="mt-3" head={["View", "3Y CAGR", "5Y CAGR", "10Y CAGR"]} align={["l", "r", "r", "r"]} rows={[["A · Historical baseline (to FY2024)", pct(baseline3), pct(baseline5), pct(revenueCagr(f?.revenueAnnual, 10, "FY2024"))], ["B · Updated (latest available)", pct(latest3), pct(latest5), pct(revenueCagr(f?.revenueAnnual, 10))]]} />
              <div className="mt-2 flex flex-wrap gap-1.5 text-xs">{yoy.filter((y) => y.growth !== null).map((y) => <Badge key={y.key} tone={(y.growth ?? 0) >= 0.25 ? "pos" : (y.growth ?? 0) < 0 ? "neg" : "muted"}>{y.key} {pct(y.growth)}</Badge>)}</div>
              <Note>Consistency (CoV of YoY growth): {gq.consistency?.toFixed(2) ?? "—"} · acceleration (last 2y vs prior 3y): {pct(gq.acceleration)} · {gq.positiveYears}/{gq.years} growth years. Slowdown classification: <b>{r?.slowdownCause ?? "not assessed"}</b>{r?.slowdownEvidence ? ` — ${r.slowdownEvidence}` : ""}. A cause is only recorded with evidence.</Note>
            </>
          ) : <Empty title="No revenue data">Import fundamentals (Settings → Imports → Fundamentals template) from annual reports or a screener export, with the source stated.</Empty>}
        </Card>
        <Card title="Selection criteria check">
          <ul className="space-y-1.5 text-sm">{crit.map((c) => <li key={c.id} className="flex items-start justify-between gap-2"><span>{c.label}<div className="text-[11px] text-muted">{c.detail}</div></span><Badge tone={c.result === "pass" ? "pos" : c.result === "fail" ? "neg" : "muted"}>{c.result}</Badge></li>)}</ul>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card title="Valuation & financial health" subtitle="Exploratory bands, not buy/sell rules.">
          <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
            {[["P/E", f?.pe?.toFixed(1)], ["Forward P/E", f?.forwardPe?.toFixed(1)], ["PEG", h?.peg?.toFixed(2)], ["Price/sales", f?.priceToSales?.toFixed(2)], ["EV/sales", f?.evToSales?.toFixed(2)], ["EV/EBITDA", f?.evToEbitda?.toFixed(1)], ["Price/book", f?.priceToBook?.toFixed(2)],
              ["Operating margin", f?.operatingMarginPct !== undefined ? f.operatingMarginPct + "%" : undefined], ["Net margin", f?.netMarginPct !== undefined ? f.netMarginPct + "%" : undefined], ["ROE / ROCE", f ? `${f.roePct ?? "—"}% / ${f.rocePct ?? "—"}%` : undefined],
              ["Debt/equity", f?.debtToEquity?.toFixed(2)], ["Interest coverage", f?.interestCoverage?.toFixed(1)], ["OCF / FCF (₹ cr)", f ? `${f.operatingCashFlowCr ?? "—"} / ${f.freeCashFlowCr ?? "—"}` : undefined],
              ["FCF yield", f?.freeCashFlowCr && sec?.marketCapCr ? pct(f.freeCashFlowCr / sec.marketCapCr) : undefined]].map(([k, v]) => <Fragment key={k}><dt className="text-muted">{k}</dt><dd className="num text-right">{v ?? "—"}</dd></Fragment>)}
          </dl>
          <Note>{peBand(f?.pe, f?.ttmNetProfit)}</Note>
        </Card>
        <Card title="Promoter & governance">
          <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
            <dt className="text-muted">Promoter holding</dt><dd className="num text-right">{f?.promoterHoldingPct?.toFixed(2) ?? "—"}%</dd>
            <dt className="text-muted">Unpledged promoter</dt><dd className="num text-right">{up?.value?.toFixed(2) ?? "—"}%</dd>
            <dt className="text-muted">Trend</dt><dd className="text-right">{pt.direction}{pt.change !== null ? ` (${pt.change > 0 ? "+" : ""}${pt.change.toFixed(2)} pp)` : ""}</dd>
          </dl>
          <Note>{up?.basis}. Unpledged = promoter % × (1 − pledged fraction of promoter holding).</Note>
          {pt.direction === "Declining" && <Note tone="warn">Declining promoter ownership conflicts with your preferences — record the reason (e.g. OFS for minimum public shareholding, ESOP dilution, sale) in research notes rather than assuming wrongdoing.</Note>}
          {(f?.governanceFlags ?? []).map((g) => <Note key={g} tone="neg">⚑ {g}</Note>)}
          <h3 className="mt-3 text-xs font-semibold">Digital presence ({dig.score ?? "—"}/10, 5% weight)</h3>
          <ul className="text-xs text-muted">{dig.facts.map((x) => <li key={x}>• {x}</li>)}</ul>
          <Note>Social popularity is not evidence of financial quality.</Note>
        </Card>
        <Card title="Score breakdown">
          <T head={["Category", "Weight", "Rating", "Points", "Evidence"]} align={["l", "r", "r", "r", "l"]} rows={(h?.score.breakdown ?? []).map((b) => [CATEGORY_LABEL[b.category], b.weight.toFixed(0), b.rating ?? "—", b.points.toFixed(1), b.evidence])} />
        </Card>
      </div>

      <Card className="mt-4" title="Business growth dashboard" subtitle={f ? `Historical facts from ${f.source} (as of ${f.asOf}). Forward-looking items are in the research form below.` : "Import fundamentals with *_FYyyyy columns (ocf, fcf, debt, opm, npm, roce, pe, shares)."}>
        {seriesRows.length ? (
          <div className="grid gap-4 xl:grid-cols-3">
            <div><h3 className="mb-1 text-xs font-semibold">Cash flow (₹ cr)</h3><Bars nf={nf} y="num" height={200} data={seriesRows} xKey="year" bars={[{ key: "ocf", name: "Operating CF" }, { key: "fcf", name: "Free CF", color: "var(--c2)" }]} /></div>
            <div><h3 className="mb-1 text-xs font-semibold">Debt (₹ cr) vs revenue</h3><LineSeries nf={nf} y="num" height={200} data={seriesRows} xKey="year" lines={[{ key: "debt", name: "Debt", bar: true, color: "var(--c8)" }, { key: "revenue", name: "Revenue", yAxis: "right" }]} rightY="num" /></div>
            <div><h3 className="mb-1 text-xs font-semibold">Margins & ROCE (%)</h3><LineSeries nf={nf} y="num" height={200} data={seriesRows} xKey="year" lines={[{ key: "opm", name: "Operating margin" }, { key: "npm", name: "Net margin", color: "var(--c2)" }, { key: "roce", name: "ROCE", color: "var(--c3)" }]} /></div>
            <div><h3 className="mb-1 text-xs font-semibold">Valuation history (P/E)</h3><LineSeries nf={nf} y="num" height={200} data={seriesRows} xKey="year" lines={[{ key: "pe", name: "P/E" }]} /></div>
            <div><h3 className="mb-1 text-xs font-semibold">Share count (dilution)</h3><Bars nf={nf} y="num" height={200} data={seriesRows} xKey="year" bars={[{ key: "shares", name: "Shares (cr)" }]} /></div>
            <div><h3 className="mb-1 text-xs font-semibold">Promoter ownership (%)</h3><LineSeries nf={nf} y="num" height={200} data={pch.map((x) => ({ q: x.quarter, pct: x.pct }))} xKey="q" lines={[{ key: "pct", name: "Promoter %" }]} /></div>
          </div>
        ) : <Empty title="No multi-year fundamentals series imported" />}
      </Card>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card title="Valuation scenarios (bear / base / bull)" subtitle="Your assumptions → implied outcomes. Clearly labelled estimates.">
          <ScenarioTool symbol={symbol} revenue0={f?.ttmRevenue ?? null} mcap0={sec?.marketCapCr ?? null} saved={r?.scenarios} requiredDefault={0.15} />
        </Card>
        <Card title="Liquidity" subtitle="Reported market value is not assumed realisable. Conservative exit scenarios from price/volume history.">
          <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
            <dt className="text-muted">Liquidity score</dt><dd className="num text-right font-semibold">{liq.score !== null ? `${liq.score.toFixed(0)}/100` : "unknown"}</dd>
            <dt className="text-muted">Avg daily traded value (20d / 120d)</dt><dd className="num text-right">{cmp(liq.adtv20)} / {cmp(liq.adtv120)}</dd>
            <dt className="text-muted">Avg daily volume (20d)</dt><dd className="num text-right">{liq.advVolume20?.toFixed(0) ?? "—"}</dd>
            <dt className="text-muted">No-trade days (90)</dt><dd className="num text-right">{liq.zeroVolumeDays90 ?? "—"}</dd>
            <dt className="text-muted">Liquidity change (20d vs 120d)</dt><dd className="num text-right">{pct(liq.deterioration)}</dd>
            <dt className="text-muted">Free-float market cap</dt><dd className="num text-right">{liq.freeFloatMcapCr !== null ? `₹${liq.freeFloatMcapCr.toFixed(0)} cr` : "—"}</dd>
            <dt className="text-muted">Spread / delivery % / circuits (90d)</dt><dd className="num text-right">{liq.spreadPct ?? "—"}% / {liq.deliveryPct ?? "—"}% / {liq.circuitHits90d ?? "—"}</dd>
            <dt className="text-muted">Listing</dt><dd className="text-right">{liq.isSME ? `SME (min lot ${inr(liq.minLotValue)})` : "Main board"}{liq.suspended ? " · suspension history" : ""}</dd>
          </dl>
          {liq.smeBlocksInitialRule && <Note tone="warn">SME minimum lot exceeds the ₹{s.positionLimits.initialPositionInr.toLocaleString("en-IN")} initial-position rule — not compatible with your process.</Note>}
          <T className="mt-2" head={["Exit at % of daily volume", "Days", "Est. impact", "Est. realisable"]} align={["l", "r", "r", "r"]} rows={liq.exits.map((x) => [pct(x.participation, 0), x.days?.toFixed(1) ?? "—", pct(x.impactPct), inr(x.realisable)])} />
          <Note>{liq.scoreBasis.join(" · ")}. Impact uses a square-root model (σ_daily × √participation + half-spread) — an estimate.</Note>
        </Card>
        <Card title="Promoter monitoring" subtitle="Facts vs interpretation are labelled. A % decline is not assumed to be a sale.">
          {pch.length ? <T head={["Quarter", "Promoter %", "Change", "Promoter shares", "Total shares", "Reason"]} align={["l", "r", "r", "r", "r", "l"]} rows={[...pch].reverse().map((x) => [x.quarter, x.pct.toFixed(2), x.changePP !== null ? `${x.changePP > 0 ? "+" : ""}${x.changePP.toFixed(2)} pp` : "—", x.promoterShares ?? "—", x.totalShares ?? "—", <span key="r" className={x.reason === "Promoter sale" ? "text-neg" : x.reason.startsWith("Unknown") ? "text-muted" : ""}>{x.reason}</span>])} /> : <Empty title="No promoter history imported" />}
        </Card>
        <Card title="Governance alerts">
          {gov.length ? <ul className="space-y-1.5 text-sm">{gov.map((g, i) => <li key={i}><Badge tone={g.severity === "high" ? "neg" : "warn"}>{g.kind === "fact" ? "Fact" : "Interpretation"}</Badge> <span className="text-muted">{g.date}</span> {g.text}{g.source && <span className="block truncate text-[11px] text-muted">Source: {g.source}</span>}</li>)}</ul> : <Empty title="No governance events recorded">Import governance events (auditor changes, pledges, allotments, penalties) with sources.</Empty>}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card title="Position sizing" subtitle={`Limit applies to invested cost ÷ ${a.capital.limitDenominator.label}.`}>
          {h?.assetType === "STOCK" ? (
            <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
              <dt className="text-muted">Invested / cost weight</dt><dd className="num text-right">{inr(h.invested)} / {pct(h.limitWeight)}</dd>
              <dt className="text-muted">Market value / weight</dt><dd className="num text-right">{inr(h.value)} / {pct(h.weight)}</dd>
              <dt className="text-muted">Conviction limit</dt><dd className="num text-right">{h.conviction} {h.limitPct}% = {inr(cap?.maxCost)}</dd>
              <dt className="text-muted">Remaining capacity</dt><dd className="num text-right">{inr(Math.max(0, cap?.capacity ?? 0))}</dd>
              <dt className="text-muted">Above limit</dt><dd className={`num text-right ${h.aboveLimit ? "text-warn" : ""}`}>{h.aboveLimit ? inr(h.aboveLimit) : "—"}</dd>
              <dt className="text-muted">If price falls 30% / 50%</dt><dd className="num text-right">{cmp(-(h.value ?? 0) * 0.3)} / {cmp(-(h.value ?? 0) * 0.5)} ({pct((h.weight ?? 0) * -0.3)} / {pct((h.weight ?? 0) * -0.5)} of portfolio)</dd>
            </dl>
          ) : <p className="text-sm text-muted">Not a direct-equity holding.</p>}
        </Card>
        <Card title="Decision journal" right={<Link className="text-xs text-accent" href={`/journal?symbol=${encodeURIComponent(symbol)}`}>New entry →</Link>}>
          {jr.length ? <ul className="space-y-2 text-sm">{jr.map((e) => <li key={e.id}><span className="text-muted">{e.date}</span> <Badge>{e.kind}</Badge> {inr(e.amount)} — {e.reason}{e.exitConditions && <span className="block text-xs text-muted">Exit if: {e.exitConditions}</span>}</li>)}</ul> : <p className="text-sm text-muted">No journal entries for this company.</p>}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card title="Transaction history">
          {trades.length ? <T head={["Date", "Side", "Qty", "Price", "Charges", "Value", "Source"]} align={["l", "l", "r", "r", "r", "r", "l"]} rows={trades.map((t) => [t.date, <Badge key="b" tone={t.side === "BUY" ? "accent" : "warn"}>{t.side}</Badge>, t.quantity, inr(t.price, 2), t.chargesKnown ? inr(t.charges, 2) : "unknown", inr(t.quantity * t.price), t.source])} /> : <Empty title="No trades imported for this symbol" />}
        </Card>
        <Card title="Edit security master"><SecurityForm initial={{ symbol, ...sec }} /></Card>
      </div>
      <Card className="mt-4" title="Research notes & ratings" subtitle="Your inputs. Ratings without evidence are labelled as such; missing ratings score zero."><ResearchForm symbol={symbol} initial={r} /></Card>
      <Note>Contribution to portfolio return: {cmp(a.contributions.find((c) => c.symbol === symbol)?.gain)} ({pct(a.contributions.find((c) => c.symbol === symbol)?.share)} of total gain). {s.positionLimits.initialPositionInr ? `Initial research position rule: ₹${s.positionLimits.initialPositionInr.toLocaleString("en-IN")}.` : ""}</Note>
    </>
  );
}
