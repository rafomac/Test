/**
 * XIRR: money-weighted annualised return on dated cash flows.
 * Convention: investor outflows (money put in) are NEGATIVE, inflows (money received,
 * including terminal value) are POSITIVE. Uses actual/365 day count.
 */
import { toMs } from "./dates";

export interface CashFlow { date: string; amount: number }

function npv(rate: number, flows: { t: number; a: number }[]): number {
  let s = 0;
  for (const f of flows) s += f.a / Math.pow(1 + rate, f.t);
  return s;
}
function dnpv(rate: number, flows: { t: number; a: number }[]): number {
  let s = 0;
  for (const f of flows) s += (-f.t * f.a) / Math.pow(1 + rate, f.t + 1);
  return s;
}

export function xirr(cashflows: CashFlow[]): number | null {
  const cf = cashflows.filter((c) => Number.isFinite(c.amount) && c.amount !== 0);
  if (cf.length < 2) return null;
  if (!cf.some((c) => c.amount > 0) || !cf.some((c) => c.amount < 0)) return null;
  const t0 = Math.min(...cf.map((c) => toMs(c.date)));
  const flows = cf.map((c) => ({ t: (toMs(c.date) - t0) / 86_400_000 / 365, a: c.amount }));
  if (Math.max(...flows.map((f) => f.t)) === 0) return null;

  // Newton-Raphson from a few seeds
  for (const seed of [0.1, 0.4, -0.2, 1, 3]) {
    let r = seed;
    for (let i = 0; i < 100; i++) {
      const f = npv(r, flows);
      const d = dnpv(r, flows);
      if (!Number.isFinite(f) || !Number.isFinite(d) || d === 0) break;
      const next = r - f / d;
      if (next <= -0.999999) break;
      if (Math.abs(next - r) < 1e-10) {
        if (Math.abs(npv(next, flows)) < 1e-6 * Math.max(1, ...flows.map((x) => Math.abs(x.a)))) return next;
        break;
      }
      r = next;
    }
  }
  // Bisection fallback on (-1, 100]
  let lo = -0.999999999, hi = 100;
  let flo = npv(lo, flows), fhi = npv(hi, flows);
  if (flo * fhi > 0) return null;
  for (let i = 0; i < 300; i++) {
    const mid = (lo + hi) / 2;
    const fm = npv(mid, flows);
    if (Math.abs(fm) < 1e-7 || hi - lo < 1e-12) return mid;
    if (fm * flo < 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
  }
  return (lo + hi) / 2;
}

/** Annualise a period return only when the period is at least `minDays` (default 365). */
export function annualise(periodReturn: number, days: number, minDays = 365): number | null {
  if (days < minDays || !Number.isFinite(periodReturn) || periodReturn <= -1) return null;
  return Math.pow(1 + periodReturn, 365 / days) - 1;
}
