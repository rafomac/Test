import { describe, expect, it, beforeAll } from "vitest";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { zipSync, strToU8 } from "fflate";
import { parseBhavcopy, matchRows, expandFile, dateFromFileName, nseFullUrl, bseUrl } from "@/lib/import/bhavcopy";

// Layouts follow the published exchange files (header names, padding and date styles).
const NSE_FULL = `SYMBOL, SERIES, DATE1, PREV_CLOSE, OPEN_PRICE, HIGH_PRICE, LOW_PRICE, LAST_PRICE, CLOSE_PRICE, AVG_PRICE, TTL_TRD_QNTY, TURNOVER_LACS, NO_OF_TRADES, DELIV_QTY, DELIV_PER
ALPHA, EQ, 05-Nov-2024, 100.00, 101.00, 105.00, 99.00, 104.00, 104.50, 102.30, 12000, 12.28, 340, 6000, 50.00
ALPHA, N1, 05-Nov-2024, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 5, 0.05, 1, -, -
SMEONE, SM, 05-Nov-2024, 50.00, 50.00, 52.00, 49.00, 51.00, 51.25, 50.80, 4000, 2.03, 12, 4000, 100.00
LIQUIDBEES, EQ, 05-Nov-2024, 999.99, 1000, 1000, 999.99, 999.99, 999.99, 999.99, 50000, 499.99, 900, -, -`;
const NSE_CM = `SYMBOL,SERIES,OPEN,HIGH,LOW,CLOSE,LAST,PREVCLOSE,TOTTRDQTY,TOTTRDVAL,TIMESTAMP,TOTALTRADES,ISIN,
ALPHA,EQ,100,105,99,103.2,103,100,9000,927000,04-NOV-2019,200,INE000A01011,`;
const UDIFF_NSE = `TradDt,BizDt,Sgmt,Src,FinInstrmTp,FinInstrmId,ISIN,TckrSymb,SctySrs,XpryDt,FininstrmActlXpryDt,StrkPric,OptnTp,FinInstrmNm,OpnPric,HghPric,LwPric,ClsPric,LastPric,PrvsClsgPric,UndrlygPric,SttlmPric,OpnIntrst,ChngInOpnIntrst,TtlTradgVol,TtlTrfVal,TtlNbOfTxsExctd,SsnId,NewBrdLotQty,Rmks,Rsvd1,Rsvd2,Rsvd3,Rsvd4
2024-11-05,2024-11-05,CM,NSE,STK,123,INE000A01011,ALPHA,EQ,,,,,ALPHA LTD,101,105,99,104.5,104,100,,104.5,,,12000,1254000,340,F1,1,,,,,`;
const UDIFF_BSE = `TradDt,BizDt,Sgmt,Src,FinInstrmTp,FinInstrmId,ISIN,TckrSymb,SctySrs,XpryDt,FininstrmActlXpryDt,StrkPric,OptnTp,FinInstrmNm,OpnPric,HghPric,LwPric,ClsPric,LastPric,PrvsClsgPric,UndrlygPric,SttlmPric,OpnIntrst,ChngInOpnIntrst,TtlTradgVol,TtlTrfVal,TtlNbOfTxsExctd,SsnId,NewBrdLotQty,Rmks,Rsvd1,Rsvd2,Rsvd3,Rsvd4
2024-11-05,2024-11-05,CM,BSE,STK,543210,INE999Z01019,BSEONLY,X,,,,,BSE ONLY LTD,20,21,19,20.4,20.4,20,,20.4,,,800,16320,9,F1,1,,,,,
2024-11-05,2024-11-05,CM,BSE,STK,500001,INE000A01011,ALPHA,A,,,,,ALPHA LTD,101,105,99,104.9,104,100,,104.9,,,500,52000,30,F1,1,,,,,`;
const BSE_OLD = `SC_CODE,SC_NAME,SC_GROUP,SC_TYPE,OPEN,HIGH,LOW,CLOSE,LAST,PREVCLOSE,NO_TRADES,NO_OF_SHRS,NET_TURNOV,TDCLOINDI,ISIN_CODE,TRADING_DATE,FILLER2,FILLER3
543210,BSEONLY   ,X ,Q,19.00,20.00,18.50,19.80,19.80,19.00,5,700,13860.00,,INE999Z01019,05-Nov-19,,`;

describe("Bhavcopy parsers", () => {
  it("NSE full bhavdata (padded fields, delivery %, series filter, SME)", () => {
    const p = parseBhavcopy(NSE_FULL, "sec_bhavdata_full_05112024.csv");
    expect(p.format).toBe("NSE_FULL");
    expect(p.rows.map((r) => r.symbol)).toEqual(["ALPHA", "SMEONE", "LIQUIDBEES"]);
    expect(p.rows[0]).toMatchObject({ exchange: "NSE", date: "2024-11-05", close: 104.5, volume: 12000, deliveryPct: 50, tradedValue: 1228000 });
    expect(p.rows[2].deliveryPct).toBeUndefined();
    expect(p.skipped).toBe(1);
  });
  it("legacy NSE cm bhav", () => {
    const p = parseBhavcopy(NSE_CM, "cm04NOV2019bhav.csv");
    expect(p.format).toBe("NSE_CM");
    expect(p.rows[0]).toMatchObject({ date: "2019-11-04", close: 103.2, isin: "INE000A01011" });
  });
  it("UDiFF NSE and BSE", () => {
    expect(parseBhavcopy(UDIFF_NSE, "BhavCopy_NSE_CM_0_0_0_20241105_F_0000.csv").rows[0]).toMatchObject({ exchange: "NSE", close: 104.5, isin: "INE000A01011" });
    const b = parseBhavcopy(UDIFF_BSE, "BhavCopy_BSE_CM_0_0_0_20241105_F_0000.CSV");
    expect(b.rows[0]).toMatchObject({ exchange: "BSE", symbol: "BSEONLY", close: 20.4 });
  });
  it("legacy BSE file inside a ZIP (two-digit-year date)", () => {
    const zip = zipSync({ "EQ_ISINCODE_051119.CSV": strToU8(BSE_OLD) });
    const files = expandFile("EQ_ISINCODE_051119.zip", zip);
    const p = parseBhavcopy(files[0].text, files[0].name);
    expect(p.format).toBe("BSE_OLD");
    expect(p.rows[0]).toMatchObject({ exchange: "BSE", symbol: "BSEONLY", date: "2019-11-05", close: 19.8, isin: "INE999Z01019" });
  });
  it("rejects unknown files (e.g. an HTML error page)", () => {
    expect(parseBhavcopy("<html><body>Access denied</body></html>", "x.csv").format).toBeNull();
  });
  it("dates from file names and archive URLs", () => {
    expect(dateFromFileName("sec_bhavdata_full_05112024.csv")).toBe("2024-11-05");
    expect(dateFromFileName("BhavCopy_NSE_CM_0_0_0_20241105_F_0000.csv")).toBe("2024-11-05");
    expect(dateFromFileName("EQ_ISINCODE_051119.zip")).toBe("2019-11-05");
    expect(nseFullUrl("2024-11-05")[0]).toBe("https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_05112024.csv");
    expect(bseUrl("2024-11-05")).toMatch(/BhavCopy_BSE_CM_0_0_0_20241105_F_0000\.CSV$/);
    expect(bseUrl("2019-11-05")).toMatch(/EQ_ISINCODE_051119\.zip$/);
  });
});

describe("Matching to portfolio symbols", () => {
  const rows = [...parseBhavcopy(UDIFF_NSE, "BhavCopy_NSE_CM_0_0_0_20241105_F_0000.csv").rows, ...parseBhavcopy(UDIFF_BSE, "BhavCopy_BSE_CM_0_0_0_20241105_F_0000.CSV").rows, ...parseBhavcopy(NSE_FULL, "sec_bhavdata_full_05112024.csv").rows];
  const m = matchRows(rows, [{ symbol: "ALPHA", isin: "INE000A01011" }, { symbol: "BSEONLY", isin: "INE999Z01019", exchange: "BSE" }, { symbol: "SMEONE" }]);
  it("prefers NSE over BSE for the same security and day", () => {
    const a = m.points.filter((p) => p.symbol === "ALPHA");
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ close: 104.5, source: "NSE_BHAVCOPY" });
  });
  it("matches BSE-only holdings by ISIN", () => {
    expect(m.points.find((p) => p.symbol === "BSEONLY")).toMatchObject({ close: 20.4, source: "BSE_BHAVCOPY" });
  });
  it("ignores securities you never held and flags SME series", () => {
    expect(m.points.some((p) => p.symbol === "LIQUIDBEES")).toBe(false);
    expect(m.sme.has("SMEONE")).toBe(true);
  });
});

describe("One-click downloader (simulated exchange server)", () => {
  let bhav: typeof import("@/lib/server/bhav");
  let db: typeof import("@/lib/store/db");
  beforeAll(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bhav-"));
    process.env.DB_FILE = path.join(dir, "test.db");
    db = await import("@/lib/store/db");
    bhav = await import("@/lib/server/bhav");
    const t = (id: string, symbol: string, isin: string, exchange: string) => ({ id, date: "2024-11-04", symbol, isin, exchange, side: "BUY" as const, quantity: 10, price: 100, charges: 0, chargesKnown: true, source: "CONSOLE_TRADEBOOK" as const, quality: "VERIFIED" as const });
    db.insertMany("trades", [t("1", "ALPHA", "INE000A01011", "NSE"), t("2", "BSEONLY", "INE999Z01019", "BSE")]);
    db.upsertPrices([{ symbol: "ALPHA", date: "2024-11-05", close: 103.9, source: "KITE_API" }]);
  });
  it("downloads trading days, skips holidays and error pages, fills BSE-only stocks, supersedes Kite LTP", async () => {
    const fetched: string[] = [];
    const fake = async (url: string) => {
      fetched.push(url);
      const enc = (s: string) => new TextEncoder().encode(s);
      if (url.includes("sec_bhavdata_full_05112024")) return { status: 200, bytes: enc(NSE_FULL) };
      if (url.includes("sec_bhavdata_full_06112024")) return { status: 200, bytes: enc("<html>" + "x".repeat(200) + "</html>") };
      if (url.includes("BhavCopy_BSE_CM_0_0_0_20241105")) return { status: 200, bytes: enc(UDIFF_BSE) };
      return { status: 404, bytes: new Uint8Array() };
    };
    bhav.startDownload({ from: "2024-11-04", to: "2024-11-08", delayMs: 0, fetcher: fake });
    for (let i = 0; i < 100 && bhav.jobStatus()!.status === "running"; i++) await new Promise((r) => setTimeout(r, 20));
    const j = bhav.jobStatus()!;
    expect(j.status).toBe("done");
    expect(j.totalDays).toBe(5);
    expect(j.filesFound).toBe(1);
    expect(j.holidays).toBe(4);
    expect(j.failedDays).toBe(0);
    const alpha = db.listPrices("ALPHA");
    expect(alpha).toEqual([expect.objectContaining({ date: "2024-11-05", close: 104.5, volume: 12000, source: "NSE_BHAVCOPY" })]);
    expect(j.superseded).toBe(1);
    expect(fetched.some((u) => u.includes("nsearchives"))).toBe(true);
    expect(db.listAudit(20).some((a) => a.action === "prices.superseded")).toBe(true);
    // BSE-only holding priced on the very first day too
    expect(db.listPrices("BSEONLY")).toEqual([expect.objectContaining({ date: "2024-11-05", close: 20.4, source: "BSE_BHAVCOPY" })]);
  });
  it("a second run with BSE needed fetches BSE and prices the BSE-only holding", async () => {
    const enc = (s: string) => new TextEncoder().encode(s);
    const fake = async (url: string) => {
      if (url.includes("sec_bhavdata_full_11112024")) return { status: 200, bytes: enc(NSE_FULL.replace(/05-Nov-2024/g, "11-Nov-2024")) };
      if (url.includes("sec_bhavdata_full_12112024")) return { status: 200, bytes: enc(NSE_FULL.replace(/05-Nov-2024/g, "12-Nov-2024")) };
      if (url.includes("BhavCopy_BSE_CM_0_0_0_20241112")) return { status: 200, bytes: enc(UDIFF_BSE.replace(/2024-11-05/g, "2024-11-12")) };
      return { status: 404, bytes: new Uint8Array() };
    };
    bhav.startDownload({ from: "2024-11-11", to: "2024-11-12", delayMs: 0, fetcher: fake });
    for (let i = 0; i < 100 && bhav.jobStatus()!.status === "running"; i++) await new Promise((r) => setTimeout(r, 20));
    expect(db.listPrices("BSEONLY").map((p) => p.date)).toEqual(["2024-11-05", "2024-11-12"]);
  });
});
