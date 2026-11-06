/** Date helpers operating on ISO YYYY-MM-DD strings, UTC-based arithmetic (no TZ drift). */
const DAY = 86_400_000;

export function toMs(d: string): number {
  const [y, m, dd] = d.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, dd);
}
export function fromMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
export function daysBetween(a: string, b: string): number {
  return Math.round((toMs(b) - toMs(a)) / DAY);
}
export function addDays(d: string, n: number): string {
  return fromMs(toMs(d) + n * DAY);
}
export function addMonths(d: string, n: number): string {
  const [y, m, dd] = d.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(dd, last));
  return fromMs(t.getTime());
}
export function monthKey(d: string): string {
  return d.slice(0, 7);
}
export function monthEnd(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return fromMs(Date.UTC(y, m, 0));
}
export function monthStart(month: string): string {
  return month + "-01";
}
export function monthsRange(fromMonth: string, toMonth: string): string[] {
  const out: string[] = [];
  let [y, m] = fromMonth.split("-").map(Number);
  const [ty, tm] = toMonth.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}
/** Today's date in IST. */
export function todayIST(now: Date = new Date()): string {
  return new Date(now.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
}
export function yearFrac(a: string, b: string): number {
  return daysBetween(a, b) / 365;
}
export function minDate(...ds: (string | undefined)[]): string | undefined {
  return ds.filter(Boolean).sort()[0];
}
export function maxDate(...ds: (string | undefined)[]): string | undefined {
  const s = ds.filter(Boolean).sort();
  return s[s.length - 1];
}

/** Parse many date formats seen in Zerodha exports: 2024-01-31, 31-01-2024, 31/01/2024, 31-Jan-2024, 2024-01-31T10:00:00. */
export function parseDate(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const months: Record<string, string> = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
  m = s.match(/^(\d{1,2})[-\s/]([A-Za-z]{3})[A-Za-z]*[-\s/,]+(\d{4})/);
  if (m && months[m[2].toLowerCase()]) return `${m[3]}-${months[m[2].toLowerCase()]}-${m[1].padStart(2, "0")}`;
  return null;
}
