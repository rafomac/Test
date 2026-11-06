"use client";
export function PrintButton() {
  return <button onClick={() => window.print()} className="no-print rounded-md border border-line px-2 py-1 text-xs">Download PDF (print)</button>;
}
