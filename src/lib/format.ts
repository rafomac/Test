/** Number formatting with Indian (lakh/crore) grouping or international grouping. */
export type NumberFormat = "indian" | "international";

function groupIndian(intStr: string): string {
  if (intStr.length <= 3) return intStr;
  const last3 = intStr.slice(-3);
  const rest = intStr.slice(0, -3);
  return rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3;
}
function groupIntl(intStr: string): string {
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** ₹1,00,000 style (indian) or ₹100,000 (international). */
export function formatINR(value: number | null | undefined, opts: { fmt?: NumberFormat; decimals?: number; sign?: boolean } = {}): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const { fmt = "indian", decimals = 0, sign = false } = opts;
  const neg = value < 0;
  const abs = Math.abs(value);
  const fixed = abs.toFixed(decimals);
  const [i, d] = fixed.split(".");
  const grouped = fmt === "indian" ? groupIndian(i) : groupIntl(i);
  const body = "₹" + grouped + (d ? "." + d : "");
  if (neg) return "-" + body;
  return sign && value > 0 ? "+" + body : body;
}

/** Compact: ₹12.4 L / ₹1.25 Cr (indian) or ₹1.2M / ₹12.5M (international). */
export function formatCompact(value: number | null | undefined, fmt: NumberFormat = "indian"): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const neg = value < 0;
  const a = Math.abs(value);
  let s: string;
  if (fmt === "indian") {
    if (a >= 1e7) s = `₹${(a / 1e7).toFixed(a >= 1e9 ? 0 : 2)} Cr`;
    else if (a >= 1e5) s = `₹${(a / 1e5).toFixed(2)} L`;
    else if (a >= 1e3) s = `₹${(a / 1e3).toFixed(1)} K`;
    else s = `₹${a.toFixed(0)}`;
  } else {
    if (a >= 1e9) s = `₹${(a / 1e9).toFixed(2)}B`;
    else if (a >= 1e6) s = `₹${(a / 1e6).toFixed(2)}M`;
    else if (a >= 1e3) s = `₹${(a / 1e3).toFixed(1)}K`;
    else s = `₹${a.toFixed(0)}`;
  }
  return neg ? "-" + s : s;
}

export function formatPct(value: number | null | undefined, decimals = 1, sign = false): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const s = (value * 100).toFixed(decimals) + "%";
  return sign && value > 0 ? "+" + s : s;
}

export function formatNum(value: number | null | undefined, decimals = 2, fmt: NumberFormat = "indian"): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const neg = value < 0;
  const [i, d] = Math.abs(value).toFixed(decimals).split(".");
  const g = fmt === "indian" ? groupIndian(i) : groupIntl(i);
  return (neg ? "-" : "") + g + (d ? "." + d : "");
}

export function formatPP(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const v = value * 100;
  return (v > 0 ? "+" : "") + v.toFixed(1) + " pp";
}
