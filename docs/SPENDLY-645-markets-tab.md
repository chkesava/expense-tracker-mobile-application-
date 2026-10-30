# SPENDLY-645: Markets tab UI

- **Feature:** SPENDLY-622 (Investing Market Dashboard), story 4 of 5. See the [tracker](SPENDLY-622-market-dashboard.md) and [plan](SPENDLY-622-plan.md) §2.6.
- **Branch:** `feature/SPENDLY-645-markets-tab`, cut from `feature/SPENDLY-622-market-dashboard` at `ecab67f6`.
- **State:** Built and tested; waiting for the user's UI review on local Expo web, then approval to merge.

## What changed
| File | Change |
|---|---|
| `shared/config/navigation.ts` | Adds `markets` to `INVESTMENT_HUB_TAB_IDS`, between Investments and Stocks. Adds `PORTFOLIO_SUB_TAB_IDS` and `parsePortfolioSubTab`. |
| `app/(app)/investments.tsx` | Adds the **Markets** tab (Activity icon) and `?tab=markets`. Adds `?tab=portfolio&sub=watchlist|alerts|…` to open a Stocks sub-tab. Markets shortcuts switch to Stocks on that sub-tab. |
| `components/portfolio/PortfolioDashboard.tsx` | Adds an optional `initialSubTab` prop. With no prop, it opens on Holdings as before. |
| `shared/utils/marketsView.ts` (new) | Pure view-model: `marketsView` decides every state, and `indexView`/`moverView` and the formatters prepare the text. |
| `components/markets/MarketsDashboard.tsx` (new) | The screen. It uses `useMarketOverview`, plus a 30 s clock so "open" turns to "closed" at 15:30 without a refetch. |
| `components/markets/MarketParts.tsx` (new) | Presentational pieces: status strip, banner, index card, mover row and shortcut row. |
| `scripts/dev-market-api.js` (new, dev only) | Serves the bundled market functions on `localhost:8888` for local review. It isn't deployed or bundled. |
| Tests | `marketsView.test.ts` (21 tests, new), 2 tests in `navigation.test.ts`, and the Markets files added to the Firebase-free guard. |

## Screen
From top to bottom:
1. **Status line:** a dot (green open, grey closed, amber unknown) and the freshness label, e.g. "Market closed · as of 15:31 IST". It shows "Refreshing…" while a request is in flight.
2. **Banner, when needed:**
   - Offline (info).
   - Refresh failed (error; tap to retry).
   - Provider unavailable / stale (warning; retry).
   - More than a day old (warning; retry; figures dimmed).
3. **Indices:** three cards that wrap on narrow screens. Each has the name, the level **in points (no ₹)**, a signed change and %, the day range and its own as-of time. If no index came back: "Index levels aren't available right now."
4. **Top movers:**
   - Captioned "Among NIFTY 50 stocks · as of 15:28 IST", with a Gainers/Losers segmented control.
   - Rows (not cards) show the ticker, company name, ₹ price and signed %.
   - A flat side says "No NIFTY 50 stock is up/down on this session."
   - When movers are unavailable, the card explains why (low coverage, provider, or not yet available).
5. **Your stocks:** Watchlist and Price alerts rows, which open the Stocks tab on that sub-tab. There are no screener or news links until SPENDLY-623 and 628 exist.
6. **Footer:** "Prices from Yahoo Finance and may be delayed. Index levels are in points."

**Empty states:**
- Loading: skeletons.
- Offline with nothing saved: "You're offline" (no retry).
- First load failed: "Market data unavailable" with the error copy and Retry.
- No market API in this build: an explanation.

The shortcuts stay visible in every state.

**Rules kept:**
- The screen never says "live".
- Every figure comes from the payload.
- There's no Firestore listener, and the user's portfolio isn't read.
- Ghost mode doesn't hide these figures, because they're public market data, not the user's money.

## Reviewing locally (Expo web)
The deployed site doesn't have `/api/market-overview` until a Netlify web deploy, and the Expo dev server doesn't serve Netlify functions. To see real data locally:
```powershell
npm run build:netlify-fns
node scripts/dev-market-api.js          # serves http://localhost:8888/api/*
$env:EXPO_PUBLIC_MARKET_API_URL="http://localhost:8888"; npx expo start --web
```
Then open Investments → Markets. If the dev API isn't running, you'll see the "Market data unavailable" empty state with Retry, which is the error path.

## Validation
- `marketsView.test.ts`: 21 tests passed, and `navigation.test.ts`: 26 passed.
- The dev API was smoke-tested: `/api/market-overview` returned 200 (closed, 3 indices, movers 100%), with CORS headers.
- Full `npm test`: 488 files, 6,591 tests passed. `npm run typecheck:shared` and `npx tsc -p tsconfig.json --noEmit` both exited 0. The scripts tests (24 files, 201 tests) were re-run after the dev script was added.
- `test:rules` was not run, because no rules changed.
- Visual review: pending (the user reviews on local Expo web).
