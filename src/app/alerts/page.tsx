import Link from "next/link";
import { getAlerts, getSettings } from "@/lib/server/repo";
import { Badge, Card, Empty, Note, PageHeader, T } from "@/components/ui";
import { AlertButtons } from "@/components/AlertButtons";
import { ALERT_RULES } from "@/lib/engine/alerts";

export default function Alerts() {
  const { active, suppressed } = getAlerts();
  const s = getSettings();
  const tone = (x: string) => (x === "high" ? "neg" : x === "medium" ? "warn" : "muted") as "neg" | "warn" | "muted";
  const row = (x: (typeof active)[number], sup = false) => [<Badge key="s" tone={tone(x.severity)}>{x.severity}</Badge>, x.symbol ? <Link key="l" className="text-accent" href={`/holdings/${encodeURIComponent(x.symbol)}`}>{x.symbol}</Link> : "—", <span key="t" className="whitespace-normal"><b>{x.title}</b><span className="block text-xs text-muted">{x.detail}</span></span>, ALERT_RULES.find((r) => r.id === x.rule)?.label ?? x.rule, x.date, <AlertButtons key="b" id={x.id} suppressed={sup} />];
  return (
    <>
      <PageHeader title="Alerts & Review" subtitle="Material changes only — contributions, results, fundamentals, governance, sizing, concentration, liquidity and stale data. Price fluctuations alone never trigger an alert, and no trades are ever executed." />
      <Card title={`Active (${active.length})`}>{active.length ? <T head={["Severity", "Company", "Alert", "Rule", "Date", ""]} rows={active.map((x) => row(x))} /> : <Empty title="No active alerts" />}</Card>
      {suppressed.length > 0 && <Card className="mt-4" title={`Acknowledged / snoozed (${suppressed.length})`}><T head={["Severity", "Company", "Alert", "Rule", "Date", ""]} rows={suppressed.map((x) => row(x, true))} /></Card>}
      <Card className="mt-4" title="Rules & thresholds" subtitle="Configure in Settings → Alerts.">
        <T head={["Rule", "Enabled"]} rows={ALERT_RULES.map((r) => [r.label, s.alerts.enabled[r.id] === false ? <Badge key="o">off</Badge> : <Badge key="n" tone="pos">on</Badge>])} />
        <Note>Thresholds: revenue deceleration {s.alerts.revenueDecelPP} pp below 3Y CAGR · dilution &gt; {s.alerts.dilutionPct}% · valuation change &gt; {s.alerts.valuationChangePct}% · score drop ≥ {s.alerts.scoreDropPts} pts · concentration &gt; {s.alerts.concentrationPct}% · liquidity drop &gt; {s.alerts.liquidityDropPct}% · stale snapshot &gt; {s.alerts.staleSnapshotDays} d, prices &gt; {s.alerts.stalePriceDays} d, fundamentals &gt; {s.alerts.staleFundamentalsDays} d.</Note>
      </Card>
    </>
  );
}
