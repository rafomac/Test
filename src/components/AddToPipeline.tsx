"use client";
import { useState } from "react";
import { useApi } from "./JsonForm";
import { PIPELINE_STAGES, type PipelineStage } from "@/lib/types";

export function AddToPipeline() {
  const { send, busy, msg } = useApi();
  const [sym, setSym] = useState(""); const [stage, setStage] = useState<PipelineStage>("Discovery"); const [note, setNote] = useState("");
  return (
    <div className="flex flex-wrap items-end gap-2 text-sm">
      <label className="flex flex-col gap-1"><span className="text-xs text-muted">Symbol</span><input value={sym} onChange={(e) => setSym(e.target.value.toUpperCase())} placeholder="e.g. NSE symbol" /></label>
      <label className="flex flex-col gap-1"><span className="text-xs text-muted">Stage</span><select value={stage} onChange={(e) => setStage(e.target.value as PipelineStage)}>{PIPELINE_STAGES.map((s) => <option key={s}>{s}</option>)}</select></label>
      <label className="flex flex-1 flex-col gap-1"><span className="text-xs text-muted">Why it's interesting (thesis seed)</span><input value={note} onChange={(e) => setNote(e.target.value)} /></label>
      <button disabled={busy || !sym} onClick={() => send("/api/research", "PUT", { symbol: sym, stage, thesis: note || undefined, conviction: "Research" })} className="rounded-md bg-accent px-3 py-1.5 font-medium text-white disabled:opacity-50">Add / move</button>
      {msg && <span className="text-xs text-muted">{msg}</span>}
    </div>
  );
}
