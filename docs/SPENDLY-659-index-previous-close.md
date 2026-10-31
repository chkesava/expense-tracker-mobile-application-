# SPENDLY-659: Markets tab showed the wrong daily change for indices

- **Type:** Bug, High. Found while building SPENDLY-656 (watchlist quotes).
- **Branch:** `fix/SPENDLY-659-index-previous-close`, cut from `main` at `b77b1759`.
- **Impact:** SPENDLY-622 is on `main` (PR #245) but **not deployed**, so no user has seen it. **This must merge before the next Netlify web deploy.**

## What was wrong
The Markets tab computed each index's daily change from Yahoo's chart `meta.chartPreviousClose`. On 30 Oct 2026 that field held the close from **two sessions earlier** for Indian indices:

| Index | Markets tab showed | Actual (30 Oct vs 29 Oct close) |
|---|---|---|
| NIFTY 50 | +354.30 (+1.56%) | **+116.35 (+0.51%)** |
| SENSEX | +1,213.53 (+1.66%) | **+308.49 (+0.42%)** |
| NIFTY BANK | +419.55 (+0.77%) | **−222.70 (−0.41%)**, the wrong direction |

The values were verified against Yahoo's own 5-day daily closes (26–30 Oct). The 622 test fixtures had captured the stale values, which is why the tests didn't catch it.

## The fix
- `/api/market-overview` now requests each index with **`range=5d&interval=1d`**. The `meta` still has the price, day range, session and trade time, and the payload adds the daily closes.
- **The previous close is the daily close before the latest trade's session** (`dailyPreviousClose`):
  - normally that's the second-to-last bar;
  - if the provider hasn't added a bar for the latest trade's session yet, it's the last bar;
  - missing closes are skipped, so a gap in the newest bar still gives the right previous session.
- **`chartPreviousClose` is no longer used for indices.** An index without daily history is **hidden**, never shown with a guessed change.
- `indexReadingFromMeta(meta, index, previousClose)` now takes the previous close explicitly. The new `indexReadingFromChart(payload, index)` combines the two.
- Changes are rounded to 4 decimals.

## What was checked and deliberately not changed
- **Movers (SPENDLY-643, stocks)** stay on Yahoo's 1-day `chartPreviousClose`:
  - It matched the real previous close for every stock checked (TCS, RELIANCE, TRENT, INFY, M&M).
  - A 5-day series was tried and rejected for stocks: Yahoo's 5-day data was **missing M&M's 30 Oct close**, which would have priced M&M at the previous day's close (+0.70% instead of −1.72%).
  - A test pins this choice and documents why.
- `yahooSparkUrl` gains a `"5d"` option, unused on `main`. The text is identical to the SPENDLY-656 change on the watchlists branch, so the two merge cleanly.
- **Holdings quotes (`/api/stock`)** are unchanged. They price stocks only, where `chartPreviousClose` has been reliable.

## Tests
- `marketOverview.fixtures.ts`: indices now carry their **real 26–30 Oct daily closes**, and the **stale `chartPreviousClose` values are kept on purpose** to prove they're ignored.
- `marketOverview.test.ts`:
  - all three indices give the right 30 Oct numbers;
  - no daily history means hidden;
  - the latest-session bar not there yet means the last bar is used;
  - the M&M-style missing newest close is handled;
  - holes are skipped.
- `marketsView.test.ts`: the index card now reads "+116.35 (+0.51%)", including the accessibility label.
- `market-overview.test.ts`: indices are requested with `range=5d`, and movers stay on `range=1d`.
- `marketMovers.test.ts`: pins the 1-day previous close for stocks (the real M&M figures).
- **Live** (bundled handler, 31 Oct 2026):
  - NIFTY 50 23,053.10, previous close 22,936.75, **+0.51%**;
  - SENSEX **+0.42%**;
  - NIFTY BANK **−0.41%**;
  - the losers list is unchanged (SHRIRAMFIN −2.13%, NESTLEIND −1.82%, M&M −1.72%, …).
- **`npm test` (`--maxWorkers=3`): 506 files, 6,776 tests passed.** `npm run typecheck:shared` and `npx tsc -p tsconfig.json --noEmit` both exited 0.
- `test:rules` was not run, because no rules changed.
