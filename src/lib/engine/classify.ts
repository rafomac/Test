/**
 * Market-cap classification with an exclusive hierarchy:
 *   Large > Mid > Small > Micro > Nano
 * Large/Mid/Small follow SEBI's categorisation (AMFI half-yearly rank: 1–100 Large,
 * 101–250 Mid, 251+ Small) when an AMFI rank is available — this is OFFICIAL.
 * Micro and Nano are CUSTOM subdivisions of the official Small-cap bucket by full
 * market cap (₹ crore). They are not SEBI categories.
 */
import type { CapCategory, MarketCapThresholds, Security } from "../types";

export interface Classification {
  category: CapCategory;
  basis: "AMFI rank (official)" | "Market-cap fallback (approximate)" | "Custom band within Small-cap" | "Not classifiable";
  official: boolean;
  explanation: string;
}

export const DEFAULT_THRESHOLDS: MarketCapThresholds = {
  useAmfiRank: true,
  largeMaxRank: 100,
  midMaxRank: 250,
  // Approximate cut-offs; refresh each half-year from the AMFI list. Used only without a rank.
  largeMinCr: 100_000,
  midMinCr: 33_000,
  microMaxCr: 2_000,
  nanoMaxCr: 500,
};

export function validateThresholds(t: MarketCapThresholds): string[] {
  const e: string[] = [];
  if (!(t.largeMaxRank > 0 && t.midMaxRank > t.largeMaxRank)) e.push("Mid-cap max rank must exceed large-cap max rank.");
  if (!(t.largeMinCr > t.midMinCr)) e.push("Large-cap ₹cr floor must exceed mid-cap floor.");
  if (!(t.midMinCr > t.microMaxCr)) e.push("Mid-cap ₹cr floor must exceed micro-cap ceiling.");
  if (!(t.microMaxCr > t.nanoMaxCr && t.nanoMaxCr > 0)) e.push("Micro-cap ceiling must exceed nano-cap ceiling (> 0).");
  return e;
}

export function classify(sec: Pick<Security, "assetType" | "amfiRank" | "amfiCategory" | "marketCapCr"> | undefined, t: MarketCapThresholds): Classification {
  if (!sec || sec.assetType !== "STOCK")
    return { category: "Unclassified", basis: "Not classifiable", official: false, explanation: "Only direct equities are market-cap classified; ETFs/MFs use look-through." };
  const mc = sec.marketCapCr;
  let official: CapCategory | null = null;
  if (t.useAmfiRank && sec.amfiRank) {
    official = sec.amfiRank <= t.largeMaxRank ? "Large" : sec.amfiRank <= t.midMaxRank ? "Mid" : "Small";
  } else if (t.useAmfiRank && sec.amfiCategory) {
    official = sec.amfiCategory;
  }
  if (official === "Large" || official === "Mid")
    return { category: official, basis: "AMFI rank (official)", official: true, explanation: `AMFI rank ${sec.amfiRank ?? "n/a"} → ${official}-cap.` };
  if (official === "Small") {
    if (mc === undefined)
      return { category: "Small", basis: "AMFI rank (official)", official: true, explanation: "Official Small-cap; market cap unknown so Micro/Nano split not applied." };
    return subdivide(mc, t, true);
  }
  if (mc === undefined) return { category: "Unclassified", basis: "Not classifiable", official: false, explanation: "No AMFI rank and no market cap available." };
  if (mc >= t.largeMinCr) return { category: "Large", basis: "Market-cap fallback (approximate)", official: false, explanation: `₹${mc.toFixed(0)} cr ≥ ₹${t.largeMinCr} cr fallback.` };
  if (mc >= t.midMinCr) return { category: "Mid", basis: "Market-cap fallback (approximate)", official: false, explanation: `₹${mc.toFixed(0)} cr ≥ ₹${t.midMinCr} cr fallback.` };
  return subdivide(mc, t, false);
}

function subdivide(mc: number, t: MarketCapThresholds, officialSmall: boolean): Classification {
  const pre = officialSmall ? "Official Small-cap (AMFI); " : "No AMFI rank; ";
  if (mc >= t.microMaxCr) return { category: "Small", basis: officialSmall ? "AMFI rank (official)" : "Market-cap fallback (approximate)", official: officialSmall, explanation: `${pre}₹${mc.toFixed(0)} cr ≥ micro ceiling ₹${t.microMaxCr} cr.` };
  if (mc >= t.nanoMaxCr) return { category: "Micro", basis: "Custom band within Small-cap", official: false, explanation: `${pre}custom Micro band ₹${t.nanoMaxCr}–${t.microMaxCr} cr.` };
  return { category: "Nano", basis: "Custom band within Small-cap", official: false, explanation: `${pre}custom Nano band < ₹${t.nanoMaxCr} cr.` };
}

const LIQUID_PATTERNS = [/^LIQUID/i, /LIQUIDBEES/i, /LIQUIDCASE/i, /LIQUIDETF/i, /LIQUIDIETF/i, /^CASHIETF/i];
const ETF_PATTERNS = [/BEES$/i, /ETF$/i, /IETF$/i, /^MON100/i, /^MAFANG/i, /^MAHKTECH/i, /^MASPTOP50/i];

/** Heuristic asset-type inference for symbols with no security-master record. Always overridable. */
export function inferAssetType(symbol: string, name = "", liquidSymbols: string[] = []): "STOCK" | "ETF" | "MF" | "CASH_EQUIVALENT" {
  if (/^INF[A-Z0-9]{9}$/.test(symbol.toUpperCase())) return "MF"; // mutual fund ISINs start with INF
  if (liquidSymbols.map((s) => s.toUpperCase()).includes(symbol.toUpperCase())) return "CASH_EQUIVALENT";
  if (LIQUID_PATTERNS.some((r) => r.test(symbol))) return "CASH_EQUIVALENT";
  if (ETF_PATTERNS.some((r) => r.test(symbol)) || /\bETF\b/i.test(name)) return "ETF";
  return "STOCK";
}

/**
 * Index-methodology look-through for common index ETFs (constituents are defined by the index,
 * so the category is known by construction). Marked ESTIMATED; user-entered look-through wins.
 */
export const INDEX_ETF_LOOKTHROUGH: { re: RegExp; lt: Partial<Record<CapCategory, number>>; note: string }[] = [
  { re: /^(NIFTYBEES|NIFTYIETF|SETFNIF50|NIFTY1|ICICINIFTY|UTINIFTETF|HDFCNIFETF|NIF50IETF|BSLNIFTY|LICNETFN50|AXISNIFTY|KOTAKNIFTY|MOM50)$/i, lt: { Large: 1 }, note: "Nifty 50 constituents are large-caps" },
  { re: /^(BANKBEES|BANKIETF|SETFNIFBK|KOTAKBKETF|HDFCBANK?ETF)$/i, lt: { Large: 1 }, note: "Nifty Bank — predominantly large-cap (approx.)" },
  { re: /^(MID150BEES|MIDCAPETF|MIDCAPIETF|MIDQ50ADD)$/i, lt: { Mid: 1 }, note: "Nifty Midcap 150 = SEBI mid-cap universe (approx.)" },
  { re: /^(SMALLCAP|HDFCSML250|SML250|MOSMALL250|SMALL250)$/i, lt: { Small: 1 }, note: "Nifty Smallcap 250 = official small-caps (approx.)" },
];

/**
 * Classification effective on `date`, using the security's capHistory when present
 * (history entries apply from their date onward). Falls back to the current fields.
 */
export function classifyAt(sec: Security | undefined, date: string, t: MarketCapThresholds): Classification {
  if (!sec) return classify(undefined, t);
  const h = (sec.capHistory ?? []).filter((x) => x.date <= date).sort((a, b) => (a.date < b.date ? -1 : 1)).pop();
  if (!h) {
    // Before the first recorded classification, use the earliest known record rather than today's.
    const first = [...(sec.capHistory ?? [])].sort((a, b) => (a.date < b.date ? -1 : 1))[0];
    return classify(first ? { ...sec, marketCapCr: first.marketCapCr, amfiRank: first.amfiRank, amfiCategory: first.amfiCategory } : sec, t);
  }
  return classify({ ...sec, marketCapCr: h.marketCapCr ?? sec.marketCapCr, amfiRank: h.amfiRank, amfiCategory: h.amfiCategory }, t);
}

/** Append a capHistory entry when market cap / AMFI data changes (used by imports and edits). */
export function withCapHistory(prev: Security | undefined, next: Security, date: string, source: string): Security {
  const changed = !prev || prev.marketCapCr !== next.marketCapCr || prev.amfiRank !== next.amfiRank || prev.amfiCategory !== next.amfiCategory;
  const hist = [...(prev?.capHistory ?? next.capHistory ?? [])];
  if (changed && (next.marketCapCr !== undefined || next.amfiRank !== undefined)) {
    const entry = { date, marketCapCr: next.marketCapCr, amfiRank: next.amfiRank, amfiCategory: next.amfiCategory, source };
    const i = hist.findIndex((h) => h.date === date);
    if (i >= 0) hist[i] = entry; else hist.push(entry);
  }
  return { ...next, capHistory: hist.sort((a, b) => (a.date < b.date ? -1 : 1)) };
}
