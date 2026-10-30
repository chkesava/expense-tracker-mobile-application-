# SPENDLY-643: Market movers (NIFTY 50 gainers and losers)

- **Feature:** SPENDLY-622 (Investing Market Dashboard), story 2 of 5. See the [tracker](SPENDLY-622-market-dashboard.md) and [plan](SPENDLY-622-plan.md) §2.4.
- **Branch:** `feature/SPENDLY-643-market-movers`, cut from `feature/SPENDLY-622-market-dashboard` at `bc37b33c`.
- **State:** Built and tested; awaiting approval to merge into the feature branch.

## Why NIFTY 50, not exchange-wide
No provider for exchange-wide Indian movers is reachable without a key:
- Yahoo's `v7/finance/quote` returns 401 without a crumb.
- Yahoo's predefined `day_gainers` screener ignores `region=IN` and returns US stocks.

So movers are ranked within a pinned, documented universe and labelled "Among NIFTY 50 stocks". "Most active" stays hidden, because spark returns no volume.

## What changed
| File | Change |
|---|---|
| `shared/data/nifty50.ts` (new) | The 50 constituents (NSE symbol + `.NS`, NSE company name) and `NIFTY50_AS_OF = "2026-10-30"`. Generated from NSE's official `ind_nifty50list.csv` (Last-Modified 2026-10-30). All 50 priced on Yahoo spark that day. |
| `shared/utils/marketMovers.ts` (new) | Pure code: `chunk` (≤ 20), `yahooSparkUrl`, `isSparkPayload`, `moverFromSpark`, `moversFromSpark` and `rankMovers`. |
| `netlify/functions/market-overview.ts` | Fetches 3 spark batches (20, 20, 10) alongside the 3 index charts, all in parallel. It fills in `movers`, includes movers in the ETag, and logs coverage. |
| Tests | `marketMovers.test.ts` (20 tests, new). `market-overview.test.ts` now has 22 tests: a spark-aware fetch mock, plus ranking, batch-failure, error-body and movers-only cases. The new files are added to the Firebase-free guard. |

## Rules
- **Price:** the newest non-null close, with its own timestamp as `asOf`. The baseline is `chartPreviousClose`, falling back to `previousClose`. A stock with a missing price, missing time, or a baseline that's missing or zero is dropped.
- **Lists:**
  - Gainers: change % > 0, largest first.
  - Losers: change % < 0, largest fall first.
  - Ties are broken by symbol, and each list has at most 5.
  - A flat day leaves the lists short or empty; they're never padded.
- **Coverage gate:**
  - If fewer than 80% of the 50 priced, movers are `{ available: false }`.
  - The reason is `UPSTREAM` when a batch failed, and `LOW_COVERAGE` otherwise.
  - Losing the 10-stock batch still leaves exactly 80%, so movers stay available. Losing a 20-stock batch hides them.
- **Movers never fail the response.** If every index fails but movers priced, the response is 200 with the movers and an `unknown` status.

## Differences from the plan
- **No clock-based staleness test for the list.** A test that fails 7 months after `NIFTY50_AS_OF` would break `npm test` for unrelated work. The list's age is reported as `movers.universeAsOf`, and the file header says to regenerate it after each NSE rebalance (March and September).
- **Movers-only responses are allowed.** The plan treated "all indices failed" as an error. A response now fails only when there's no data at all.

## Validation
- Focused: `marketMovers`, `market-overview`, `marketOverview` and the Firebase-free guard: 79 tests passed.
- **Live smoke test** of the bundled handler on 2026-10-30, after the close:
  - Coverage 1.0; `asOf` 2026-10-30T09:58:23Z.
  - Gainers: TRENT +5.44%, INDIGO +4.33%, INFY +3.36%, APOLLOHOSP +3.02%, POWERGRID +1.92%.
  - Losers: SHRIRAMFIN −2.13%, NESTLEIND −1.82%, M&M −1.72%, JIOFIN −1.21%, ADANIPORTS −1.18%.
- Full `npm test`: 486 files, 6,536 tests passed. `npm run typecheck:shared` and `npx tsc -p tsconfig.json --noEmit` both exited 0.
- `test:rules` was not run, because no rules changed.

## Upkeep
After each NSE rebalance:
1. Download `https://www.niftyindices.com/IndexConstituent/ind_nifty50list.csv`.
2. Regenerate `shared/data/nifty50.ts` from it.
3. Update `NIFTY50_AS_OF`.
