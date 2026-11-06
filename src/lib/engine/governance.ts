/**
 * Promoter & governance monitoring. Separates FACTS (reported holdings, filed events) from
 * INTERPRETATION (classification of a decline as dilution vs sale, which needs share counts).
 */
import type { Fundamentals, GovernanceEvent } from "../types";

export interface PromoterChange {
  quarter: string;
  pct: number;
  changePP: number | null;
  promoterShares: number | null;
  totalShares: number | null;
  /** Fact-based reason when share counts are available, else "Unknown". */
  reason: "Promoter sale" | "Promoter purchase" | "Dilution (new shares issued)" | "Mixed: sale and dilution" | "No change" | "Unknown — share counts not imported";
}

/** Classify each quarter's change. A falling % with unchanged promoter shares and more total shares = dilution, not a sale. */
export function promoterChanges(f: Fundamentals | undefined): PromoterChange[] {
  const h = f?.promoterHistory;
  if (!h) return [];
  const qs = Object.keys(h).sort();
  return qs.map((q, i) => {
    const prev = i ? qs[i - 1] : null;
    const ps = f?.promoterSharesHistory?.[q] ?? null, ts = f?.totalSharesHistory?.[q] ?? null;
    const pps = prev ? f?.promoterSharesHistory?.[prev] ?? null : null, pts = prev ? f?.totalSharesHistory?.[prev] ?? null : null;
    const ch = prev ? h[q] - h[prev] : null;
    let reason: PromoterChange["reason"] = "Unknown — share counts not imported";
    if (ch === null || Math.abs(ch) < 0.01) reason = "No change";
    else if (ps !== null && pps !== null && ts !== null && pts !== null) {
      const sharesDelta = ps - pps, totalDelta = ts - pts;
      if (sharesDelta < -1e-9 && totalDelta > 1e-9) reason = "Mixed: sale and dilution";
      else if (sharesDelta < -1e-9) reason = "Promoter sale";
      else if (sharesDelta > 1e-9) reason = "Promoter purchase";
      else if (totalDelta > 1e-9) reason = "Dilution (new shares issued)";
    }
    return { quarter: q, pct: h[q], changePP: ch, promoterShares: ps, totalShares: ts, reason };
  });
}

export interface GovAlert { date: string; kind: "fact" | "interpretation"; severity: "high" | "medium" | "low"; text: string; source?: string }

const SEVERE: GovernanceEvent["type"][] = ["Auditor resignation", "Regulatory action", "Pledge created", "Pledge increased", "Promoter sale", "Controversy"];

export function governanceAlerts(f: Fundamentals | undefined): GovAlert[] {
  const out: GovAlert[] = [];
  for (const e of f?.governanceEvents ?? []) out.push({ date: e.date, kind: "fact", severity: SEVERE.includes(e.type) ? "high" : "medium", text: `${e.type}: ${e.description}`, source: e.source });
  for (const g of f?.governanceFlags ?? []) out.push({ date: f!.asOf, kind: "fact", severity: "high", text: g, source: f!.source });
  const ch = promoterChanges(f);
  const last = ch[ch.length - 1];
  if (last?.changePP !== null && last && last.changePP < -0.5)
    out.push({ date: last.quarter, kind: last.reason.startsWith("Unknown") ? "interpretation" : "fact", severity: last.reason === "Promoter sale" ? "high" : "medium", text: `Promoter holding fell ${last.changePP.toFixed(2)} pp in ${last.quarter} — ${last.reason}.` });
  const shares = f?.annualSeries?.shares;
  if (shares) {
    const k = Object.keys(shares).sort();
    if (k.length >= 2) {
      const g = shares[k[k.length - 1]] / shares[k[k.length - 2]] - 1;
      if (g > 0.05) out.push({ date: k[k.length - 1], kind: "fact", severity: g > 0.15 ? "high" : "medium", text: `Share count grew ${(g * 100).toFixed(1)}% in ${k[k.length - 1]} (equity dilution).` });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : -1));
}
