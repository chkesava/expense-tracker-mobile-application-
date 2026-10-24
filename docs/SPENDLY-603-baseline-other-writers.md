# SPENDLY-603 — Remaining balance writers respect the account balance baseline

**Type:** Bug (High) · **Branch:** `fix/SPENDLY-603-baseline-other-writers` (from `main`) · **Follows:** SPENDLY-602

## Problem
SPENDLY-602 fixed the expense/income journal writers. The other writers still hand-built `buildAccountBalanceOps` deltas with no baseline check: a row dated before a bank account's `balanceAsOfDate` moved the stored `currentBalance`, even though a full rebuild (`computeBankBalance`) skips it.

## Fix
Every listed writer now builds signed, **dated** legs and passes them to `journalBalanceOps` (SPENDLY-602). That function drops bank legs dated before the effective baseline and keeps card legs.

| Writer | Change |
|---|---|
| `shared/utils/ledgerAccountDeltas.ts` | New `BalanceLeg` type (an `AccountDelta` with an optional pinned `isCreditCard`). `baselineAwareBalanceDeltas` honours the pin. |
| `services/ledger/journalBalanceOps.ts` | Accepts `BalanceLeg` and writes with the pinned kind when one is given. |
| `services/subscriptions/duePost.ts` | The auto-posted charge or transfer uses the row's own legs (`ledgerRowAccountDeltas`). |
| `services/portfolio/investmentCash.ts` | The bank leg of a Demat ↔ bank transfer. |
| `providers/FinanceDataProvider.tsx` | `addEntry`, `deleteEntry`, `addTransfer`, `deleteTransfer`, each leg on the row's date. |
| `services/creditCardBills/billPayment.ts` | Record, void and edit. The bank side is pinned non-card and the card side pinned card, keeping the old forced flags. An edit reverses on the old date and applies on the new one. |
| `hooks/useSplits.ts` | Own-share expense, collection entry, gift purchase (expense and pass-through entry on their own dates), undo collection, and split delete. `queueSplitReversals` now returns each reversal's date. |

**Left as is:** `addCashback` / `voidCashback` only move card outstanding, which has no baseline.

## Side effect worth knowing
Four `useSplits` sites (collection, undo collection, gift purchase, split delete) never passed `needsInitialization`. Through `journalBalanceOps` they now do. A never-seeded account is seeded from its opening balance and flagged `needs_reconciliation` (SPENDLY-436), instead of `increment()` starting the balance from 0. That fixes those sites; it doesn't regress them.

## Observation (not changed)
Split reversals are dated today, not on the original row's date. When the original collection was dated before the baseline, the rebuild ignores the original but counts the reversal, so an "undo" changes the balance. The incremental write now matches the rebuild exactly, as it did before for post-baseline rows. Whether a reversal should take its original's date is a separate product question.

## Existing data
This stops new drift; it does not repair old drift. No data was read or written. For variance, run the read-only `scripts/reconcile-account-ledger.ts`. Repair only with `scripts/rebuild-financial-summaries.ts --apply`, after approval.

## Tests
- `services/creditCardBills/billPayment.test.ts`: record before and on the baseline, void, and an edit re-dated across the baseline.
- `services/subscriptions/duePost.test.ts`: a pre-baseline bank charge, and a card charge.
- `services/portfolio/investmentCash.test.ts`: a pre-baseline top-up.
- `services/ledger/journalBalanceOps.test.ts`: the pinned card flag wins over the account type.

5 of the new writer tests fail on the pre-fix writers. `FinanceDataProvider` and `useSplits` are a React provider and hook with no unit harness. Their legs go through the tested `journalBalanceOps` path and are covered by the typecheck.
