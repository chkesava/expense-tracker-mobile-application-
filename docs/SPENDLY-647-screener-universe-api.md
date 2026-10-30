# SPENDLY-647: Screener universe API (NIFTY 500)

- **Feature:** SPENDLY-623 (Stock Screener), story 1 of 5. See the [tracker](SPENDLY-623-stock-screener.md) and [plan](SPENDLY-623-plan.md) §1 and §3.2.
- **Branch:** `feature/SPENDLY-647-screener-universe-api`, cut from `feature/SPENDLY-623-stock-screener` at `1448171d`.
- **State:** Built and tested; awaiting approval to merge into the feature branch.

## What changed
| File | Change |
|---|---|
| `shared/data/nifty500.ts` (new) | 500 constituents (symbol + `.NS`, NSE company name, NSE industry, `nifty50` flag) and `NIFTY500_AS_OF = "2026-10-30"`. Generated from NSE's official `ind_nifty500list.csv` (Last-Modified 2026-10-30), which has 501 rows. The placeholder row `DUMMYHEG` (used during a corporate action) is left out, and all 50 NIFTY 50 stocks are flagged. |
| `shared/types/market.ts` | Adds `ScreenerRowDTO` and `ScreenerUniverseDTO` (available, or unavailable with a reason). |
| `shared/utils/screenerUniverse.ts` (new) | Pure helpers: `dailyCloses`, `screenerRowFromSpark`, `screenerStatus`, `screenerFreshSeconds` and `buildScreenerUniverse`. |
| `shared/utils/marketMovers.ts` | `yahooSparkUrl` gains an optional `range` argument (`"1d"` by default, so movers are unchanged). |
| `netlify/functions/screener-universe.ts` (new) | `GET /api/screener-universe`: 25 spark calls (`range=1y`, ≤ 20 stocks each, at most 6 in flight). |
| Registration | `scripts/bundle-netlify-fns.js`, the `scripts/build-web.js` `_redirects`, the `web-deploy.yml` smoke test and `scripts/dev-market-api.js`. |
| Tests | `screenerUniverse.test.ts` (17 tests, new) and `screener-universe.test.ts` (12, new). The new files are added to the Firebase-free guard. |

## Rules
- **Price** is the newest daily close, and `asOf` is its bar time.
- **Daily change** comes from the **last two closes**. In a 1-year spark payload, `chartPreviousClose` is the close *before the year began*, not yesterday's, so it isn't used. A live check confirmed this: RELIANCE −2.5 (−0.21%) matched the Markets tab's figure for the day.
- **52-week figures and 1-year return:**
  - 52-week high and low are the highest and lowest daily close in the last 365 days, labelled "closing prices" (they can differ slightly from intraday highs and lows).
  - From those come the % below the 52-week high, the % above the 52-week low, and the 1-year return.
  - These figures only exist when the series spans **at least 358 days**. A stock listed under a year ago gets `null`, never a "since listing" figure.
- **Null closes** in the series are skipped. A stock Yahoo doesn't return stays in the list **unpriced**, never dropped silently.
- **Rounding:** derived figures are rounded to 4 decimals.
- **Coverage gate:** if fewer than 80% of the 500 priced, the universe is `available: false`. The reason is `UPSTREAM` if a batch failed, otherwise `LOW_COVERAGE`. It's never shown as a partial universe.
- **Status:** today's 09:15–15:30 IST session plus the newest close feed `marketStateAt`. It reads "open" only after today's session has printed, so weekends and holidays read closed.
- **Caching:**
  - CDN: 5 min while open; 6 h while closed, but never past the next open. After that, stale-while-revalidate for 10 min.
  - Memory: fresh hits, in-flight dedupe, and stale-if-error for 24 h. A stand-in is sent with `stale: true` and the market state worked out again.
  - If every batch fails with nothing cached, the response is 502 with `no-store`.
- **Not provided:** market cap, P/E and volume. There's no keyless batch source for them (see plan §1). The engine story (648) shows them as disabled.
- **No Firestore**, and the app never calls Yahoo.

## Validation
- `screenerUniverse.test.ts` and `screener-universe.test.ts`: 29 tests passed.
- **Live smoke test** of the bundled handler on 2026-10-30, after the close:
  - 200 in **1.5 s**, 158 KB before compression;
  - **499 of 500 priced** (only `BAGMANE.NS`, a new REIT Yahoo doesn't carry, is missing);
  - status `closed`, CDN `s-maxage=21600`.
  - 19 recent listings (e.g. GROWW, MEESHO, LENSKART, PINELABS) correctly have no 52-week figures or 1-year return.
- `npm run typecheck:shared` and `npx tsc -p tsconfig.json --noEmit` both exited 0.
- **Full `npm test`:**
  - The first run had 4 timing failures in unrelated modules (`feePatterns`, `goalFundingOptimizer`, `retiredSummaries`, `calendarQuery`) while the machine was busy. Run alone, they all pass (39/39).
  - The re-run passed: **490 files, 6,633 tests**.
- `test:rules` was not run, because no rules changed.

## Upkeep
After each NSE rebalance (March and September):
1. Regenerate `shared/data/nifty500.ts` from `https://www.niftyindices.com/IndexConstituent/ind_nifty500list.csv`, dropping `DUMMY*` rows and flagging NIFTY 50 members.
2. Update `NIFTY500_AS_OF`.
