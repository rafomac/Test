"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { formatINR, formatPct, formatNum, type NumberFormat } from "@/lib/format";

export interface HRow {
  symbol: string; name?: string; exchange?: string; assetType: string; sector: string; industry: string; marketCapCr?: number; cap: string; capOfficial: boolean;
  quantity: number; avgPrice: number; invested: number; lastPrice: number | null; value: number | null; unrealized: number | null; unrealizedPct: number | null;
  weight: number | null; costWeight: number | null; rev3y: number | null; rev5y: number | null; rev10y: number | null; pe?: number; peg: number | null; roce?: number;
  debtEquity?: number; promoter?: number; unpledged: number | null; score: number | null; completeness: number; conviction: string; vs200: number | null;
  lastReviewed?: string; quality: string; overLimit: boolean; limitPct: number;
}

type Col = { k: keyof HRow; label: string; fmt?: (r: HRow, nf: NumberFormat) => React.ReactNode; num?: boolean; group?: "core" | "fund" | "all" };

const pct = (x: number | null | undefined) => formatPct(x, 1);
const COLS: Col[] = [
  { k: "symbol", label: "Company", fmt: (r) => <Link href={`/holdings/${encodeURIComponent(r.symbol)}`} className="font-medium text-accent hover:underline">{r.symbol}<div className="max-w-40 truncate text-[11px] font-normal text-muted">{r.name ?? ""}</div></Link> },
  { k: "exchange", label: "Exch", group: "all" },
  { k: "assetType", label: "Type" },
  { k: "sector", label: "Sector" },
  { k: "industry", label: "Industry", group: "all" },
  { k: "marketCapCr", label: "Mcap (cr)", num: true, fmt: (r, nf) => formatNum(r.marketCapCr, 0, nf) },
  { k: "cap", label: "Cap", fmt: (r) => <span title={r.capOfficial ? "Official (AMFI/SEBI)" : "Custom band / fallback"}>{r.cap}{r.capOfficial ? "" : "*"}</span> },
  { k: "quantity", label: "Qty", num: true, fmt: (r, nf) => formatNum(r.quantity, r.quantity % 1 ? 3 : 0, nf) },
  { k: "avgPrice", label: "Avg price", num: true, fmt: (r, nf) => formatINR(r.avgPrice, { fmt: nf, decimals: 2 }) },
  { k: "invested", label: "Invested", num: true, fmt: (r, nf) => formatINR(r.invested, { fmt: nf }) },
  { k: "lastPrice", label: "LTP", num: true, fmt: (r, nf) => formatINR(r.lastPrice, { fmt: nf, decimals: 2 }) },
  { k: "value", label: "Value", num: true, fmt: (r, nf) => formatINR(r.value, { fmt: nf }) },
  { k: "unrealized", label: "Unrl. P/L", num: true, fmt: (r, nf) => <span className={(r.unrealized ?? 0) >= 0 ? "text-pos" : "text-neg"}>{formatINR(r.unrealized, { fmt: nf })}</span> },
  { k: "unrealizedPct", label: "P/L %", num: true, fmt: (r) => <span className={(r.unrealizedPct ?? 0) >= 0 ? "text-pos" : "text-neg"}>{pct(r.unrealizedPct)}</span> },
  { k: "weight", label: "Wt (value)", num: true, fmt: (r) => pct(r.weight) },
  { k: "costWeight", label: "Wt (cost)", num: true, fmt: (r) => <span className={r.overLimit ? "font-semibold text-warn" : ""} title={`Limit ${r.limitPct}% (${r.conviction})`}>{pct(r.costWeight)}</span> },
  { k: "rev3y", label: "Rev 3Y", num: true, fmt: (r) => pct(r.rev3y), group: "fund" },
  { k: "rev5y", label: "Rev 5Y", num: true, fmt: (r) => pct(r.rev5y), group: "fund" },
  { k: "rev10y", label: "Rev 10Y", num: true, fmt: (r) => pct(r.rev10y), group: "fund" },
  { k: "pe", label: "P/E", num: true, fmt: (r) => formatNum(r.pe, 1), group: "fund" },
  { k: "peg", label: "PEG", num: true, fmt: (r) => formatNum(r.peg, 2), group: "fund" },
  { k: "roce", label: "ROCE", num: true, fmt: (r) => (r.roce !== undefined ? r.roce.toFixed(1) + "%" : "—"), group: "fund" },
  { k: "debtEquity", label: "D/E", num: true, fmt: (r) => formatNum(r.debtEquity, 2), group: "fund" },
  { k: "promoter", label: "Promoter", num: true, fmt: (r) => (r.promoter !== undefined ? r.promoter.toFixed(1) + "%" : "—"), group: "fund" },
  { k: "unpledged", label: "Unpledged", num: true, fmt: (r) => (r.unpledged !== null ? r.unpledged.toFixed(1) + "%" : "—"), group: "fund" },
  { k: "score", label: "Score", num: true, fmt: (r) => (r.score !== null ? <span title={`Completeness ${(r.completeness * 100).toFixed(0)}%`}>{r.score.toFixed(0)}<span className="text-[10px] text-muted">/{(r.completeness * 100).toFixed(0)}%</span></span> : "—") },
  { k: "conviction", label: "Conviction" },
  { k: "vs200", label: "vs 200DMA", num: true, fmt: (r) => (r.vs200 === null ? "—" : <span className={r.vs200 >= 0 ? "text-pos" : "text-neg"}>{pct(r.vs200)}</span>) },
  { k: "lastReviewed", label: "Reviewed", group: "all" },
  { k: "quality", label: "Data", group: "all" },
];

export function HoldingsTable({ rows, nf }: { rows: HRow[]; nf: NumberFormat }) {
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [cap, setCap] = useState("all");
  const [sector, setSector] = useState("all");
  const [view, setView] = useState<"core" | "fund" | "all">("core");
  const [sort, setSort] = useState<{ k: keyof HRow; d: 1 | -1 }>({ k: "value", d: -1 });
  const sectors = [...new Set(rows.map((r) => r.sector))].sort();
  const filtered = useMemo(() => {
    const out = rows.filter((r) => (type === "all" || r.assetType === type) && (cap === "all" || r.cap === cap) && (sector === "all" || r.sector === sector) && (!q || `${r.symbol} ${r.name ?? ""} ${r.sector} ${r.industry}`.toLowerCase().includes(q.toLowerCase())));
    return out.sort((a, b) => {
      const x = a[sort.k], y = b[sort.k];
      if (x === y) return 0;
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      return (x > y ? 1 : -1) * sort.d;
    });
  }, [rows, q, type, cap, sector, sort]);
  const cols = COLS.filter((c) => !c.group || view === "all" || c.group === view || (view === "fund" && c.group === undefined));
  const exportCsv = () => {
    const head = COLS.map((c) => c.label);
    const lines = filtered.map((r) => COLS.map((c) => { const v = r[c.k]; return v === null || v === undefined ? "" : typeof v === "string" && /[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : String(v); }).join(","));
    const blob = new Blob(["﻿" + [head.join(","), ...lines].join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "holdings.csv"; a.click();
  };
  return (
    <div>
      <div className="no-print mb-3 flex flex-wrap items-center gap-2 text-sm">
        <input placeholder="Search company, sector…" value={q} onChange={(e) => setQ(e.target.value)} className="w-56" />
        <select value={type} onChange={(e) => setType(e.target.value)}><option value="all">All types</option><option value="STOCK">Stocks</option><option value="ETF">ETFs</option><option value="MF">Mutual funds</option><option value="CASH_EQUIVALENT">Cash-equivalent</option></select>
        <select value={cap} onChange={(e) => setCap(e.target.value)}><option value="all">All caps</option>{["Large", "Mid", "Small", "Micro", "Nano", "Unclassified"].map((c) => <option key={c}>{c}</option>)}</select>
        <select value={sector} onChange={(e) => setSector(e.target.value)}><option value="all">All sectors</option>{sectors.map((s) => <option key={s}>{s}</option>)}</select>
        <div className="flex overflow-hidden rounded-md border border-line">{(["core", "fund", "all"] as const).map((v) => <button key={v} onClick={() => setView(v)} className={`px-2 py-1 text-xs ${view === v ? "bg-accent text-white" : "text-muted"}`}>{v === "core" ? "Performance" : v === "fund" ? "Fundamentals" : "All columns"}</button>)}</div>
        <button onClick={exportCsv} className="rounded-md border border-line px-2 py-1 text-xs">Export CSV ({filtered.length})</button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-sm">
          <thead className="bg-panel-2">
            <tr>{cols.map((c) => <th key={c.k} onClick={() => setSort({ k: c.k, d: sort.k === c.k ? (sort.d === 1 ? -1 : 1) : -1 })} className={`cursor-pointer select-none whitespace-nowrap px-2 py-2 text-[11px] font-medium uppercase tracking-wide text-muted ${c.num ? "text-right" : "text-left"}`}>{c.label}{sort.k === c.k ? (sort.d === 1 ? " ▲" : " ▼") : ""}</th>)}</tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.symbol} className="border-t border-line/60 hover:bg-panel-2/60">
                {cols.map((c) => <td key={c.k} className={`num whitespace-nowrap px-2 py-1.5 ${c.num ? "text-right" : ""}`}>{c.fmt ? c.fmt(r, nf) : String(r[c.k] ?? "—")}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">* Custom Micro/Nano band or market-cap fallback (not an official SEBI/AMFI category). Score shown as points/completeness — missing evidence earns zero points. Amber cost-weight = above conviction limit (cost-based; not a sell instruction).</p>
    </div>
  );
}
