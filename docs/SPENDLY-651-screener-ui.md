# SPENDLY-651: Screener UI

- **Feature:** SPENDLY-623 (Stock Screener), story 5 of 5. See the [tracker](SPENDLY-623-stock-screener.md) and [plan](SPENDLY-623-plan.md) §3.5.
- **Branch:** `feature/SPENDLY-651-screener-ui`, cut from `feature/SPENDLY-623-stock-screener` at `0abec339`.
- **State:** Built and tested; waiting for the user's review on local Expo web, then merge approval.

## What changed
| File | Change |
|---|---|
| `app/(app)/screener.tsx` (new) | The **/screener** route. It's behind the same investments gate as the Investments hub, with a `PageHeader` back button (falling back to the Markets tab). |
| `components/screener/ScreenerFilterSheet.tsx` (new) | The filter sheet. |
| `components/screener/ScreenerSheets.tsx` (new) | The sort sheet and the saved-screens sheet. |
| `shared/utils/screenerView.ts` (new) | Pure view-model: `screenerView` decides every state, plus row formatting, missing-data notes, input parsing and sort options. |
| `components/markets/MarketsDashboard.tsx` | The Markets tab's "Your stocks" card gets a **Stock screener** row. |
| Route registration | `app/(app)/_layout.tsx` (Stack.Screen), `SUB_SCREEN_ROUTES` and `RESTORABLE_ROUTES` (`/screener`), all with tests. |
| Tests | `screenerView.test.ts` (18, new) and `lib/screenerRoute.test.ts` (4, new), plus additions to `navigation.test.ts` and `routeRestoration.test.ts`. The screener files are added to the Firebase-free guard and to the **read-only guard**, which forbids `usePortfolio()`, `@/services/portfolio`, `addToWatchlist` and similar. |

## Screen
1. **Header:** "Stock screener", with the subtitle "NIFTY 500 by price, change and 52-week range".
2. **Status:**
   - The status line: "Market closed · closing prices of 30 Oct" or "Market open · prices as of 11:30 IST" (never "live").
   - The coverage line: "Among NIFTY 500 stocks · 499 of 500 priced", with "· Refreshing…" while loading.
   - A banner when needed: offline (info); refresh failed (error, tap to retry); provider stale or more than a day old (warning, retry; figures dimmed).
3. **Toolbar** (scrolls sideways on narrow screens): **Filters (n)**, **Sort** (field and ↓/↑), **Screens (n)**, and **Reset** when filters are active.
4. **Active filter chips**, e.g. "Change today ≥ 2%", "Price ₹100–₹1,500", "2 sectors" or "NIFTY 50 only". Tapping one opens the filter sheet.
5. **Results:**
   - A count ("23 stocks match") and notes for stocks left out for missing data ("1 stock has no 52-week data, so it isn't included.").
   - Rows (not cards) show the ticker, name · sector, the sorted field's value when it isn't already shown, the ₹ price and the signed %.
   - Tapping a row opens the read-only stock sheet with its chart (`InstrumentSheet`, from SPENDLY-646).
   - 50 rows at a time, with **Show more (50 of 499)**.
6. **Footer:** "Figures come from daily closing prices (Yahoo Finance) and may be delayed. 52-week figures use closing prices. Market cap, P/E and volume aren't available from this data source."

**Filter sheet:**
- A "NIFTY 50 only" toggle.
- Min/max boxes for each available field, each with its description. `₹`, `,` and `%` are accepted, and an empty box means no bound.
- **Market cap, P/E and volume** are greyed out with a lock and the reason.
- Sector chips with stock counts.
- Nothing applies until **Show results**. The engine validates the draft and errors appear under the field (min above max, a stock above its 52-week high, a negative price, a non-number). **Clear all** resets the draft.

**Sort sheet:** High to low / Low to high, and a field: change today, price, from 52-week high, above 52-week low, 1-year return or name. Stocks with no value always sort last.

**Screens sheet:**
- Save the current filters under a name. The limit is 10 and the counter shows "n of 10". Name errors appear inline.
- Your saved screens: tap to open, ✎ to rename inline, 🗑 to delete with confirmation. They're kept **on this device**.
- Ready-made: Near 52-week high, Up 2% or more today, 30% or more below the 52-week high, NIFTY 50 today.

**Empty states:**
- Loading: skeleton.
- Offline with nothing saved: "You're offline".
- First load failed: "Screener unavailable" with Retry.
- Universe below 80% coverage: "Can't screen right now" with Retry.
- No market API in this build: an explanation.
- No matches: "No stocks match", with **Clear filters**.

## Reviewing locally (Expo web)
Same setup as SPENDLY-645, from this worktree:
```powershell
cd C:\dev\worktrees\spendly-623
npm run build:netlify-fns
node scripts/dev-market-api.js
# .env.local: EXPO_PUBLIC_FIREBASE_EMULATOR_HOST=127.0.0.1, EXPO_PUBLIC_MARKET_API_URL=http://127.0.0.1:8888
npx expo start --web --port 8082
```
Then go to Investments → Markets → **Stock screener**, or open `/screener`.

## Validation
- `screenerView.test.ts` (18) and `screenerRoute.test.ts` (4), plus the navigation, route-restoration and guard additions: 174 focused tests passed.
- `npx tsc -p tsconfig.json --noEmit` and `npm run typecheck:shared` both exited 0. That covers the new route and components.
- **Full `npm test`:**
  - The machine was at 100% CPU from other processes (git, Chrome, Defender, OneDrive). Two default-parallel runs each failed only on wall-clock performance assertions in modules this story doesn't touch: fee detection, journal, calendar, what-if and decision-journal QA, and bill payment.
  - Every one of those passes when run alone.
  - A full run with `--maxWorkers=3` passed: **496 files, 6,728 tests**.
- `test:rules` was not run, because no rules changed.
- **Visual review:** pending, on local Expo web.
