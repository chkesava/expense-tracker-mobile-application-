# SPENDLY-642: Market overview API (indices and market status)

- **Feature:** SPENDLY-622 (Investing Market Dashboard), story 1 of 5. See the [tracker](SPENDLY-622-market-dashboard.md) and [plan](SPENDLY-622-plan.md).
- **Branch:** `feature/SPENDLY-642-market-overview-api`, cut from `feature/SPENDLY-622-market-dashboard` at `3971ecbc`.
- **State:** Built and tested; awaiting approval to merge into the feature branch.

## What changed
| File | Change |
|---|---|
| `shared/utils/marketQuotes.ts` | `normalizeStockSymbol` passes a symbol starting with `^` through unchanged. Before, `^NSEI` became `^NSEI.NS`, which Yahoo doesn't know. Every other symbol is unchanged. |
| `shared/types/market.ts` | Adds `MarketOverviewDTO`, `IndexQuoteDTO`, `MarketStatusDTO`, `MoversDTO`/`MoverDTO` (filled in by 643) and the error DTO. |
| `shared/utils/marketOverview.ts` (new) | Pure code: index normalisation from chart `meta`, `marketStateAt`, `marketStatusFromReadings`, `overviewFreshSeconds` and `buildMarketOverview`. |
| `shared/utils/marketOverview.fixtures.ts` (new) | Test-only chart payloads, using values from a live probe on 2026-10-30. |
| `netlify/functions/market-overview.ts` (new) | `GET /api/market-overview`. Fetches three charts in parallel, with caching (see below). |
| `scripts/bundle-netlify-fns.js`, `scripts/build-web.js`, `.github/workflows/web-deploy.yml` | Bundle the function, route it, and smoke-load it on deploy. |
| Tests | `marketOverview.test.ts` (25 tests, new) and `market-overview.test.ts` (17 tests, new). `market.test.ts` and `stock-history.test.ts` each gain an index-symbol test, and `marketQuotes.test.ts` gains a passthrough test. The two new files are added to the `stockHistoryFirebaseFree` guard. |

## Behaviour
- **Indices:** an index is shown only when Yahoo gives a finite price, a previous close above 0 and a trade time. Otherwise it's left out; nothing is filled in. Display names are ours ("SENSEX", not "S&P BSE SENSEX").
- **Status:** `open` only when now is inside `currentTradingPeriod.regular` **and** the newest trade is at or after the session start. On a holiday the window is still today's, but no trade has printed since it began, so the status is `closed`. With no index data the status is `unknown`. The DTO carries the session window and last trade, so the app (SPENDLY-644) can work the state out again against its own clock.
- **Partial failure:** if some indices fail, the response is still 200 with the ones that worked. Only all three failing is an error: 429 THROTTLED, 504 TIMEOUT, or 502 UPSTREAM or MALFORMED.
- **Caching:**
  - The CDN keeps a copy fresh for 60 s while the market is open, and up to 15 min while it's closed, never past the next session's start. Past that, it serves the stale copy while revalidating, for up to 5 min.
  - The memory copy serves fresh hits, dedupes concurrent misses, and stands in for up to 24 h when Yahoo fails. A stand-in is sent with `stale: true`, the market state worked out again, and a 60 s CDN lifetime.
  - Errors are sent with `no-store`.
- **Movers:** returned as `{ available: false, reason: "DISABLED" }` until SPENDLY-643.
- **No Firestore.** The guard test covers the new files.

## Differences from the plan
- **No `Netlify-Vary` header.** The endpoint takes no parameters. A junk query string could make extra CDN entries, but each instance's memory copy still answers within the fresh window, so Yahoo isn't hit for each request.
- **Not changed in this story:** `isIndianListing` in `stockHistory.ts` doesn't treat `^NSEI`, `^BSESN` or `^NSEBANK` as Indian. Their chart history would therefore use the shorter "open" TTLs. That's harmless, and it's left for SPENDLY-646, which first charts an index.

## Validation
- `npx vitest run` on the market, function and script tests: 33 files, 319 tests passed.
- The function bundled with `node scripts/bundle-netlify-fns.js` and loaded with `require()`.
- **Live smoke test** of the bundled handler against Yahoo on 2026-10-30, after the close:
  - Status 200, state `closed`, CDN lifetime `s-maxage=900`.
  - NIFTY 50 23,053.10 (+1.56%), SENSEX 74,459.53 (+1.66%), NIFTY BANK 54,686.95 (+0.77%). Each carried its own `asOf` and INR.
- Full `npm test`: 485 files, 6,509 tests passed. `npm run typecheck:shared` and `npx tsc -p tsconfig.json --noEmit` both exited 0.
- `test:rules` was not run, because no rules changed.

## Deploy
This story is not live until a Netlify web deploy, which the user decides on (Netlify credits are low). Until then the Markets tab (SPENDLY-645) will show "unavailable". There are no rules, index or data changes.
