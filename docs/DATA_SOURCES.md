# Data sources, reconciliation and limitations

## Availability matrix
| Data | Kite Connect API | Console export | Other / manual |
|---|---|---|---|
| Equity & ETF holdings (qty, avg price, LTP) | ✅ `/portfolio/holdings` | ✅ Holdings | |
| Mutual funds (Coin) | ✅ `/mf/holdings` | ✅ MF tradebook | |
| Available funds | ✅ `/user/margins` | Ledger | |
| Historical trades | ❌ (current day only) | ✅ Tradebook | |
| Realised P/L | computed | ✅ P&L report (cross-check) | |
| Deposits / withdrawals | ❌ | ✅ Funds statement | Deposits template |
| Dividends | ❌ | ✅ Dividends report | |
| Corporate actions | ❌ | ❌ | Template (exchange announcements) |
| Charges (brokerage, STT, GST, stamp, exchange) | ❌ | Contract notes / ledger | `charges` column in tradebook import |
| Historical prices | ✅ historical API (plan-dependent) | ❌ | CSV (e.g. bhavcopy-derived) |
| Index TRI | ❌ | ❌ | niftyindices.com CSV |
| Market cap / AMFI category | ❌ | ❌ | AMFI list + security master |
| Fundamentals, promoter, pledge, governance | ❌ | ❌ | Fundamentals template (state the source) |
| Historical snapshots | — | — | Accumulated by this app on every sync |

## Quality labels
- **VERIFIED** — from a broker API/export without transformation.
- **RECONSTRUCTED** — derived by replaying verified transactions with imported prices.
- **ESTIMATED** — model-based (e.g. SIP without ledger, profit-proxy attribution, index look-through).
- **MISSING** — required input absent; metric withheld.
- **SYNTHETIC** — the clearly-labelled sample data set.

## Reconciliation performed
- Snapshot quantity vs tradebook replay (incl. corporate actions) per holding; broker average vs FIFO average.
- Sells exceeding imported buys (missing history / IPO allotments / off-market transfers).
- Ledger cash vs Kite margins; dividends: report preferred over ledger credits to avoid double counting.
- Price sources disagreeing by > 1% become conflicts; > 40% daily moves flagged (split-adjusted feed detection).
- Unclassified ledger rows listed and excluded from contributions.

## Known limitations
- Kite historical candles may be split-adjusted; valuation uses actual share counts, so either use unadjusted prices or
  enter the corporate action (the Data Quality screen flags suspicious jumps).
- Tradebook has no charges; cost basis excludes them unless a charges column is supplied (warned on import).
- IPO allotments, off-market transfers, and rights entitlements are not in the tradebook — add as BUY rows.
- Bonus/split cost is spread across new shares (portfolio convention), not the income-tax treatment.
- Look-through for non-index ETFs/MFs requires manual weights.
- Sector taxonomy is whatever you import (Console holdings carry a sector column); keep it consistent.
- Rate limiting and analytics caching are per-process (single-instance deployment).
- Drive search at build time found only 2018–2020 Zerodha files (pre-liquidation); they were not imported.
