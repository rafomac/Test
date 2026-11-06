import type { DataQuality } from "@/lib/types";
import { clsx } from "clsx";

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-muted">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function Card({ title, subtitle, children, className, right }: { title?: React.ReactNode; subtitle?: React.ReactNode; children: React.ReactNode; className?: string; right?: React.ReactNode }) {
  return (
    <section className={clsx("rounded-xl border border-line bg-panel p-4", className)}>
      {(title || right) && (
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            {title && <h2 className="text-sm font-semibold">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, sub, tone, hint }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "pos" | "neg" | "warn" | null; hint?: string }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-3.5" title={hint}>
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className={clsx("num mt-1 text-lg font-semibold", tone === "pos" && "text-pos", tone === "neg" && "text-neg", tone === "warn" && "text-warn")}>{value}</div>
      {sub && <div className="mt-0.5 text-xs leading-snug text-muted">{sub}</div>}
    </div>
  );
}

export const tone = (x: number | null | undefined) => (x === null || x === undefined || x === 0 ? null : x > 0 ? "pos" : "neg");

const QCOL: Record<DataQuality, string> = {
  VERIFIED: "border-pos/40 text-pos", RECONSTRUCTED: "border-accent/40 text-accent", ESTIMATED: "border-warn/40 text-warn",
  MISSING: "border-neg/40 text-neg", SYNTHETIC: "border-neg/60 bg-neg/10 text-neg",
};
export function QualityBadge({ q }: { q: DataQuality }) {
  return <span className={clsx("inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide", QCOL[q])}>{q}</span>;
}

export function Badge({ children, tone: t }: { children: React.ReactNode; tone?: "pos" | "neg" | "warn" | "muted" | "accent" }) {
  return <span className={clsx("inline-block rounded px-1.5 py-0.5 text-[11px] font-medium", t === "pos" && "bg-pos/15 text-pos", t === "neg" && "bg-neg/15 text-neg", t === "warn" && "bg-warn/15 text-warn", t === "accent" && "bg-accent/15 text-accent", (!t || t === "muted") && "bg-panel-2 text-muted")}>{children}</span>;
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line p-6 text-center">
      <div className="text-sm font-medium">{title}</div>
      {children && <div className="mx-auto mt-1 max-w-xl text-xs text-muted">{children}</div>}
    </div>
  );
}

export function Note({ children, tone: t = "muted" }: { children: React.ReactNode; tone?: "muted" | "warn" | "neg" }) {
  return <p className={clsx("mt-2 text-xs leading-relaxed", t === "warn" ? "text-warn" : t === "neg" ? "text-neg" : "text-muted")}>{children}</p>;
}

export function Freshness({ at, label = "Data as of" }: { at?: string | null; label?: string }) {
  return <span className="text-xs text-muted">{label} {at ? new Date(at.length === 10 ? at + "T00:00:00" : at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: at.length === 10 ? undefined : "short" }) : "—"}</span>;
}

export function T({ head, rows, className, align }: { head: React.ReactNode[]; rows: React.ReactNode[][]; className?: string; align?: ("l" | "r")[] }) {
  return (
    <div className={clsx("overflow-x-auto", className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-muted">
            {head.map((h, i) => <th key={i} className={clsx("whitespace-nowrap px-2 py-2 font-medium", align?.[i] === "r" && "text-right")}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-line/60 last:border-0">
              {r.map((c, j) => <td key={j} className={clsx("num whitespace-nowrap px-2 py-1.5", align?.[j] === "r" && "text-right")}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
