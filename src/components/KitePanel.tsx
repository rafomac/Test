"use client";
import { useApi } from "./JsonForm";

export function KitePanel({ status }: { status: { configured: boolean; connected: boolean; userId?: string; userName?: string; expiresAt?: string; expired: boolean; lastSync: { at: string; holdings: number; mf: number; cash: number | null } | null } }) {
  const { send, busy, msg } = useApi();
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-block h-2.5 w-2.5 rounded-full ${status.connected ? "bg-pos" : status.configured ? "bg-warn" : "bg-neg"}`} />
        <b>{status.connected ? `Connected as ${status.userName} (${status.userId})` : status.expired ? "Session expired (Kite tokens expire ~6 AM IST daily)" : status.configured ? "Not connected" : "Not configured"}</b>
        {status.expiresAt && status.connected && <span className="text-xs text-muted">token valid until {new Date(status.expiresAt).toLocaleString("en-IN")}</span>}
      </div>
      {!status.configured ? (
        <p className="text-xs text-muted">Set <code>KITE_API_KEY</code> and <code>KITE_API_SECRET</code> in the server environment (.env.local), and register <code>https://&lt;your-host&gt;/api/kite/callback</code> as the redirect URL of your app at developers.kite.trade. See README → Zerodha setup.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <a href="/api/kite/login" className="rounded-md bg-accent px-3 py-1.5 font-medium text-white">{status.connected ? "Re-login with Zerodha" : "Login with Zerodha"}</a>
          <button disabled={!status.connected || busy} onClick={() => send("/api/kite/sync", "POST")} className="rounded-md border border-line px-3 py-1.5 disabled:opacity-50">Sync holdings & funds</button>
          <button disabled={!status.connected || busy} onClick={() => send("/api/kite/historical", "POST")} className="rounded-md border border-line px-3 py-1.5 disabled:opacity-50">Fetch historical prices</button>
          <button disabled={!status.connected || busy} onClick={() => send("/api/kite/logout", "POST")} className="rounded-md border border-line px-3 py-1.5 disabled:opacity-50">Disconnect</button>
        </div>
      )}
      {status.lastSync && <p className="text-xs text-muted">Last sync {new Date(status.lastSync.at).toLocaleString("en-IN")}: {status.lastSync.holdings} holdings, {status.lastSync.mf} MF, cash {status.lastSync.cash ?? "—"}</p>}
      {busy && <p className="text-xs text-muted">Working…</p>}
      {msg && <p className="text-xs text-muted">{msg}</p>}
    </div>
  );
}
