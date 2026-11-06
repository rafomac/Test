import { Fragment } from "react";
import Link from "next/link";
import type { MetricDef } from "@/lib/engine/capital";
import { formatCompact, formatPct, formatPP, type NumberFormat } from "@/lib/format";
import type { PortfolioAnalytics } from "@/lib/engine/portfolio";
import type { Settings } from "@/lib/types";
import { clsx } from "clsx";

/** Metric value with an expandable, complete definition (window, scope, flows, treatments). */
export function MetricInfo({ m, inr }: { m: MetricDef; inr?: boolean }) {
  return (
    <details className="group rounded-lg border border-line bg-panel p-3">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-2">
        <span>
          <span className="block text-[11px] font-medium uppercase tracking-wide text-muted">{m.label}</span>
          <span className={clsx("num mt-0.5 block text-lg font-semibold", m.value !== null && m.value < 0 && "text-neg", m.value !== null && m.value > 0 && "text-pos")}>{m.value === null ? "—" : inr ? formatCompact(m.value) : formatPct(m.value, 1)}</span>
          <span className="block text-[11px] text-muted">{m.start ?? "—"} → {m.end}</span>
        </span>
        <span className="mt-0.5 rounded border border-line px-1 text-[10px] text-muted group-open:bg-panel-2">ⓘ</span>
      </summary>
      <dl className="mt-2 grid grid-cols-[88px_1fr] gap-x-2 gap-y-1 border-t border-line pt-2 text-[11px] leading-snug">
        {([["Scope", m.scope], ["Cash flows", m.flows], ["Annualisation", m.annualisation], ["Fees", m.fees], ["Dividends", m.dividends], ["Taxes", m.taxes], ["Cash", m.cash], ["Liquid BeES", m.liquid]] as [string, string][]).map(([k, v]) => <Fragment key={k}><dt className="text-muted">{k}</dt><dd>{v}</dd></Fragment>)}
        {m.note && <><dt className="text-muted">Note</dt><dd className="text-warn">{m.note}</dd></>}
      </dl>
    </details>
  );
}

function HealthTile({ label, value, sub, tone, href }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "pos" | "neg" | "warn" | null; href?: string }) {
  const body = (
    <div className="h-full rounded-lg border border-line bg-panel px-3 py-2.5 hover:border-accent/50">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</div>
      <div className={clsx("num mt-0.5 text-base font-semibold", tone === "pos" && "text-pos", tone === "neg" && "text-neg", tone === "warn" && "text-warn")}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] leading-snug text-muted">{sub}</div>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

/** PORTFOLIO HEALTH header (V2 §24). */
export function PortfolioHealth({ a, s, nf }: { a: PortfolioAnalytics; s: Settings; nf: NumberFormat }) {
  const c = a.capital;
  const best = a.summary.xirrAccount ?? a.summary.xirrSecurities;
  const short = a.summary.yearsSinceInception < 1;
  const cur = a.sip.months.find((m) => m.month === a.asOf.slice(0, 7));
  const stocks = a.holdings.filter((h) => h.assetType === "STOCK");
  const over = stocks.filter((h) => h.overLimit).length;
  const capDev = a.allocation.directEquity.filter((r) => r.target !== null).reduce((x, r) => x + Math.abs(r.costPct - (r.target ?? 0)), 0) / 2;
  const top = a.risk.concentration.largestByValue;
  return (
    <section aria-label="Portfolio health" className="mb-4">
      <div className="mb-1.5 flex items-center justify-between"><h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Portfolio health</h2><span className="text-[11px] text-muted">as of {a.asOf}</span></div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
        <HealthTile label="Portfolio value" value={formatCompact(c.measures.totalMarketValue ?? c.measures.securitiesValue, nf)} sub={c.measures.brokerCash !== null ? "Securities + Zerodha cash" : "Securities (cash unknown)"} />
        <HealthTile href="/performance" label="Actual annualised return" value={formatPct(best, 1)} tone={best === null ? null : best >= 0 ? "pos" : "neg"} sub={short ? "< 1 yr history — unstable" : a.summary.xirrAccount !== null ? "Account XIRR" : "Securities XIRR"} />
        <HealthTile href="/performance" label={`${s.targetCagrPct}% aspiration`} value={a.summary.status} tone={a.summary.status === "Ahead" ? "pos" : a.summary.status === "Behind" ? "neg" : a.summary.status === "Near" ? "warn" : null} sub={a.summary.gapVsTarget !== null ? `${formatPP(a.summary.gapVsTarget)} vs target` : "vs contribution-adjusted path"} />
        <HealthTile href="/sip" label="This month's contribution" value={cur ? formatPct(cur.target ? cur.contribution / cur.target : null, 0) : "—"} tone={cur && cur.contribution >= cur.target ? "pos" : "warn"} sub={cur ? `${formatCompact(cur.contribution, nf)} of ${formatCompact(cur.target, nf)}${a.sip.basis !== "ledger" ? " (est.)" : ""}` : "No plan month"} />
        <HealthTile href="/deployment" label="Investment reserve" value={formatCompact(c.reserve.combined, nf)} sub={`Cash ${c.reserve.availableCash !== null ? formatCompact(c.reserve.availableCash, nf) : "?"} + Liquid BeES ${formatCompact(c.reserve.liquidBees, nf)}`} />
        <HealthTile href="/allocation" label="Cost-based allocation" value={stocks.length ? `${over} over limit` : "—"} tone={over ? "warn" : stocks.length ? "pos" : null} sub={stocks.length ? `Cap mix off target by ${formatPct(capDev, 0)}` : "No direct equity"} />
        <HealthTile href="/risk" label="Market-value concentration" value={top ? formatPct(top.weight, 1) : "—"} tone={top && top.weight > s.alerts.concentrationPct / 100 ? "warn" : null} sub={top ? `Largest: ${top.symbol} · top-5 ${formatPct(a.risk.concentration.top5Value, 0)}` : undefined} />
      </div>
    </section>
  );
}

export function ViewToggle({ mode, path }: { mode: "simple" | "advanced"; path: string }) {
  return (
    <div className="no-print inline-flex overflow-hidden rounded-md border border-line text-xs" role="group" aria-label="View mode">
      {(["simple", "advanced"] as const).map((m) => <a key={m} href={`${path}${path.includes("?") ? "&" : "?"}view=${m}`} className={clsx("px-2.5 py-1 capitalize", mode === m ? "bg-accent text-white" : "text-muted hover:text-fg")}>{m}</a>)}
    </div>
  );
}

export function viewFrom(sp: Record<string, string | undefined>, s: Settings): "simple" | "advanced" {
  return sp.view === "advanced" || sp.view === "simple" ? sp.view : s.viewMode;
}

export function Bridge({ b, inr }: { b: PortfolioAnalytics["capital"]["bridge"]; inr: (x: number | null | undefined) => string }) {
  if (!b.available) return <p className="text-xs text-muted">{b.note}</p>;
  const row = (label: string, v: number | null, strong = false, sign = "") => (
    <div className={clsx("flex justify-between py-1", strong && "border-t border-line font-semibold")}><span className={strong ? "" : "text-muted"}>{sign} {label}</span><span className="num">{inr(v)}</span></div>
  );
  return (
    <div className="text-sm">
      {row("Opening account value", b.opening, true)}
      {row("External contributions", b.contributions, false, "+")}
      {row("External withdrawals", -b.withdrawals, false, "−")}
      {row("Investment gains/losses (market P/L, realised + unrealised)", b.marketGain, false, "+")}
      {row("Income credited to the trading account", b.ledgerIncome, false, "+")}
      {row("Fees not already in trade cost (DP, AMC…)", -b.charges, false, "−")}
      {row("Closing value (derived)", b.closingDerived, true, "=")}
      {row("Closing value (reported: securities + broker cash)", b.closingReported)}
      <div className={clsx("flex justify-between py-1 text-xs", b.residual !== null && Math.abs(b.residual) > 100 ? "text-warn" : "text-muted")}><span>Reconciliation residual</span><span className="num">{inr(b.residual)}</span></div>
      <div className="mt-1 flex justify-between border-t border-line pt-1 text-xs text-muted"><span>Memo: dividends paid to your bank (outside the account)</span><span className="num">{inr(b.bankIncome)}</span></div>
      <div className="flex justify-between text-xs"><span className="text-muted">Total investment gain (market P/L + all income − fees)</span><span className="num font-medium">{inr(b.totalInvestmentGain)}</span></div>
      <p className="mt-1 text-[11px] text-muted">{b.from} → {b.to}. {b.note} A non-zero residual means the imported ledger and the broker&apos;s reported cash disagree (missing ledger rows or opening balance).</p>
    </div>
  );
}
