"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const NAV = [
  ["/", "Overview"], ["/performance", "Annual Performance Goal"], ["/sip", "Monthly ₹2 Lakh SIP"], ["/holdings", "Holdings"],
  ["/allocation", "Market-Cap Allocation"], ["/sectors", "Sector Analysis"], ["/risk", "Portfolio Risk"], ["/research", "Research Scorecard"],
  ["/multibaggers", "Multibaggers"], ["/projections", "Wealth Projections"], ["/reports", "Reports"], ["/settings", "Settings & Data Quality"],
] as const;

export function Sidebar() {
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
    <aside className="no-print border-b border-line bg-panel lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:shrink-0 lg:border-b-0 lg:border-r">
      <div className="flex items-center justify-between px-4 py-3 lg:py-5">
        <Link href="/" className="font-semibold tracking-tight">Portfolio<span className="text-accent"> Intelligence</span></Link>
        <button className="rounded border border-line px-2 py-1 text-xs lg:hidden" onClick={() => setOpen(!open)} aria-expanded={open}>Menu</button>
      </div>
      <nav className={`${open ? "block" : "hidden"} px-2 pb-3 lg:block`}>
        {NAV.map(([href, label]) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <Link key={href} href={href} onClick={() => setOpen(false)} className={`block rounded-md px-3 py-1.5 text-sm ${active ? "bg-accent/15 font-medium text-accent" : "text-muted hover:bg-panel-2 hover:text-fg"}`}>{label}</Link>
          );
        })}
        <div className="mt-4 flex gap-2 px-3">
          <button onClick={cycle} className="rounded border border-line px-2 py-1 text-xs text-muted">Theme: {theme}</button>
          <form action="/api/auth/logout" method="post"><button className="rounded border border-line px-2 py-1 text-xs text-muted">Log out</button></form>
        </div>
        <p className="mt-4 px-3 text-[11px] leading-snug text-muted">Read-only analytics. No orders are ever placed. Not investment advice.</p>
      </nav>
    </aside>
  );
}
