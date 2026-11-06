# Changelog

## 2.0.0 — V2 upgrade (audit, enhance, complete)

### Priority 0 — financial accuracy (fixes)
- **Cash double-count fixed.** Kite `margins.equity.net` includes collateral margin from pledged holdings (e.g. Liquid BeES). V1 stored it as "cash". V2 stores the full funds object and uses `available.cash` as Zerodha cash; `net` is shown separately as broker buying power. Legacy snapshots are flagged.
- **Ledger cash no longer adds dividends paid to the bank.** Zerodha credits dividends to the linked bank account, not the trading ledger.
- **Weekend-flow bug fixed.** A deposit/trade dated on a weekend after the last business day of the window was dropped from the series. The final as-of date is now always included (found via a non-zero value-bridge residual; regression test added).
- **Ambiguous return labels fixed.** "Portfolio XIRR" (account-level) and the period "money-weighted" figure (securities-only) used different scopes without saying so. All returns now come from a standardised registry with start/end, scope, flows, annualisation and fee/dividend/tax/cash/Liquid BeES treatment.
- **Position-limit denominator** was total invested cost of all assets (incl. ETFs and Liquid BeES). Default is now direct-equity invested cost, configurable, and disclosed everywhere. Compliance snapshots store the denominator used.
- **Synthetic/live separation.** `DATA_MODE=demo` (`npm run demo`) uses a separate `data/demo.db`. The live DB rejects synthetic data; imports and Kite sync are blocked while any synthetic record remains; backup → inventory → purge migration.

### New capital accounting
- Three capital measures (total market value, invested capital by asset type, net external contributions).
- Daily broker-cash ledger, account-level TWR (securities + cash, external flows only), contribution-adjusted 40% reference path.
- Value bridge (opening + contributions − withdrawals + market gain + ledger income − fees = closing) with a reconciliation residual against broker-reported value.
- Combined investment reserve = Zerodha available cash + Liquid BeES market value, with components, buying power and collateral shown separately; explicit "Cash & cash equivalents" class.
- Additive "Why am I ahead or behind?" decomposition: timing + cash drag + Liquid BeES drag + selection vs blended benchmark + market conditions = XIRR − target.

### New modules
- Allocation System A (invested cost) / System B (market value) toggle + comparison; classification history (`capHistory`).
- Capital deployment planner, contribution/deployment/allocation achievement, conviction sizing table and simulator, compliance history.
- Investment pipeline (12 stages, stage history, timeline, thesis & invalidation conditions, forward-looking assessment).
- Liquidity analysis (ADTV, no-trade days, free float, spread, delivery %, circuits, suspensions, SME lot check, score, conservative exit scenarios).
- Promoter & governance monitoring (dilution vs sale from share counts; factual events with sources vs interpretation).
- Business-growth dashboard (cash flow, debt, margins, ROCE, P/E, share count, promoter %), bear/base/bull valuation scenarios.
- Decision journal with automatic entry facts and 6/12/24/36-month reviews; process-effectiveness analytics (lots, initial vs additions, conviction, score, valuation, cap, holding period, benchmark excess, t-stat, sample-size warnings, gain concentration).
- Multibagger enhancements (original vs additional capital, realised/unrealised, per-position XIRR, −30/−50% impact, thesis health).
- Alerts (14 material-change rules, acknowledge/snooze, configurable thresholds; no price-only alerts).
- Tax & costs (indicative STCG/LTCG/slab classification by FY, NRI notes, contract-note charge columns, rates blank by default).
- Portfolio Health header, Simple/Advanced views, grouped navigation with alert badge, contribution calendar, rolling-12-month and year-end SIP summaries, 5/10/15-year projection table with milestone dates.

### Tests
100 automated tests (was 65).
