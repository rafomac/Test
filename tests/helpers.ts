import type { Trade, CashEntry } from "@/lib/types";
let n = 0;
export function buy(date: string, symbol: string, quantity: number, price: number, charges = 0): Trade {
  return { id: `t${++n}`, date, symbol, side: "BUY", quantity, price, charges, chargesKnown: true, source: "MANUAL", quality: "VERIFIED" };
}
export function sell(date: string, symbol: string, quantity: number, price: number, charges = 0): Trade {
  return { ...buy(date, symbol, quantity, price, charges), side: "SELL" };
}
export function dep(date: string, amount: number, kind: CashEntry["kind"] = "DEPOSIT", symbol?: string): CashEntry {
  return { id: `c${++n}`, date, kind, amount, symbol, source: kind === "DIVIDEND" ? "CONSOLE_DIVIDENDS" : "CONSOLE_LEDGER", quality: "VERIFIED" };
}
