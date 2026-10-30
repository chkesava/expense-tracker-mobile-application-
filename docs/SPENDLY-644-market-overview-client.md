# SPENDLY-644: Market overview client (service, hook, offline snapshot)

- **Feature:** SPENDLY-622 (Investing Market Dashboard), story 3 of 5. See the [tracker](SPENDLY-622-market-dashboard.md) and [plan](SPENDLY-622-plan.md) §2.5.
- **Branch:** `feature/SPENDLY-644-market-overview-client`, cut from `feature/SPENDLY-622-market-dashboard` at `a216b52d`.
- **State:** Built and tested; awaiting approval to merge into the feature branch.

## What changed
| File | Change |
|---|---|
| `shared/utils/marketOverview.ts` | Adds pure client helpers: `formatIstTime`, `classifyFreshness` (fresh, stale or expired), `freshnessLabel`, `overviewPollMs`, `overviewStaleMs`, `overviewErrorCopy` and `isMarketOverview` (a shape check). |
| `services/marketDataService.ts` | Adds `fetchMarketOverview()`. It returns `null` only when no market API base URL is set. Failures throw `MarketDataError` with the server's code: THROTTLED, TIMEOUT, MALFORMED, or none for a bare 5xx. Its own timeout becomes `TIMEOUT`; a caller's cancellation passes through unchanged. `MarketDataError.code` is widened to cover both endpoints. |
| `lib/marketOverviewCache.ts` (new) | The last good payload in one AsyncStorage item (`spendly.marketOverview.v1`). It's read once per session. A copy marked `stale` isn't saved, an older copy never replaces a newer one, and storage failures fall back to memory. |
| `hooks/useMarketOverview.ts` (new) | `useMarketOverviewCacheReady()` and `useMarketOverview()`, both thin wrappers over the helpers above (see Behaviour). |
| Tests | `marketOverview.test.ts` gains 16 tests (41 in total). `marketDataService.test.ts` gains 5, and `marketOverviewCache.test.ts` (new) has 6. The cache and the hook are added to the Firebase-free guard. |

## Behaviour
- **Freshness:**
  - Expired: the copy was fetched more than 24 h ago.
  - Stale: the server marked it stale, or the market is open and the copy is more than 3 min old.
  - Fresh: anything else. A closing price stays fresh overnight, because it's still the latest price.
- **Label:**
  - "Market open · as of 10:15 IST" or "Market closed · as of 15:31 IST".
  - "Delayed · showing …", "Offline · showing …" or "Out of date · last seen 30 Oct, 10:15 IST".
  - The date is added when the time isn't today in IST.
  - IST is computed by hand, not with `Intl`. The label never says "live".
- **The device works out open or closed** from the session window and last trade in the payload. A copy saved while the market was open reads "closed" once the session ends, and polling stops.
- **Hook:** `['market-overview', 1]`.
  - It starts from the on-device copy, with `initialDataUpdatedAt` set to `fetchedAt`.
  - `staleTime` is the server's fresh lifetime: 60 s while open, up to 15 min while closed.
  - It polls every 60 s only while the market is open and the screen is focused.
  - It retries once, but not after THROTTLED or MALFORMED.
  - It returns `data`, `isOffline` (from React Query's `onlineManager`, which is tied to NetInfo), `fromSnapshot`, `freshness`, `label` and `errorMessage`. Data can stay on screen alongside an error.
- **No Firestore**, and nothing is called on Yahoo directly.

## Validation
- Focused runs: `marketOverview` 41 tests, `marketDataService` 20, `marketOverviewCache` 6. All passed.
- Full `npm test`: 487 files, 6,565 tests passed. `npm run typecheck:shared` and `npx tsc -p tsconfig.json --noEmit` both exited 0.
- `test:rules` was not run, because no rules changed.
- There's no hook test. The repo doesn't unit-test hooks (as with `useStockHistory`), so all of the hook's decisions live in the tested pure helpers. SPENDLY-645 uses the hook on screen, and you review it there.
