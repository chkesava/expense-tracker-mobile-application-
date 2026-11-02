# SPENDLY-668: Money Lent "None — already deducted"

**State:** built on `feature/SPENDLY-668-lend-already-deducted`, awaiting UI review.

## Problem
"Paid From Account" was required on Record Money Lent, and saving always debited that account. If the outflow was already recorded elsewhere in Spendly (an expense, a card spend, a cash entry), the same money was deducted twice.

## What changed
- **Form** (`components/receivables/CreateReceivableModal.tsx`):
  - The account chips gain a final **"None — already deducted"** chip, with an accessibility label.
  - When it is selected, the helper reads: "No account balance change. Use when this amount was already recorded elsewhere."
  - A choice is still required.
  - Users with no accounts can now record a lend through None (before, they hit a dead end).
- **Data model** (`shared/types/receivable.ts`):
  - `sourceAccountId?: string | null`;
  - a new `sourceMode?: "account" | "already_deducted"`.
  - Absent means `"account"`, which is what every earlier record is. **There is no backfill or migration, and no historical record is touched.**
- **Pure helpers** (`shared/utils/receivableSource.ts`):
  - `resolveLendSource` maps the picker selection to stored fields, or to a validation error;
  - `normalizeLendSource` makes sure an already-deducted lend never carries an account;
  - `lockLendSource` fixes the mode at creation, so an edit or a retry can't attach an account to an already-deducted lend or switch modes;
  - `isAlreadyDeducted`.
- **Provider** (`createReceivable` / `updateReceivable`): applies `normalizeLendSource` / `lockLendSource` before the write.
- **Display:**
  - the detail modal shows "Already deducted elsewhere (no account balance change)";
  - the list tip copy is updated.

## Why no ledger change
- `ledgerRowAccountDeltas` skips a leg that has no account id, so `debtLedgerBalanceOps` emits no balance ops. That covers create, edit, delete and retry.
- Repayment, cancel and delete never read `sourceAccountId`.
- A repayment credits only its own `receivedAccountId`.
- One ledger, no parallel path.

## Not changed
- **Firestore rules:** `receivableWellFormed()` has no `hasOnly` list and never checks `sourceAccountId`. A rules test now documents that a null source plus `sourceMode` is accepted. **No rules deploy is needed.**
- **Read model:** receivables are not synced yet. When Wave 2 (SPENDLY-589) adds them, `source_account_id` must be nullable and `source_mode` must be carried.

## Net worth note
An already-deducted lend adds the receivable as an asset, with no matching bank drop on the lend itself. That is correct only because the outflow is already recorded elsewhere, which is exactly what the option asserts. The copy says so.

## Tests
- `shared/utils/receivableSource.test.ts` (new): covers the picker mapping, validation, normalization and the edit lock. It stands in for UI tests, because the repo has no React Native component-test harness.
- `services/ledger/debtBalanceOps.test.ts`: no ops on create, edit, retry or delete of an already-deducted lend; an account-backed lend still debits exactly once.
- `lib/finance/receivables.integration.test.ts`: no balance change and no expense; outstanding counted; a repayment into an account works and updates the outstanding amount.
- `firestore/personalData.rules.test.ts`: the owner can write an already-deducted receivable.
