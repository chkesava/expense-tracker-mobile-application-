# SPENDLY-650: Screener client (service, hook, offline snapshot)

- **Feature:** SPENDLY-623 (Stock Screener), story 4 of 5. See the [tracker](SPENDLY-623-stock-screener.md) and [plan](SPENDLY-623-plan.md).
- **Branch:** `feature/SPENDLY-650-screener-client`, cut from `feature/SPENDLY-623-stock-screener` at `366fa1d4`.
- **State:** Built and tested; awaiting approval to merge into the feature branch.

## What changed
| File | Change |
|---|---|
| `services/marketDataService.ts` | A shared private helper, `fetchCheckedJson`, now does the work: base URL, timeout, typed `MarketDataError` codes, MALFORMED on a wrong shape, and caller cancellation passed through. `fetchMarketOverview` now uses it with **unchanged behaviour** (its existing tests pass), and the new **`fetchScreenerUniverse()`** uses it with a 20 s timeout. |
| `shared/utils/marketOverview.ts` | `classifyFreshness` and `freshnessLabel` accept any `FreshnessSource` (fetch time, stale flag, status) and an optional "stale while open" threshold. The defaults are unchanged, so the Markets tab behaves the same. |
| `shared/utils/screenerUniverse.ts` | Adds `isScreenerUniverse` (a shape check), `screenerFreshness` (stale while open after **10 min**, because the server refreshes every 5), `screenerFreshnessLabel`, `istDayLabel`, `screenerPollMs` (every **5 min** only while open) and `screenerStaleMs`. |
| `lib/screenerUniverseCache.ts` (new) | The last good universe in AsyncStorage (`spendly.screenerUniverse.v1`, about 160 KB), with a memory fallback. Stale copies and **unavailable universes** (no rows) are never saved over a good copy. |
| `hooks/useScreenerUniverse.ts` (new) | `useScreenerUniverseCacheReady` and `useScreenerUniverse`, which follows `useMarketOverview`. |
| Tests | New tests in `screenerUniverse.test.ts`, `marketDataService.test.ts` and `screenerUniverseCache.test.ts` (new). The cache and the hook are added to the Firebase-free guard. |

## Labels
A daily bar is stamped with the session's **open** (09:15 IST). Its time says nothing about when the price was taken, so the screener's line doesn't reuse the Markets "as of HH:MM" wording:

| Situation | Label |
|---|---|
| Closed | "Market closed · closing prices of 30 Oct" |
| Open, fresh | "Market open · prices as of 11:30 IST" (the fetch time) |
| Open, more than 10 min old, or server-stale | "Delayed · prices from 11:30 IST" |
| Offline | "Offline · showing prices from 16:00 IST" |
| More than a day old | "Out of date · closing prices of 30 Oct" |

It never says "live".

## Hook
- Query key `['screener-universe', 1]`.
- It starts from the on-device copy (`initialDataUpdatedAt` is `fetchedAt`).
- `staleTime` is the server's fresh lifetime: 5 min while open, up to 6 h while closed.
- It polls every 5 min only while the market is open and the screen is focused.
- It retries once, but not after THROTTLED or MALFORMED.
- It returns `data`, `isOffline`, `fromSnapshot`, `freshness`, `label` and `errorMessage`. Filtering and sorting stay on the device (`shared/utils/screener.ts`).
- No Firestore.

## Validation
- Focused: `screenerUniverse`, `marketOverview`, `marketDataService`, both caches and the guard: **131 tests passed**. That includes every existing Markets test, so the refactor is safe.
- The hook isn't unit-tested, following the repo convention; its decisions are the tested helpers.
- Full `npm test`: **494 files, 6,699 tests passed** on the first run. `npm run typecheck:shared` and `npx tsc -p tsconfig.json --noEmit` both exited 0.
- `test:rules` was not run, because no rules changed.
