# SPENDLY-522: Web market prices blocked by the CSP

## Symptom
On spendly-share.netlify.app, holdings showed no live prices. The console said `Fetch API cannot load https://kesavaexpensetracker.netlify.app/api/stock?symbol=… Refused to connect because it violates the document's Content Security Policy`.

## Root cause
- `services/marketDataService.ts` falls back to `EXPO_PUBLIC_APP_URL`, the legacy Vite site. That site is the only host of `/api/stock`, `/api/mutual-funds` and `/api/crypto`.
- The SPENDLY-21 CSP in `scripts/build-web.js` allows only `'self'` plus Google, Firebase and Supabase in `connect-src`.
- The legacy functions send no `Access-Control-Allow-Origin`, so adding the origin to the CSP would only turn the CSP error into a CORS error.
- Native builds have neither a CSP nor CORS, so Android was unaffected. Web prices only worked while the web app was served from the legacy site itself.

## Fix
- `scripts/build-web.js` writes `/api/*  https://kesavaexpensetracker.netlify.app/api/:splat  200` into `_redirects`, above the `/*` catch-all. Netlify proxies the request on the server, so the browser stays same-origin.
- `marketDataService` uses `window.location.origin` on web. An explicit `EXPO_PUBLIC_MARKET_API_URL` or `extra.marketApiUrl` still wins, and native still uses `EXPO_PUBLIC_APP_URL`.
- The CSP is unchanged.

## Tests
- `services/marketDataService.test.ts`: web uses the page origin, native uses the app URL.
- `npm test` (5377 passed), `typecheck:shared` and full `tsc` are clean.

## After merge
Web only: run **Deploy Web (Netlify)** on main. No rules deploy and no Android release are needed. Then check that `https://spendly-share.netlify.app/api/stock?symbol=KPITTECH.NS` returns JSON, not HTML.

The proxy depends on the legacy site staying up, as native builds already do. Moving the market functions into this repo would remove that dependency.
