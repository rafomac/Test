/**
 * Capital deployment planner and position-sizing simulator. Simulation only — never places orders.
 * Allocation is measured on INVESTED COST (the allocation-discipline system).
 */
export interface PlannerHolding { symbol: string; cap: string; cost: number; limitPct: number }
export interface Proposal { symbol: string; cap: string; amount: number; fromReserve: "cash" | "liquid" }

export interface PlanInput {
  holdings: PlannerHolding[]; // direct equity only
  targets: Record<string, number>; // fractions over Mid/Small/Micro/Nano
  availableCash: number;
  liquidBees: number;
  proposals: Proposal[];
  hardLimitPct: number;
  newContribution: number; // money expected to arrive (not yet in reserve)
}

export interface PlanResult {
  before: Record<string, { cost: number; pct: number }>;
  after: Record<string, { cost: number; pct: number }>;
  deficits: Record<string, number>; // ₹ needed (on post-plan total) to reach target, >0 = underweight
  proposed: number;
  remainingCash: number;
  remainingLiquid: number;
  remainingReserve: number;
  checks: { symbol: string; costAfter: number; weightAfter: number; limitPct: number; ok: boolean; hardOk: boolean; message: string }[];
  warnings: string[];
}

export function planDeployment(i: PlanInput): PlanResult {
  const caps = Object.keys(i.targets);
  const sumBy = (hs: { cap: string; cost: number }[]) => { const m: Record<string, number> = {}; for (const h of hs) m[h.cap] = (m[h.cap] ?? 0) + h.cost; return m; };
  const beforeCost = sumBy(i.holdings);
  const totalBefore = i.holdings.reduce((s, h) => s + h.cost, 0);
  const proposed = i.proposals.reduce((s, p) => s + p.amount, 0);
  const afterHold = new Map(i.holdings.map((h) => [h.symbol, { ...h }]));
  for (const p of i.proposals) {
    const h = afterHold.get(p.symbol);
    if (h) h.cost += p.amount; else afterHold.set(p.symbol, { symbol: p.symbol, cap: p.cap, cost: p.amount, limitPct: NaN });
  }
  const totalAfter = totalBefore + proposed;
  const afterCost = sumBy([...afterHold.values()]);
  const keys = [...new Set([...caps, ...Object.keys(beforeCost), ...Object.keys(afterCost)])];
  const before = Object.fromEntries(keys.map((k) => [k, { cost: beforeCost[k] ?? 0, pct: totalBefore > 0 ? (beforeCost[k] ?? 0) / totalBefore : 0 }]));
  const after = Object.fromEntries(keys.map((k) => [k, { cost: afterCost[k] ?? 0, pct: totalAfter > 0 ? (afterCost[k] ?? 0) / totalAfter : 0 }]));
  const deficits = Object.fromEntries(caps.map((k) => [k, i.targets[k] * totalAfter - (afterCost[k] ?? 0)]));
  const fromCash = i.proposals.filter((p) => p.fromReserve === "cash").reduce((s, p) => s + p.amount, 0);
  const fromLiquid = i.proposals.filter((p) => p.fromReserve === "liquid").reduce((s, p) => s + p.amount, 0);
  const warnings: string[] = [];
  const cashAvail = i.availableCash + i.newContribution;
  if (fromCash > cashAvail + 1e-6) warnings.push(`Proposals funded from cash (₹${Math.round(fromCash).toLocaleString("en-IN")}) exceed available cash + expected contribution (₹${Math.round(cashAvail).toLocaleString("en-IN")}).`);
  if (fromLiquid > i.liquidBees + 1e-6) warnings.push("Proposals funded from Liquid BeES exceed its market value.");
  if (fromLiquid > 0) warnings.push("Selling Liquid BeES settles T+1; same-day buying power depends on the broker's collateral/ sale-credit rules. This switch is internal and does not count as a contribution.");
  const checks = i.proposals.map((p) => {
    const h = afterHold.get(p.symbol)!;
    const orig = i.holdings.find((x) => x.symbol === p.symbol);
    const limitPct = orig?.limitPct ?? NaN;
    const w = totalAfter > 0 ? h.cost / totalAfter : 0;
    const ok = Number.isFinite(limitPct) ? w * 100 <= limitPct + 1e-9 : true;
    const hardOk = w * 100 <= i.hardLimitPct + 1e-9;
    return { symbol: p.symbol, costAfter: h.cost, weightAfter: w, limitPct, ok, hardOk, message: !orig ? "New position — initial research position rule applies." : !hardOk ? "Exceeds hard limit" : !ok ? "Exceeds conviction limit" : "Within limit" };
  });
  return { before, after, deficits, proposed, remainingCash: cashAvail - fromCash, remainingLiquid: i.liquidBees - fromLiquid, remainingReserve: cashAvail - fromCash + i.liquidBees - fromLiquid, checks, warnings };
}

/** Maximum additional cost for a holding under its conviction limit, given the denominator grows with the purchase. */
export function sizingCapacity(currentCost: number, limitPct: number, denominator: number): { maxCost: number; capacity: number; capacityIfDenominatorGrows: number } {
  const L = limitPct / 100;
  const maxCost = L * denominator;
  // If the purchase itself increases the denominator: (c + x) / (D + x) = L  → x = (L·D − c) / (1 − L)
  const grow = L < 1 ? (L * denominator - currentCost) / (1 - L) : Infinity;
  return { maxCost, capacity: maxCost - currentCost, capacityIfDenominatorGrows: grow };
}
