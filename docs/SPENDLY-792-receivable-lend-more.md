# SPENDLY-792: Receivables "Lend More"

**State:** built on `feature/SPENDLY-792-receivable-lend-more`. Awaiting UI review. Nothing is deployed.

## Problem
Partial repayments already reduce what a person owes ("Record Repayment"). When the same person borrowed **more** later, the only option was editing the receivable's original amount. That edit:
- overwrote the history;
- back-dated the extra debit to the first lend's date;
- couldn't take the money from a different account;
- charged interest on the new money from the first lend's date.

## What changed
- **New collection** `users/{uid}/receivableLends`, a sibling of `receivableRepayments`. Fields: `receivableId`, `amount`, `date`, `month`, `sourceMode` (`account | already_deducted`), `sourceAccountId` (null when already deducted), `note`, `createdAt`, `updatedAt`.
- **Ledger:** each lend is its own dated row, `LedgerRow` kind `receivableLend`. It is a `-amount` leg on `sourceAccountId` on its `date`, or no leg when already deducted. `computeBankBalance`, `accountSourcesFor`, `debtLedgerBalanceOps`, the account feed, the rebuild (in-app and `rebuildRunner`), `rebaseline-account`, `reconcile-account-ledger`, `snapshot-daily` and the financial baseline all count it. Incremental and full rebuild agree, and a test pins that.
- **Math** (`shared/utils/receivableMath.ts`):
  - **Principal owed** = `originalAmount + Σ lends`. `originalAmount` keeps meaning "the first lend", so there's **no backfill**. A receivable with no lend rows gives exactly the same output as before, and tests pin that.
  - **Interest starts from each lend's own date:**
    - on the outstanding-principal basis, a lend is a movement that raises the principal;
    - on the original-principal basis and for one-time interest, each lend is its own tranche.
  - **Edit floor:** the first lend must cover at least `principalReceived − additionalLent`. The first lend's date can't move past a later lend.
  - **Guards:**
    - `validateReceivableLend` refuses a cancelled receivable, an amount ≤ 0, a future date, and a date before the first lend.
    - `validateReceivableLendDelete` refuses a delete that would leave more principal received than lent.
- **Parent cache:** gets `additionalLent`. The drift check compares it with the lend rows, the cache repair (`debtCacheRepair`) restamps it, and the portfolio's `totalLent` includes it.
- **Provider** (`BorrowingsReceivablesProvider`):
  - It reads lends through `useReadModelSource("receivableLends")`.
  - **`addLend`** writes one `commitMutations` batch: the lend row, the parent's restamped cache, and the source account's debit.
  - **`deleteLend`** reverses all three.
  - Deleting a receivable cascades to its lends, and refuses while offline.
  - Every existing writer (repay, edit, settle, waive) passes the lends into the summary.
- **UI:**
  - **Detail modal:**
    - A **Lend More** button sits beside Record Repayment. It is also shown on a fully settled receivable, because borrowing again reopens it. It is never shown on a cancelled one.
    - The form has an amount, a source (account chips or "None — already deducted"), a date (from the first lend's date to today), and a note.
    - The breakdown shows First lend / Lent later / Total lent.
    - The history is one timeline of lends and repayments, and each can be removed.
  - **Card:** shows "Lent" as the total.
  - **Account activity:** shows the debit.

## Read model (dual write and read)
- `TableSpec` `receivable_lends` (`derivedMonth`), plus `additional_lent` on `receivables`.
- Registered in `SWITCHED_COLLECTIONS` (the default is `firestore`).
- Migration `20261120000000_readmodel_receivable_lends.sql`:
  - the table, owner-only RLS, realtime pings, and the `additional_lent` column;
  - restates the sync and client allowlists, the purge, the live counts and `v_data_quality`.
- **Guards extended:**
  - the mapping test now also reads `alter table … add column`;
  - the provider-switch, listeners-off, push-refs and sync-core lists;
  - the cross-user indexes (`receivableLends.createdAt/updatedAt`);
  - the Supabase SQL tests;
  - the golden fixture (a 500 later lend), plus the regenerated `golden.sql` and baseline snapshot.

## Firestore
- **`firestore.rules`:**
  - `receivableLendWellFormed()`: `hasAll`/`hasOnly`, a positive bounded amount, YMD `date`, `month`, a source mode consistent with the account, a note of at most 500 characters, timestamps.
  - Create and delete only, no update.
  - `receivableWellFormed()` now bounds `additionalLent`.
- **`firestore.indexes.json`:** `receivableId + date desc`, plus the two collection-group field overrides.

## Deploy order (each step needs approval)
1. `firebase deploy --only firestore:rules,firestore:indexes`. Diff the indexes against live first.
2. Supabase migration `20261120000000`: dry run, then apply. It must be live before an app build writes `receivableLends`, or the outbox apply for that table is refused until it is.
3. Web deploy and app release.

Existing data needs no migration or repair: no receivable has lend rows yet.

## Tests
- `shared/utils/receivableLend.test.ts`: 33 tests.
- `lib/finance/receivables.integration.test.ts`: lend → part repay → lend more (account and already deducted) → repay all; balances equal the full replay; the delete guard; the cascade; the account feed.
- `firestore/personalData.rules.test.ts`: lend rules.
