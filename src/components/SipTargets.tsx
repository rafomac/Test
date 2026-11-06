"use client";
import { useState } from "react";
import { useApi } from "./JsonForm";

export function SipTargets({ monthlyTarget, planStartMonth, overrides }: { monthlyTarget: number; planStartMonth: string; overrides: Record<string, number> }) {
  const { send, busy, msg } = useApi();
  const [mt, setMt] = useState(monthlyTarget);
  const [ps, setPs] = useState(planStartMonth);
  const [ov, setOv] = useState(Object.entries(overrides).map(([k, v]) => `${k}=${v}`).join("\n"));
  const save = () => {
    const o: Record<string, number> = {};
    for (const line of ov.split(/\n|,/)) { const m = line.trim().match(/^(\d{4}-\d{2})\s*=\s*([\d.]+)$/); if (m) o[m[1]] = Number(m[2]); }
    send("/api/settings", "PUT", { monthlyTarget: mt, planStartMonth: ps, monthlyTargetOverrides: o });
  };
  return (
    <div className="grid gap-3 text-sm md:grid-cols-3">
      <label className="flex flex-col gap-1"><span className="text-xs text-muted">Monthly target (₹)</span><input type="number" value={mt} onChange={(e) => setMt(Number(e.target.value))} /></label>
      <label className="flex flex-col gap-1"><span className="text-xs text-muted">Plan start month (earlier months are not judged)</span><input type="month" value={ps} onChange={(e) => setPs(e.target.value)} /></label>
      <label className="flex flex-col gap-1"><span className="text-xs text-muted">Per-month overrides (YYYY-MM=amount, one per line)</span><textarea rows={3} value={ov} onChange={(e) => setOv(e.target.value)} placeholder="2026-03=150000" /></label>
      <div className="md:col-span-3"><button disabled={busy} onClick={save} className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">Save targets</button> {msg && <span className="ml-2 text-xs text-muted">{msg}</span>}</div>
    </div>
  );
}
