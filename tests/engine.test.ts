import { describe, expect, it } from "vitest";
import { xirr, annualise } from "@/lib/engine/xirr";
import { runLedger } from "@/lib/engine/positions";
import { buildPriceBook, buildSeries, chainReturn, monthlyReturns, targetPath, maxDrawdown } from "@/lib/engine/series";
import { computeSip } from "@/lib/engine/sip";
import { classify, DEFAULT_THRESHOLDS, validateThresholds, inferAssetType } from "@/lib/engine/classify";
import { project, futureValueClosedForm, monthsToTarget, monteCarlo } from "@/lib/engine/projection";
import { formatINR, formatCompact } from "@/lib/format";
import { unpledgedPromoter, researchScore, revenueCagr, returnMultiple, attribution, sma, promoterTrend } from "@/lib/engine/research";
import { stressTest, concentration, returnStats, relativeStats } from "@/lib/engine/risk";
import type { CorporateAction, PricePoint } from "@/lib/types";
import { buy, sell, dep } from "./helpers";

describe("XIRR", () => {
  it("matches the Microsoft Excel XIRR reference example (37.336%)", () => {
    const r = xirr([
      { date: "2008-01-01", amount: -10000 },
      { date: "2008-03-01", amount: 2750 },
      { date: "2008-10-30", amount: 4250 },
      { date: "2009-02-15", amount: 3250 },
      { date: "2009-04-01", amount: 2750 },
    ]);
    expect(r).toBeCloseTo(0.373362535, 6);
  });
  it("recovers a known 10% annual return over 2 years (actual/365)", () => {
    expect(xirr([{ date: "2020-01-01", amount: -100 }, { date: "2021-12-31", amount: 121 }])).toBeCloseTo(0.1, 6);
  });
  it("handles monthly SIP with a known IRR", () => {
    // 12 monthly 2L contributions growing at exactly 40%/yr (actual/365 compounding) to a terminal value
    const flows = [] as { date: string; amount: number }[];
    let tv = 0;
    for (let m = 0; m < 12; m++) {
      const d = `2025-${String(m + 1).padStart(2, "0")}-05`;
      flows.push({ date: d, amount: -200000 });
      const days = (Date.parse("2026-01-05") - Date.parse(d)) / 86400000;
      tv += 200000 * Math.pow(1.4, days / 365);
    }
    flows.push({ date: "2026-01-05", amount: tv });
    expect(xirr(flows)).toBeCloseTo(0.4, 6);
  });
  it("returns null when no sign change", () => {
    expect(xirr([{ date: "2020-01-01", amount: -1 }, { date: "2020-02-01", amount: -1 }])).toBeNull();
  });
  it("refuses to annualise periods under a year", () => {
    expect(annualise(0.1, 100)).toBeNull();
    expect(annualise(0.21, 730)).toBeCloseTo(0.1, 6);
  });
});

describe("Position ledger (FIFO, corporate actions)", () => {
  it("computes FIFO realised P&L and remaining cost incl. charges", () => {
    const r = runLedger([buy("2024-01-01", "A", 10, 100, 10), buy("2024-02-01", "A", 10, 120), sell("2024-03-01", "A", 15, 150, 15)]);
    const p = r.positions.get("A")!;
    // proceeds 2250-15 = 2235; cost = 1010 + 5*120 = 1610
    expect(p.realizedPnl).toBeCloseTo(625, 6);
    expect(p.quantity).toBe(5);
    expect(p.costBasis).toBeCloseTo(600, 6);
    expect(r.realized.reduce((s, x) => s + x.proceeds, 0)).toBeCloseTo(2235, 6);
  });
  it("applies a 1:5 split and 1:1 bonus preserving total cost", () => {
    const acts: CorporateAction[] = [
      { id: "s", symbol: "A", exDate: "2024-02-01", kind: "SPLIT", ratioFrom: 1, ratioTo: 5, source: "MANUAL" },
      { id: "b", symbol: "A", exDate: "2024-03-01", kind: "BONUS", ratioFrom: 1, ratioTo: 1, source: "MANUAL" },
    ];
    const p = runLedger([buy("2024-01-01", "A", 10, 500)], acts).positions.get("A")!;
    expect(p.quantity).toBe(100);
    expect(p.costBasis).toBe(5000);
    expect(p.avgCost).toBe(50);
  });
  it("applies corporate action before trades on the ex-date", () => {
    const acts: CorporateAction[] = [{ id: "s", symbol: "A", exDate: "2024-02-01", kind: "SPLIT", ratioFrom: 1, ratioTo: 2, source: "MANUAL" }];
    const p = runLedger([buy("2024-01-01", "A", 10, 100), buy("2024-02-01", "A", 10, 50)], acts).positions.get("A")!;
    expect(p.quantity).toBe(30);
    expect(p.costBasis).toBe(1500);
  });
  it("moves lots on merger and splits cost on demerger", () => {
    const acts: CorporateAction[] = [
      { id: "m", symbol: "OLD", exDate: "2024-02-01", kind: "MERGER", ratioFrom: 2, ratioTo: 1, newSymbol: "NEW", source: "MANUAL" },
      { id: "d", symbol: "NEW", exDate: "2024-03-01", kind: "DEMERGER", ratioFrom: 1, ratioTo: 1, newSymbol: "SPIN", costAllocationPct: 25, source: "MANUAL" },
    ];
    const r = runLedger([buy("2024-01-01", "OLD", 10, 100)], acts);
    expect(r.positions.get("OLD")!.quantity).toBe(0);
    expect(r.positions.get("NEW")!.quantity).toBe(5);
    expect(r.positions.get("NEW")!.costBasis).toBeCloseTo(750, 6);
    expect(r.positions.get("SPIN")!.quantity).toBe(5);
    expect(r.positions.get("SPIN")!.costBasis).toBeCloseTo(250, 6);
  });
  it("warns instead of inventing cost when sells exceed buy history", () => {
    const r = runLedger([buy("2024-01-01", "A", 5, 100), sell("2024-02-01", "A", 8, 120)]);
    expect(r.warnings.length).toBe(1);
    expect(r.positions.get("A")!.realizedPnl).toBeCloseTo(5 * 20, 6);
  });
});

describe("Time-weighted return", () => {
  const prices: PricePoint[] = [
    { symbol: "A", date: "2024-01-01", close: 100, source: "MANUAL" },
    { symbol: "A", date: "2024-01-02", close: 110, source: "MANUAL" },
    { symbol: "A", date: "2024-01-03", close: 110, source: "MANUAL" },
    { symbol: "A", date: "2024-01-04", close: 99, source: "MANUAL" },
  ];
  it("is independent of contribution timing", () => {
    // Day1 buy 10@100; Day3 buy 10@110; prices 100 → 110 → 110 → 99. TWR = 1.1 × 0.9 − 1 = −1%.
    const s = buildSeries([buy("2024-01-01", "A", 10, 100), buy("2024-01-03", "A", 10, 110)], [], [], buildPriceBook(prices), "2024-01-04");
    const c = chainReturn(s.points, "2023-12-31", "2024-01-04");
    expect(c.complete).toBe(true);
    expect(c.ret).toBeCloseTo(-0.01, 10);
    // Money-weighted differs: lost more because more capital was exposed to the fall.
    const moneyLoss = (1980 - 2100) / 2100;
    expect(moneyLoss).toBeLessThan(c.ret!);
  });
  it("treats dividends as return, not as a contribution", () => {
    const p2: PricePoint[] = [{ symbol: "A", date: "2024-01-01", close: 100, source: "MANUAL" }, { symbol: "A", date: "2024-01-02", close: 100, source: "MANUAL" }];
    const s = buildSeries([buy("2024-01-01", "A", 10, 100)], [], [dep("2024-01-02", 50, "DIVIDEND", "A")], buildPriceBook(p2), "2024-01-02");
    expect(chainReturn(s.points, "2023-12-31", "2024-01-02").ret).toBeCloseTo(0.05, 10);
  });
  it("does not chain across missing prices", () => {
    const s = buildSeries([buy("2024-01-01", "A", 10, 100), buy("2024-01-02", "B", 1, 10)], [], [], buildPriceBook(prices), "2024-01-04");
    expect(s.uncoveredDays).toBeGreaterThan(0);
    expect(chainReturn(s.points, "2023-12-31", "2024-01-04").ret).toBeNull();
    expect(monthlyReturns(s.points)[0].complete).toBe(false);
  });
  it("target path compounds each dated flow from its own date", () => {
    const s = buildSeries([buy("2024-01-01", "A", 10, 100)], [], [], buildPriceBook([{ symbol: "A", date: "2024-01-01", close: 100, source: "MANUAL" }, { symbol: "A", date: "2024-12-31", close: 100, source: "MANUAL" }]), "2024-12-31", 400);
    const tp = targetPath(s.points, 0.4);
    expect(tp[tp.length - 1].target).toBeCloseTo(1000 * Math.pow(1.4, 365 / 365), 4);
  });
  it("computes max drawdown", () => {
    expect(maxDrawdown([1, 1.2, 0.9, 1.3, 1.04])).toBeCloseTo(-0.25, 10);
  });
});

describe("SIP accounting", () => {
  const settings = { monthlyTarget: 200000, planStartMonth: "2026-01", monthlyTargetOverrides: {} };
  const at = (s: string) => (s === "LIQUIDBEES" ? "CASH_EQUIVALENT" : s.endsWith("BEES") ? "ETF" : "STOCK") as never;
  it("counts only external deposits; internal switches are not contributions", () => {
    const trades = [buy("2026-01-06", "LIQUIDBEES", 200, 1000), sell("2026-02-10", "LIQUIDBEES", 100, 1000), buy("2026-02-10", "XYZ", 100, 1000)];
    const cash = [dep("2026-01-05", 200000)];
    const r = computeSip(trades, cash, at, settings, "2026-03");
    const [jan, feb, mar] = r.months;
    expect(jan.contribution).toBe(200000);
    expect(jan.status).toBe("Met");
    expect(jan.liquidNet).toBe(200000);
    expect(feb.contribution).toBe(0);
    expect(feb.status).toBe("Missed");
    expect(feb.buys.STOCK).toBe(100000);
    expect(mar.status).toBe("In progress");
    expect(r.months[1].cumActual).toBe(200000);
    expect(r.months[1].cumTarget).toBe(400000);
    expect(r.basis).toBe("ledger");
  });
  it("does not judge months before the plan start", () => {
    const r = computeSip([buy("2025-10-01", "A", 1, 100)], [dep("2025-10-01", 100)], at, settings, "2026-01");
    expect(r.months[0].status).toBe("Before plan");
    expect(r.months[0].cumTarget).toBe(0);
  });
  it("estimate mode nets internal switches within the month", () => {
    const r = computeSip([buy("2026-01-06", "LIQUIDBEES", 200, 1000), sell("2026-01-20", "LIQUIDBEES", 200, 1000), buy("2026-01-20", "XYZ", 200, 1000)], [], at, settings, "2026-02");
    expect(r.basis).toBe("estimate");
    expect(r.months[0].contribution).toBe(200000);
  });
});

describe("Market-cap classification", () => {
  const t = DEFAULT_THRESHOLDS;
  it("uses AMFI rank as official for large/mid/small", () => {
    expect(classify({ assetType: "STOCK", amfiRank: 50 }, t).category).toBe("Large");
    expect(classify({ assetType: "STOCK", amfiRank: 120 }, t)).toMatchObject({ category: "Mid", official: true });
    expect(classify({ assetType: "STOCK", amfiRank: 400, marketCapCr: 8000 }, t).category).toBe("Small");
  });
  it("subdivides official small-cap into custom micro/nano bands exclusively", () => {
    expect(classify({ assetType: "STOCK", amfiRank: 900, marketCapCr: 1500 }, t)).toMatchObject({ category: "Micro", official: false });
    expect(classify({ assetType: "STOCK", marketCapCr: 499 }, t).category).toBe("Nano");
    expect(classify({ assetType: "STOCK", marketCapCr: 500 }, t).category).toBe("Micro");
    expect(classify({ assetType: "STOCK", marketCapCr: 2000 }, t).category).toBe("Small");
  });
  it("never classifies ETFs as direct small-caps", () => {
    expect(classify({ assetType: "ETF", marketCapCr: 300 }, t).category).toBe("Unclassified");
  });
  it("rejects overlapping thresholds", () => {
    expect(validateThresholds(t)).toEqual([]);
    expect(validateThresholds({ ...t, nanoMaxCr: 3000 }).length).toBeGreaterThan(0);
  });
  it("infers Liquid BeES as cash-equivalent and MF ISINs as MF", () => {
    expect(inferAssetType("LIQUIDBEES")).toBe("CASH_EQUIVALENT");
    expect(inferAssetType("NIFTYBEES")).toBe("ETF");
    expect(inferAssetType("INF209K01YN0")).toBe("MF");
    expect(inferAssetType("TCS")).toBe("STOCK");
  });
});

describe("Projections", () => {
  it("deterministic engine matches closed-form annuity-due FV", () => {
    const rows = project({ startValue: 1_300_000, monthlySip: 200_000, years: 10, annualReturn: 0.15, inflation: 0.05, stepUpPct: 0 });
    expect(rows[120].value).toBeCloseTo(futureValueClosedForm(1_300_000, 200_000, 0.15, 120), 2);
    expect(rows[120].contributed).toBe(1_300_000 + 200_000 * 120);
  });
  it("0% return equals contributions; inflation deflates", () => {
    const r = project({ startValue: 0, monthlySip: 100, years: 1, annualReturn: 0, inflation: 0.1, stepUpPct: 0 });
    expect(r[12].value).toBeCloseTo(1200, 8);
    expect(r[12].real).toBeCloseTo(1200 / 1.1, 8);
  });
  it("step-up raises SIP every 12 months", () => {
    const r = project({ startValue: 0, monthlySip: 100, years: 2, annualReturn: 0, inflation: 0, stepUpPct: 0.1 });
    expect(r[24].contributed).toBeCloseTo(1200 + 1320, 8);
  });
  it("milestone timing", () => {
    expect(monthsToTarget({ startValue: 0, monthlySip: 100_000, annualReturn: 0, inflation: 0, stepUpPct: 0 }, 1_000_000)).toBe(10);
  });
  it("Monte Carlo is reproducible and collapses to deterministic with zero volatility", () => {
    const base = { startValue: 1_000_000, monthlySip: 200_000, years: 5, annualReturn: 0.12, inflation: 0, stepUpPct: 0, df: 4, paths: 200, seed: 7, stressProb: 0, stressStay: 0, stressVolMult: 1, stressDriftAnnual: 0, milestones: [1e7] };
    const a = monteCarlo({ ...base, volatility: 0.25 }), b = monteCarlo({ ...base, volatility: 0.25 });
    expect(a.p50).toEqual(b.p50);
    const z = monteCarlo({ ...base, volatility: 0 });
    expect(z.p50[5]).toBeCloseTo(project(base)[60].value, 0);
    expect(a.p10[5]).toBeLessThan(a.p90[5]);
  });
});

describe("Formatting", () => {
  it("Indian grouping", () => {
    expect(formatINR(100000)).toBe("₹1,00,000");
    expect(formatINR(1000000)).toBe("₹10,00,000");
    expect(formatINR(10000000)).toBe("₹1,00,00,000");
    expect(formatINR(-2500.5, { decimals: 2 })).toBe("-₹2,500.50");
    expect(formatINR(100000, { fmt: "international" })).toBe("₹100,000");
    expect(formatCompact(12_500_000)).toBe("₹1.25 Cr");
    expect(formatCompact(1_250_000)).toBe("₹12.50 L");
  });
});

describe("Research metrics", () => {
  it("unpledged promoter: pledge as % of promoter vs % of total", () => {
    expect(unpledgedPromoter({ promoterHoldingPct: 60, promoterPledgePctOfPromoter: 25 }).value).toBeCloseTo(45, 10);
    expect(unpledgedPromoter({ promoterHoldingPct: 60, promoterPledgePctOfTotal: 15 }).value).toBeCloseTo(45, 10);
    expect(unpledgedPromoter({ promoterHoldingPct: 60 }).value).toBeNull();
  });
  it("missing ratings earn zero, completeness reported", () => {
    const r = researchScore({ symbol: "A", conviction: "Standard", ratings: { growth: 10 }, evidence: { growth: "verified" }, updatedAt: "" }, undefined, { growth: 25, financialHealth: 20, valuation: 20, governance: 15, competitive: 10, industry: 5, digital: 5 });
    expect(r.score).toBeCloseTo(25, 10);
    expect(r.completeness).toBeCloseTo(0.25, 10);
    expect(r.confidence).toBeCloseTo(0.25, 10);
    expect(researchScore(undefined, undefined, { growth: 25, financialHealth: 20, valuation: 20, governance: 15, competitive: 10, industry: 5, digital: 5 }).score).toBeNull();
  });
  it("revenue CAGR", () => {
    expect(revenueCagr({ FY2021: 100, FY2024: 172.8 }, 3)).toBeCloseTo(0.2, 10);
    expect(revenueCagr({ FY2024: 100 }, 3)).toBeNull();
  });
  it("promoter trend", () => {
    expect(promoterTrend({ "2025Q1": 60, "2026Q2": 55 }).direction).toBe("Declining");
  });
  it("return multiple accounts for partial sales and dividends", () => {
    expect(returnMultiple(30000, 20000, 1000, 10000)).toBeCloseTo(5.1, 10);
  });
  it("earnings vs valuation attribution sums to total", () => {
    const a = attribution(100, 300, 20, 30)!;
    expect(a.earnings + a.valuation).toBeCloseTo(Math.log(3), 10);
    expect(Math.exp(a.valuation)).toBeCloseTo(1.5, 10);
  });
  it("SMA", () => {
    expect(sma([1, 2, 3, 4], 2)).toEqual([null, 1.5, 2.5, 3.5]);
  });
});

describe("Risk", () => {
  const h = [
    { symbol: "A", value: 500, cost: 100, capCategory: "Micro" as const, assetType: "STOCK" },
    { symbol: "B", value: 300, cost: 300, capCategory: "Mid" as const, assetType: "STOCK" },
    { symbol: "L", value: 200, cost: 200, capCategory: "Unclassified" as const, assetType: "CASH_EQUIVALENT" },
  ];
  it("stress tests", () => {
    const s = stressTest(h);
    expect(s.find((x) => x.id === "largest50")!.loss).toBe(-250);
    expect(s.find((x) => x.id === "micronano70")!.lossPct).toBeCloseTo(-0.35, 10);
    expect(s.find((x) => x.id === "market35")!.loss).toBeCloseTo(-(500 * 0.455 + 300 * 0.35), 8);
  });
  it("concentration distinguishes value vs cost", () => {
    const c = concentration(h);
    expect(c.largestByValue!.symbol).toBe("A");
    expect(c.largestByCost!.symbol).toBe("B");
  });
  it("withholds ratios with insufficient history", () => {
    expect(returnStats([0.01, 0.02, -0.01], 0.065).sharpe).toBeNull();
    expect(relativeStats([0.01], [0.02]).informationRatio).toBeNull();
    const s = returnStats(Array(12).fill(0.01), 0);
    expect(s.annualisedReturn).toBeCloseTo(Math.pow(1.01, 12) - 1, 10);
  });
});
