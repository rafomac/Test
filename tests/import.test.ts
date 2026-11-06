import { describe, expect, it } from "vitest";
import { parseTradebook, parseHoldings, parseLedger, parseDividends, parseFundamentals, parseCorporateActions, parsePrices, classifyLedger, parseAmfi } from "@/lib/import/zerodha";
import { parseDate } from "@/lib/engine/dates";
import { checksum, tokenExpiry, loginUrl } from "@/lib/kite/auth";
import crypto from "node:crypto";

describe("Zerodha Console importers", () => {
  it("parses a Console equity tradebook (with preamble rows)", () => {
    const csv = `Client ID,AB1234\nTradebook for Equity from 2026-01-01 to 2026-10-31\n\nsymbol,isin,trade_date,exchange,segment,series,trade_type,auction,quantity,price,trade_id,order_id,order_execution_time
INFY,INE009A01021,2026-01-05,NSE,EQ,EQ,buy,false,10.000000,1500.50,123456,1100000000000001,2026-01-05T10:15:00
INFY,INE009A01021,2026-02-05,NSE,EQ,EQ,sell,false,4.000000,1600.00,123457,1100000000000002,2026-02-05T11:00:00
NIFTY26JANFUT,,2026-01-05,NFO,FO,,buy,false,50,22000,9,9,2026-01-05T10:00:00`;
    const r = parseTradebook(csv);
    expect(r.records.length).toBe(2);
    expect(r.records[0]).toMatchObject({ symbol: "INFY", side: "BUY", quantity: 10, price: 1500.5, date: "2026-01-05", chargesKnown: false });
    expect(r.records[1].side).toBe("SELL");
    expect(r.skipped[0].reason).toMatch(/Segment FO/);
    expect(r.warnings.some((w) => /charges/.test(w))).toBe(true);
    // Stable IDs make re-imports idempotent
    expect(parseTradebook(csv).records[0].id).toBe(r.records[0].id);
  });
  it("parses Console holdings export", () => {
    const csv = `Holdings Statement as on 2026-10-31\n\nSymbol,ISIN,Sector,Quantity Available,Quantity Discrepant,Quantity Long Term,Quantity Pledged (Margin),Quantity Pledged (Loan),Average Price,Previous Closing Price,Unrealized P&L,Unrealized P&L Pct.
INFY,INE009A01021,IT,6,0,0,0,0,1500.5,1550,297,3.3
LIQUIDBEES,INF732E01037,,100,0,0,5,0,1000,1000.1,10,0.01`;
    const r = parseHoldings(csv);
    expect(r.source).toBe("CONSOLE_HOLDINGS");
    expect(r.records.length).toBe(2);
    expect(r.records[0]).toMatchObject({ symbol: "INFY", quantity: 6, averagePrice: 1500.5, lastPrice: 1550, sector: "IT", assetType: "STOCK" });
    expect(r.records[1]).toMatchObject({ quantity: 105, assetType: "CASH_EQUIVALENT" });
  });
  it("parses Kite holdings CSV", () => {
    const csv = `Instrument,Qty.,Avg. cost,LTP,Cur. val,P&L,Net chg.,Day chg.\nTCS,5,3500,3600,18000,500,2.86,0.5`;
    const r = parseHoldings(csv);
    expect(r.source).toBe("KITE_HOLDINGS_CSV");
    expect(r.records[0]).toMatchObject({ symbol: "TCS", quantity: 5, averagePrice: 3500, lastPrice: 3600 });
  });
  it("classifies ledger rows: deposits, payouts, settlements excluded", () => {
    const csv = `particulars,posting_date,cost_center,voucher_type,debit,credit,net_balance
Opening Balance,,,,,,0
Funds added using UPI from XXXX,2026-01-03,NSE-EQ,Bank Receipts,0,200000,200000
Net settlement for Equity with settlement number: 2026001,2026-01-06,NSE-EQ,Book Voucher,15005,0,184995
Payout of 50000,2026-02-10,NSE-EQ,Bank Payments,50000,0,134995
DP Charges for sale of INFY on 05/02/2026,2026-02-06,NSE-EQ,Journal Entry,15.93,0,134979.07`;
    const r = parseLedger(csv);
    expect(r.records.map((x) => [x.kind, x.amount])).toEqual([["DEPOSIT", 200000], ["WITHDRAWAL", 50000], ["CHARGE", 15.93]]);
    expect(classifyLedger("Net settlement for Equity")).toBe("SKIP");
  });
  it("parses dividends", () => {
    const r = parseDividends(`Symbol,ISIN,Ex-date,Quantity,Dividend Per Share,Net Dividend Amount\nINFY,INE009A01021,2026-05-30,6,20,120\nTotal,,,,,120`);
    expect(r.records).toHaveLength(1);
    expect(r.records[0]).toMatchObject({ symbol: "INFY", amount: 120, kind: "DIVIDEND", date: "2026-05-30" });
  });
  it("parses fundamentals with pledge basis made explicit", () => {
    const r = parseFundamentals(`symbol,as_of,source,rev_FY2023,rev_FY2026,pe,promoter_pct,pledge_pct_of_promoter,promoter_2025Q1,promoter_2026Q2\nabc,2026-10-01,Annual reports,100,172.8,32,62,10,61,62`);
    const f = r.records[0];
    expect(f.symbol).toBe("ABC");
    expect(f.revenueAnnual).toEqual({ FY2023: 100, FY2026: 172.8 });
    expect(f.promoterPledgePctOfPromoter).toBe(10);
    expect(f.promoterHistory).toEqual({ "2025Q1": 61, "2026Q2": 62 });
    const amb = parseFundamentals(`symbol,pledge_pct,promoter_pct\nX,5,50`);
    expect(amb.warnings[0]).toMatch(/ambiguous/);
    expect(amb.records[0].promoterPledgePctOfPromoter).toBeUndefined();
  });
  it("parses corporate actions and prices", () => {
    expect(parseCorporateActions(`symbol,ex_date,kind,ratio_from,ratio_to\nABC,2026-03-15,split,1,5`).records[0]).toMatchObject({ kind: "SPLIT", ratioTo: 5 });
    const p = parsePrices(`Date,Total Returns Index\n01 Jan 2026,15000.5\n02-01-2026,15100`, "IDX:NIFTY_SMALLCAP_250_TRI");
    expect(p.records.map((x) => x.date)).toEqual(["2026-01-01", "2026-01-02"]);
  });
  it("parses AMFI categorisation list", () => {
    const r = parseAmfi(`Sr. No.,Company name,ISIN,BSE Symbol,NSE Symbol,Average of All Exchanges (Rs. Cr.),Categorization as per SEBI Circular dated Oct 6, 2017\n1,Big Co,INE000000001,BIG,BIG,1500000,Large Cap\n180,Mid Co,INE000000002,MID,MID,40000,Mid Cap`);
    expect(r.records.map((x) => [x.rank, x.category])).toEqual([[1, "Large"], [180, "Mid"]]);
  });
  it("date formats", () => {
    expect(parseDate("31-01-2026")).toBe("2026-01-31");
    expect(parseDate("31/01/2026")).toBe("2026-01-31");
    expect(parseDate("31-Jan-2026")).toBe("2026-01-31");
    expect(parseDate("2026-01-31T09:15:00")).toBe("2026-01-31");
  });
});

describe("Kite Connect auth helpers", () => {
  it("checksum is SHA-256(api_key + request_token + api_secret)", () => {
    expect(checksum("key", "req", "sec")).toBe(crypto.createHash("sha256").update("keyreqsec").digest("hex"));
  });
  it("token expires at the next 06:00 IST", () => {
    expect(tokenExpiry(new Date("2026-11-06T10:00:00+05:30")).toISOString()).toBe("2026-11-07T00:30:00.000Z");
    expect(tokenExpiry(new Date("2026-11-06T05:00:00+05:30")).toISOString()).toBe("2026-11-06T00:30:00.000Z");
  });
  it("login URL carries CSRF state via redirect_params", () => {
    expect(loginUrl("abc", "xyz")).toBe("https://kite.zerodha.com/connect/login?v=3&api_key=abc&redirect_params=state%3Dxyz");
  });
});
