# Portfolio Intelligence — Zerodha wealth-compounding dashboard

A private, read-only analytics application for an Indian small/micro-cap equity portfolio held at Zerodha.
It answers: what you own, what you really contributed, your true (money- and time-weighted) return, how far
you are from a 40% aspiration, whether the ₹2 lakh monthly SIP was met, where market-cap and sector allocation
deviate from target, where risk concentrates, and how wealth may compound.

**It never places, modifies or cancels orders, and never fabricates data.** Missing inputs are shown as missing.

## Quick start (local)

```bash
npm install                      # Node >= 22.13 (uses built-in node:sqlite)
cp .env.example .env.local       # fill in the values (see below)
npm run hash-password -- "choose-a-dashboard-password"   # paste output into .env.local
npm run dev                      # http://localhost:3000
npm test                         # 100 calculation / import / integrity tests
```

In development without `APP_PASSWORD_HASH` the app runs open with a warning banner; a production build refuses
to serve until it is set.

**Live vs demo mode.** `npm run dev` / `npm start` run in **live** mode (`data/portfolio.db`), which never accepts
synthetic data. To explore first, run `npm run demo` (port 3001): a separate `data/demo.db` where you can load a
fictional sample (`ZZ…` tickers, generated prices). Broker connection and real imports are disabled in demo mode.
If an older database contains synthetic records, Settings → Data quality → *Synthetic-data migration* backs it up and
removes them; imports stay blocked until that is done.

## Connecting Zerodha (what you need to provide)

1. Create a Kite Connect app at <https://developers.kite.trade> (paid subscription; choose the plan that includes
   historical data if you want automatic price history). Set the **Redirect URL** to
   `https://<your-host>/api/kite/callback` (for local use `http://127.0.0.1:3000/api/kite/callback`).
2. Put `KITE_API_KEY` and `KITE_API_SECRET` in `.env.local` (server-side only).
3. Settings → **Login with Zerodha** → you log in on kite.zerodha.com (your password/PIN/TOTP never touch this app).
4. **Sync holdings & funds** (creates an immutable verified snapshot), then optionally **Fetch historical prices**.
5. Kite access tokens expire around 06:00 IST every day and there is no refresh token — log in again daily to sync.

Kite Connect does **not** expose historical trades, the funds ledger, dividends or corporate actions. Import these
from Console (Settings → Import), one CSV per report/financial year:

| Report | Console path | Needed for |
|---|---|---|
| Tradebook (Equity, and MF) | Reports → Tradebook | XIRR, TWR, realised P&L, cost basis, SIP deployment |
| Funds statement (ledger) | Funds → Statement | Verified contributions (deposits/payouts), cash |
| Dividends | Reports → Dividends | Dividend income |
| Holdings | Portfolio → Holdings | Snapshot if not using Kite API |
| Corporate actions | (manual template) | Splits, bonuses, mergers, demergers |
| AMFI market-cap list | amfiindia.com (half-yearly) | Official Large/Mid/Small categories |
| Nifty TRI series | niftyindices.com → Historical data | Benchmarks |
| Fundamentals | your research source (template) | Revenue CAGR, valuation, promoter/pledge, scores |

Re-imports are idempotent; differing records with the same identity become **conflicts** for review, never silent overwrites.

## V2 upgrade
See [CHANGELOG.md](CHANGELOG.md) and [docs/V2_IMPLEMENTATION_REPORT.md](docs/V2_IMPLEMENTATION_REPORT.md) — the
calculation audit, integration status, reconciliation report, security assessment and remaining tasks.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — stack, modules, data model, deployment
- [docs/METRICS.md](docs/METRICS.md) — every metric's definition and validity rules
- [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md) — what comes from where, reconciliation, quality labels, limitations
- [docs/SECURITY.md](docs/SECURITY.md) — security model and operating guidance

Not investment advice. Scores, flags and projections are decision-support, not recommendations.
