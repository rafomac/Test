# Security

- **Read-only broker integration.** The Kite client implements only session exchange/invalidation and GET endpoints.
  There is no order, GTT, alert or fund-transfer code.
- **No Zerodha credentials.** Login happens on kite.zerodha.com; the app receives a `request_token` and exchanges it
  server-side using `checksum = SHA-256(api_key + request_token + api_secret)`. CSRF protection via a random `state`
  passed through `redirect_params` and verified against an httpOnly cookie.
- **Secrets at rest.** The access token is encrypted with AES-256-GCM (`ENCRYPTION_KEY`) and discarded on expiry
  (~06:00 IST) or a 403 TokenException. API key/secret live only in server environment variables; a build scan
  confirms no secret values in client bundles.
- **Dashboard auth.** scrypt-hashed password (`APP_PASSWORD_HASH`), HMAC-signed httpOnly SameSite=Lax session cookie
  (12 h), middleware gate on every page and API route, login rate limit (5 / 15 min / IP), same-origin checks on
  every state-changing API, security headers (frame-deny, nosniff, referrer policy).
- **Logging.** The audit log records actions and counts only; error messages are scrubbed of tokens.
- **Backups.** Back up `data/portfolio.db` (contains your portfolio, not credentials in plaintext). Keep `.env.local`
  out of git (already ignored).
- Always serve over HTTPS when not on localhost (cookies are `Secure` in production).
