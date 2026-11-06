import Link from "next/link";
import { getSettings, hasSynthetic } from "@/lib/server/repo";
import { kiteStatus } from "@/lib/server/kite-service";
import { list } from "@/lib/store/db";
import { Card, Note, PageHeader, T, Badge } from "@/components/ui";
import { KitePanel } from "@/components/KitePanel";
import { Importer } from "@/components/Importer";
import { SettingsForm, SampleButtons } from "@/components/SettingsForm";
import type { ImportLog } from "@/lib/types";

const CAPS: [string, string, string][] = [
  ["Current equity & ETF holdings, qty, avg price, LTP", "Kite API /portfolio/holdings", "Direct"],
  ["Mutual fund holdings (Coin)", "Kite API /mf/holdings", "Direct"],
  ["Available funds", "Kite API /user/margins", "Direct"],
  ["Unrealised P/L", "Computed from holdings", "Direct"],
  ["Historical orders & trades", "Kite API returns today only → Console tradebook CSV", "Import"],
  ["Realised P/L", "Computed FIFO from tradebook (Console P&L report for cross-check)", "Import"],
  ["Deposits & withdrawals", "Console → Funds → Statement (ledger) CSV", "Import"],
  ["Dividends", "Console → Reports → Dividends CSV (credited to bank, not ledger)", "Import"],
  ["Corporate actions", "No Kite/Console export — enter via template", "Manual"],
  ["Historical prices", "Kite historical API (plan with historical data) or CSV", "API / Import"],
  ["Benchmark TRI series", "niftyindices.com historical TRI downloads → CSV", "Import"],
  ["Market cap & AMFI category", "AMFI half-yearly list + security master", "Import"],
  ["Fundamentals, promoter, pledge", "Annual reports / exchange filings / screener export", "Import"],
  ["Historical portfolio snapshots", "Kept by this app from each sync (immutable)", "Built over time"],
];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const s = getSettings();
  const ks = kiteStatus();
  const imports = list<ImportLog>("imports").sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 15);
  return (
    <>
      <PageHeader title="Settings & Data Quality" subtitle="Connect Zerodha (read-only), import Console reports, and configure targets." right={<Link href="/settings/data" className="rounded-md border border-line px-3 py-1.5 text-sm">Data quality & audit →</Link>} />
      {sp.kite && <div className={`mb-4 rounded-md border px-3 py-2 text-sm ${sp.kite === "connected" ? "border-pos/40 text-pos" : "border-neg/40 text-neg"}`}>Kite: {sp.kite}</div>}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Zerodha Kite Connect (read-only)" subtitle="Official OAuth-style login on kite.zerodha.com. Your password/PIN/TOTP are never seen or stored here; only an encrypted, day-scoped access token is kept server-side.">
          <KitePanel status={ks} />
          <Note>This app calls only read endpoints (holdings, MF holdings, margins, historical). It contains no order placement, modification, GTT, or fund-transfer code.</Note>
        </Card>
        <Card title="What comes from where">
          <T head={["Data", "Source", "Access"]} rows={CAPS.map(([a, b, c]) => [<span key="a" className="whitespace-normal">{a}</span>, <span key="b" className="whitespace-normal text-xs text-muted">{b}</span>, <Badge key="c" tone={c === "Direct" ? "pos" : c === "Manual" ? "warn" : "accent"}>{c}</Badge>])} />
        </Card>
      </div>
      <Card className="mt-4" title="Import Zerodha reports & reference data" subtitle="Re-importing the same file is safe: identical rows are skipped and differing rows become conflicts for review — never silently overwritten.">
        <Importer />
        {imports.length > 0 && <T className="mt-4" head={["When", "Type", "File", "Read", "Imported", "Dup", "Skipped", "Warnings"]} align={["l", "l", "l", "r", "r", "r", "r", "l"]} rows={imports.map((l) => [new Date(l.at).toLocaleString("en-IN"), l.kind, l.fileName, l.rowsRead, l.rowsImported, l.duplicates, l.rowsSkipped, <span key="w" className="whitespace-normal text-xs text-muted">{l.warnings.slice(0, 2).join(" ")}</span>])} />}
      </Card>
      <Card className="mt-4" title="Configuration"><SettingsForm initial={s} /></Card>
      <Card className="mt-4" title="Sample data" subtitle="A fictional portfolio (ZZ tickers, generated prices) for exploring the UI. Tagged SYNTHETIC everywhere and removable in one click.">
        <SampleButtons loaded={hasSynthetic()} />
      </Card>
    </>
  );
}
