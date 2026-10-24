# SPENDLY-584 — "Balance after" preview in Add Transaction

**Type:** Bug (High) · **Branch:** `fix/SPENDLY-584-balance-after-preview` (from `main`, no epic)

## Problem
Add Transaction showed "Balance after ₹19,211" for a ₹100 expense on an account whose detail screen showed ₹1,072.

## Root cause
| Surface | Balance source |
|---|---|
| Account detail (`app/(app)/accounts/[id].tsx`) | Stored `account.currentBalance`, kept current by every write (`buildAccountBalanceOps`) |
| Add Transaction preview (`previewBalanceAfterTransaction`) | Replay of `computeBankBalance` from `openingBalance` over the **client-loaded** expenses/incomes |

The expense and income lists are paged (`complete` / `hasMore`, SPENDLY-97/410). Older spending that was never loaded was dropped from the replay, which inflated the preview. SPENDLY-487 fixed the same flaw for running balances; the preview never got that fix.

The credit-card branch already used the card detail's formula (`limit − unbilledSpend`). However, it counted the row being edited twice.

## Fix
`shared/utils/accountBalance.ts`, `previewBalanceAfterTransaction`, with a new trailing `options` parameter (`ledgerComplete`, `editing`):
- **Bank/cash:** start from `storedBalanceAnchor(account)`, the same trust rule as SPENDLY-487 (seeded and not `needs_reconciliation`). Apply exactly the delta the save writes (`createExpense`/`createIncome`, `updateExpense`/`updateIncome`):
  - an expense subtracts the amount and an income adds it;
  - an edit on the same account first reverses the original row's amount;
  - an edit that moves the row from another account applies only the new amount.
- **Untrusted stored balance:** replay only when the ledger is fully loaded; otherwise return `null` and the preview is hidden. It never shows a guessed number.
- **Credit card:** the edited row is excluded from `computeOutstandingCredit`. The formula is unchanged.

`components/ExpenseForm.tsx` passes `ledgerComplete` (`complete && !hasMore` for expenses and incomes, both read from hooks the form already used) and the row being edited. It adds no new listeners or reads.

## Not changed / out of scope
- No Firestore writes, no data repair, no rules, index or dependency change.
- Transfer and card-bill-payment forms have no balance-after preview (`previewBalanceAfterBillPayment` has no UI caller).
- A card with no bill date still shows no preview (existing behaviour).

## Open risk (separate from this fix)
The expense/income write paths apply ±amount to `currentBalance` even when the row is dated **before** the account's `balanceAsOfDate`. A full rebuild (`computeBankBalance` / `netBankBalanceDeltas`) excludes those rows, so such a write drifts the stored balance. The preview mirrors the write, so it matches what the save does. The write-path inconsistency itself needs its own ticket.

## Tests
`shared/utils/accountBalance.test.ts`, block `previewBalanceAfterTransaction uses the stored balance (SPENDLY-584)` (12 tests):
- The ticket's case: 1,072 − 100 = 972 on a partial ledger.
- Cash accounts and income.
- Editing on the same account and editing that moves a row between accounts.
- Switching accounts (bank, cash and card).
- The untrusted-balance fallback and the hidden preview.
- Card semantics and the edit double-count.

Ten of these fail on the pre-fix code.
