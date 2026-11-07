# Going live on your own computer

1. Install **Node.js 22 LTS** (nodejs.org) and **Git**.
2. Get the code:
   ```bash
   git clone https://github.com/rafomac/Test.git portfolio
   cd portfolio
   git checkout claude/zerodha-portfolio-dashboard-d9k67x
   npm install
   ```
3. Create `.env.local` in the `portfolio` folder (copy `.env.example`) and fill it in:
   ```bash
   npm run hash-password -- "choose-a-dashboard-password"   # → APP_PASSWORD_HASH=...
   node -e "console.log('SESSION_SECRET='+require('crypto').randomBytes(48).toString('base64'))"
   node -e "console.log('ENCRYPTION_KEY='+require('crypto').randomBytes(32).toString('base64'))"
   ```
4. At https://developers.kite.trade create an app. The free **Personal** API is enough for holdings, mutual funds,
   funds/cash and everything built from your Console imports (XIRR, SIP tracking, allocation, research). It has no
   historical candles: prices then accumulate from each daily Sync, and past prices can be imported as CSV.
   The paid Connect plan adds automatic historical prices (needed for full-history TWR, 200 DMA, liquidity from volume).
   Redirect URL: `http://127.0.0.1:3000/api/kite/callback`. Put its API key and secret in `.env.local`
   as `KITE_API_KEY=` and `KITE_API_SECRET=`.
5. Start it:
   ```bash
   npm run build
   npm start
   ```
   Open **http://127.0.0.1:3000** (use 127.0.0.1, matching the redirect URL) and sign in with your dashboard password.
6. Settings → **Login with Zerodha** → **Sync holdings & funds** → **Fetch historical prices**.
7. Settings → Import, once: Console tradebook (each financial year), funds statement (ledger), dividends.
   Optional: AMFI list, Nifty TRI series, fundamentals.
8. Daily: `npm start`, log in to Zerodha again (tokens expire ~6 AM IST), Sync.
9. Back up `data/portfolio.db` regularly. Never share `.env.local`.
