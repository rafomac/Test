# V2 implementation report

## 1. Updated application
All twelve original sections are preserved. Added: Investment Pipeline, Deployment & Sizing, Decision Journal, Process Effectiveness, Alerts, Tax & Costs. Overview and Annual Performance Goal gain a Portfolio Health header and Simple/Advanced views. See `CHANGELOG.md`.

## 2. Changelog
See `CHANGELOG.md`.

## 3. Financial calculation audit

| Area | Finding | Status |
|---|---|---|
| Screenshot figures 14.5% / 17.2% / 12.7% | Different scopes, all correct for their own scope: account XIRR (deposits → securities + cash, from first deposit); securities money-weighted (net purchases → securities only); securities TWR. 14.5 vs 17.2 = cash drag from ₹7 L idle cash. 17.2 vs 12.7 = contribution timing. | Labels fixed; every metric now discloses window/scope/flows; "Why do the numbers differ?" panel quantifies each gap |
| Broker cash | `margins.net` includes collateral (double-counts pledged Liquid BeES) | **Fixed** — `available.cash`; `net` shown as buying power |
| Ledger cash | Added bank-paid dividends | **Fixed** |
| Weekend flows at window end | Dropped | **Fixed** + regression test |
| Position-limit denominator | All-asset invested cost (incl. Liquid BeES/ETFs) | **Fixed** — direct-equity cost by default, configurable, disclosed, stored on compliance snapshots |
| Contributions vs purchases | Already external-only (V1 tests) | Verified again (bridge + SIP tests) |
| Liquid BeES classification | Already excluded from caps/sectors/stock count | Verified; now an explicit "Cash & cash equivalents" class with Zerodha cash |
| XIRR | Excel reference example, 40% SIP case | Verified |
| TWR | Hand-calculated securities and account cases | Verified |
| Annualisation | < 365 days never annualised for comparisons | Verified |
| Calendar-year vs since-inception | Separate metrics; partial years use pro-rata targets | Verified |
| Market-cap allocation | Reconciles to 100% on cost and value | Verified; classification history added |
| Corporate actions | Split/bonus/merger/demerger replay | Verified (V1 tests) |
| Value bridge | Residual 0 on synthetic sample and hand case | Verified |
| Decomposition | Terms telescope exactly to XIRR − target | Verified |

## 4. Zerodha integration status
- **Not connected to your account.** No Kite API key was provided, and this build environment cannot reach `api.kite.trade` (network policy). No live data has been retrieved, and none is shown.
- Implemented: official Kite Connect login (CSRF state), encrypted day-scoped token, read-only holdings / MF holdings / funds (now storing cash, collateral and net separately) / historical candles. No order code exists.
- Not available from Kite Connect: historical trades, ledger, dividends, corporate actions, tax statements → Console CSV importers (plus new contract-note charge columns, governance events, extended fundamentals series).
- Remaining steps for you: create a Kite Connect app, set `KITE_API_KEY`/`KITE_API_SECRET`, register `https://<host>/api/kite/callback`, run the app in live mode on your machine, log in, sync, and import Console reports.

## 5. Data reconciliation report
- Live database: the V1 synthetic sample (15,100 records: 16 securities, 90 trades, 26 cash entries, 9 fundamentals, 6 research records, 1 snapshot, 14,952 prices incl. 5 benchmark series) was backed up to `data/portfolio.pre-synthetic-purge-<timestamp>.db` and removed via the migration workflow. The live database is now empty of synthetic data and shows the onboarding checklist.
- Real-data reconciliation (snapshot ↔ tradebook, ledger cash ↔ broker cash via the bridge residual, dividends report ↔ ledger) runs automatically once real data is imported; results appear on Settings → Data quality.

## 6. Test results
`npm test`: 100 tests across 5 files, all passing (engine, importers, portfolio integrity, V2 capital, V2 modules). Production build succeeds. All 18 sections + company page render without console errors in demo mode (dark and light), with no horizontal scroll at 390 px.

## 7. Security assessment
- Unchanged: scrypt password, HMAC sessions, middleware gate, rate limits, same-origin checks, AES-256-GCM token encryption, read-only broker client.
- Verified on a production build: every new page and API route (journal, alerts, migration, sample, deployment…) returns 401/redirect without a session; no secret values in client bundles.
- New: demo mode cannot connect the broker or import real files; synthetic data cannot enter the live DB; purge always backs up first (atomic transaction); governance events require a source.

## 8. Known limitations
- Liquidity metrics need price **and volume** history; spread, delivery %, free float, circuits and SME lot size must be imported/entered (no free authoritative API is wired in).
- Price impact and risk-adjusted exposure are model estimates (square-root impact).
- Return attribution by market cap/sector uses current classification for closed positions; the "selection" term includes sector and cap tilts (no Brinson split without per-category benchmarks).
- Process effectiveness: dividends are not allocated to lots; mergers/demergers are not traced across symbols; conviction "at purchase" is only exact when journalled.
- Tax: indicative classification only; rates blank by default; NRI TDS/DTAA not computed; MF orientation must be confirmed.
- Kite historical candles may be split-adjusted (flagged by jump detection).
- Single-instance deployment (in-memory rate limits, SQLite).

## 9. Remaining tasks
1. Your authorisation + Console exports (section 4) — then review reconciliation and bridge residual.
2. Optional data feeds for liquidity (delivery %, spread, free float) and fundamentals.
3. Optional: Postgres/Supabase storage adapter if you want hosted deployment.
4. Optional: scheduled daily sync reminder (Kite requires a manual daily login).

## 10. Deployment
See `README.md` and `docs/ARCHITECTURE.md`. Recommended: your own machine or a private VM, live mode, HTTPS, environment variables from `.env.example`, regular backups of `data/portfolio.db` (backups are written next to it). **Nothing has been deployed.**
