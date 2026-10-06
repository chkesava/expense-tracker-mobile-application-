# Firestore Cursor-Based Ledger Pagination (SPENDLY-410)

## 1. Overview & Objective

Prior to Epic SPENDLY-406, Spendly queried all historical transactions across the entire user collection on startup and during background idle upgrades. For users with large ledgers (e.g. ~2,000 transactions), every session re-read thousands of documents, generating ~24,000 unnecessary Firestore document reads daily.

In **SPENDLY-409**, the background unlimited idle upgrade was removed.
In **SPENDLY-410**, we implemented **deterministic cursor-based pagination** (`startAfter` + `limit(50)`) for historical transactions, allowing users to browse through months and years of transactions without ever reading the full collection up front.

---

## 2. Architecture & Design

### 2.1 Staged Realtime Stream + On-Demand Cursor Extension
- **Realtime Active Window**: `FinanceDataProvider` maintains a bounded realtime listener on the most recent 300 transactions (`query(col, orderBy("createdAt", "desc"), limit(300))`). This satisfies all recent dashboard calculations, current billing cycles, and instant updates with zero latency.
- **Cursor-Based Historical Query**: When a user scrolls to the bottom of the ledger or explicitly requests older transactions, Firestore is queried incrementally:
  ```ts
  query(
    collection(db, "users", uid, "expenses"),
    orderBy("createdAt", "desc"),
    startAfter(lastDocSnapshot),
    limit(50)
  );
  ```
- **Deterministic Ordering & Tie-Breaking**: By passing `QueryDocumentSnapshot` to `startAfter()`, Firestore automatically incorporates the document's ID (`__name__`) as the final deterministic tie-breaker. This prevents skipped or duplicated rows when documents share identical timestamps.

### 2.2 Deduplication & Push-Out Preservation
1. **ID Deduplication**: When combining `realtimeExpenses` and `paginatedExpenses`:
   - Realtime documents ALWAYS take precedence over paginated documents if IDs collide.
   - Any paginated item not in the realtime set is appended in chronological order.
2. **Push-Out Preservation**: When new transactions arrive in the realtime listener, existing transactions at the boundary may be pushed out of the 300-doc window. The listener detects these displaced documents and transfers them into `paginatedExpenses`, ensuring no items vanish from the user's active view.
3. **Local Optimistic Mutations**: `FinanceDataProvider` provides `removeExpense`, `updateExpense`, `removeIncome`, and `updateIncome` so edits and soft-deletes apply immediately across both realtime and paginated sets.

### 2.3 UI Integration
- **`components/ExpenseList.tsx`**:
  - `FlashList` wired with `onEndReached` (threshold `0.3`) and `ListFooterComponent`.
  - Shows an `ActivityIndicator` with `"Loading older transactions..."` while a page is in flight.
  - Shows a discrete `"Load older transactions"` trigger when more items exist.
- **`app/(app)/ledger.tsx` (Journal)**:
  - Consumes `useLedgerPagination()`.
  - Replaced the confusing static banner with an informative notice: *"Showing recent transactions. Displaying the latest N transactions. Scroll down or tap below to load older history."*
  - Dedicated action button: `Load older transactions (+50)`.
  - Once all pages are loaded, `ledgerComplete` flips to `true`, revealing complete running cash flows and period totals.
- **`components/analytics/ExportDataModal.tsx`**:
  - When an export is requested for a scope that needs full history, if `ledgerComplete` is false, it prompts the user to download all historical transactions on demand before exporting.

### 2.4 Read Attribution & Telemetry
Every cursor pagination request is logged via `logDirectRead`:
```ts
logDirectRead(`users/${uid}/expenses`, snap.docs.length, snap.metadata.fromCache ? "cache" : "server", {
  feature: "ledger_pagination",
  queryShape: `startAfter limit=50`,
});
```
This guarantees complete visibility in `getFirestoreReadStats()`.

---

## 3. Verification & Safety Guardrails

1. **Type Safety**:
   - `npm run typecheck:shared` — 0 errors.
   - `npm run typecheck` — 0 errors.
2. **Performance Guardrails**:
   - `npm run perf:verify` — 0 violations.
3. **Automated Unit Tests**:
   - `npm test -- shared/utils/ledgerPagination.test.ts shared/utils/ledgerSnapshot.test.ts` — 17 passed.
   - Full test suite: **364 test files passed (5,438 tests)**.
