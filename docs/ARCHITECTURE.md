# Architecture

## Stack
- **Next.js 15 (App Router) + TypeScript**, server components render pages directly from the analytics engine.
- **Tailwind CSS v4** with CSS-variable design tokens (dark/light/system themes). UI primitives are small
  shadcn-style components in `src/components/ui.tsx` (the shadcn CLI was not used to avoid a network-dependent generator).
- **Recharts** for charts (`src/components/charts.tsx`).
- **SQLite via Node's built-in `node:sqlite`** (no native build). JSON-document tables map 1:1 to PostgreSQL `jsonb`.
- **Vitest** for tests.

## Layout
```
src/lib/engine/       pure, I/O-free calculation engine (fully unit-tested)
  positions.ts        FIFO lot ledger, charges, corporate actions, realised P&L
  xirr.ts             XIRR (Newton + bisection), guarded annualisation
  series.ts           daily valuation series, TWR chaining, monthly/calendar/rolling, benchmarks, target path
  sip.ts              monthly contribution tracker (external flows only)
  classify.ts         SEBI/AMFI + custom micro/nano classification, asset-type inference, ETF look-through
  risk.ts             return stats, Sharpe/Sortino/IR, concentration, stress tests, liquidity
  research.ts         revenue CAGR, growth quality, promoter/pledge, scorecard, technicals, multiples, attribution
  projection.ts       deterministic compounding, milestones, Monte Carlo
  rebalance.ts        allocation-gap simulator
  reports.ts          period metrics, monthly & annual reports
  portfolio.ts        aggregator: PortfolioData + Settings + asOf -> PortfolioAnalytics
src/lib/import/       Zerodha Console/Kite CSV parsers + canonical templates
src/lib/kite/         read-only Kite Connect client and pure auth helpers
src/lib/store/db.ts   persistence, conflict-safe inserts, audit log
src/lib/server/       repo (load/import/analytics cache), Kite sync service, HTTP helpers
src/lib/security/     AES-256-GCM, scrypt password hashing, HMAC sessions, rate limiting
src/middleware.ts     authentication gate for every route
src/app/              12 dashboard sections + API routes
tests/                engine, import and portfolio-integrity tests
```

## Data model (collections)
`trades`, `cash` (deposits/withdrawals/dividends/charges), `actions` (corporate actions), `securities` (security
master: asset type, sector, market cap, AMFI rank, look-through), `fundamentals`, `research`, `snapshots`
(immutable holdings snapshots), `prices` (symbol/date/close/volume incl. `IDX:*` benchmarks), `imports`, `conflicts`,
`kv` (settings, encrypted Kite session), `audit`.

## Deployment
Recommended: run on your own machine or a small private VM (single user, daily Kite login, SQLite file on disk),
behind HTTPS (e.g. Caddy) with the environment variables from `.env.example`. Back up `data/portfolio.db`.

Vercel is possible but SQLite on serverless storage is not durable; for Vercel replace `src/lib/store/db.ts` with a
PostgreSQL/Supabase implementation of the same functions (`list/put/insertMany/upsertPrices/kv*/audit`) and use a
single region. Rate limiting is in-memory (single instance). **No deployment has been performed.**
