# SPENDLY-658: Watchlist UI and "Add to watchlist"

- **Epic:** SPENDLY-624 (Investment Watchlists), story 5 of 5.
- **Branch:** `feature/SPENDLY-658-watchlist-ui`, cut from `feature/SPENDLY-624-watchlists`.

## What the user sees
**Stocks → Watchlist** (`components/portfolio/WatchlistTab.tsx`)
- **List chips:** one per list, with the default list first, then "New list" (up to 20 lists).
- **Header:** the list name, its stock count and the price freshness ("3 stocks · Market closed · closing prices of 30 Oct").
- **"⋯" menu:**
  - **Rename** opens an inline form.
  - **Delete list** asks for confirmation. The default list has no delete option.
- **Add:**
  - The symbol is normalised as you type. The helper reads "Adds HDFCBANK.NS (NSE)"; `.BO` means BSE.
  - "TCS is already in this list" shows before saving. An invalid symbol shows an example.
  - The name is optional.
  - Adding is blocked at 50 stocks, with a message.
- **Rows:**
  - Each row shows the ticker and exchange, the name, the ₹ price, and the signed ₹ change with its %, colour-coded.
  - A row with no live price shows why: "Saved 15:30 IST", "Price unavailable", "Not found on Yahoo Finance" or "Loading price…".
  - The ↑/↓ buttons reorder; they are disabled at the ends and work on the web.
  - The bin asks before removing.
  - Tapping a row opens the chart sheet.
- **States:**
  - first load;
  - lists failed with nothing on screen (Retry);
  - a later load or setup failure (banner with Retry; the rows stay);
  - "Start your watchlist" before any list exists;
  - "No stocks in this list yet".
- **Quote states:** offline shows saved prices with no Retry. A quote failure shows a warning banner with Retry, and every stock stays in the list.

**"Add to watchlist" on the stock sheet** (`components/markets/AddToWatchlistButton.tsx`, in `InstrumentSheet`)
- The button appears for stocks from **Markets** (movers) and the **Screener**, but not for indices. It is hidden when the sheet was opened from a watchlist row.
- On tap it reads the lists once; it holds no listener.
- With one list, it adds straight away. With several, it asks which one.
- If the stock is already in the chosen list, it says so and writes nothing.
- **First time:** if the user has never opened Watchlist, the first-time setup runs first, so the old watchlist is still copied in. It runs only after a server read; offline it says "Connect to the internet once…" rather than risk overwriting.

**Sheet subtitle fix:** the stock sheet always said "NSE · NIFTY 50", which was wrong for Screener stocks (NIFTY 500) and watchlist stocks. `MoverView` gains an optional `listing`:
- the Screener sets "NSE · {sector}";
- the watchlist sets "NSE" or "BSE";
- Markets movers keep "NSE · NIFTY 50".

A watchlist index's sheet shows the trading day ("as of 30 Oct"). Batch quote times are the daily bar's 09:15 session start, so a time would mislead.

## Code
- **`shared/utils/watchlistView.ts`** (pure) holds every state decision:
  - `watchlistView`, `watchlistRowView` and `addSymbolPreview`;
  - `watchlistRowInstrument`.
- **`services/portfolio/watchlistStore.ts`** gains `prepareWatchlistChoices` (one read, and setup only from server data) and `addToWatchlistById` (reads the list's items, then `addToWatchlist`).
- **`WatchlistTab`** draws the view: it uses `useWatchlists` (657) and `useWatchlistQuotes` (656), and its dialogs go through `appDialog`. It no longer takes a `currency` prop.
- **Reuse:**
  - `MarketCard`, `MarketBanner` and `InstrumentSheet` from the Markets tab;
  - `Chip`, `Button` and `Input`;
  - `toast` and `haptic`;
  - `lib/errors`.

## Safety
- **No direct Firestore writes in the UI.** The tab writes through the hook and the sheet button through the store, so every write goes through `commitMutations`.
- **Watchlists never touch holdings, cash, transactions or the ledger.** Guard tests enforce this on `WatchlistTab`, `AddToWatchlistButton` and `watchlistView`. The check ignores string text, so "your holdings are not affected" is allowed.
- **Rules are unchanged from 654/655**, so `test:rules` was not re-run.

## Tests
- **`shared/utils/watchlistView.test.ts`**, 20 tests:
  - every state, chips, limits, prices and moves;
  - saved, unknown, unavailable and loading rows;
  - offline versus error banners;
  - index points;
  - add preview;
  - the sheet for a stock and an index, including the date-only subtitle.
- **`services/portfolio/watchlistStore.test.ts`**, 5 new tests:
  - the choices are read without writing;
  - setup runs when the server has no default list;
  - setup never runs from a cache read;
  - adding to a list that isn't open appends after its items;
  - an existing stock is not written again.
- **`shared/utils/screenerView.test.ts`:** the Screener sheet subtitle.
- **`shared/utils/watchlists.test.ts`:** the UI guard.

## Local review (Expo web, emulator only)
Everything runs from the 624 worktree, in separate windows:
- the **Firebase emulator** (`npm run emulators:local`, 8080/9099, with this branch's rules), seeded with the demo user (`npm run emulators:seed`);
- two **legacy watchlist entries** (TCS, INFY) added to the demo user in the emulator, to show the one-time copy;
- the **market dev API** (`node scripts/dev-market-api.js`, 8888);
- **Expo web** on **http://localhost:8082**, with a gitignored `.env.local` setting `EXPO_PUBLIC_FIREBASE_EMULATOR_HOST=127.0.0.1` and `EXPO_PUBLIC_MARKET_API_URL=http://127.0.0.1:8888`.

Sign in as `demo@spendly.test` / `spendly-demo`.

## After merge
These are the epic's steps (in the PR to main):
1. **Deploy Firestore rules first.**
2. Deploy Web (Netlify), for `/api/stock-quotes`.
3. Release — Expense.
