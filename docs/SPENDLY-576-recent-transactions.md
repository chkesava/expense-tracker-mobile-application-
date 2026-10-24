# SPENDLY-576: Recent Transactions → Transactions list → transaction detail

This story is part of epic SPENDLY-581.
- **Branch:** `feature/SPENDLY-576-recent-transactions`.
- **Cut from:** the epic branch at `be2fb0a0`, in the worktree `C:\dev\worktrees\spendly-581`.

## Reference images
- **`spendly-recent-transactions-drilldown.png` is mislabelled.** It shows Spending Trends (SPENDLY-578).
- **The real flow** (Dashboard Recent Transactions → Transactions list → DMart detail) is `generated/a_wide_high_resolution_ui_mockup_triptych_of_a_mo.png`.

## What already existed (inspected first, reused, not rebuilt)
- **`/transactions/[id]`:** detail for every transaction kind.
  - Type, amount and title; account link; counterparty; merchant correction; date and time; tags; space and trip; statement import; balance after; fee card; created/updated/history.
  - **Edit:** the shared edit modal, with past-month locking (`ledgerRowEditability`).
  - **Delete:** with an `appDialog` confirmation and the deletion-impact message (`softDeleteExpense` / `softDeleteIncome`).
  - Loading and not-found states.
- **The Journal pipeline (`runJournalFilterPipeline`):** search, the filter modal (type specials, date range, amount range, categories, counterparties, accounts, tags, audit status), the month-or-range scope and totals.
- **Transfers** come from `useAccountTransfers` (`FinanceDataProvider`), already loaded app-wide.
  - They were only listed per account; the Journal holds one row per expense or income and no transfers.

## Changes
- **Dashboard Recent Transactions:**
  - A row now opens its `/transactions/[id]` detail instead of the edit modal. Edit lives on the detail.
  - "See all" opens `/transactions?month=<month in view>` instead of the Money hub.
- **New `/transactions` list** (`app/(app)/transactions/index.tsx`, logic in `shared/utils/transactionsFeed.ts`):
  - month stepper;
  - All / Expenses / Income / Transfers tabs with counts;
  - search (title, category, account, note, tags…), the existing filter modal, with a badge and "Clear";
  - a sort chip (latest, oldest, highest, lowest);
  - day groups with Today/Yesterday and day totals;
  - "Show more" paging (40 at a time);
  - Spent / Income / Transferred tiles;
  - offline, partial-load, error, empty and no-match states.
  - **How it uses existing logic:**
    - Rows, search, filters, date scope and totals are the Journal's own (`runJournalFilterPipeline`).
    - Transfers become Journal-shaped rows (`transferRecords`) and go through the same `searchAccountActivities` / `applyAccountActivityFilters`. A category filter leaves them out, because a transfer has no category.
    - **Transfers are never added to spent, income or a day's total**, matching the Journal and the dashboard summaries. They are shown in their own "Transferred" tile.
    - Day totals are `summarizeJournalTotals` over the day's expense and income rows.
    - Order is the Journal's posting order (`postingSortMs`: date, stored clock, else created time).
  - **State:** month and tab are in the route. Search, filters and sort live in the screen, which stays mounted under the detail, so they are kept on the way back.
  - **Reads:** for the month, or each month of a custom range (capped at 12), the list asks the store's existing `loadMonth` once for expenses and incomes. These are bounded date-range reads, skipped when the month is already loaded. There are no new listeners or collections.
    - A range longer than 12 months says so instead of silently missing rows.
- **Detail (`/transactions/[id]`):**
  - **Category** links to that category's month (`/spending/<category>`, SPENDLY-574).
  - **Source document:** for statement-imported rows (`accountDocumentId`), "View statement" lists the account's documents on tap and opens the signed URL, the same flow as the account screen. A removed document gets a clear message.
  - **Related records:** shown through `findJournalRelatedRecords`, the Money tab's existing rule (cashback on this expense, the bill that paid it, an investment entry, shared tags). Nothing is inferred beyond that rule.
- **Routes:** `transactions/index` is registered in `app/(app)/_layout.tsx`, with `/transactions` in `SUB_SCREEN_ROUTES` and `RESTORABLE_ROUTES`. Tests cover both.

## Not available in the data (so not shown)
- **Payment method:** expenses have no such field.
- **Attachments:** the only attachment is the statement-import source document; receipt scans are not saved to an expense.
- **Location** and **merchant photos**, as shown in the mockup.

## Known risks / follow-ups
- **Swipe-delete on the Money tab has no confirmation.** Swipe-delete in `components/ExpenseList.tsx` deletes without a confirmation, unlike `/transactions/[id]`. That is existing Money-tab behaviour outside this story's screens; flagged, not changed.
- **No screenshots:** none were taken by the agent for this story.

## Validation (2026-10-23, worktree)
- `npx vitest run shared/utils/transactionsFeed.test.ts`: 12 passed.
- `npm test`: 438 files, 6167 tests passed.
- `npm run typecheck:shared`: clean.
- `npx tsc -p tsconfig.json --noEmit`: clean.
- `npx expo export --platform web` (scratch folder): succeeded, and the bundle contains the new route.
- Not run: lint (no ESLint config), Android Gradle build.
