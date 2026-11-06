/**
 * SYNTHETIC sample portfolio for exploring the UI and for tests.
 * Every symbol is fictional (prefixed "ZZ"), every record is tagged source=SYNTHETIC_SAMPLE and
 * quality=SYNTHETIC, and the UI shows a permanent banner while any of it is loaded.
 * It is NOT your portfolio and NOT market data.
 */
import type { CashEntry, Fundamentals, HoldingsSnapshot, PricePoint, ResearchEntry, Security, Trade } from "./types";
import { mulberry32 } from "./engine/projection";
import { addDays, monthsRange } from "./engine/dates";
import type { PortfolioData } from "./engine/portfolio";

const SRC = "SYNTHETIC_SAMPLE" as const;

const STOCKS: { s: string; name: string; sector: string; industry: string; mcap: number; rank?: number; drift: number; vol: number; p0: number }[] = [
  { s: "ZZALPHA", name: "Alpha Precision (fictional)", sector: "Capital Goods", industry: "Industrial machinery", mcap: 14000, rank: 230, drift: 0.22, vol: 0.32, p0: 820 },
  { s: "ZZBETA", name: "Beta Fine Chem (fictional)", sector: "Chemicals", industry: "Specialty chemicals", mcap: 6200, rank: 420, drift: 0.12, vol: 0.35, p0: 410 },
  { s: "ZZGAMMA", name: "Gamma Finserv (fictional)", sector: "Financial Services", industry: "NBFC", mcap: 3800, rank: 560, drift: 0.18, vol: 0.38, p0: 260 },
  { s: "ZZDELTA", name: "Delta Defence Systems (fictional)", sector: "Defence", industry: "Defence electronics", mcap: 1650, drift: 0.55, vol: 0.5, p0: 140 },
  { s: "ZZEPS", name: "Epsilon Health (fictional)", sector: "Healthcare", industry: "Diagnostics", mcap: 1200, drift: 0.15, vol: 0.4, p0: 310 },
  { s: "ZZZETA", name: "Zeta Logistics (fictional)", sector: "Logistics", industry: "Freight & logistics", mcap: 900, drift: 0.05, vol: 0.45, p0: 95 },
  { s: "ZZETA", name: "Eta Renewables (fictional)", sector: "Renewable Energy", industry: "Solar EPC", mcap: 640, drift: 0.35, vol: 0.55, p0: 72 },
  { s: "ZZTHETA", name: "Theta Software (fictional)", sector: "Technology", industry: "IT services", mcap: 420, drift: 0.28, vol: 0.5, p0: 55 },
  { s: "ZZIOTA", name: "Iota Foods (fictional)", sector: "Consumer Staples", industry: "Packaged foods", mcap: 310, drift: -0.05, vol: 0.45, p0: 120 },
  { s: "ZZKAPPA", name: "Kappa Infra (fictional)", sector: "Infrastructure", industry: "Construction", mcap: 240, drift: 0.4, vol: 0.6, p0: 38 },
  { s: "ZZLAMBDA", name: "Lambda Pharma (fictional)", sector: "Pharmaceuticals", industry: "Formulations", mcap: 25000, rank: 180, drift: 0.14, vol: 0.28, p0: 1500 },
  { s: "ZZMU", name: "Mu Auto Parts (fictional)", sector: "Manufacturing", industry: "Auto components", mcap: 2800, rank: 610, drift: 0.2, vol: 0.36, p0: 480 },
];
const ETFS = [
  { s: "ZZNIFTYETF", name: "Fictional Nifty 50 ETF", drift: 0.11, vol: 0.15, p0: 240, lt: { Large: 1 } },
  { s: "ZZSMALLETF", name: "Fictional Smallcap ETF", drift: 0.16, vol: 0.24, p0: 160, lt: { Small: 0.75, Micro: 0.25 } },
];
const LIQ = { s: "ZZLIQUID", name: "Fictional Liquid ETF (cash-equivalent)", p0: 1000 };
const MF = { s: "INFZZ0000001", name: "Fictional Flexi Cap Fund — Direct Growth", drift: 0.13, vol: 0.16, p0: 85 };
const IDX = [
  { s: "IDX:NIFTY_50_TRI", drift: 0.11, vol: 0.15, p0: 30000 },
  { s: "IDX:NIFTY_NEXT_50_TRI", drift: 0.13, vol: 0.19, p0: 80000 },
  { s: "IDX:NIFTY_MIDCAP_150_TRI", drift: 0.17, vol: 0.2, p0: 20000 },
  { s: "IDX:NIFTY_SMALLCAP_250_TRI", drift: 0.18, vol: 0.24, p0: 15000 },
  { s: "IDX:NIFTY_MICROCAP_250_TRI", drift: 0.2, vol: 0.27, p0: 25000 },
];

function businessDays(from: string, to: string) {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) { const w = new Date(d + "T00:00:00Z").getUTCDay(); if (w !== 0 && w !== 6) out.push(d); }
  return out;
}

export function generateSample(asOf: string, startMonth = "2024-11", seed = 42): PortfolioData {
  const rand = mulberry32(seed);
  const g = () => { let u = 0, v = 0; while (!u) u = rand(); while (!v) v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const start = `${startMonth}-01`;
  const days = businessDays(addDays(start, -260), asOf);
  const prices: PricePoint[] = [];
  const pathFor = (sym: string, p0: number, drift: number, vol: number, withVolume: boolean, market: number[]) => {
    let p = p0;
    const dv = vol / Math.sqrt(252), dm = Math.log(1 + drift) / 252;
    days.forEach((d, i) => {
      const shock = 0.6 * market[i] + 0.8 * g();
      p *= Math.exp(dm - 0.5 * dv * dv + dv * shock);
      prices.push({ symbol: sym, date: d, close: Math.round(p * 100) / 100, volume: withVolume ? Math.round((20000 + rand() * 80000) * (p0 < 100 ? 3 : 1)) : undefined, source: SRC });
    });
  };
  const market = days.map(() => g());
  for (const x of STOCKS) pathFor(x.s, x.p0, x.drift, x.vol, true, market);
  for (const x of ETFS) pathFor(x.s, x.p0, x.drift, x.vol, true, market);
  for (const x of IDX) pathFor(x.s, x.p0, x.drift, x.vol, false, market);
  pathFor(MF.s, MF.p0, MF.drift, MF.vol, false, market);
  let lp = LIQ.p0;
  for (const d of days) { lp *= 1 + 0.065 / 252; prices.push({ symbol: LIQ.s, date: d, close: Math.round(lp * 100) / 100, source: SRC }); }
  const px = new Map(prices.map((p) => [`${p.symbol}@${p.date}`, p.close]));
  const priceOn = (s: string, d: string) => { for (let k = 0; k < 7; k++) { const v = px.get(`${s}@${addDays(d, -k)}`); if (v) return v; } return undefined; };

  const trades: Trade[] = [];
  const cash: CashEntry[] = [];
  let n = 0;
  const mk = (date: string, symbol: string, side: "BUY" | "SELL", amountOrQty: number, byQty = false) => {
    if (date > asOf) return 0;
    const p = priceOn(symbol, date); if (!p) return 0;
    const q = byQty ? amountOrQty : Math.max(1, Math.floor(amountOrQty / p));
    const charges = Math.round(q * p * 0.0012 * 100) / 100; // illustrative ~0.12% all-in delivery charges
    trades.push({ id: `SYN-T${++n}`, date, symbol, side, quantity: q, price: p, charges, chargesKnown: true, source: SRC, quality: "SYNTHETIC" });
    return q * p;
  };
  const months = monthsRange(startMonth, asOf.slice(0, 7));
  const held = new Map<string, number>();
  // Initial lump sum representing an existing portfolio
  const d0 = businessDays(start, addDays(start, 10))[0];
  cash.push({ id: `SYN-C${++n}`, date: d0, kind: "DEPOSIT", amount: 1_000_000, description: "Initial transfer (synthetic)", source: SRC, quality: "SYNTHETIC" });
  [["ZZALPHA", 120000], ["ZZBETA", 100000], ["ZZLAMBDA", 150000], ["ZZNIFTYETF", 250000], ["ZZSMALLETF", 200000], [MF.s, 100000]].forEach(([s, a]) => {
    const q = mk(d0, s as string, "BUY", a as number); held.set(s as string, (held.get(s as string) ?? 0) + q);
  });
  mk(d0, LIQ.s, "BUY", 70000);
  months.forEach((m, i) => {
    if (i === 0) return;
    const dd = businessDays(`${m}-01`, `${m}-10`)[1];
    if (!dd || dd > asOf) return;
    const amt = i % 7 === 3 ? 120000 : i % 11 === 5 ? 0 : 200000; // occasional shortfalls
    if (amt) cash.push({ id: `SYN-C${++n}`, date: dd, kind: "DEPOSIT", amount: amt, description: "Monthly SIP (synthetic)", source: SRC, quality: "SYNTHETIC" });
    // Park in liquid first, then deploy 10k initial positions / adds
    if (amt) mk(dd, LIQ.s, "BUY", amt * 0.4);
    const pick = STOCKS[(i * 5) % STOCKS.length];
    mk(addDays(dd, 2), pick.s, "BUY", i < STOCKS.length ? 10000 : 40000 + (i % 3) * 15000);
    const pick2 = STOCKS[(i * 3 + 1) % STOCKS.length];
    mk(addDays(dd, 3), pick2.s, "BUY", 30000 + (i % 4) * 10000);
    if (i % 4 === 0) {
      // internal switch: sell some liquid to fund a stock (NOT a contribution)
      const lq = trades.filter((t) => t.symbol === LIQ.s).reduce((s, t) => s + (t.side === "BUY" ? t.quantity : -t.quantity), 0);
      const q = Math.floor(lq * 0.5);
      if (q > 0) { mk(addDays(dd, 4), LIQ.s, "SELL", q, true); mk(addDays(dd, 4), STOCKS[(i * 7) % STOCKS.length].s, "BUY", q * (priceOn(LIQ.s, addDays(dd, 4)) ?? 1000) * 0.98); }
    }
    if (i === 9) {
      // partial ETF sale to fund research picks
      const q = trades.filter((t) => t.symbol === "ZZNIFTYETF").reduce((s, t) => s + t.quantity, 0);
      mk(addDays(dd, 5), "ZZNIFTYETF", "SELL", Math.floor(q * 0.3), true);
    }
  });
  // Dividends
  for (const [i, s] of ["ZZLAMBDA", "ZZALPHA", "ZZBETA"].entries()) {
    const d = addDays(`${months[Math.min(months.length - 1, 5 + i * 3)]}-15`, 0);
    if (d <= asOf) cash.push({ id: `SYN-D${++n}`, date: d, kind: "DIVIDEND", amount: 1500 + i * 700, symbol: s, description: "Dividend (synthetic)", source: SRC, quality: "SYNTHETIC" });
  }
  // Ensure the synthetic ledger never goes negative: top up the initial transfer if needed.
  const events = [...cash.filter((c) => c.kind === "DEPOSIT").map((c) => ({ d: c.date, v: c.amount })), ...trades.map((t) => ({ d: t.date, v: t.side === "BUY" ? -(t.quantity * t.price + t.charges) : t.quantity * t.price - t.charges }))].sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : b.v - a.v));
  let bal = 0, minBal = 0;
  for (const e of events) { bal += e.v; minBal = Math.min(minBal, bal); }
  if (minBal < 0) { cash[0].amount += Math.ceil(-minBal / 1000) * 1000 + 10000; bal += Math.ceil(-minBal / 1000) * 1000 + 10000; }
  const now = new Date().toISOString();
  const securities: Security[] = [
    ...STOCKS.map((x) => ({ symbol: x.s, name: x.name, assetType: "STOCK" as const, sector: x.sector, industry: x.industry, marketCapCr: x.mcap, amfiRank: x.rank, marketCapAsOf: asOf, source: SRC, updatedAt: now })),
    ...ETFS.map((x) => ({ symbol: x.s, name: x.name, assetType: "ETF" as const, lookThrough: x.lt, source: SRC, updatedAt: now })),
    { symbol: LIQ.s, name: LIQ.name, assetType: "CASH_EQUIVALENT", source: SRC, updatedAt: now },
    { symbol: MF.s, name: MF.name, assetType: "MF", source: SRC, updatedAt: now },
  ];
  const fundamentals: Fundamentals[] = STOCKS.slice(0, 9).map((x, i) => {
    const g0 = 0.12 + (i % 5) * 0.06;
    const rev: Record<string, number> = {};
    let r = x.mcap / (3 + i % 4);
    for (let y = 2016; y <= 2026; y++) { rev[`FY${y}`] = Math.round(r); r *= 1 + g0 + (y >= 2025 && i % 3 === 0 ? -0.15 : 0); }
    return {
      symbol: x.s, asOf, source: "SYNTHETIC SAMPLE — not real company data",
      revenueAnnual: rev, ttmRevenue: rev.FY2026, ttmNetProfit: i === 8 ? -5 : Math.round(rev.FY2026 * 0.09),
      pe: i === 8 ? undefined : 18 + i * 9, rocePct: 12 + i * 2, roePct: 10 + i * 1.5, debtToEquity: i === 5 ? 1.6 : 0.2 + i * 0.05, interestCoverage: i === 5 ? 2.2 : 8,
      operatingMarginPct: 10 + i, netMarginPct: 6 + i * 0.5, freeCashFlowCr: Math.round(rev.FY2026 * 0.04), operatingCashFlowCr: Math.round(rev.FY2026 * 0.1),
      promoterHoldingPct: 48 + i * 2.5, promoterPledgePctOfPromoter: i === 4 ? 30 : 0,
      promoterHistory: { "2024Q4": 48 + i * 2.5 + (i === 6 ? 3 : 0), "2026Q2": 48 + i * 2.5 },
      website: `https://example.com/${x.s.toLowerCase()}`, websiteQuality: (i % 4) as 0 | 1 | 2 | 3,
      socials: i % 2 === 0 ? [{ platform: "LinkedIn", url: "https://example.com", verifiedOfficial: true, postsLast90d: 6 }, { platform: "X", url: "https://example.com", verifiedOfficial: true, postsLast90d: 2 }] : [],
    };
  });
  const research: ResearchEntry[] = STOCKS.slice(0, 6).map((x, i) => ({
    symbol: x.s, conviction: (["High", "Standard", "Exceptional", "Research", "Standard", "High"] as const)[i],
    ratings: { growth: 6 + (i % 4), financialHealth: 5 + (i % 3), valuation: 4 + (i % 5), governance: 7, competitive: 6 },
    evidence: { growth: "interpretation", financialHealth: "verified", valuation: "verified", governance: "interpretation", competitive: "user" },
    thesis: "Synthetic example thesis.", lastReviewed: addDays(asOf, -30 * (i + 1)), nextReview: addDays(asOf, 60 - i * 20), updatedAt: now,
  }));
  // Final snapshot from replayed quantities at asOf prices
  const qty = new Map<string, number>();
  for (const t of trades) qty.set(t.symbol, (qty.get(t.symbol) ?? 0) + (t.side === "BUY" ? t.quantity : -t.quantity));
  const cost = new Map<string, number>();
  for (const t of trades.filter((t) => t.side === "BUY")) cost.set(t.symbol, (cost.get(t.symbol) ?? 0) + t.quantity * t.price);
  const bq = new Map<string, number>();
  for (const t of trades.filter((t) => t.side === "BUY")) bq.set(t.symbol, (bq.get(t.symbol) ?? 0) + t.quantity);
  const snapshot: HoldingsSnapshot = {
    id: `SYN-SNAP-${asOf}`, takenAt: `${asOf}T10:00:00.000Z`, asOfDate: asOf, source: SRC, quality: "SYNTHETIC",
    items: [...qty].filter(([, q]) => q > 0).map(([s, q]) => ({
      symbol: s, assetType: securities.find((x) => x.symbol === s)!.assetType, quantity: q,
      averagePrice: (cost.get(s) ?? 0) / (bq.get(s) ?? 1), lastPrice: priceOn(s, asOf)!,
    })),
    cash: Math.round(bal * 100) / 100,
  };
  return { trades, cash, actions: [], securities, fundamentals, research, snapshots: [snapshot], prices };
}
