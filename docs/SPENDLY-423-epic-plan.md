# SPENDLY-423 Epic Plan: Financial Materialized State & Zero-Ledger-Calculation Architecture

## Goal Description
The objective of Epic SPENDLY-423 is to completely move the Spendly mobile app from a "transaction-replay-driven" financial calculation architecture to a **persisted materialized financial state** architecture. The transaction ledger remains the immutable source of truth, but the UI will no longer read thousands of historical transactions just to derive the current net worth, account balances, or dashboard aggregates. 

This enables instantaneous O(1) first-paint loads for the Money and Dashboard surfaces, regardless of whether the user has 10 transactions or 50,000 transactions.

## Status Overview & Foundation
* **Phase 0 & 1 (Discovery & Foundation):** Partially established. The rules of engagement (atomic batched writes, client-side idempotency) are proven.
* **Phase 2 (SPENDLY-426):** **COMPLETED** (via SPENDLY-422). `Account` documents now natively store `currentBalance`.
* **Phase 3 (SPENDLY-427):** **COMPLETED** (via SPENDLY-422). `Account` documents for credit cards now natively store `currentOutstanding`, `statementDue`, `unbilledSpend`, etc.

**Remaining Focus for this Epic Plan:**
We will sequence the execution of Phase 4 through Phase 7. Because Spark plan Firebase restricts Cloud Functions, **all materialization updates will be driven via client-side atomic Firestore Batches using `FieldValue.increment()`**, ensuring offline-first reliability and immediate local cache updates without waiting for server triggers.

---

## Proposed Execution Plan

### Phase 4 (SPENDLY-428): Net Worth & Asset/Liability State
**Objective:** Create a single top-level document `users/{uid}/financialSummaries/netWorth` so the Money/Dashboard screens do not need to aggregate all `Account`, `Holding`, and `Borrowing` docs at runtime.

**Implementation Steps:**
1. **Schema Definition:**
   ```typescript
   interface NetWorthSummary {
     netWorth: number;
     totalAssets: number;
     totalLiabilities: number;
     bankCashTotal: number;
     fixedDepositTotal: number;
     investmentCash: number;
     holdingsValue: number; // Snapshot of market value
     epfValue: number;
     calculatedAt: string; // ISO timestamp
     summaryVersion: number;
   }
   ```
2. **Write Path (Delta propagation):**
   Update the core ledger write hooks (`useExpenses`, `useIncomes`, `useAccountTransfers`, etc.) to calculate the net change (`delta`) in the asset/liability. Alongside the `Account` update, add a `FieldValue.increment(delta)` to the `financialSummaries/netWorth` document inside the same `writeBatch`.
3. **Read Path:**
   Refactor `hooks/useUnifiedNetWorth.ts` to instantly return the snapshot from `financialSummaries/netWorth` on first paint, triggering a background recalculation only if live stock prices cause the `holdingsValue` to drift from the snapshot.

### Phase 5 (SPENDLY-429): Investments, EPF, FD & Domain Materialization
**Objective:** Move domain-specific current-state calculations into domain summary documents (e.g., `users/{uid}/financialSummaries/investments`).

**Implementation Steps:**
1. **Investments:** Persist `investmentCash`, `holdingsMarketValue`, `investedValue`, and `realisedPnL`.
2. **EPF:** Persist `epfCurrentBalance`, `employeeContribution`, `employerContribution`.
3. **Fixed Deposits:** Persist `fdPrincipalTotal`, `fdMaturedTotal`.
4. **Integration:** Plumb these domain aggregates upward so a change in a stock holding updates the `financialSummaries/investments` doc, which in turn increments the `financialSummaries/netWorth` doc.

### Phase 6 (SPENDLY-430): Dashboard & Analytics Materialization
**Objective:** Precompute the heavy dashboard aggregates (e.g., Monthly Income/Expense vs Budget).

**Implementation Steps:**
1. **Period Summaries:** Create a collection `users/{uid}/periodSummaries/{YYYY-MM}` holding `totalIncome`, `totalExpense`, and categorical rollups.
2. **Write Path:** When an expense is recorded in `"2026-10"`, the batch increments `periodSummaries/2026-10.totalExpense`.
3. **Read Path:** Dashboard loads exactly one document for the current month instead of querying all `expenses` where `date >= startOfMonth`.

### Phase 7 (SPENDLY-431): Backfill, Reconciliation & Hardening
**Objective:** Ensure integrity across the new summary architecture.

**Implementation Steps:**
1. **Global Rebuild CLI:** Expand `scripts/rebuild-financial-summaries.ts` to iterate over all users, compute true Net Worth/Period Totals from the ledger, and overwrite the `financialSummaries` and `periodSummaries` collections.
2. **In-App Health Check:** Build a lightweight validation routine that compares `netWorth` against the sum of materialized `Account` docs and flags variances to the user.

---

> [!IMPORTANT]
> **User Review Required**
> 
> **Client-Side vs Cloud Functions:** Since the app utilizes the Spark plan (no Cloud Functions), this plan heavily relies on **client-side batch writes** using `FieldValue.increment()`. This means if a user updates an expense, their device must successfully commit the batch to update both the ledger and the `financialSummaries` doc. Are you comfortable keeping this strictly client-side, or do you have a Netlify serverless function strategy you prefer for global aggregates?
> 
> **Holdings Market Value:** Stock market prices fluctuate constantly. The materialized `netWorth.holdingsValue` will be a snapshot. Do you want the client app to silently update this snapshot in Firebase whenever it fetches fresh live quotes from the Yahoo Finance API, or should it remain static until a ledger transaction occurs?

## Verification Plan

### Automated Tests
* We will write/update Vitest unit tests in `shared/utils/netWorth.test.ts` and `shared/utils/runwaySources.test.ts` to verify the delta generation logic for `FieldValue.increment`.

### Manual Verification
* Monitor Firebase read counts in the Emulator: Opening the Dashboard should read exactly `O(1)` or `O(few)` documents instead of `O(N)` ledger transactions.
* Perform a dry-run rebuild via `npx tsx scripts/rebuild-financial-summaries.ts` to mathematically prove that the materialized net worth exactly matches the ledger replay.
