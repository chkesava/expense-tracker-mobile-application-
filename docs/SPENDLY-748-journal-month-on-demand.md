# SPENDLY-748: Journal loads the selected month on demand

**Type:** Bug. **Related:** SPENDLY-409, 585, 596, 732. **Branch:** `fix/SPENDLY-748-journal-month-on-demand` (from `main`).

## Problem
On a ledger with more than 300 expenses, picking an older month in Money → Journal showed none of that month's transactions until "load all".

## Root cause
The month-scoped read already existed: `readJournalMonth` in `lib/readModel/journalReadPath.ts`, with the read switch and the Firestore fallback (SPENDLY-511). But the Journal skipped it whenever the oldest loaded row's **date** was on or before the month start.

The live window is the newest 300 rows by **createdAt**. So one back-dated row in the window (an old date, entered recently) made every month after that date look "covered". The month query never ran, and the month showed only the rows the window happened to hold.

Separately, the provider's set of loaded months was never cleared on sign-out. A month loaded by one user would read as loaded for the next.

## Fix
- **`shared/utils/journalMonthLoad.ts`** (`planJournalMonthLoad`) decides what to load:
  - **The current month** keeps the newest-300 window when the window reaches the month start (SPENDLY-585, unchanged).
  - **Any other month** is complete only after its own month-scoped query (or once the whole ledger is loaded). Until then, one query per collection is requested; the income sub-tab never reads expenses.
  - **A custom range** keeps the previous rule.
- **`lib/readModel/journalMonthCache.ts`** is the session cache, one entry per month:
  - concurrent callers share one in-flight read;
  - a successful month is never read again;
  - a failed month is forgotten, so Retry reads again;
  - `reset` on sign-out drops everything and ignores reads still in flight.
- **`FinanceDataProvider`**:
  - `loadExpensesForMonth` / `loadIncomesForMonth` go through the cache and return `true`/`false` (they no longer show a toast; the screen shows the error);
  - the caches reset when the user signs out;
  - a read that finishes after a user switch is dropped.
- **`app/(app)/ledger.tsx`**:
  - The **"Older history not loaded" / "Showing recent transactions" banner and its "Load older transactions (+50)" button are removed** (owner request). Scroll-to-load-older in the list stays.
  - A month that is loading shows a small "Loading YYYY-MM…" line.
  - A failed month shows an error card with **Retry**.
  - The list shows a month-aware empty state (loading / failed / "No transactions in YYYY-MM") instead of the first-run "No Expenses Yet".
  - While a month query is in flight, scrolling doesn't also page older history.
- `journalHistoryNotice` (the banner copy) was removed, now unused.

## Invariants kept
- **Totals:** the period card (`JournalPeriodSummary`) still uses the rows in view only once the period is complete. No stored summary or ledger logic changed.
- **Reads:**
  - No full-history load.
  - One `date`-range read per collection per month, per session.
  - All month reads go through `readJournalMonth`: the `journal` read switch (`firestore` / `shadow` / `supabase`) with the Firestore fallback.
- **Writes and schema:** no write paths, schema, rules or indexes changed. The `date` range query is the existing one.

## QA (emulator, Spendly Test or Expo web)
1. Seed a ledger over 300 rows:
   ```sh
   npm run emulators:seed -- --months=12
   ```
   That's about 515 expenses, plus `exp-backdated`: an old date, created today, which reproduces the original bug.
2. Open Money → Journal. The current month shows from the live window, and there's no banner.
3. Pick a month around 8 months back. Expect "Loading…", then exactly that month's rows; the card counts match the month.
4. Pick the oldest month (the one holding the back-dated row). It must load, not show only the single back-dated row.
5. Go back to an earlier-picked month. It shows instantly, with no new read (watch `ledger_month_query` in the read log).
6. Go offline and pick a new month. Expect the error card and a Retry button; Retry works after you reconnect.
7. On the Income sub-tab, pick an old month. Only incomes are read.

## Tests
- `lib/readModel/journalMonthCache.test.ts`: once per month, a shared in-flight read, retry after failure, reset.
- `shared/utils/journalMonthLoad.test.ts`: query scope per month and collection, the back-dated regression, the current-month window, custom range, the income sub-tab.
- `lib/readModel/journalReadPath.test.ts`: month query bounds (including a leap February), shadow off/on, the supabase error falling back to the Firestore month query.
- `lib/localTestMode.test.ts`: the 12-month seed has more than 300 expenses and includes the back-dated row.
