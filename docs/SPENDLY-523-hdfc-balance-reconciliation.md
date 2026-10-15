# SPENDLY-523: HDFC balance overstated by ₹24,509.50

SPENDLY-524 was filed for the same report and is closed as its duplicate.

## Bug
On 2026-10-15 the HDFC account showed ₹53,938.50, but the real bank balance was ₹29,429.00. Spendly was ₹24,509.50 too high.

- The rows themselves were correct, and the "Balance after" chain was internally consistent.
- Opening balance ₹0.00, baseline "Creation" (no `balanceAsOfDate`, so the full ledger counts).

## Cause
Two write paths added a ledger row but never moved the account's materialized `currentBalance`.

### 1. Bank → Stocks Demat transfer (the ₹24,500)
- **Flow:** Transfer Funds with "Stocks Demat Cash" as the destination calls `depositCash`, which calls `transferInvestmentCashWithBank` (`services/portfolio/investmentCash.ts`). Its default note is "Account fund transfer".
- **What the batch did:** it wrote the Investment Cash credit, the bank's `accountEntries` debit and the Demat `cashBalance`, but no `buildAccountBalanceOps`.
- **Effect:** `computeBankBalance` (and so every rebuild) counts the entry, but the stored `currentBalance` was never debited. The two top-ups on 14 and 15 Oct (₹4,500 + ₹20,000) left HDFC ₹24,500 too high.
- **Withdrawals** (Demat → bank) had the mirror problem: the bank was never credited.

### 2. Subscription, EMI and auto-transfer due-posts
- **Flow:** `postDueSubscriptionCharge` (`services/subscriptions/duePost.ts`) wrote the expense or transfer plus `lastProcessed`.
- **Effect:** no balance op, so every auto-posted charge left the paying account too high, and a recurring transfer left both accounts stale.

### Why the screen looked consistent
- **Balance after:** SPENDLY-487 anchors "Balance after" on the stored `currentBalance` and walks backwards. A stale stored value therefore shifts every row by the same amount and the chain still adds up.
- **Account health:** current, average, highest and lowest all come from the same walk, so they were offset too.

### Earlier HDFC figures
- **2026-10-10 dry-run** (₹69,714.50 stored vs ₹56,132.50 recomputed): the same class of drift from earlier top-ups and due-posts, made visible once SPENDLY-436 fixed the transfers collection name.
- **SPENDLY-487 header (₹56,080.50):** suggests a rebuild ran after that.
- **This report:** the ₹24,500 is the drift added by the top-ups after that point.
- **Next step:** the per-record report below confirms this from `balanceLastRebuiltAt` and each row's `createdAt`.

## Fix
- **`shared/utils/ledgerAccountDeltas.ts` (new, pure):**
  - `ledgerRowAccountDeltas` maps one row of any of the nine bank-balance kinds to its per-account delta, with the same signs and relation fields as `computeBankBalance`.
  - `accountBalanceContributions` and `balanceFromContributions` give the per-row breakdown. Their sum is tested to equal `computeBankBalance`.
  - SPENDLY-496 reuses this helper for borrowings, receivables and splits.
- **`transferInvestmentCashWithBank`:** stages the bank leg's `currentBalance` op (plus net worth) in the same batch.
- **`postDueSubscriptionCharge`:** adds the balance ops for the expense's account, or both legs of a transfer. A card charge raises `currentOutstanding`, the same as `createExpense`.
- **Retry guard:** both paths use deterministic ids that get re-set on retry. The balance op is only included when the doc does not exist yet, via the new `docAlreadyWritten` in `services/ledger/fetchAccountTypes.ts`.
  - It checks the cache first, so this device's pending write counts and the save never waits on the network.
  - If neither the cache nor the server can answer (offline, never cached), the doc is treated as new, so offline saves still work.
- **`deleteEntry`** already reversed the entry's delta. With the create side fixed, create + delete now nets to zero. No change was needed.
- **Write path unchanged:** the transfer still commits through `writeBatch` + `commitWrite`, which has no outbox replay, so the guard above is the only retry protection needed. The due-post stays on `commitMutations`, which ack-guards increments on replay.

## Per-record report (read-only)
`scripts/reconcile-account-ledger.ts --uid=… --accountId=… [--real-balance=N] [--out=file]` never writes. It prints:
- Opening balance, baseline, flags, `balanceLastRebuiltAt`, the stored balance, the recomputed balance (cross-checked against `computeBankBalance`), and the variance against the real balance.
- Rows from the two write paths that skipped the balance update, split into before and after the last rebuild. Their sum is the expected overstatement, and the leftover is printed as "unexplained".
- Every contributing row with its delta and running balance.
- The uid is never printed.

It was verified on the Firestore emulator with a fixture of the HDFC pattern. The ₹24,500 was attributed to the two top-ups and the unexplained remainder was ₹0.00.

## Production repair (HDFC only, not yet run)
1. Dry-run report:
   `npx tsx scripts/reconcile-account-ledger.ts --uid=<uid> --accountId=<hdfc id> --real-balance=29429 --out=<scratch>/hdfc.md`
   This needs `GOOGLE_APPLICATION_CREDENTIALS`.
2. Explain the full variance in this doc: the ₹24,500, the ₹9.50 and the ₹1,200 GY… row (auto-posted or entered by hand).
3. Get explicit approval from the user, then apply to HDFC only:
   `npx tsx scripts/rebuild-financial-summaries.ts --uid=<uid> --accountId=<hdfc id> --apply`
4. Re-run the report and expect zero variance. Then check on the device: Overview, "Balance after" and Account health.

Every other account stays with SPENDLY-500.

## Findings, not fixed here
| Rank | Finding | Where | Owner |
|---|---|---|---|
| P1 | **Statement re-import applies twice.** Re-importing the same line lands on the same expense id (`merge: true`), and `createExpense` adds its balance delta again. Candidate for the ₹9.50. | `ReconcileStatementModal.tsx` → `createLedgerTransaction.ts` | new ticket |
| P1 | **Split paths miss initialization.** They emit balance ops without `needsInitialization`, so an unseeded account increments from 0. | `hooks/useSplits.ts` | SPENDLY-496 |
| P2 | **Reconcile has no preview.** "Reconcile Summaries" in Edit Account applies straight away and throws the variance details away. | `EditAccountModal.tsx` | new ticket |
| P2 | **Backdated rows break the baseline.** A row dated before the account's baseline still moves `currentBalance`, while the rebuild excludes it. That is permanent drift. | `balanceMutations.ts` | new ticket |
| P2 | **Card detection is fragile.** An account is treated as a credit card only when `accountTypeId === "credit_card"` or "credit" appears in its name. | `fetchAccountTypes.ts` | new ticket |
| P2 | **The rebuild implementations disagree.** They differ on reconciliation status, timestamp type and credit-card fields, and none clears `summaryReconciliationStatus`. | rebuild scripts and service | SPENDLY-499 |
| P3 | **Due-posts skip dashboard summaries.** Expenses posted this way are missing from the period summaries. | `duePost.ts` | SPENDLY-495 |
| P3 | **Mislabelled row.** A Demat-transfer entry shows as "Adjustment" instead of a transfer. | `activityDisplay.ts` | new ticket |
| P3 | **Orphaned cash leg.** Deleting a Demat-transfer `accountEntries` row leaves its Investment Cash leg behind. There is no UI caller today. | `FinanceDataProvider.deleteEntry` | new ticket |
| P3 | **Two-device race.** Two devices posting the same due charge while both are offline can each apply the delta once. Accepted: the planner's `lastProcessed` check makes this rare, and a rebuild corrects it. | `duePost.ts` | — |

## Tests
- `shared/utils/ledgerAccountDeltas.test.ts` (new): every kind; soft-deleted and voided rows; relation fields; the sum equals `computeBankBalance` across accounts and baselines.
- `services/portfolio/investmentCash.test.ts`: top-up debits and withdrawal credits the bank in the same batch; an unseeded bank is seeded and flagged; a retry over an existing entry does not debit twice.
- `services/subscriptions/duePost.test.ts`: an expense debits its account; a card charge raises outstanding; a transfer moves both accounts; an existing charge doc gets no balance op.
- `services/ledger/fetchAccountTypes.test.ts`: `docAlreadyWritten` uses the cache first, falls back to the server, and treats the doc as new when offline.
- `shared/utils/accountBalance.test.ts`: the HDFC regression. A stored balance ₹24,500 high offsets every anchored row by exactly that amount, and after a rebuild the anchored rows match the full replay.
