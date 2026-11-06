import { describe, expect, it } from "vitest";
import { accountSeries, cashLedger, resolveCash, valueBridge } from "@/lib/engine/capital";
import { buildPriceBook, buildSeries } from "@/lib/engine/series";
import { analyse } from "@/lib/engine/portfolio";
import { generateSample } from "@/lib/sample";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { classifyAt, DEFAULT_THRESHOLDS, withCapHistory } from "@/lib/engine/classify";
import { computeSip } from "@/lib/engine/sip";
import type { HoldingsSnapshot, PricePoint, Security } from "@/lib/types";
import { buy, dep } from "./helpers";

const px = (sym: string, rows: [string, number][]): PricePoint[] => rows.map(([date, close]) => ({ symbol: sym, date, close, source: "MANUAL" }));

describe("Account-level TWR (securities + broker cash, external flows only)", () => {
  // Mon 2024-01-01 deposit 1000, buy 10@100. Tue close 110. Wed deposit 1000 (stays cash). Thu close 99.
  const trades = [buy("2024-01-01", "A", 10, 100)];
  const cash = [dep("2024-01-01", 1000), dep("2024-01-03", 1000)];
  const prices = px("A", [["2024-01-01", 100], ["2024-01-02", 110], ["2024-01-03", 110], ["2024-01-04", 99]]);
  const sec = buildSeries(trades, [], cash, buildPriceBook(prices), "2024-01-04").points;
  const cl = cashLedger(trades, cash, sec.map((p) => p.date))!;
  const acct = accountSeries(sec, cl);
  it("replays broker cash", () => {
    expect(cl.map((c) => c.cash)).toEqual([0, 0, 1000, 1000]);
  });
  it("matches hand calculation: 1.10 × 1.00 × (1990/2100) − 1", () => {
    const twr = acct.reduce((g, p) => g * (1 + (p.dailyReturn ?? 0)), 1) - 1;
    expect(twr).toBeCloseTo(1.1 * (1990 / 2100) - 1, 12);
  });
  it("internal purchases are not external flows", () => {
    expect(acct.map((p) => p.extFlow)).toEqual([1000, 0, 1000, 0]);
  });
  it("value bridge reconciles with zero residual", () => {
    const b = valueBridge(acct, sec, cl, "2023-12-31", "2024-01-04", 990 + 1000);
    expect(b.opening).toBe(0);
    expect(b.contributions).toBe(2000);
    expect(b.marketGain).toBeCloseTo(-10, 9);
    expect(b.closingDerived).toBeCloseTo(1990, 9);
    expect(b.residual).toBeCloseTo(0, 9);
  });
  it("no ledger → account series unavailable (not fabricated)", () => {
    expect(cashLedger(trades, [], sec.map((p) => p.date))).toBeNull();
  });
});

describe("Cash & Liquid BeES treatment", () => {
  const snap = (extra: Partial<HoldingsSnapshot>): HoldingsSnapshot => ({ id: "s", takenAt: "2026-01-01T00:00:00Z", asOfDate: "2026-01-01", source: "KITE_API", quality: "VERIFIED", items: [], ...extra });
  it("uses available cash, not collateral-inclusive net margin", () => {
    const r = resolveCash(snap({ funds: { cash: 125000, collateral: 300000, net: 425000 } }), null);
    expect(r.availableCash).toBe(125000);
    expect(r.buyingPower).toBe(425000);
    expect(r.warnings[0]).toMatch(/collateral/);
  });
  it("flags legacy V1 snapshots", () => {
    expect(resolveCash(snap({ cash: 5000 }), null).legacy).toBe(true);
  });
  it("combined reserve = available cash + Liquid BeES value, without double counting", () => {
    const a = analyse({
      trades: [], cash: [], actions: [], fundamentals: [], research: [], prices: [],
      securities: [{ symbol: "LIQUIDBEES", assetType: "CASH_EQUIVALENT", source: "MANUAL", updatedAt: "" }, { symbol: "XYZ", assetType: "STOCK", marketCapCr: 300, sector: "Tech", source: "MANUAL", updatedAt: "" }],
      snapshots: [snap({ funds: { cash: 125000, collateral: 0, net: 125000 }, items: [
        { symbol: "LIQUIDBEES", assetType: "CASH_EQUIVALENT", quantity: 375, averagePrice: 1000, lastPrice: 1000 },
        { symbol: "XYZ", assetType: "STOCK", quantity: 100, averagePrice: 100, lastPrice: 150 },
      ] })],
    }, DEFAULT_SETTINGS, "2026-01-02");
    expect(a.capital.reserve.combined).toBe(500000);
    expect(a.capital.measures.totalMarketValue).toBe(375000 + 15000 + 125000);
    expect(a.summary.counts.stocks).toBe(1);
    expect(a.allocation.directEquity.reduce((s, r) => s + r.value, 0)).toBe(15000);
    expect(a.sectors.map((x) => x.sector)).toEqual(["Tech"]);
  });
  it("SIP cash balance ignores dividends paid to the bank", () => {
    const r = computeSip([buy("2026-01-05", "A", 1, 1000)], [dep("2026-01-02", 2000), dep("2026-01-20", 50, "DIVIDEND", "A")], () => "STOCK", { monthlyTarget: 2000, planStartMonth: "2026-01", monthlyTargetOverrides: {} }, "2026-01");
    expect(r.months[0].cashBalance).toBe(1000);
  });
});

describe("Position limits use a disclosed denominator", () => {
  it("reproduces the spec example: ₹50k cost, 5% limit, ₹15L direct-equity cost → ₹25k capacity", () => {
    const items = [{ symbol: "AAA", assetType: "STOCK" as const, quantity: 500, averagePrice: 100, lastPrice: 100 }, { symbol: "BBB", assetType: "STOCK" as const, quantity: 14500, averagePrice: 100, lastPrice: 100 }, { symbol: "LIQUIDBEES", assetType: "CASH_EQUIVALENT" as const, quantity: 1000, averagePrice: 1000, lastPrice: 1000 }];
    const a = analyse({ trades: [], cash: [], actions: [], fundamentals: [], prices: [], securities: [{ symbol: "LIQUIDBEES", assetType: "CASH_EQUIVALENT", source: "MANUAL", updatedAt: "" }],
      research: [{ symbol: "AAA", conviction: "High", ratings: {}, evidence: {}, updatedAt: "" }],
      snapshots: [{ id: "s", takenAt: "2026-01-01T00:00:00Z", asOfDate: "2026-01-01", source: "KITE_API", quality: "VERIFIED", items }] }, DEFAULT_SETTINGS, "2026-01-02");
    const h = a.holdings.find((x) => x.symbol === "AAA")!;
    expect(a.capital.limitDenominator.value).toBe(1_500_000); // Liquid BeES excluded
    expect(h.limitCapacity).toBeCloseTo(25_000, 6);
    expect(h.overLimit).toBe(false);
    const b = a.holdings.find((x) => x.symbol === "BBB")!;
    expect(b.aboveLimit).toBeCloseTo(1_450_000 - 45_000, 6); // Standard 3%
  });
});

describe("Classification history", () => {
  it("past dates use the classification effective then", () => {
    let s: Security = { symbol: "X", assetType: "STOCK", marketCapCr: 400, source: "MANUAL", updatedAt: "" };
    s = withCapHistory(undefined, s, "2025-01-01", "test");
    s = withCapHistory(s, { ...s, marketCapCr: 2500 }, "2026-06-01", "test");
    expect(classifyAt(s, "2025-06-01", DEFAULT_THRESHOLDS).category).toBe("Nano");
    expect(classifyAt(s, "2026-07-01", DEFAULT_THRESHOLDS).category).toBe("Small");
  });
});

describe("Synthetic sample — V2 reconciliation", () => {
  const asOf = "2026-11-05";
  const a = analyse(generateSample(asOf), { ...DEFAULT_SETTINGS, planStartMonth: "2024-12" }, asOf);
  it("value bridge residual is ~0 and every flow counted once", () => {
    expect(a.capital.bridge.available).toBe(true);
    expect(Math.abs(a.capital.bridge.residual!)).toBeLessThan(1);
    expect(a.capital.bridge.contributions).toBeCloseTo(a.capital.measures.deposits, 6);
  });
  it("why-ahead/behind terms telescope to XIRR − target", () => {
    const d = a.capital.decomposition;
    const sum = d.terms.reduce((s, t) => s + (t.value ?? 0), 0);
    expect(sum).toBeCloseTo(d.total!, 10);
  });
  it("every return metric discloses its window and scope", () => {
    for (const m of a.capital.metrics) { expect(m.end).toBeTruthy(); expect(m.scope).toBeTruthy(); expect(m.annualisation).toBeTruthy(); }
    expect(a.capital.metrics.find((m) => m.id === "accountXirr")!.value).toBe(a.summary.xirrAccount);
  });
  it("monthly deployment: contribution achievement uses external deposits only", () => {
    for (const d of a.capital.deployment) if (d.target > 0) expect(d.contributionAch).toBeCloseTo(d.contribution / d.target, 12);
  });
});
