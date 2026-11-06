"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const GROUPS: [string, [string, string][]][] = [
  ["Dashboard", [["/", "Overview"], ["/performance", "Annual Performance Goal"], ["/sip", "Monthly ₹2 Lakh SIP"]]],
  ["Portfolio", [["/holdings", "Holdings"], ["/allocation", "Market-Cap Allocation"], ["/sectors", "Sector Analysis"], ["/risk", "Risk & Liquidity"], ["/multibaggers", "Multibaggers"]]],
  ["Research & process", [["/pipeline", "Investment Pipeline"], ["/research", "Research Scorecard"], ["/deployment", "Deployment & Sizing"], ["/journal", "Decision Journal"], ["/process", "Process Effectiveness"]]],
  ["Planning", [["/projections", "Wealth Projections"], ["/reports", "Reports"], ["/tax", "Tax & Costs"], ["/alerts", "Alerts"]]],
  ["", [["/settings", "Settings & Data Quality"]]],
];

export function Sidebar({ alertCount = 0, mode = "live" }: { alertCount?: number; mode?: "live" | "demo" }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<"system" | "dark" | "light">("system");
  useEffect(() => { try { const t = localStorage.getItem("theme"); if (t === "dark" || t === "light") setTheme(t); } catch {} }, []);
  const cycle = () => {
    const next = theme === "system" ? "dark" : theme === "dark" ? "light" : "system";
    setTheme(next);
    try { if (next === "system") { localStorage.removeItem("theme"); delete document.documentElement.dataset.theme; } else { localStorage.setItem("theme", next); document.documentElement.dataset.theme = next; } } catch {}
  };
  return (
    <aside className="no-print border-b border-line bg-panel lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:shrink-0 lg:overflow-y-auto lg:border-b-0 lg:border-r">
      <div className="flex items-center justify-between px-4 py-3 lg:py-4">
        <Link href="/" className="font-semibold tracking-tight">Portfolio<span className="text-accent"> Intelligence</span>{mode === "demo" && <span className="ml-1.5 rounded bg-warn/20 px-1 text-[10px] font-bold text-warn">DEMO</span>}</Link>
        <button className="rounded border border-line px-2 py-1 text-xs lg:hidden" onClick={() => setOpen(!open)} aria-expanded={open}>Menu{alertCount ? ` · ${alertCount}` : ""}</button>
      </div>
      <nav className={`${open ? "block" : "hidden"} px-2 pb-3 lg:block`}>
        {GROUPS.map(([g, items]) => (
          <div key={g || "x"} className="mb-2">
            {g && <div className="px-3 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted/80">{g}</div>}
            {items.map(([href, label]) => {
              const active = href === "/" ? path === "/" : path.startsWith(href);
              return (
                <Link key={href} href={href} onClick={() => setOpen(false)} className={`flex items-center justify-between rounded-md px-3 py-1.5 text-sm ${active ? "bg-accent/15 font-medium text-accent" : "text-muted hover:bg-panel-2 hover:text-fg"}`}>
                  <span>{label}</span>
                  {href === "/alerts" && alertCount > 0 && <span className="rounded-full bg-neg px-1.5 text-[10px] font-semibold text-white">{alertCount}</span>}
                </Link>
              );
            })}
          </div>
        ))}
        <div className="mt-2 flex gap-2 px-3">
          <button onClick={cycle} className="rounded border border-line px-2 py-1 text-xs text-muted">Theme: {theme}</button>
          <form action="/api/auth/logout" method="post"><button className="rounded border border-line px-2 py-1 text-xs text-muted">Log out</button></form>
        </div>
        <p className="mt-3 px-3 text-[11px] leading-snug text-muted">Read-only analytics. No orders are ever placed. Not investment advice.</p>
      </nav>
    </aside>
  );
}
