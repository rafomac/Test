import { describe, expect, it } from "vitest";
import { planDeployment, sizingCapacity } from "@/lib/engine/planner";
import { runScenario } from "@/lib/engine/valuation";
import { promoterChanges, governanceAlerts } from "@/lib/engine/governance";
import { liquidityProfile } from "@/lib/engine/liquidity";
import { lotAnalysis, groupStats, gainConcentration, additionTiming, sampleNote } from "@/lib/engine/process";
import { classifyGains, fyOf, summariseByFy } from "@/lib/engine/tax";
import { evaluateAlerts } from "@/lib/engine/alerts";
import { analyse } from "@/lib/engine/portfolio";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { parseFundamentals, parseGovernanceEvents, parseTradebook } from "@/lib/import/zerodha";
import type { PricePoint } from "@/lib/types";
import { buy, sell } from "./helpers";

describe("Deployment planner & sizing", () => {
  it("sizing capacity matches the spec example and the self-diluting variant", () => {
    const c = sizingCapacity(50_000, 5, 1_500_000);
    expect(c.maxCost).toBeCloseTo(75_000, 6);
    expect(c.capacity).toBeCloseTo(25_000, 6);
    // (50k + x)/(15L + x) = 5% → x = (75k − 50k)/0.95
    expect(c.capacityIfDenominatorGrows).toBeCloseTo(25_000 / 0.95, 6);
  });
  it("plan conserves money and recomputes cost-based allocation", () => {
    const r = planDeployment({
      holdings: [{ symbol: "A", cap: "Small", cost: 90_000, limitPct: 5 }, { symbol: "B", cap: "Mid", cost: 10_000, limitPct: 3 }],
      targets: { Mid: 0.2, Small: 0.45, Micro: 0.25, Nano: 0.1 }, availableCash: 50_000, liquidBees: 100_000, newContribution: 0, hardLimitPct: 10,
      proposals: [{ symbol: "B", cap: "Mid", amount: 20_000, fromReserve: "cash" }, { symbol: "N", cap: "Nano", amount: 10_000, fromReserve: "liquid" }],
    });
    expect(r.proposed).toBe(30_000);
    expect(r.remainingReserve).toBe(120_000);
    expect(r.after.Mid.cost).toBe(30_000);
    expect(Object.values(r.after).reduce((s, x) => s + x.pct, 0)).toBeCloseTo(1, 12);
    expect(r.checks.find((c) => c.symbol === "B")!.ok).toBe(false); // 30k/130k = 23% > 3%
    expect(r.warnings.some((w) => /internal/.test(w))).toBe(true);
  });
});

describe("Valuation scenarios", () => {
  it("implied multiple and CAGR follow the stated formula", () => {
    const r = runScenario({ name: "Base", revenueGrowthPct: 20, netMarginPct: 10, dilutionPct: 0, exitPe: 20, years: 5 }, 100, 200, 0.15);
    const revT = 100 * 1.2 ** 5;
    expect(r.marketCapT).toBeCloseTo(revT * 0.1 * 20, 9);
    expect(r.multiple).toBeCloseTo((revT * 2) / 200, 9);
    expect(r.impliedCagr).toBeCloseTo(Math.pow(r.multiple!, 0.2) - 1, 12);
    expect(r.presentValueCr).toBeCloseTo((revT * 2) / 1.15 ** 5, 9);
  });
  it("dilution reduces per-share outcome", () => {
    const a = runScenario({ name: "Base", revenueGrowthPct: 20, netMarginPct: 10, dilutionPct: 0, exitPe: 20, years: 5 }, 100, 200, 0.15);
    const b = runScenario({ name: "Base", revenueGrowthPct: 20, netMarginPct: 10, dilutionPct: 5, exitPe: 20, years: 5 }, 100, 200, 0.15);
    expect(b.multiple! / a.multiple!).toBeCloseTo(1 / 1.05 ** 5, 12);
  });
});

describe("Promoter monitoring distinguishes dilution from sales", () => {
  const base = { symbol: "X", asOf: "2026-10-01", source: "test" };
  it("unchanged promoter shares + more total shares = dilution", () => {
    const c = promoterChanges({ ...base, promoterHistory: { "2026Q1": 60, "2026Q2": 55 }, promoterSharesHistory: { "2026Q1": 6, "2026Q2": 6 }, totalSharesHistory: { "2026Q1": 10, "2026Q2": 10.909 } });
    expect(c[1].reason).toBe("Dilution (new shares issued)");
  });
  it("fewer promoter shares = sale", () => {
    expect(promoterChanges({ ...base, promoterHistory: { "2026Q1": 60, "2026Q2": 55 }, promoterSharesHistory: { "2026Q1": 6, "2026Q2": 5.5 }, totalSharesHistory: { "2026Q1": 10, "2026Q2": 10 } })[1].reason).toBe("Promoter sale");
  });
  it("without share counts the reason is unknown and flagged as interpretation", () => {
    const g = governanceAlerts({ ...base, promoterHistory: { "2026Q1": 60, "2026Q2": 55 } });
    expect(g[0].kind).toBe("interpretation");
  });
  it("governance events require a source", () => {
    const r = parseGovernanceEvents("symbol,date,type,description,source\nX,2026-01-01,Auditor resignation,Resigned,\nX,2026-01-02,Auditor resignation,Resigned,https://bse");
    expect(r.records).toHaveLength(1);
    expect(r.skipped[0].reason).toMatch(/Source/);
  });
});

describe("Liquidity", () => {
  const ps: PricePoint[] = Array.from({ length: 30 }, (_, i) => ({ symbol: "T", date: `2026-01-${String(i + 1).padStart(2, "0")}`, close: 100, volume: 1000, source: "MANUAL" as const }));
  it("exit days = value / (participation × ADTV)", () => {
    const l = liquidityProfile("T", ps, undefined, 1_000_000, 10_000);
    expect(l.adtv20).toBe(100_000);
    expect(l.exits[1].days).toBeCloseTo(1_000_000 / (0.1 * 100_000), 9);
    expect(l.score).not.toBeNull();
  });
  it("unknown volume is never treated as liquid", () => {
    const l = liquidityProfile("T", ps.map((p) => ({ ...p, volume: undefined })), undefined, 1000, 10_000);
    expect(l.score).toBeNull();
  });
  it("SME minimum lot above ₹10k blocks the initial-position rule", () => {
    const l = liquidityProfile("T", ps, { symbol: "T", assetType: "STOCK", isSME: true, lotSize: 1200, source: "MANUAL", updatedAt: "" }, 0, 10_000);
    expect(l.minLotValue).toBe(120_000);
    expect(l.smeBlocksInitialRule).toBe(true);
  });
});

describe("Process effectiveness", () => {
  const prices: PricePoint[] = [
    { symbol: "A", date: "2024-01-01", close: 100, source: "MANUAL" }, { symbol: "A", date: "2026-01-01", close: 300, source: "MANUAL" },
    { symbol: "B", date: "2025-06-01", close: 100, source: "MANUAL" }, { symbol: "B", date: "2026-01-01", close: 50, source: "MANUAL" },
    { symbol: "IDX:NIFTY_SMALLCAP_250_TRI", date: "2024-01-01", close: 1000, source: "MANUAL" }, { symbol: "IDX:NIFTY_SMALLCAP_250_TRI", date: "2025-06-01", close: 1200, source: "MANUAL" }, { symbol: "IDX:NIFTY_SMALLCAP_250_TRI", date: "2026-01-01", close: 1300, source: "MANUAL" },
  ];
  const trades = [buy("2024-01-01", "A", 100, 100), buy("2025-06-01", "A", 10, 200), buy("2025-06-01", "B", 100, 100), sell("2025-07-01", "A", 50, 250)];
  const lots = lotAnalysis(trades, [], prices, [], [], [], DEFAULT_SETTINGS, "2026-01-01");
  it("labels initial positions vs additions and applies FIFO sales to the oldest lot", () => {
    const a0 = lots.find((l) => l.symbol === "A" && l.kind === "Initial")!;
    expect(a0.currentValue).toBeCloseTo(50 * 300 + 50 * 250, 9);
    expect(lots.filter((l) => l.kind === "Addition")).toHaveLength(1);
  });
  it("excess return is measured against the benchmark over the same window", () => {
    const b = lots.find((l) => l.symbol === "B")!;
    expect(b.benchmarkRet).toBeCloseTo(1300 / 1200 - 1, 12);
    expect(b.excess).toBeCloseTo(-0.5 - (1300 / 1200 - 1), 12);
  });
  it("groups, concentration and sample warnings", () => {
    const g = groupStats(lots, (l) => l.kind);
    expect(g.find((x) => x.key === "Initial")!.n).toBe(2);
    expect(sampleNote(5)).toMatch(/Insufficient/);
    const c = gainConcentration(lots);
    expect(c.top1).not.toBeNull();
    expect(additionTiming(lots).avgDaysToFirstAddition).toBe(517);
  });
});

describe("Tax classification (indicative)", () => {
  it("Indian financial year", () => { expect(fyOf("2026-03-31")).toBe("FY2025-26"); expect(fyOf("2026-04-01")).toBe("FY2026-27"); });
  it("equity > 12 months = LTCG, Liquid BeES at slab, rates blank → no tax amount", () => {
    const rows = classifyGains([buy("2024-01-01", "A", 10, 100), sell("2025-06-01", "A", 5, 200), buy("2025-01-01", "LIQUIDBEES", 10, 1000), sell("2025-03-01", "LIQUIDBEES", 10, 1010)], [], (s) => (s === "LIQUIDBEES" ? "CASH_EQUIVALENT" : "STOCK"), DEFAULT_SETTINGS.tax);
    expect(rows.find((r) => r.symbol === "A")!.cls).toBe("LTCG (equity)");
    expect(rows.find((r) => r.symbol === "LIQUIDBEES")!.cls).toBe("Slab-rate (specified fund / debt)");
    expect(summariseByFy(rows, DEFAULT_SETTINGS.tax)[0].indicativeEquityTax).toBeNull();
  });
  it("tradebook with contract-note charge columns is captured", () => {
    const r = parseTradebook("symbol,trade_date,trade_type,quantity,price,brokerage,stt,stamp duty\nX,2026-01-01,buy,10,100,0,1,0.15");
    expect(r.records[0].charges).toBeCloseTo(1.15, 9);
    expect(r.records[0].chargesBreakdown).toEqual({ brokerage: 0, stt: 1, stamp: 0.15 });
  });
});

describe("Fundamentals series import & alerts", () => {
  it("generic metric_FY columns become annual series", () => {
    const f = parseFundamentals("symbol,debt_FY2025,debt_FY2026,shares_FY2025,shares_FY2026,promoter_shares_2026Q2\nX,10,30,1,1.2,0.6").records[0];
    expect(f.annualSeries).toEqual({ debt: { FY2025: 10, FY2026: 30 }, shares: { FY2025: 1, FY2026: 1.2 } });
    expect(f.promoterSharesHistory).toEqual({ "2026Q2": 0.6 });
  });
  it("material alerts fire; price moves alone do not", () => {
    const fund = { symbol: "X", asOf: "2026-10-20", source: "t", revenueAnnual: { FY2022: 100, FY2023: 130, FY2024: 170, FY2025: 220, FY2026: 225 }, annualSeries: { debt: { FY2025: 10, FY2026: 30 }, shares: { FY2025: 1, FY2026: 1.2 } } };
    const a = analyse({ trades: [], cash: [], actions: [], research: [], prices: [], fundamentals: [fund], securities: [],
      snapshots: [{ id: "s", takenAt: "2026-11-01T00:00:00Z", asOfDate: "2026-11-01", source: "KITE_API", quality: "VERIFIED", items: [{ symbol: "X", assetType: "STOCK", quantity: 10, averagePrice: 100, lastPrice: 50 }] }] }, DEFAULT_SETTINGS, "2026-11-02");
    const r = evaluateAlerts(a, [fund], [], [], [], DEFAULT_SETTINGS, []);
    const rules = r.active.map((x) => x.rule);
    expect(rules).toContain("revenueDecel");
    expect(rules).toContain("debtVsRevenue");
    expect(rules).toContain("dilution");
    expect(rules).not.toContain("valuation"); // the 50% price fall alone raises nothing
    const ack = evaluateAlerts(a, [fund], [], [], [], DEFAULT_SETTINGS, [{ id: r.active[0].id, status: "acknowledged", at: "" }]);
    expect(ack.suppressed).toHaveLength(1);
  });
});
