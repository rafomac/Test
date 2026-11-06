"use client";
import { useApi } from "./JsonForm";
export function AlertButtons({ id, suppressed }: { id: string; suppressed?: boolean }) {
  const { send, busy } = useApi();
  const snooze = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  if (suppressed) return <button disabled={busy} onClick={() => send("/api/alerts", "POST", { id, status: "active" })} className="rounded border border-line px-1.5 py-0.5 text-xs">Restore</button>;
  return (
    <span className="space-x-1 whitespace-nowrap">
      <button disabled={busy} onClick={() => send("/api/alerts", "POST", { id, status: "acknowledged" })} className="rounded border border-line px-1.5 py-0.5 text-xs">Acknowledge</button>
      <button disabled={busy} onClick={() => send("/api/alerts", "POST", { id, status: "snoozed", until: snooze })} className="rounded border border-line px-1.5 py-0.5 text-xs">Snooze 30d</button>
    </span>
  );
}
