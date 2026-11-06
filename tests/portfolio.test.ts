import { describe, expect, it } from "vitest";
import { analyse } from "@/lib/engine/portfolio";
import { generateSample } from "@/lib/sample";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { xirr } from "@/lib/engine/xirr";
import { buy, dep } from "./helpers";

const asOf = "2026-11-05";
const data = generateSample(asOf);
const a = analyse(data, { ...DEFAULT_SETTINGS, planStartMonth: "2024-12" }, asOf);

describe("Portfolio aggregate integrity (synthetic sample)", () => {
  it("market value equals the sum of holdings", () => {
    const sum = a.holdings.reduce((s, h) => s + (h.value ?? 0), 0);
    expect(a.summary.marketValue).toBeCloseTo(sum, 6);
  });
  it("weights reconcile to 100%", () => {
    expect(a.holdings.reduce((s, h) => s + (h.weight ?? 0), 0)).toBeCloseTo(1, 9);
    expect(a.holdings.reduce((s, h) => s + (h.costWeight ?? 0), 0)).toBeCloseTo(1, 9);
    expect(a.allocation.directEquity.reduce((s, r) => s + r.valuePct, 0)).toBeCloseTo(1, 9);
    expect(a.allocation.directEquity.reduce((s, r) => s + r.costPct, 0)).toBeCloseTo(1, 9);
    expect(a.allocation.assetTypes.reduce((s, r) => s + r.valuePct, 0)).toBeCloseTo(1, 9);
    expect(a.sectors.reduce((s, r) => s + r.weight, 0)).toBeCloseTo(1, 9);
    expect(a.allocation.lookThrough.reduce((s, r) => s + r.valuePct, 0)).toBeCloseTo(1, 9);
  });
  it("all holdings reconcile between snapshot and ledger", () => {
    expect(a.dataQuality.reconciliation.every((r) => r.status === "ok")).toBe(true);
  });
  it("U + R = V − (buys − sells) identity holds", () => {
    expect(a.summary.unrealized + a.summary.realized).toBeCloseTo(a.summary.marketValue - a.summary.netSecurityFlows, 4);
  });
  it("deposits are not double-counted: contributions = Σ deposits only", () => {
    const deps = data.cash.filter((c) => c.kind === "DEPOSIT").reduce((s, c) => s + c.amount, 0);
    expect(a.summary.netContributions).toBeCloseTo(deps, 6);
    const sipTotal = a.sip.months.reduce((s, m) => s + m.contribution, 0);
    expect(sipTotal).toBeCloseTo(deps, 6);
  });
  it("ETFs are never counted as direct small-caps", () => {
    const etfSyms = a.holdings.filter((h) => h.assetType === "ETF").map((h) => h.symbol);
    expect(etfSyms.length).toBeGreaterThan(0);
    const directCount = a.allocation.directEquity.reduce((s, r) => s + r.count, 0);
    expect(directCount).toBe(a.summary.counts.stocks);
  });
  it("full price coverage gives a TWR and series value matches snapshot", () => {
    expect(a.seriesGaps.length).toBe(0);
    expect(a.summary.twrSinceInception).not.toBeNull();
    const last = a.series[a.series.length - 1];
    expect(last.value).toBeCloseTo(a.summary.marketValue, 2);
  });
  it("security XIRR equals an independently computed XIRR", () => {
    const flows = data.trades.map((t) => ({ date: t.date, amount: t.side === "BUY" ? -(t.quantity * t.price + t.charges) : t.quantity * t.price - t.charges }));
    for (const c of data.cash.filter((c) => c.kind === "DIVIDEND")) flows.push({ date: c.date, amount: c.amount });
    flows.push({ date: asOf, amount: a.summary.marketValue });
    expect(a.summary.xirrSecurities).toBeCloseTo(xirr(flows)!, 8);
  });
  it("flags synthetic data", () => {
    expect(a.dataQuality.issues.some((i) => i.area === "Sample data")).toBe(true);
  });
});

describe("Missing data is disclosed, never fabricated", () => {
  it("no prices → no TWR, holdings value missing, XIRR withheld", () => {
    const r = analyse({ trades: [buy("2025-01-01", "AAA", 10, 100)], cash: [], actions: [], securities: [], fundamentals: [], research: [], snapshots: [], prices: [] }, DEFAULT_SETTINGS, "2026-01-01");
    expect(r.holdings[0].value).toBeNull();
    expect(r.holdings[0].quality).toBe("MISSING");
    expect(r.summary.twrSinceInception).toBeNull();
    expect(r.summary.xirrSecurities).toBeNull();
    expect(r.summary.status).toBe("Insufficient data");
  });
  it("snapshot without trades → value shown, XIRR unavailable", () => {
    const r = analyse({ trades: [], cash: [], actions: [], securities: [], fundamentals: [], research: [], prices: [], snapshots: [{ id: "s", takenAt: "2026-01-01T10:00:00Z", asOfDate: "2026-01-01", source: "KITE_API", quality: "VERIFIED", items: [{ symbol: "AAA", assetType: "STOCK", quantity: 10, averagePrice: 100, lastPrice: 150 }] }] }, DEFAULT_SETTINGS, "2026-01-02");
    expect(r.summary.marketValue).toBe(1500);
    expect(r.summary.unrealized).toBe(500);
    expect(r.summary.xirrSecurities).toBeNull();
    expect(r.summary.xirrNote).toMatch(/tradebook/);
    expect(r.dataQuality.reconciliation[0].status).toBe("no-trades");
  });
  it("short history is not annualised for target gap", () => {
    const prices = [{ symbol: "AAA", date: "2026-01-01", close: 100, source: "MANUAL" as const }, { symbol: "AAA", date: "2026-03-02", close: 120, source: "MANUAL" as const }];
    const r = analyse({ trades: [buy("2026-01-01", "AAA", 10, 100)], cash: [dep("2026-01-01", 1000)], actions: [], securities: [], fundamentals: [], research: [], snapshots: [], prices }, DEFAULT_SETTINGS, "2026-03-02");
    expect(r.summary.gapVsTarget).toBeNull();
    expect(r.summary.twrAnnualised).toBeNull();
    expect(r.summary.status).toBe("Ahead"); // 20% in 2 months vs 40%/yr reference path
  });
});
