# SPENDLY-522: Stop depending on the legacy site for market prices and Ganesh phone auth

## Symptom
On spendly-share.netlify.app, holdings showed no live prices. The console said `Fetch API cannot load https://kesavaexpensetracker.netlify.app/api/stock?symbol=… Refused to connect because it violates the document's Content Security Policy`.

## Root cause
- `services/marketDataService.ts` fell back to `EXPO_PUBLIC_APP_URL`, the legacy Vite site from the archived repo `chkesava/expense-tracker`. That site was the only host of `/api/stock`, `/api/mutual-funds` and `/api/crypto`.
- The SPENDLY-21 CSP in `scripts/build-web.js` allows only `'self'` plus Google, Firebase and Supabase in `connect-src`.
- The legacy functions also send no `Access-Control-Allow-Origin`, so widening the CSP would only have produced a CORS error.
- Native builds have neither restriction, so Android kept working, but only while the legacy site stayed up.

Found on the way: native Ganesh phone sign-in opened `${EXPO_PUBLIC_APP_URL}/ganesh-phone-auth`. On the legacy site that path serves the old "Vault" app, not the reCAPTCHA bridge (`app/ganesh-phone-auth.tsx`, registered only in the Ganesh build at `/ganesh`). So native phone sign-in could not complete.

## Fix
**Market functions now ship with this repo:**
- `netlify/functions/stock.ts`, `mutual-funds.ts` and `crypto.ts`, with shared plumbing in `_market.ts`.
- They are pure Netlify v1 handlers bundled by `scripts/bundle-netlify-fns.js` and load-checked in `web-deploy.yml`.
- The quote shaping lives in `shared/utils/marketQuotes.ts`. The response shapes are unchanged (`StockQuoteDTO`, `MutualFundQuoteDTO`, `{ success, quotes }`).
- Stock quotes use Yahoo's public v8 chart endpoint instead of `yahoo-finance2`. It returns the same price, previous close, day range, name and exchange with no key and no dependency (v4 pulls about 70 packages, including Express and an MCP SDK). Mutual funds still use mfapi.in (`/latest`, then the full history), and crypto still uses CoinGecko.
- `_redirects`: `/api/stock`, `/api/mutual-funds` and `/api/crypto` map to `/.netlify/functions/*`, above the catch-all. The CSP is unchanged.

**Callers:**
- Web uses the page's own origin.
- Native uses `EXPO_PUBLIC_SHARE_URL`, falling back to `EXPO_PUBLIC_APP_URL` only for a build without one.
- Native Ganesh phone sign-in opens `${EXPO_PUBLIC_SHARE_URL}/ganesh/ganesh-phone-auth` (`shared/utils/ganeshPhoneAuthUrl.ts`).

**Not ported:** the legacy `historical`, `twelve-data`, `app-distribution-invite` functions, mutual-fund search (`?q=`) and crypto `?list=1`. Nothing in this app calls them.

## Tests
- `shared/utils/marketQuotes.test.ts`: symbol normalization and the stock, mutual-fund and crypto mapping.
- `netlify/functions/market.test.ts`: the handlers' status codes, retry and timeout, and the mfapi fallback. `vitest.config.ts` now includes `netlify/**/*.test.ts`.
- `services/marketDataService.test.ts`: web uses the page origin, native uses the share URL, and the legacy URL is only a fallback.
- `shared/utils/ganeshPhoneAuthUrl.test.ts`.
- The bundled functions loaded and returned live quotes for KPITTECH, HDFCBANK.NS, scheme 120503 and bitcoin/ethereum, and a 404 for an unknown ticker.
- `npm test` (5403 passed), `typecheck:shared` and full `tsc` are clean.

## After merge
1. **Deploy Web (Netlify)** first, so the functions exist on spendly-share. Check that `https://spendly-share.netlify.app/api/stock?symbol=KPITTECH.NS` returns JSON.
2. **Release — Expense**: native prices switch to spendly-share.
3. **Release — Ganesh**: native phone sign-in uses the working bridge. Confirm that `spendly-share.netlify.app` is in Firebase Auth's authorized domains; web Ganesh phone sign-in already needs it.
4. No Firestore rules change.

## Retiring the legacy site
- APKs built before this change still call the legacy site for prices. Keep it serving until those are updated.
- The legacy site also runs two **daily scheduled jobs** against the shared Firebase project: `sip-execute` and `credit-card-bills` (03:00 UTC). They overlap with on-device logic here (`services/sip/executeSips.ts`, `services/creditCardBills/autoBill.ts`) and were not ported. Decide whether they are still wanted before the site is switched off, because turning it off stops them.
