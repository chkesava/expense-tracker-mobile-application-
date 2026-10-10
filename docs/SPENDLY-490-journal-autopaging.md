# SPENDLY-490: Stop the Journal auto-paging the whole ledger

**Epic:** SPENDLY-488 (Android lag fixes).

## Problem
The Journal's lists passed `onEndReached → loadMoreLedger(...)` to a FlashList.

A list filtered to one month is often shorter than the screen. FlashList then reports "end reached" right after rendering, and again after every page lands. So without the user scrolling at all, the app paged through 50-row batches until the entire ledger was in memory (about 800 records, roughly 16 reads of 50 documents each).

Each page also re-created `loadMoreExpenses`/`loadMoreIncomes`, because they depended on the `isFetchingMore*` state. That changed the Expenses/Incomes context values again, so every consumer re-rendered once more per page.

## Fix

### `components/ExpenseList.tsx`
`onEndReached` now fires **at most once per user drag**.
- A ref is armed in `onScrollBeginDrag` and consumed by the end-reached handler.
- A short list can no longer page by itself, and a real scroll to the bottom still loads the next page.

### `app/(app)/ledger.tsx`
Both lists skip end-reached paging once `periodSummaryComplete` is true. That is the case when the selected month is already fully covered, either by a direct month query or by loaded history. Older history is still one tap away with "Load older transactions".

### `providers/FinanceDataProvider.tsx`
- The in-flight guard for `loadMoreExpenses`/`loadMoreIncomes` is now a ref, so both callbacks keep a single identity (`[]` deps).
- This also closes a race in which two quick calls could fetch the same cursor twice.
- The `isFetchingMore*` state is unchanged for the spinners.

## Tests
- `npm test`: 352 test files pass.
- `npx tsc -p tsconfig.json --noEmit`: clean.
- Device check on Spendly Test: pending (the phone was disconnected).
