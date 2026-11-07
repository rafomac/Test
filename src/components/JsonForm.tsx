"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** Small helper: PUT/POST JSON to an API route, then refresh server components. */
export function useApi() {
  const r = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function send(url: string, method: string, body?: unknown) {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(j.error ?? `Error ${res.status}`); return null; }
      setMsg(typeof j?.note === "string" && j.planLimited ? j.note : "Saved"); r.refresh(); return j;
    } finally { setBusy(false); }
  }
  return { send, busy, msg, setMsg };
}
