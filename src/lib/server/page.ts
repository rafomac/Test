import "server-only";
import { getAnalytics, getSettings } from "./repo";
import { formatCompact, formatINR, formatPct, formatPP } from "../format";

export function pageCtx() {
  const s = getSettings();
  const a = getAnalytics();
  const nf = s.numberFormat;
  return {
    a, s, nf,
    inr: (x: number | null | undefined, decimals = 0) => formatINR(x, { fmt: nf, decimals }),
    cmp: (x: number | null | undefined) => formatCompact(x, nf),
    pct: (x: number | null | undefined, d = 1) => formatPct(x, d),
    pp: formatPP,
  };
}
