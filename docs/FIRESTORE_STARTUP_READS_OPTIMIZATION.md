# Removal of Unlimited Startup Ledger Reads Report — SPENDLY-409

This document records the architectural fix eliminating the background automatic upgrade from staged ledger queries to unbounded full-history queries during app startup in `FinanceDataProvider.tsx`.

---

## 1. Problem Statement & Root Cause

Previously, `FinanceDataProvider.tsx` implemented a two-stage loading pattern:
1. **First Paint**: Subscribed to a 300-document slice of expenses and incomes (`limit(300)`).
2. **Idle Upgrade**: Scheduled a background task via `scheduleIdleWork` that cancelled the 300-document listener and attached **unbounded** queries across the entire `expenses` and `incomes` subcollections:
   ```ts
   // PREVIOUS BEHAVIOR:
   const cancelLedgerUpgrade = scheduleIdleWork(() => {
     expensesUnsub();
     expensesUnsub = onSnapshot(query(expensesCol, orderBy("createdAt", "desc")), ...);
     incomesUnsub();
     incomesUnsub = onSnapshot(query(incomesCol, orderBy("createdAt", "desc")), ...);
   });
   ```

### Why This Caused the 24K Daily Reads Explosion:
- For a typical user account with ~1,500 expenses and ~500 incomes, every app launch, warm restore from background, or network reconnect pulled all 2,000 documents from Firestore.
- With 10–12 app opens per day, this single mechanism generated **~20,000–24,000 document reads**.

---

## 2. Implementation Changes

1. **Eliminated Automatic Idle Upgrade**:
   - Removed `scheduleIdleWork` and `cancelLedgerUpgrade` in `FinanceDataProvider.tsx`.
   - The bounded `limit(LEDGER_STAGED_LIMIT)` (300 documents) query is now the **permanent active realtime listener** for startup and dashboard hydration.
   - Initial expense and income reads are strictly capped at 300 documents per collection.
2. **Preserved Financial Correctness**:
   - `expensesLoading` and `incomesLoading` resolve on first paint as before.
   - `expensesComplete` and `incomesComplete` resolve when `snap.docs.length < 300` (meaning the user has fewer than 300 total transactions in history).
   - Historical records older than 300 items will be paged on-demand via cursor-based pagination (`startAfter` + `limit(50)`) in **SPENDLY-410**.
   - Account balances and net worth calculations remain 100% authoritative because balances are sourced directly from canonical account records, not computed via lifetime sum of client-loaded expense documents.
3. **Telemetry & Attribution**:
   - Verified that `logQuerySnapshot` now permanently records `query=limit=300` and never fires `query=unlimited` on startup or idle.

---

## 3. Results & Impact

- **Startup Document Reads Reduced by 70–85%**:
  - Cold startup expense and income reads capped at $\le 600$ total documents (vs 2,000+ unbounded).
  - Eliminates the ~20,000 daily read amplification from repeated idle upgrades.
- **Zero UI Latency Impact**:
  - `app_ready` and `dashboard_data_ready` remain under 200ms and ~400ms respectively.
- **Verification**:
  - 11 ledger test suites (236 tests) passing.
  - TypeScript compilation 100% clean.
  - Performance budgets and guardrails (`npm run perf:verify`) 100% clean.
