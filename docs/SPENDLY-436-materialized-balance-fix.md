# SPENDLY-436: Fix incorrect account balances and net worth from materialized summaries

## Problem

After SPENDLY-423 moved the Money/Vault screen and net worth off full-ledger replay onto persisted `currentBalance`/`currentOutstanding` fields, the user observed materially wrong numbers (e.g. SBI savings at **-₹7,600** instead of **₹18,981**, Hand cash at **-₹43,070** instead of **₹1,923**), with net worth off by over ₹1.2L.

## Root causes

1. **Uninitialized summaries silently treated as zero.** `Account.balanceInitialized` existed in the schema but nothing in the production create/edit flow ever set it or seeded `currentBalance`/`currentOutstanding`. The first ledger write against such an account read `currentBalance ?? 0`, then Firestore's `increment()` also started an absent field at 0 — permanently dropping `openingBalance` and any pre-materialization history the moment any transaction touched the account.
2. **Rebuild/backfill scripts filtered borrowings/receivables by a field that doesn't exist.** `services/ledger/rebuildFinancialSummaries.ts`, `scripts/rebuild-financial-summaries.ts`, and `scripts/rebuild-domain-summaries.ts` all filtered `Borrowing`/`BorrowingRepayment`/`Receivable`/`ReceivableRepayment` by `accountId`. That field doesn't exist on any of these four types — the real fields are `creditedAccountId`, `paymentAccountId`, `sourceAccountId`, and `receivedAccountId` respectively. `scripts/rebuild-domain-summaries.ts` also computed net-worth borrowing/receivable totals from nonexistent `.amount`/`.amountPaid` fields.

## Fix

1. **Rebuild scripts** (`services/ledger/rebuildFinancialSummaries.ts`, `scripts/rebuild-financial-summaries.ts`, `scripts/rebuild-domain-summaries.ts`): now match borrowings/receivables via the newly-exported `shared/utils/accountBalance.ts` helpers (`borrowingsCreditedTo`, `repaymentsPaidFrom`, `receivablesPaidFrom`, `receivableRepaymentsInto`) instead of a nonexistent `accountId`. The net-worth borrowing/receivable totals in `rebuild-domain-summaries.ts` now use `summarizeBorrowings`/`summarizeReceivables` (the same portfolio aggregators the live app uses) instead of nonexistent `.amount`/`.amountPaid` fields.
2. **New accounts never start uninitialized**: `providers/FinanceDataProvider.tsx`'s `addAccount` now seeds `currentBalance`/`balanceInitialized`/`balanceReconciliationStatus` (or the credit-card equivalents) at creation time, from `openingBalance` for bank/cash accounts and `0` for new credit cards.
3. **Write paths no longer default "missing" to "zero"**: `services/ledger/createLedgerTransaction.ts` and `services/ledger/fetchAccountTypes.ts` (shared by edit/delete/restore in `mutateLedgerTransaction.ts`, transfers and bill payments in `FinanceDataProvider.tsx`/`billPayment.ts`) now check `balanceInitialized`. When missing, the mutation seeds `currentBalance`/`currentOutstanding` from `openingBalance` (a literal set, not an `increment()`) and marks the account `needs_reconciliation` instead of falsely `healthy`. This is implemented via a new `needsInitialization` flag on `shared/utils/balanceMutations.ts`'s `BalanceDeltaParams`.
4. **UI surfaces the gap**: `components/accounts/AccountRow.tsx` (deposit accounts and credit cards) and `components/accounts/CreditCardListItem.tsx` (Cards tab) now show a small warning line — "Balance pending reconciliation — tap Edit to rebuild" — when `balanceReconciliationStatus`/`summaryReconciliationStatus === "needs_reconciliation"`. The existing manual "Rebuild" action in `EditAccountModal.tsx` (which calls the now-fixed `rebuildFinancialSummaries`) is the fix path.

## Tests

- `shared/utils/reconciliation.test.ts`: regression test proving borrowings/receivables are matched by their real relation fields (`creditedAccountId`/`paymentAccountId`/`sourceAccountId`/`receivedAccountId`), not a generic `accountId`.
- `shared/utils/balanceMutations.test.ts` (new): proves an uninitialized account's first mutation seeds from the caller's prior value instead of a bare `increment()` on an absent field, and marks `needs_reconciliation`.
- `services/ledger/fetchAccountTypes.test.ts` (new): proves a missing `balanceInitialized` falls back to `openingBalance`, not `currentBalance ?? 0`.
- Full suite: `npm test` (369 files / 5515 tests pass), `npm run typecheck:shared`, `npx tsc -p tsconfig.json --noEmit` all clean.

## Not yet done

- **Production backfill**: a one-time dry-run reconciliation (`npx tsx scripts/rebuild-domain-summaries.ts`, no `--apply`) against the real Firebase project, to fix the already-corrupted SBI/Hand Cash/Slice/HDFC balances named in the ticket. Per [[feedback_shared_firebase_no_staging]], this requires a reviewed dry-run report and explicit user go-ahead before `--apply`. Not run as part of this change.
- `scripts/rebuild-domain-summaries.ts`'s dashboard/period-summary section was not touched — out of scope for this ticket.
