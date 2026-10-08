# SPENDLY-422: Persist authoritative account, credit-card and bill summaries in Firestore

## Objective
Remove the dependency of critical financial UI (account cards, credit-card balances, bills, net-worth summaries) from replaying the full transaction ledger on the client. We will achieve this by persisting authoritative, materialized financial state directly on the `Account` and `CreditCardBill` Firestore documents. 

Transactions remain the immutable/auditable source ledger, while the app reads stored summaries for O(1) first-paint balance rendering.

## Phase 1: Data Model & TypeScript Contracts
1. **Extend `shared/types/expense.ts` (`Account`)**:
   Add the new materialized summary fields:
   * **Standard Account fields**: `currentBalance`, `balanceAsOf`, `balanceVersion`, `balanceUpdatedAt`, `balanceReconciliationStatus`, `balanceLastRebuiltAt`.
   * **Credit Card Specific fields**: `currentOutstanding`, `statementDue`, `unbilledSpend`, `availableCredit`, `paidThisCycle`, `cashbackThisCycle`, `oldestOpenRemaining`, `oldestOpenBillId`, `openCycleStart`, `nextDueDate`, `summaryAsOf`, `summaryVersion`, `summaryReconciliationStatus`.
   * *Note: Ensure we do not overload `currentBalance` for credit-card liabilities.*
2. **Review `shared/types/creditCardBill.ts` (`CreditCardBill`)**:
   * Ensure `statementAmount`, `amountPaid`, `remainingAmount`, `status`, `paymentIds`, `accountId`, `billingCycleStart`/`End` (currently optional), `statementDate`, `dueDate`, `version`, and `updatedAt` are strictly typed as authoritative state.
3. **Firestore Rules Update**:
   * Add strict validation rules in `firestore.rules` preventing arbitrary client writes to these materialized fields unless properly structured. Writes should be protected by trusted validation logic or server rules where applicable.

## Phase 2: Write-path Architecture (Atomic Mutations)
Every money mutation must update the affected materialized summary in the same atomic operation (via Firestore batched writes or transactions).
1. **Create Utility for Balance Deltas**:
   * Build `shared/utils/mutations/balanceMutations.ts` (or similar) to standardize the application of deltas for expenses, incomes, manual entries, and transfers.
2. **Update Core Operations**:
   * **Expenses/Incomes**: Adjust create/edit/soft-delete/restore logic. Compute the exact delta (`new - old`) and apply atomically to the `currentBalance` / `currentOutstanding`.
   * **Transfers**: Atomically debit the source account summary and credit the destination account summary.
   * **Account entries, Borrowings & Receivables**: Ensure manual adjustments correctly calculate into the new `currentBalance`.
3. **Credit Card Bill Operations**:
   * **Bill Generation/Update/Cancellation**: Atomically update the CC account's `statementDue`, `unbilledSpend`, and `openCycleStart`.
   * **Bill Payment (Full/Partial) & Voids**: Atomically update both the source bank account (`currentBalance`), the CC account (`currentOutstanding`, `paidThisCycle`, etc.), and the `Bill` document (`amountPaid`, `remainingAmount`, `status`).
   * **Cashback/Statement Credit**: Must update the card liability without being treated as income or ordinary bill payment.
4. **Idempotency**: 
   * Ensure SPENDLY-417 bill idempotency guarantees are maintained (re-running generation or retrying a payment must not double-count or reset paid amounts).

## Phase 3: Read-path Architecture
Critical first-paint UI must read materialized state directly instead of computing it via `computeBankBalance()` / `computeOutstandingCredit()`.
1. **Accounts List & Detail Hero**: Bind to `account.currentBalance`.
2. **Credit-Card List & Detail**: Bind to `account.currentOutstanding`, `account.statementDue`, `account.unbilledSpend`, `account.availableCredit`.
3. **Money/Accounts Summary & Net Worth**: Compute from the fast array of Account documents rather than 30k+ ledger items.
4. **Bills UI**: Display `statementAmount`, `amountPaid`, `remainingAmount`, and `status` directly from the `CreditCardBill` document without loading the ledger.

*Note: Keep pure functions for reconciliation, migration/backfill, tests, and audit/debug, but remove them from the UI render path.*

## Phase 4: Reconciliation & Rebuild Tooling
Create a deterministic rebuild script/function: `rebuildFinancialSummaries(userId, accountId, mode: 'dryRun' | 'apply')`.
1. Read the complete source ledger.
2. Recompute expected values using trusted pure functions.
3. Compare expected values with the materialized summaries.
4. Produce a dry-run report.
5. If `mode === 'apply'`, apply only the mismatches and record reconciliation metadata/timestamp.
6. The function must be idempotent, never delete source transactions, and flag data integrity issues rather than guessing.
7. Add an in-app/manual reconciliation trigger for a specific account/card where appropriate.

## Phase 5: Migration and Backfill
Execute a staged rollout to initialize all existing users.
1. **Dry-Run Script**: Run dry-run for all users/accounts/cards.
2. **Audit Report**: Report current stored values, recalculated values, variance, source-row count, missing/invalid bill links, and duplicate bill/payment anomalies.
3. **Approval**: Review dry-run results.
4. **Production Backfill**: Apply materialized values safely.
5. **Verification Pass**: Run the script again post-backfill to ensure 0 variance.
6. **Record**: Log migration version for each account.

## Phase 6: QA and Validation
1. **Test Coverage**:
   * Unit tests for delta logic (creates, edits, deletes).
   * E2E/Integration tests covering mutation paths, migration, reconciliation, failure/retry, and SPENDLY-417 idempotency.
   * `npm run test:rules` for Firestore rule updates.
2. **Performance Validation**:
   * Attach read-volume/performance before-vs-after evidence to the ticket.
   * Verify that loading older Journal pages does not unexpectedly alter already-correct current balances.
3. **Safety Checklist**:
   * `npm test`, `npm run typecheck:shared`, `npx tsc -p tsconfig.json --noEmit`
   * Refer to `docs/AFTER_MERGE_CHECKLIST.md` before concluding the rollout.
