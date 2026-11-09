# SPENDLY-749: Journal custom range incomplete period fix

**Type:** Bug. **Related:** SPENDLY-109, 111, 409, 585, 748. **Branch:** `fix/SPENDLY-749-journal-custom-range` (from `main`).

## Problem
In Money → Journal, when a user selected a custom date range in the filter modal (overriding the month pill), an incomplete period could be falsely marked as complete.

## Root cause
In SPENDLY-748, on-demand month loading was introduced for selecting an older month from the month pill. However, for custom date ranges (`scope.monthOverridden: true`), `planJournalMonthLoad` retained the legacy heuristic `isDateScopeCoveredByLoadedHistory(scope, input.oldestLoadedDate)`.

Because the live window (the newest 300 rows) is ordered by `createdAt DESC`, a single back-dated transaction in the live window (an old date entered recently) pulled `oldestLoadedDate` back in time. Whenever `oldestLoadedDate <= scope.fromDate`:
- `planJournalMonthLoad` returned `periodComplete: true`.
- `JournalPeriodSummary` unpaused and calculated totals over whatever partial rows were in memory, violating the financial correctness invariant.
- The empty state showed "No transactions in this range" if no rows were in memory, hiding the fact that data was simply unloaded.
- `onEndReached` in `app/(app)/ledger.tsx` returned early (`if (periodSummaryComplete || monthLoading) return;`), preventing the user from paging older rows by scrolling.

## Fix
- **`shared/utils/journalMonthLoad.ts`**:
  - `customRangeMonthsInScope(fromDate, toDate, currentMonthKey)` calculates the months spanned by the range (newest first, capped at `MAX_RANGE_MONTHS = 12`).
  - `planJournalMonthLoad` handles custom ranges (`scope.monthOverridden`):
    - Open-ended past ranges (`fromDate: ""` with only `toDate`) cannot be enumerated into bounded months; they remain `periodComplete: false` until `ledgerComplete: true`.
    - Bounded ranges check every month in scope:
      - Current month is covered if `expenseMonthsLoaded`/`incomeMonthsLoaded` has it or if the live window reaches the start of the current month (`oldestLoadedDate <= ${currentMonthKey}-01`).
      - Past months must be confirmed loaded via `expenseMonthsLoaded` and `incomeMonthsLoaded`.
    - Missing months are loaded sequentially on demand (`loadExpensesMonth` / `loadIncomesMonth`).
    - The custom range is complete (`periodComplete: true`) only once all spanned months are confirmed loaded in memory and the range was not truncated past 12 months (or if `ledgerComplete: true`).
- **`app/(app)/ledger.tsx`**:
  - Updated empty-state descriptions to accurately reflect range vs. month contexts:
    - While loading: `"Fetching transactions for this range."`
    - When empty: `"Nothing was recorded in this range. Adjust the date filters to see activity."`
- **`shared/utils/journalMonthLoad.test.ts`**:
  - Added unit test suite covering single-month custom ranges, multi-month sequential loading, current-month live window coverage, open-ended past ranges, >12 months truncation, and the back-dated row regression.

## Invariants kept
- **Financial correctness:** `JournalPeriodSummary` stays paused (`complete={false}`) while any part of the requested date range remains unloaded.
- **Spark plan limits:** Custom ranges are capped at `MAX_RANGE_MONTHS = 12` to prevent unbounded Firestore reads. Reads reuse the existing month cache from SPENDLY-748.
- **Read-model architecture:** In `supabase` mode, `readJournalMonth` reads from Supabase with Firestore fallback; in `firestore` mode, it queries Firestore.
- **Multi-app safety:** Only Expense Journal utilities and screen touched; Nutrition and Ganesh Seva are unaffected.

## QA (emulator, Spendly Test or Expo web)
1. Seed a ledger over 300 rows with a back-dated row:
   ```sh
   npm run emulators:seed -- --months=12
   ```
2. Open Money → Journal.
3. Tap Filters, select a custom date range for an older period (e.g. `2025-06-01` to `2025-06-30`).
4. Expect `Loading 2025-06…` to appear.
5. While loading, `JournalPeriodSummary` displays "Period totals paused".
6. Once loaded, the progress indicator disappears and `JournalPeriodSummary` unpauses with accurate totals matching that month.
7. Select a multi-month range (e.g. `2025-06-01` to `2025-07-31`). Expect both months to load sequentially before the summary unpauses.
8. Select an empty date range with no transactions. Expect "No transactions in this range" only after loading completes.
9. Select a range within the current month (`2026-11`). If the live window reaches the current month start, it shows immediately without firing new network queries.

## Tests
- `shared/utils/journalMonthLoad.test.ts`: 23 tests covering month pill and custom ranges.
- `shared/utils/journalDateScope.test.ts`: 23 tests covering date scope parsing and boundary helpers.
- `shared/utils/journalFilterPipeline.test.ts`: 48 tests verifying date range filtering and running balances.
- `lib/readModel/journalReadPath.test.ts`: 10 tests verifying read path bounds, shadow comparison, and fallback.
- `lib/readModel/journalMonthCache.test.ts`: 5 tests verifying month session caching and concurrency deduplication.
