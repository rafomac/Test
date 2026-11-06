"use client";
import { useState } from "react";
import { useApi } from "./JsonForm";
import type { ResearchEntry, ScoreCategory, Security } from "@/lib/types";

const CATS: [ScoreCategory, string][] = [["growth", "Future growth"], ["financialHealth", "Financial health & cash flow"], ["valuation", "Valuation"], ["governance", "Management & governance"], ["competitive", "Competitive position"], ["industry", "Industry opportunity"], ["digital", "Digital presence"]];

export function ResearchForm({ symbol, initial }: { symbol: string; initial?: ResearchEntry }) {
  const { send, busy, msg } = useApi();
  const [r, setR] = useState<ResearchEntry>(initial ?? { symbol, conviction: "Research", ratings: {}, evidence: {}, updatedAt: "" });
  const set = <K extends keyof ResearchEntry>(k: K, v: ResearchEntry[K]) => setR({ ...r, [k]: v });
  return (
    <div className="space-y-3 text-sm">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1"><span className="text-xs text-muted">Conviction</span>
          <select value={r.conviction} onChange={(e) => set("conviction", e.target.value as ResearchEntry["conviction"])}>{["Research", "Standard", "High", "Exceptional"].map((c) => <option key={c}>{c}</option>)}</select></label>
        <label className="flex flex-col gap-1"><span className="text-xs text-muted">Last reviewed</span><input type="date" value={r.lastReviewed ?? ""} onChange={(e) => set("lastReviewed", e.target.value)} /></label>
        <label className="flex flex-col gap-1"><span className="text-xs text-muted">Next review</span><input type="date" value={r.nextReview ?? ""} onChange={(e) => set("nextReview", e.target.value)} /></label>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm"><thead><tr className="text-left text-[11px] uppercase text-muted"><th className="py-1">Category</th><th>Rating 0–10 (blank = not assessed)</th><th>Evidence</th></tr></thead>
          <tbody>{CATS.map(([k, l]) => (
            <tr key={k} className="border-t border-line/60"><td className="py-1">{l}</td>
              <td><input type="number" min={0} max={10} step={0.5} className="w-20" value={r.ratings[k] ?? ""} onChange={(e) => setR({ ...r, ratings: { ...r.ratings, [k]: e.target.value === "" ? undefined : Number(e.target.value) } })} /></td>
              <td><select value={r.evidence[k] ?? ""} onChange={(e) => setR({ ...r, evidence: { ...r.evidence, [k]: (e.target.value || undefined) as "verified" | "interpretation" | "user" | undefined } })}><option value="">—</option><option value="verified">Verified data</option><option value="interpretation">Analyst interpretation</option><option value="user">My conviction</option></select></td></tr>
          ))}</tbody></table>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {(["thesis", "opportunities", "risks", "notes"] as const).map((k) => <label key={k} className="flex flex-col gap-1"><span className="text-xs capitalize text-muted">{k}</span><textarea rows={3} value={r[k] ?? ""} onChange={(e) => set(k, e.target.value)} /></label>)}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1"><span className="text-xs text-muted">2025–26 slowdown classification (only with evidence)</span>
          <select value={r.slowdownCause ?? "Not applicable"} onChange={(e) => set("slowdownCause", e.target.value as ResearchEntry["slowdownCause"])}>{["Not applicable", "Temporary", "Cyclical", "Structural", "Company-specific", "Unexplained"].map((c) => <option key={c}>{c}</option>)}</select></label>
        <label className="flex flex-col gap-1"><span className="text-xs text-muted">Evidence / source for the classification</span><input value={r.slowdownEvidence ?? ""} onChange={(e) => set("slowdownEvidence", e.target.value)} placeholder="e.g. Q2 FY26 concall: US tariff on exports…" /></label>
      </div>
      <button disabled={busy} onClick={() => send("/api/research", "PUT", r)} className="rounded-md bg-accent px-3 py-1.5 font-medium text-white disabled:opacity-50">Save research</button> {msg && <span className="text-xs text-muted">{msg}</span>}
    </div>
  );
}

export function SecurityForm({ initial }: { initial: Partial<Security> & { symbol: string } }) {
  const { send, busy, msg } = useApi();
  const [s, setS] = useState(initial);
  const field = (k: keyof Security, label: string, type = "text") => (
    <label className="flex flex-col gap-1"><span className="text-xs text-muted">{label}</span>
      <input type={type} value={(s[k] as string | number | undefined) ?? ""} onChange={(e) => setS({ ...s, [k]: type === "number" ? (e.target.value === "" ? undefined : Number(e.target.value)) : e.target.value || undefined })} /></label>
  );
  return (
    <div className="space-y-3 text-sm">
      <div className="grid gap-3 sm:grid-cols-3">
        {field("name", "Name")}
        <label className="flex flex-col gap-1"><span className="text-xs text-muted">Asset type</span><select value={s.assetType ?? "STOCK"} onChange={(e) => setS({ ...s, assetType: e.target.value as Security["assetType"] })}><option value="STOCK">Stock</option><option value="ETF">ETF</option><option value="MF">Mutual fund</option><option value="CASH_EQUIVALENT">Cash-equivalent (e.g. Liquid BeES)</option></select></label>
        {field("isin", "ISIN")}
        {field("sector", "Sector")}
        {field("industry", "Industry")}
        {field("marketCapCr", "Market cap (₹ cr)", "number")}
        {field("marketCapAsOf", "Market cap as of", "date")}
        {field("amfiRank", "AMFI rank (official)", "number")}
      </div>
      <button disabled={busy} onClick={() => send("/api/securities", "PUT", s)} className="rounded-md bg-accent px-3 py-1.5 font-medium text-white disabled:opacity-50">Save security master</button> {msg && <span className="text-xs text-muted">{msg}</span>}
    </div>
  );
}
