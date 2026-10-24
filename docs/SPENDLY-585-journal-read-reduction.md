# SPENDLY-585: Journal reads for the current month

**Type:** Bug (no epic). **Branch:** `fix/SPENDLY-585-journal-reads`, from `main`.

## What the "342" was
The header read "342 activities · loaded so far" while 2026-10 held 115 rows (104 expenses and 11 incomes). The Journal did not fetch those 342 rows.

- `FinanceDataProvider` keeps one app-wide realtime window per collection: the newest `LEDGER_STAGED_LIMIT` (300) docs by `createdAt`.
  - For this account that is 300 expenses (the cap) plus all 42 incomes, which makes 342.
  - The dashboard, balances and the other money screens use the same window. It loads at sign-in whether or not the Journal is ever opened.
- The header count was `journal.records.length`, which is every loaded row before the month filter. So it showed the window size beside a month label.

## What the Journal itself reads (code trace)
| Action | Firestore reads caused by the Journal |
|---|---|
| Open, current month | 0. `periodSummaryComplete` is already true, because the window reaches back past the 1st, so `loadExpensesForMonth`/`loadIncomesForMonth` never fire. |
| Type, kind or search change | 0. Client-side memo over rows in memory. |
| Pick an older month | One bounded `where(date)` query per collection, at most once per month (`*MonthsLoadedRef`). |
| Load older (+50) | One `startAfter` + `limit(50)` page per collection. In-flight and exhausted states are guarded by refs. |
| Leave and return | 0. The listeners live in the provider, not the screen. |
| **Pull-to-refresh (before)** | **Every finance listener re-subscribed** through `retryFinanceData`: expenses (≤300), incomes (≤300), accounts, accountTypes, and the uncapped accountPayments, accountEntries and accountTransfers. Native persistence is memory-only, so each pull re-read all of them. |

## Fix
- **Refresh** (`shared/utils/journalRefresh.ts` → `journalRefreshAction`): pull-to-refresh re-subscribes only when a finance listener has failed. When the listeners are healthy they are already live, so there is nothing newer to read. `retryFinanceData` is unchanged for ErrorState retry and the other screens.
- **Header count:** `runJournalFilterPipeline` now returns `periodCount`, the rows in the selected month or range before search and filters. The header shows that count.
  - `journalScopeLabel` names the period and adds "loaded so far" only while the period isn't known to be complete.
- **Notice:** `journalHistoryNotice` no longer quotes the window size ("Displaying the latest 342").
- **`useLedgerPagination.loadMore`** relies on the provider's ref guards, so it keeps one identity across pages.

Nothing about the listeners, pagination, dedup (`unseenRows`), totals or the completeness flags changed. No data is written.

## Measurement (to record on local web)
`app/_layout.tsx` exposes `spendlyReadStats()` in dev builds. On local Expo web against the emulator (`docs/LOCAL_TEST_MODE.md`, demo account):
1. Open the Journal and wait for the list. Note `spendlyReadStats().totalServerReads`.
2. Pull to refresh, or on web use the refresh control, then read the stats again.
   - Before the fix, the delta is the full size of the 7 finance collections.
   - After the fix, it should be 0.
3. Change the month to the current month and back, and type a search. The delta should be 0, both before and after.

The before/after numbers go in the Jira comment once measured.

## Not changed / follow-up
The 300-row app-wide window is the real source of the startup read volume. Shrinking it or making it depend on the month affects the dashboard, budgets, auto-bills and the completeness checks across the app, so it needs its own ticket.

## Tests
- `shared/utils/journalRefresh.test.ts` (new): the refresh decision, the scope label, and a check that the notice never quotes a count.
- `shared/utils/journalFilterPipeline.test.ts`:
  - a 342-row multi-month window gives a current-month `periodCount` of 115 (104 expenses and 11 incomes);
  - an empty month gives 0;
  - a month change leaves no stale rows;
  - search doesn't change the period count.
- `shared/utils/ledgerSnapshot.test.ts`: overlapping 50-row pages over the 300-row window add every row exactly once.
