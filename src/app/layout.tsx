import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { getAlerts, hasSynthetic } from "@/lib/server/repo";
import { dataMode } from "@/lib/store/db";
import Link from "next/link";

export const metadata: Metadata = { title: "Portfolio Intelligence", description: "Zerodha portfolio intelligence & wealth compounding dashboard" };
export const dynamic = "force-dynamic";

const themeScript = `try{var t=localStorage.getItem('theme');if(t==='dark'||t==='light')document.documentElement.dataset.theme=t;}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  let synthetic = false, alertCount = 0;
  const mode = dataMode();
  try { synthetic = hasSynthetic(); alertCount = getAlerts().active.filter((x) => x.severity !== "low").length; } catch { /* DB unavailable during build */ }
  const authOff = !process.env.APP_PASSWORD_HASH;
  return (
    <html lang="en-IN" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body className="min-h-screen">
        <div className="flex min-h-screen flex-col lg:flex-row">
          <Sidebar alertCount={alertCount} mode={mode} />
          <main className="min-w-0 flex-1 px-4 py-5 lg:px-8">
            {mode === "demo" && (
              <div className="mb-4 rounded-lg border border-warn/50 bg-warn/10 px-4 py-2 text-sm text-warn">
                <b>DEMO MODE</b> — separate demo database with fictional “ZZ” companies and generated prices. Broker connection and real imports are disabled here. Run <code>npm start</code> (live mode) for your portfolio.
              </div>
            )}
            {mode === "live" && synthetic && (
              <div className="mb-4 rounded-lg border border-neg/40 bg-neg/10 px-4 py-2 text-sm text-neg">
                <b>Synthetic sample records found in the LIVE database.</b> Real imports and Kite sync are blocked until they are removed. <Link href="/settings/data#migration" className="underline">Run the synthetic-data migration →</Link>
              </div>
            )}
            {authOff && process.env.NODE_ENV !== "production" && (
              <div className="no-print mb-4 rounded-lg border border-warn/40 bg-warn/10 px-4 py-2 text-xs text-warn">Development mode without a dashboard password (APP_PASSWORD_HASH unset). Production builds refuse to serve until it is set.</div>
            )}
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
