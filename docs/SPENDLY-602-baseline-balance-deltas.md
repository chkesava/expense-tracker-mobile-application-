# SPENDLY-602 — Journal writes respect the account balance baseline

**Type:** Bug (High) · **Branch:** `fix/SPENDLY-602-baseline-balance-deltas` (from `main`) · **Follows:** SPENDLY-584 · **Carries on:** SPENDLY-603

## Problem
An account with a balance snapshot (`balanceAsOfDate`) holds every earlier row inside `openingBalance`. The full rebuild (`planAccountRebuild` → `computeBankBalance`) and the debt writers (`debtBalanceOps` → `netBankBalanceDeltas`) skip those rows. The expense/income writers did not: creating, editing, deleting or restoring a pre-baseline row still moved the stored `currentBalance`, which then drifted from the rebuild value.

## Fix
| File | Change |
|---|---|
| `shared/utils/ledgerAccountDeltas.ts` | New `baselineAwareBalanceDeltas(legs, accountContext, today)`. It nets signed, dated legs per account, drops non-credit legs dated before the effective baseline (same rule as `computeBankBalance`), and keeps card legs (card outstanding has no baseline). Unknown accounts keep every leg, as before. |
| `services/ledger/journalBalanceOps.ts` | New. Turns legs plus the `AccountInfo` the writers already fetch into `buildAccountBalanceOps` ops, keeping the SPENDLY-436 seeding. |
| `services/ledger/createLedgerTransaction.ts` | `createExpense` / `createIncome` use `journalBalanceOps`. |
| `services/ledger/mutateLedgerTransaction.ts` | `updateExpense` / `updateIncome` reverse the old row on its own date and apply the new row on its date. Soft-delete and restore do the same with one leg. |
| `shared/utils/accountBalance.ts`, `components/ExpenseForm.tsx` | The SPENDLY-584 preview runs its legs through the same helper (draft date and the edited row's original date), so the preview still equals the save. |

**Behaviour that does not change:**
- Post-baseline rows and accounts with no baseline.
- Card outstanding.
- No extra reads: the writers already fetched `AccountInfo`, which already carried `balanceAsOfDate`.

## Not in scope → SPENDLY-603
The same gap exists in the other hand-built delta writers:
- `FinanceDataProvider`: cashback, account entries, transfers;
- `useSplits`;
- `billPayment`;
- `duePost`;
- `investmentCash`.

They are listed with line numbers in SPENDLY-603.

## Existing data
This fix stops new drift; it does not repair old drift. No data was read or written. To check an account, run the read-only `scripts/reconcile-account-ledger.ts --uid=… --accountId=…` (a variance report). Repair only with `scripts/rebuild-financial-summaries.ts --apply`, after approval.

## Tests
- `shared/utils/baselineAwareBalanceDeltas.test.ts`: the rules, plus a parity check against `computeBankBalance` for these scenarios:
  - create before and after the baseline;
  - edit an amount;
  - edit a date across the baseline in both directions;
  - move a row between accounts;
  - delete.
- `services/ledger/journalBalanceOps.test.ts`: bank, pre-baseline, card and never-seeded account cases.
- `services/ledger/mutateLedgerTransaction.test.ts`: 8 end-to-end cases through the real writers (edit, cross-baseline moves, soft-delete, restore, income, card). 6 of them fail on the pre-fix writers.
- `shared/utils/accountBalance.test.ts`: preview baseline cases.
