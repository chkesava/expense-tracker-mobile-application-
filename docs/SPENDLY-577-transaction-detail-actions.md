# SPENDLY-577: Individual transaction details and contextual actions

This story is part of epic SPENDLY-581.
- **Branch:** `feature/SPENDLY-577-transaction-detail-actions`.
- **Cut from:** the epic branch at `85151a23`, in the worktree `C:\dev\worktrees\spendly-581`.
- It builds on SPENDLY-576's route and data contracts. Both the dashboard and the `/transactions` list open the existing `/transactions/[id]` detail with a stable `{kind, id}` (+ `accountId`).

## Reference images
- **`spendly-individual-transaction-details.png`:** Dashboard → Transactions → detail (fields, attachments, related, Edit/Delete).
- **The "More Options" sheet** is in `spendly-budget-progress-drilldown.png`. That file is the same image as `generated/a_wide_high_resolution_ui_ux_concept_mockup_on_a.png` and is mislabelled for SPENDLY-575.
- The mockup's merchant photo, location, receipt images and related merchants are illustrative and not reproduced.

## What the detail already had (inspected; kept)
- **Fields:** title, amount and type; category; account link; counterparty; merchant correction; date and time; tags; space and trip; statement import; balance after; fee card; created/updated/history.
- **Edit:** through the shared edit modal, with `ledgerRowEditability` past-month locks.
- **Delete:** `appDialog` confirmation with `deletionImpactMessage`, then `softDeleteExpense` / `softDeleteIncome`. These are the canonical mutation services, keeping the balance, summary and audit behaviour.
- **Loading and not-found states.**
- **Added in SPENDLY-576:** category link, "View statement" source document, related records.

## Added here
- **A "More options" button** (⋯) in the header opens `components/transactions/TransactionMoreSheet.tsx`.
- **Rows come from `transactionActions`** (`shared/utils/transactionActions.ts`, pure and tested). Every row is an existing flow:

| Action | When shown | Flow |
|---|---|---|
| View account | account known and not the screen we came from (same rule as the Account row) | `/accounts/[id]` |
| View category | live expense with a category | `/spending/<category>?month` (SPENDLY-574) |
| View budget / Set a budget | live expense with a category; which one depends on whether a category budget exists for its month | `/budgets/<category>?month` (SPENDLY-575) / settings |
| Make it recurring | live, editable expense not already posted by a subscription | existing `EditSubscriptionModal` with a no-id draft (the path recurring suggestions use). The user reviews and saves it. |
| Share details | live expense or income | React Native `Share` (already used for exports, payment requests and splits). Title, amount, date and category only, with **no account names**. |
| Delete | live, editable expense or income | the existing confirmed `confirmDelete` |

- **The budget lookup** uses the shared, ref-counted `useCategoryBudgets` subscription. It is mounted only while the sheet is open (the SPENDLY-406 rule).

### Recurring safety
- `recurringDraftFromExpense` sets `lastProcessed` to the expense's own month. The auto-poster (`evaluateSubscriptionDue` / `duePost`) skips a month equal to `lastProcessed`, so making a payment recurring **never posts a second copy** of the one already recorded.
- A test runs the draft through the real `evaluateSubscriptionDue`: not due later that month, due on next month's billing day.

### Omitted on purpose (no existing flow)
- **Split:** `CreateSplitModal` cannot take an existing expense.
- **Duplicate:** there is no prefilled create path in the add modal.
- **Add attachment:** expenses have no attachment field; receipt scans are not saved.
- **Move to another category / Change account:** both are fields in Edit, which is already one tap away. Adding separate rows would duplicate it.
- **Payment method, location:** no such fields exist.

## Validation (2026-10-23, worktree)
- `npx vitest run shared/utils/transactionActions.test.ts`: 10 passed.
- `npm test`: 439 files, 6177 tests passed.
- `npm run typecheck:shared`: clean.
- `npx tsc -p tsconfig.json --noEmit`: clean.
- `npx expo export --platform web`: succeeded.
- Not run:
  - lint (no ESLint config);
  - Android build;
  - screenshots (none taken by the agent).
