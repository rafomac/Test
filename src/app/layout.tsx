import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { getSettings, hasSynthetic } from "@/lib/server/repo";

export const metadata: Metadata = { title: "Portfolio Intelligence", description: "Zerodha portfolio intelligence & wealth compounding dashboard" };
export const dynamic = "force-dynamic";

const themeScript = `try{var t=localStorage.getItem('theme');if(t==='dark'||t==='light')document.documentElement.dataset.theme=t;}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  let synthetic = false;
  try { synthetic = hasSynthetic(); getSettings(); } catch { /* DB unavailable during build */ }
  const authOff = !process.env.APP_PASSWORD_HASH;
  return (
    <html lang="en-IN" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body className="min-h-screen">
        <div className="flex min-h-screen flex-col lg:flex-row">
          <Sidebar />
          <main className="min-w-0 flex-1 px-4 py-5 lg:px-8">
            {synthetic && (
              <div className="mb-4 rounded-lg border border-neg/40 bg-neg/10 px-4 py-2 text-sm text-neg">
                <b>SYNTHETIC SAMPLE DATA LOADED.</b> Fictional “ZZ” tickers and generated prices — not your portfolio and not market data. Remove it in Settings → Sample data.
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
