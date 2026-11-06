/**
 * Allocation-gap simulator (no trades are executed). New capital is directed to under-weight
 * market-cap categories first (proportional to their rupee shortfall against the target on the
 * post-deployment total), and any remainder is split by target weights. Existing holdings are
 * never sold except for the user-chosen fraction of ETFs.
 */
export interface SimInput {
  current: Record<string, number>; // direct-equity value by category
  target: Record<string, number>; // fractions summing to 1 (over categories considered)
  etfValue: number;
  etfSellFraction: number; // 0..1
  reserve: number; // Liquid BeES + cash
  reserveUseFraction: number; // 0..1
  monthlyContribution: number;
  months: number;
  directShareOfContribution: number; // 0..1 of each contribution routed to direct equity
}

export function simulateAllocation(i: SimInput) {
  const newCapital = i.etfValue * i.etfSellFraction + i.reserve * i.reserveUseFraction + i.monthlyContribution * i.months * i.directShareOfContribution;
  const cats = Object.keys(i.target);
  const cur = Object.fromEntries(cats.map((c) => [c, i.current[c] ?? 0]));
  const currentTotal = Object.values(i.current).reduce((s, x) => s + x, 0);
  const total = currentTotal + newCapital;
  const short = Object.fromEntries(cats.map((c) => [c, Math.max(0, i.target[c] * total - cur[c])]));
  const shortSum = Object.values(short).reduce((s, x) => s + x, 0);
  const alloc: Record<string, number> = {};
  if (shortSum >= newCapital) for (const c of cats) alloc[c] = shortSum > 0 ? (newCapital * short[c]) / shortSum : 0;
  else { const rest = newCapital - shortSum; for (const c of cats) alloc[c] = short[c] + rest * i.target[c]; }
  const after = Object.fromEntries(cats.map((c) => [c, cur[c] + alloc[c]]));
  // Categories outside the target set (e.g. Large, Unclassified) are carried unchanged.
  for (const [k, v] of Object.entries(i.current)) if (!cats.includes(k)) after[k] = v;
  return { newCapital, alloc, after, total, afterPct: Object.fromEntries(Object.entries(after).map(([k, v]) => [k, total > 0 ? v / total : 0])) };
}
