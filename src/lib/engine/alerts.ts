/**
 * Rule-based alerts focused on MATERIAL changes. Price fluctuations alone never raise an alert.
 * Each alert has a stable id so it can be acknowledged or snoozed.
 */
import type { AlertState, Fundamentals, ResearchEntry, Settings, PricePoint, Security } from "../types";
import type { PortfolioAnalytics } from "./portfolio";
import { revenueCagr, yoyGrowth } from "./research";
import { promoterChanges } from "./governance";
import { liquidityProfile } from "./liquidity";
import { addDays, daysBetween, monthKey } from "./dates";

export interface Alert { id: string; rule: string; severity: "high" | "medium" | "low"; symbol?: string; title: string; detail: string; date: string }

export const ALERT_RULES: { id: string; label: string }[] = [
  { id: "contribution", label: "Monthly contribution below target" },
  { id: "results", label: "New quarterly results likely available" },
  { id: "revenueDecel", label: "Revenue growth deterioration" },
  { id: "debtVsRevenue", label: "Debt rising faster than revenue" },
  { id: "promoterDecline", label: "Promoter ownership decline" },
  { id: "pledge", label: "New or increased share pledging" },
  { id: "auditor", label: "Auditor resignation / change" },
  { id: "dilution", label: "Large equity dilution" },
  { id: "scoreDrop", label: "Research score deterioration" },
  { id: "valuation", label: "Material valuation change" },
  { id: "positionLimit", label: "Position above invested-cost limit" },
  { id: "concentration", label: "Market-value concentration" },
  { id: "liquidity", label: "Liquidity deterioration" },
  { id: "stale", label: "Stale data" },
];

const lastQuarterEnd = (d: string) => { const y = Number(d.slice(0, 4)), m = Number(d.slice(5, 7)); const q = Math.floor((m - 1) / 3) * 3; return q === 0 ? `${y - 1}-12-31` : `${y}-${String(q).padStart(2, "0")}-${q === 6 ? "30" : q === 9 ? "30" : "31"}`; };

export function evaluateAlerts(a: PortfolioAnalytics, fundamentals: Fundamentals[], research: ResearchEntry[], prices: PricePoint[], securities: Security[], s: Settings, states: AlertState[]): { active: Alert[]; suppressed: Alert[] } {
  const cfg = s.alerts;
  const on = (r: string) => cfg.enabled[r] !== false;
  const out: Alert[] = [];
  const add = (x: Alert) => { if (on(x.rule)) out.push(x); };
  const fm = new Map(fundamentals.map((f) => [f.symbol, f]));
  const rm = new Map(research.map((r) => [r.symbol, r]));
  const sm = new Map(securities.map((x) => [x.symbol, x]));
  const asOf = a.asOf;

  // Contributions: last completed plan month below target.
  const done = a.sip.months.filter((m) => m.inPlan && m.month < monthKey(asOf));
  const lastM = done[done.length - 1];
  if (lastM && lastM.contribution < lastM.target) add({ id: `contribution:${lastM.month}`, rule: "contribution", severity: lastM.contribution <= 0 ? "high" : "medium", title: `Contribution below target in ${lastM.month}`, detail: `₹${Math.round(lastM.contribution).toLocaleString("en-IN")} of ₹${Math.round(lastM.target).toLocaleString("en-IN")} (${a.sip.basis === "ledger" ? "ledger" : "estimate"}). Cumulative gap ₹${Math.round(lastM.cumGap).toLocaleString("en-IN")}.`, date: asOf });
  const cur = a.sip.months.find((m) => m.month === monthKey(asOf));
  if (cur?.inPlan && Number(asOf.slice(8, 10)) >= 25 && cur.contribution < cur.target) add({ id: `contribution:${cur.month}:late`, rule: "contribution", severity: "low", title: `This month's contribution not yet complete`, detail: `₹${Math.round(cur.target - cur.contribution).toLocaleString("en-IN")} remaining with the month nearly over.`, date: asOf });

  for (const h of a.holdings.filter((x) => x.assetType === "STOCK")) {
    const f = fm.get(h.symbol);
    if (f) {
      const qEnd = lastQuarterEnd(asOf);
      if (f.asOf < qEnd && daysBetween(qEnd, asOf) > 45) add({ id: `results:${h.symbol}:${qEnd}`, rule: "results", severity: "low", symbol: h.symbol, title: `Results for quarter ending ${qEnd} likely published`, detail: `Fundamentals last updated ${f.asOf}. Listed companies must publish quarterly results within 45 days of quarter end.`, date: asOf });
      const yy = yoyGrowth(f.revenueAnnual).filter((x) => x.growth !== null);
      const latest = yy[yy.length - 1];
      const c3 = revenueCagr(f.revenueAnnual, 3, yy[yy.length - 2]?.key);
      if (latest && c3 !== null && latest.growth! < c3 - cfg.revenueDecelPP / 100) add({ id: `revenueDecel:${h.symbol}:${latest.key}`, rule: "revenueDecel", severity: latest.growth! < 0 ? "high" : "medium", symbol: h.symbol, title: `Revenue growth slowed to ${(latest.growth! * 100).toFixed(1)}% in ${latest.key}`, detail: `Prior 3-year CAGR ${(c3 * 100).toFixed(1)}%. Classify the slowdown (temporary / cyclical / structural) with evidence on the company page.`, date: f.asOf });
      const debt = f.annualSeries?.debt;
      if (debt && f.revenueAnnual) {
        const k = Object.keys(debt).sort(); const a1 = k[k.length - 1], a0 = k[k.length - 2];
        if (a0 && debt[a0] > 0 && f.revenueAnnual[a0] > 0 && f.revenueAnnual[a1] > 0) {
          const dg = debt[a1] / debt[a0] - 1, rg = f.revenueAnnual[a1] / f.revenueAnnual[a0] - 1;
          if (dg > rg + 0.1 && debt[a1] > debt[a0]) add({ id: `debtVsRevenue:${h.symbol}:${a1}`, rule: "debtVsRevenue", severity: "medium", symbol: h.symbol, title: `Debt +${(dg * 100).toFixed(0)}% vs revenue +${(rg * 100).toFixed(0)}% in ${a1}`, detail: "Debt is growing materially faster than revenue.", date: f.asOf });
        }
      }
      const pc = promoterChanges(f); const lp = pc[pc.length - 1];
      if (lp?.changePP !== null && lp && lp.changePP < -0.5) add({ id: `promoterDecline:${h.symbol}:${lp.quarter}`, rule: "promoterDecline", severity: lp.reason === "Promoter sale" ? "high" : "medium", symbol: h.symbol, title: `Promoter holding −${Math.abs(lp.changePP).toFixed(2)} pp (${lp.quarter})`, detail: lp.reason, date: f.asOf });
      const pNow = f.promoterPledgePctOfPromoter ?? f.promoterPledgePctOfTotal, pPrev = f.previous?.promoterPledgePctOfPromoter ?? f.previous?.promoterPledgePctOfTotal;
      if (pNow !== undefined && pNow > (pPrev ?? 0) + 0.01) add({ id: `pledge:${h.symbol}:${f.asOf}`, rule: "pledge", severity: "high", symbol: h.symbol, title: `Promoter pledge ${pPrev === undefined ? "reported" : "increased"}: ${pNow.toFixed(1)}%`, detail: pPrev !== undefined ? `Previously ${pPrev.toFixed(1)}% (${f.previous!.asOf}).` : "No earlier pledge data on record.", date: f.asOf });
      for (const e of f.governanceEvents ?? []) {
        if ((e.type === "Pledge created" || e.type === "Pledge increased") && daysBetween(e.date, asOf) <= 120) add({ id: `pledge:${h.symbol}:${e.date}:ev`, rule: "pledge", severity: "high", symbol: h.symbol, title: e.type, detail: `${e.description} (${e.source})`, date: e.date });
        if ((e.type === "Auditor resignation" || e.type === "Auditor change") && daysBetween(e.date, asOf) <= 365) add({ id: `auditor:${h.symbol}:${e.date}`, rule: "auditor", severity: e.type === "Auditor resignation" ? "high" : "medium", symbol: h.symbol, title: e.type, detail: `${e.description} (${e.source})`, date: e.date });
      }
      const sh = f.annualSeries?.shares;
      if (sh) { const k = Object.keys(sh).sort(); if (k.length >= 2) { const g = sh[k[k.length - 1]] / sh[k[k.length - 2]] - 1; if (g * 100 > cfg.dilutionPct) add({ id: `dilution:${h.symbol}:${k[k.length - 1]}`, rule: "dilution", severity: g > 0.15 ? "high" : "medium", symbol: h.symbol, title: `Share count +${(g * 100).toFixed(1)}% (${k[k.length - 1]})`, detail: "Equity dilution — check for preferential allotment, QIP, ESOPs or warrants.", date: f.asOf }); } }
      if (f.pe && f.previous?.pe && Math.abs(f.pe / f.previous.pe - 1) * 100 > cfg.valuationChangePct) add({ id: `valuation:${h.symbol}:${f.asOf}`, rule: "valuation", severity: "low", symbol: h.symbol, title: `P/E moved from ${f.previous.pe.toFixed(1)} to ${f.pe.toFixed(1)}`, detail: "Material valuation change since the previous fundamentals update — reassess valuation scenarios.", date: f.asOf });
    }
    const r = rm.get(h.symbol);
    const hist = (r?.scoreHistory ?? []).filter((x) => x.score !== null && daysBetween(x.date, asOf) <= 365);
    const peak = hist.length ? Math.max(...hist.map((x) => x.score!)) : null;
    if (peak !== null && h.score.score !== null && peak - h.score.score >= cfg.scoreDropPts) add({ id: `scoreDrop:${h.symbol}:${Math.round(h.score.score)}`, rule: "scoreDrop", severity: "medium", symbol: h.symbol, title: `Research score fell ${Math.round(peak - h.score.score)} pts`, detail: `From ${peak.toFixed(0)} to ${h.score.score.toFixed(0)} within 12 months.`, date: asOf });
    if (h.overLimit) add({ id: `positionLimit:${h.symbol}:${h.conviction}`, rule: "positionLimit", severity: h.limitWeight! * 100 > s.positionLimits.hardLimitPct ? "high" : "medium", symbol: h.symbol, title: `Invested cost above ${h.conviction} limit`, detail: `${(h.limitWeight! * 100).toFixed(1)}% of ${a.capital.limitDenominator.label} vs ${h.limitPct}% (₹${Math.round(h.aboveLimit).toLocaleString("en-IN")} above). Informational — no sell instruction.`, date: asOf });
    if (h.weight !== null && h.weight * 100 > cfg.concentrationPct) add({ id: `concentration:${h.symbol}:${Math.floor(h.weight * 20)}`, rule: "concentration", severity: "low", symbol: h.symbol, title: `${(h.weight * 100).toFixed(1)}% of portfolio market value`, detail: `A 50% fall would cost ≈ ${(h.weight * 50).toFixed(1)}% of portfolio value. Winners are not auto-sold; review thesis and liquidity.`, date: asOf });
    const lp = liquidityProfile(h.symbol, prices, sm.get(h.symbol), h.value ?? 0, s.positionLimits.initialPositionInr);
    if (lp.deterioration !== null && lp.deterioration * 100 < -cfg.liquidityDropPct) add({ id: `liquidity:${h.symbol}:${monthKey(asOf)}`, rule: "liquidity", severity: "medium", symbol: h.symbol, title: `Traded value down ${Math.abs(lp.deterioration * 100).toFixed(0)}% (20d vs 120d)`, detail: `Estimated exit at 10% of volume: ${lp.exits[1].days?.toFixed(1) ?? "—"} days.`, date: asOf });
  }
  const fr = Object.fromEntries(a.dataQuality.freshness.map((f) => [f.item, f.at]));
  const snapAt = fr["Holdings snapshot"];
  if (snapAt && daysBetween(snapAt.slice(0, 10), asOf) > cfg.staleSnapshotDays) add({ id: `stale:snapshot:${snapAt.slice(0, 10)}`, rule: "stale", severity: "medium", title: "Holdings snapshot is stale", detail: `Last snapshot ${snapAt.slice(0, 10)}. Log in to Kite and sync.`, date: asOf });
  const priceAt = fr["Latest price"];
  if (priceAt && daysBetween(priceAt, asOf) > cfg.stalePriceDays) add({ id: `stale:prices:${priceAt}`, rule: "stale", severity: "low", title: "Prices are stale", detail: `Latest price ${priceAt}.`, date: asOf });
  for (const f of fundamentals) if (a.holdings.some((h) => h.symbol === f.symbol) && daysBetween(f.asOf, asOf) > cfg.staleFundamentalsDays) add({ id: `stale:fund:${f.symbol}:${f.asOf}`, rule: "stale", severity: "low", symbol: f.symbol, title: "Fundamentals out of date", detail: `Last updated ${f.asOf}.`, date: asOf });

  const st = new Map(states.map((x) => [x.id, x]));
  const isSuppressed = (x: Alert) => { const s0 = st.get(x.id); return !!s0 && (s0.status === "acknowledged" || (s0.status === "snoozed" && (s0.until ?? "") >= asOf)); };
  const order = { high: 0, medium: 1, low: 2 };
  const sorted = out.sort((x, y) => order[x.severity] - order[y.severity] || (x.date < y.date ? 1 : -1));
  void addDays;
  return { active: sorted.filter((x) => !isSuppressed(x)), suppressed: sorted.filter(isSuppressed) };
}
