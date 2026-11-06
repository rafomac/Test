import ExcelJS from "exceljs";
import { getAnalytics, getSettings, loadData } from "@/lib/server/repo";
import { monthlyReport, annualReport } from "@/lib/engine/reports";
import { audit } from "@/lib/store/db";

type Table = { name: string; columns: string[]; rows: (string | number | null)[][] };

function toCsv(t: Table) {
  const esc = (v: unknown) => { const s = v === null || v === undefined ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [t.columns.map(esc).join(","), ...t.rows.map((r) => r.map(esc).join(","))].join("\n");
}

function tables(type: string, month?: string, year?: string): Table[] {
  const a = getAnalytics();
  const r2 = (x: number | null | undefined) => (x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);
  const pct = (x: number | null | undefined) => (x === null || x === undefined ? null : Math.round(x * 10000) / 100);
  const holdings: Table = {
    name: "Holdings",
    columns: ["Symbol", "Name", "Type", "Sector", "Industry", "Market cap (cr)", "Cap category", "Cap basis", "Qty", "Avg price", "Invested", "LTP", "Price date", "Value", "Unrealised P/L", "Unrealised %", "Weight %", "Cost weight %", "Realised P/L", "Dividends", "Rev 3Y CAGR %", "Rev 5Y CAGR %", "P/E", "ROCE %", "D/E", "Promoter %", "Unpledged promoter %", "Research score", "Completeness %", "Conviction", "vs 200DMA %", "Data quality"],
    rows: a.holdings.map((h) => [h.symbol, h.name ?? "", h.assetType, h.sector, h.industry, r2(h.marketCapCr), h.cap.category, h.cap.basis, h.quantity, r2(h.avgPrice), r2(h.invested), r2(h.lastPrice), h.priceDate ?? "", r2(h.value), r2(h.unrealized), pct(h.unrealizedPct), pct(h.weight), pct(h.costWeight), r2(h.realized), r2(h.dividends), pct(h.rev3y), pct(h.rev5y), r2(h.pe), r2(h.roce), r2(h.debtEquity), r2(h.promoter), r2(h.unpledgedPromoter), r2(h.score.score), pct(h.score.completeness), h.conviction, pct(h.tech?.vs200), h.quality]),
  };
  const sip: Table = {
    name: "SIP",
    columns: ["Month", "In plan", "Target", "Contribution", "Difference", "Stock buys", "ETF buys", "MF buys", "Liquid net", "Cash balance", "Cumulative target", "Cumulative actual", "Status"],
    rows: a.sip.months.map((m) => [m.month, m.inPlan ? "yes" : "no", m.target, r2(m.contribution), r2(m.difference), r2(m.buys.STOCK), r2(m.buys.ETF), r2(m.buys.MF), r2(m.liquidNet), r2(m.cashBalance), m.cumTarget, r2(m.cumActual), m.status]),
  };
  const monthly: Table = { name: "Monthly returns", columns: ["Month", "TWR %", "Complete"], rows: a.monthly.map((m) => [m.key, pct(m.ret), m.complete ? "yes" : "no"]) };
  const quality: Table = { name: "Data quality", columns: ["Severity", "Area", "Message"], rows: a.dataQuality.issues.map((i) => [i.severity, i.area, i.message]) };
  const summary: Table = {
    name: "Summary",
    columns: ["Metric", "Value", "Note"],
    rows: [
      ["As of", a.asOf, a.valuationSource.kind], ["Market value", r2(a.summary.marketValue), ""], ["Invested (cost of holdings)", r2(a.summary.invested), ""],
      ["Unrealised P/L", r2(a.summary.unrealized), ""], ["Realised P/L", r2(a.summary.realized), ""], ["Dividends", r2(a.summary.dividends), ""],
      ["XIRR (securities) %", pct(a.summary.xirrSecurities), a.summary.xirrNote], ["XIRR (account) %", pct(a.summary.xirrAccount), ""],
      ["TWR since inception %", pct(a.summary.twrSinceInception), a.summary.twrNote], ["TWR annualised %", pct(a.summary.twrAnnualised), ""],
      ["Target CAGR %", a.summary.targetRate * 100, ""], ["Gap vs target (pp)", pct(a.summary.gapVsTarget), a.summary.gapNote], ["Status vs target path", a.summary.status, a.summary.statusDetail],
    ],
  };
  if (type === "holdings") return [holdings];
  if (type === "sip") return [sip];
  if (type === "monthly") return [monthly];
  if (type === "monthly-report" && month) {
    const r = monthlyReport(a, loadData(), getSettings(), month);
    return [{ name: `Report ${month}`, columns: ["Item", "Value"], rows: [
      ["Opening value", r2(r.opening)], ["Closing value", r2(r.closing)], ["Contributions", r2(r.contributions)], ["Withdrawals", r2(r.withdrawals)],
      ["Net security flows", r2(r.netFlows)], ["Investment P/L", r2(r.pnl)], ["TWR %", pct(r.twr)], ["Realised P/L", r2(r.realized)], ["Dividends", r2(r.dividends)],
      ["SIP target", r.sip?.target ?? null], ["SIP status", r.sip?.status ?? ""], ...r.best.map((b) => [`Best: ${b.symbol}`, r2(b.gain)] as [string, number | null]), ...r.worst.map((b) => [`Worst: ${b.symbol}`, r2(b.gain)] as [string, number | null]),
    ] }, quality];
  }
  if (type === "annual-report" && year) {
    const r = annualReport(a, loadData(), getSettings(), year);
    return [{ name: `Annual ${year}`, columns: ["Item", "Value"], rows: [
      ["TWR %", pct(r.pm.twr)], ["Money-weighted %", pct(r.pm.mwr)], ["Wealth created", r2(r.wealthCreated)], ["Contributions", r2(r.contributions)], ["SIP target", r.sipTarget],
      ["Months met", `${r.monthsMet}/${r.monthsInPlan}`], ...r.benchmarks.map((b) => [b.name + " %", pct(b.ret)] as [string, number | null]),
      ...r.sectorAttribution.map((x) => ["Sector: " + x.key, r2(x.gain)] as [string, number | null]), ...r.capAttribution.map((x) => ["Cap: " + x.key, r2(x.gain)] as [string, number | null]),
    ] }, quality];
  }
  return [summary, holdings, sip, monthly, quality];
}

export async function GET(req: Request) {
  const u = new URL(req.url);
  const type = u.searchParams.get("type") ?? "all";
  const format = u.searchParams.get("format") ?? "csv";
  const month = u.searchParams.get("month") ?? undefined;
  const year = u.searchParams.get("year") ?? undefined;
  if (month && !/^\d{4}-\d{2}$/.test(month)) return new Response("bad month", { status: 400 });
  if (year && !/^\d{4}$/.test(year)) return new Response("bad year", { status: 400 });
  const ts = tables(type, month, year);
  audit("export", `${type}.${format}`);
  const base = `portfolio-${type}${month ? "-" + month : ""}${year ? "-" + year : ""}`;
  if (format === "xlsx") {
    const wb = new ExcelJS.Workbook();
    wb.creator = "Portfolio Intelligence";
    for (const t of ts) {
      const ws = wb.addWorksheet(t.name.slice(0, 31));
      ws.addRow(t.columns).font = { bold: true };
      for (const r of t.rows) ws.addRow(r);
      ws.columns.forEach((c) => { c.width = 16; });
      ws.views = [{ state: "frozen", ySplit: 1 }];
    }
    const buf = await wb.xlsx.writeBuffer();
    return new Response(buf, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${base}.xlsx"` } });
  }
  const csv = ts.map((t) => (ts.length > 1 ? `# ${t.name}\n` : "") + toCsv(t)).join("\n\n");
  return new Response("﻿" + csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${base}.csv"` } });
}
