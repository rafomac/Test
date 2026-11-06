"use client";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

const OPTS = [["all", "All-time"], ["ytd", "Current year"], ["prev-year", "Previous year"], ["12m", "Last 12 months"], ["6m", "Last 6 months"], ["3m", "Last 3 months"], ["30d", "Last 30 days"], ["custom", "Custom"]];

export function RangeFilter() {
  const r = useRouter(), sp = useSearchParams(), path = usePathname();
  const range = sp.get("range") ?? "all";
  const set = (k: string, v: string) => { const q = new URLSearchParams(sp.toString()); q.set(k, v); r.push(`${path}?${q}`); };
  return (
    <div className="no-print flex flex-wrap items-center gap-2 text-sm">
      <select value={range} onChange={(e) => set("range", e.target.value)} aria-label="Date range">
        {OPTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      {range === "custom" && (
        <>
          <input type="date" defaultValue={sp.get("from") ?? ""} onChange={(e) => set("from", e.target.value)} aria-label="From" />
          <input type="date" defaultValue={sp.get("to") ?? ""} onChange={(e) => set("to", e.target.value)} aria-label="To" />
        </>
      )}
    </div>
  );
}
