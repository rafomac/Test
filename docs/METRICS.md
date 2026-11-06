# Metric definitions

All money in INR. Dates are IST calendar dates. Day count actual/365.

| Metric | Definition | Validity rules |
|---|---|---|
| Market value | Σ qty × latest price. Qty & price from latest holdings snapshot (Kite/Console), else tradebook replay × latest imported close. | Holdings without a price are shown as MISSING and excluded. |
| Invested capital | Cost basis of currently held lots (FIFO remaining lots, incl. known charges). If snapshot and tradebook quantities disagree, broker average × qty is used and flagged. | Unrealised gains are never treated as invested capital. |
| Unrealised P/L | Value − invested capital. | |
| Realised P/L | FIFO: sale proceeds (net of charges) − cost of matched lots. | Sells exceeding imported buys produce a warning; that portion is excluded. |
| Total return % | (Value + dividends − net invested) ÷ net invested, net invested = Σ buys − Σ sale proceeds. Identity: U + R = V − net invested (tested). | Null if net invested ≤ 0. |
| XIRR (security level) | Buys negative, sale proceeds & dividends positive, terminal market value positive on as-of date. | Requires tradebook and prices for all holdings. |
| XIRR (account level) | Ledger deposits negative, payouts positive, dividends paid to bank positive, terminal = value + cash. Preferred when ledger exists. | |
| TWR | Daily chain-linking: r_t = (V_t + D_t)/(V_{t−1} + F_t) − 1, F_t = net purchases (flows at start of day), D_t = dividends. | Never chained across days where any held symbol lacks a price (≤ 7 days stale allowed). Incomplete periods shown as unavailable. |
| Annualisation | (1 + r)^(365/days) − 1 | Only for periods ≥ 365 days; shorter periods are shown as period returns. |
| Calendar / YTD | TWR over the calendar year; partial years compared to a pro-rata target. | |
| Rolling 12M / 3Y | Compounded complete monthly TWRs, 3Y annualised. | Need 12 / 36 complete months. |
| Target reference path | Σ each dated net purchase × (1 + g)^(years since its date) − dividends likewise. Ahead/Near/Behind: value vs path, ±5% band. | Contributions are compounded, never counted as return. |
| Gap vs target | Best XIRR − target. | Only after ≥ 1 year of history. |
| Volatility, Sharpe, Sortino | From complete monthly TWRs; annualised by √12; risk-free configurable (default 6.5%). | ≥ 12 months required. |
| Tracking difference / error, IR | Portfolio vs benchmark monthly returns over overlapping complete months. | ≥ 12 months; benchmark must be imported. |
| Blended benchmark | Daily-rebalanced weighted daily returns of chosen TRI indices (default Midcap150 20 / Smallcap250 45 / Microcap250 35). | Null on days any component lacks data. |
| Max drawdown | Min over time of index/peak − 1 on the TWR index. | |
| SIP contribution | Ledger deposits − payouts in the month. Internal switches (Liquid BeES → stock, ETF → stock) are not contributions. Without ledger: ESTIMATE = purchases − sale proceeds. | Months before plan start are not judged. |
| Market-cap category | AMFI rank 1–100 Large, 101–250 Mid, 251+ Small (official). Within Small: Micro ₹500–2,000 cr, Nano < ₹500 cr (custom, configurable). Without rank: approximate ₹cr fallbacks. | Exclusive hierarchy; thresholds validated for overlap. ETFs/MFs never classified as direct equity. |
| Position limits | Cost weight = position cost ÷ total invested cost vs conviction limit (3/5/8%, hard 10%). Market-value weight shown separately (informational). | |
| Return multiple | (value + sale proceeds + dividends) ÷ total capital invested (CA-adjusted). | |
| Return attribution | ln(P₁/P₀) = ln(E₁/E₀) + ln(PE₁/PE₀), net profit as EPS proxy. | ESTIMATE; requires profit history covering the purchase FY. |
| Unpledged promoter | promoter % × (1 − pledge as fraction of promoter holding); or promoter % − pledge % of total equity. | Ambiguous pledge columns are rejected on import. |
| Research score | Σ weight × rating/10; missing ratings score 0. Completeness = assessed weight share; confidence = verified-evidence weight share. | Not a buy/sell signal. |
| Projections | Monthly compounding r_m = (1+r)^(1/12) − 1, SIP at start of month, yearly step-up, inflation deflator. Monte Carlo: Student-t (df 4) log returns, regime-switching stress state. | Illustrative; tested against closed-form annuity-due FV. |
| Stress tests | Largest −50%, top-5 −40%, small+micro+nano −50%, micro/nano −70%, market −35% (small −45.5%, Liquid BeES 0%). | Scenarios, not forecasts. |
| Liquidity | Days to exit = value ÷ (10% × 20-day average traded value). | Requires price+volume history. |

## V2 additions

| Metric | Definition | Validity rules |
|---|---|---|
| Total portfolio market value (A) | Securities (stocks, ETFs, MFs, Liquid BeES) + Zerodha **available cash** (`margins.available.cash`). | Collateral margin is never counted as cash. |
| Invested capital (B) | Cost basis of held lots incl. known charges, split by asset type. | |
| Net external contributions (C) | Ledger deposits − payouts. | Requires the funds ledger. |
| Combined investment reserve | Zerodha available cash + Liquid BeES market value. Buying power = broker `net` (authoritative, may include collateral). | Liquid BeES settles T+1; not bank cash. |
| Account XIRR | Deposits (−), payouts (+), bank-paid dividends (+), terminal = securities + available cash. | From first deposit. |
| Account TWR | Daily sub-periods: r = (V_t + B_t)/(V_{t−1} + E_t) − 1, V = securities + broker cash, E = external flows, B = bank-paid income. | Requires ledger + full price coverage. |
| Selected-period XIRR | Account: start value (−), external flows, end value (+); securities: start value, net purchases, dividends, end value. | De-annualised under one year. |
| Value bridge | Opening + contributions − withdrawals + market gain + ledger income − non-trade fees = closing (derived); residual = reported − derived. | Residual ≈ 0 when ledger is complete. |
| Why ahead/behind | (XIRR − TWR_account) + (TWR_account − TWR_securities) + (TWR_securities − TWR_equity) + (TWR_equity − Benchmark) + (Benchmark − Target) = XIRR − Target. | Annualised when window ≥ 1 year, else cumulative vs pro-rata target. |
| Contribution-adjusted reference | Σ external deposits × (1 + g)^(years since deposit). Ahead/Near/Behind within ±5%. | Securities-level path when no ledger. |
| Position-limit weight | Invested cost ÷ denominator (default direct-equity invested cost). Capacity = limit × denominator − cost; self-diluting capacity = (L·D − c)/(1 − L). | Denominator stored on compliance snapshots. |
| Contribution / deployment / allocation achievement | Deposits ÷ target; stock buys ÷ deposits; 1 − ½ Σ |month cap share − guide share|. | |
| Liquidity score | 0–100 from ADTV (log-scaled), exit days at 10% participation, no-trade days, spread, circuit hits, suspensions. Exit impact ≈ σ_daily·√participation + half-spread. | Unknown without volume history (never assumed liquid). |
| Valuation scenarios | Rev_T = Rev_0(1+g)^n; MCap_T = Rev_T × margin × exit P/E; multiple = MCap_T/MCap_0 ÷ (1+dilution)^n. | User assumptions, not fair value. |
| Lot return / excess | (remaining qty × price + FIFO proceeds) ÷ lot cost − 1; excess = minus Smallcap 250 TRI over the same window; t = mean/(sd/√n). | n < 10 insufficient; n < 30 anecdotal. |
