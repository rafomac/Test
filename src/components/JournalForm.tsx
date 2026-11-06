"use client";
import { useState } from "react";
import { useApi } from "./JsonForm";
import type { JournalEntry } from "@/lib/types";

const BASIS = ["Improved fundamentals", "Lower valuation", "Temporary correction", "New business opportunity", "Increased conviction", "Allocation adjustment"] as const;

export function JournalForm({ preset }: { preset?: Partial<JournalEntry> }) {
  const { send, busy, msg } = useApi();
  const [e, setE] = useState<Partial<JournalEntry>>({ kind: "Initial", conviction: "Research", ...preset });
  const f = (k: keyof JournalEntry, label: string, area = false) => (
    <label className="flex flex-col gap-1"><span className="text-xs text-muted">{label}</span>
      {area ? <textarea rows={2} value={(e[k] as string) ?? ""} onChange={(ev) => setE({ ...e, [k]: ev.target.value })} /> : <input value={(e[k] as string) ?? ""} onChange={(ev) => setE({ ...e, [k]: ev.target.value })} />}</label>
  );
  return (
    <div className="space-y-3 text-sm">
      <div className="grid gap-3 sm:grid-cols-5">
        <label className="flex flex-col gap-1"><span className="text-xs text-muted">Company</span><input value={e.symbol ?? ""} onChange={(ev) => setE({ ...e, symbol: ev.target.value.toUpperCase() })} /></label>
        <label className="flex flex-col gap-1"><span className="text-xs text-muted">Date</span><input type="date" value={e.date ?? ""} onChange={(ev) => setE({ ...e, date: ev.target.value })} /></label>
        <label className="flex flex-col gap-1"><span className="text-xs text-muted">Amount ₹</span><input type="number" value={e.amount ?? ""} onChange={(ev) => setE({ ...e, amount: Number(ev.target.value) })} /></label>
        <label className="flex flex-col gap-1"><span className="text-xs text-muted">Decision</span><select value={e.kind} onChange={(ev) => setE({ ...e, kind: ev.target.value as JournalEntry["kind"] })}>{["Initial", "Addition", "Trim", "Exit"].map((k) => <option key={k}>{k}</option>)}</select></label>
        <label className="flex flex-col gap-1"><span className="text-xs text-muted">Conviction</span><select value={e.conviction} onChange={(ev) => setE({ ...e, conviction: ev.target.value as JournalEntry["conviction"] })}>{["Research", "Standard", "High", "Exceptional"].map((k) => <option key={k}>{k}</option>)}</select></label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {f("reason", "Reason for this decision *", true)}{f("evidence", "Fundamental evidence", true)}{f("valuation", "Valuation justification", true)}{f("expectedGrowth", "Expected business growth", true)}
        {f("risks", "Major risks", true)}{f("holdingPeriod", "Expected holding period")}{f("addConditions", "Conditions for adding capital", true)}{f("exitConditions", "Conditions for exiting", true)}
      </div>
      {e.kind === "Addition" && (
        <div className="flex flex-wrap gap-3 text-xs"><span className="text-muted">Addition based on:</span>{BASIS.map((b) => <label key={b} className="flex items-center gap-1"><input type="checkbox" checked={e.basis?.includes(b) ?? false} onChange={(ev) => setE({ ...e, basis: ev.target.checked ? [...(e.basis ?? []), b] : (e.basis ?? []).filter((x) => x !== b) })} />{b}</label>)}</div>
      )}
      <p className="text-xs text-muted">Price, P/E, TTM revenue and research score at entry are captured automatically from your data so the thesis can be compared with results later.</p>
      <button disabled={busy || !e.symbol || !e.date || !e.reason} onClick={() => send("/api/journal", "PUT", e)} className="rounded-md bg-accent px-3 py-1.5 font-medium text-white disabled:opacity-50">Save journal entry</button> {msg && <span className="text-xs text-muted">{msg}</span>}
    </div>
  );
}
