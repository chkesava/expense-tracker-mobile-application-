# Testing Strategy Audit — Expense Tracker Mobile

> **Worktree:** `claude/testing-audit` (branched from `origin/main` @ `3c19363`)
> **Audit date:** 2026-08-15
> **Commit:** `024b45e`

---

## Final Test Results

| | Before audit | After audit |
|--|--|--|
| **Test files** | 88 | 91 |
| **Tests** | 624 | 659 |
| **Passed** | 624 ✅ | 659 ✅ |
| **Failed** | 0 | 0 |

---

## Coverage by Priority Area

| # | Area | Status | Key Files |
|---|------|--------|-----------|
| 1 | **Authentication** | ✅ Well covered | `lib/authHelpers.test.ts`, `lib/errors.test.ts`, `lib/privacySession.test.ts`, `lib/duressPath.contract.test.ts` |
| 2 | **Account balance calculations** | ✅ Well covered | `shared/utils/accountBalance.test.ts`, `shared/utils/accountActivities.test.ts`, `lib/finance/borrowings.integration.test.ts`, `lib/finance/receivables.integration.test.ts` |
| 3 | **Income/expense calculations** | ✅ Well covered | `shared/utils/insightMetrics.test.ts`, `shared/utils/rangeAnalytics.test.ts`, `shared/utils/incomeSummary.test.ts`, `shared/utils/dashboardWidgets.test.ts` |
| 4 | **Transfers** | ✅ Well covered | `shared/utils/accountBalance.test.ts`, `lib/finance/moneyFlows.integration.test.ts` |
| 5 | **Borrowed money** | ✅ Well covered | `lib/finance/borrowings.integration.test.ts`, `shared/utils/borrowingMath.test.ts` |
| 6 | **Money lent / receivables** | ✅ Well covered | `lib/finance/receivables.integration.test.ts`, `shared/utils/receivableMath.test.ts` |
| 7 | **Net worth** | ⚠️ No pure function | Computed inline in `AccountsList.tsx` by summing `computeBankBalance` per account. Balance math thoroughly tested; net worth is a trivial sum of already-tested values. No extractable function to test. |
| 8 | **Transaction creation** | ✅ Covered | `lib/finance/memoryLedger.test.ts` — addExpense / addIncome / addBorrowing / addReceivable |
| 9 | **Transaction editing** | ✅ Covered | `lib/finance/memoryLedger.test.ts` — updateExpense (amount + month re-derivation) |
| 10 | **Transaction deletion** | ✅ Covered | `lib/finance/memoryLedger.test.ts` — deleteExpense, deleteAccount guard |
| 11 | **Notifications** | ✅ Now fully covered | `shared/utils/creditCardBillReminders.test.ts`, `services/creditCardBills/billNotificationCopy.test.ts`, **+ `services/creditCardBills/billReminderScheduler.test.ts` (added)** |
| 12 | **Offline behavior** | ✅ Well covered | `lib/firestoreWrite.test.ts` — acked/queued/late-failure, pending-sync count, `writeSavedMessage` |
| 13 | **Navigation** | ✅ Well covered | `shared/config/navigation.test.ts`, `shared/config/routeRestoration.test.ts`, `shared/config/journeys.test.ts` |
| 14 | **Error handling** | ✅ Now fully covered | `lib/errors.test.ts`, `lib/firestoreErrors.test.ts`, `lib/firestoreWrite.test.ts`, **+ `lib/globalErrorHandler.test.ts` (added)** |

---

## Tests Added

### 1. `lib/fetchWithTimeout.test.ts` — 9 tests *(new)*

| Test | Description |
|------|-------------|
| `isAbortError > returns true for AbortError` | Identifies abort-style errors |
| `isAbortError > returns true for TimeoutError` | Identifies timeout-style errors |
| `isAbortError > returns false for ordinary errors` | No false positives |
| `fetchWithTimeout > resolves with the response when server replies in time` | Happy path |
| `fetchWithTimeout > respects the default timeout constant of 8 seconds` | Constant value contract |
| `fetchWithTimeout > aborts with AbortError when the internal timer fires` | Timeout abort path |
| `fetchWithTimeout > aborts immediately when already-aborted signal provided` | Pre-aborted upstream |
| `fetchWithTimeout > aborts when upstream signal fires mid-request` | Mid-flight cancellation |
| `fetchWithTimeout > clears the internal timer on successful response` | No timer leak |

**Rationale:** Every outbound HTTP call in the app goes through `fetchWithTimeout`. A bug in the timeout/abort path means hung spinners and resource leaks.

---

### 2. `lib/globalErrorHandler.test.ts` — 6 tests *(new)*

| Test | Description |
|------|-------------|
| `installs without throwing on plain Node environment` | Runs safely in test env |
| `wraps ErrorUtils.setGlobalHandler when RN global is present` | RN crash handler integration |
| `forwards fatal errors to the default handler` | Fatal crash report chain |
| `registers the Hermes rejection tracker` | Unhandled promise rejection capture |
| `falls back to addEventListener for browser/JSC environments` | Web/JSC fallback path |
| `is idempotent — only installs once` | Guard against double-installation |

**Rationale:** Without this handler, unhandled rejections are silent in release builds and uncaught exceptions produce raw crash messages. Zero coverage here meant a silent regression could disable all error capture.

---

### 3. `services/creditCardBills/billReminderScheduler.test.ts` — 8 tests *(new)*

| Test | Description |
|------|-------------|
| `skips when global reminders are disabled` | Global settings respected |
| `skips when bill reminderEnabled = false` | Per-bill setting respected |
| `skips when bill is already PAID` | No notifications for settled bills |
| `logs permission_denied failure when OS permission not granted` | Permission flow |
| `schedules notifications for eligible bills with permission` | Happy path |
| `cancels existing reminders before rescheduling` | Stale notification guard |
| `silently skips bills with no matching account` | Missing map entry |
| `processes multiple bills independently` | Multi-bill correctness |

**Rationale:** `reconcileBillReminders` was the only non-trivial service function with zero tests. It drives credit card bill notifications — high user-visible impact on payment reminders.

---

## Important Untested Areas (Not Added — Justified)

| Area | Why not added |
|------|---------------|
| **Net worth UI calculation** | No pure function exists — computed inline in `AccountsList.tsx` summing already-tested `computeBankBalance` results. |
| **`ensureCategoryHierarchy`** | Deeply coupled to Firestore SDK (`getDoc`, `writeBatch`, `setDoc`). Needs Firebase emulator. Low ROI vs. complexity. |
| **`queryNetworkBinding`** | Wraps `@react-native-community/netinfo` and React Native `AppState`. Requires a device or emulator. Pure logic is trivial. |
| **React component tests** | Need `@testing-library/react-native` + Jest/Babel. Current Vitest+Node setup structurally excludes all `react-native` imports. |
| **Auth flow E2E (sign-in / OAuth)** | Requires Firebase Auth emulator. The *error message layer* is fully tested; the network round-trip is not. |
| **Firestore CRUD hooks** | `useExpenses`, `useBorrowings`, etc. are React hooks with Firebase listeners. Would need React Query + Firestore mocks. |

---

## Architecture Observations

1. **Good separation of concerns.** Business logic in `shared/utils/` and `lib/finance/` is framework-independent and fully testable. The suite exploits this well.

2. **`createMemoryLedger` is a high-value seam.** The in-memory fake in `lib/finance/memoryLedger.ts` enables lifecycle integration tests (create → repay → settle → balance check) without Firebase. This pattern should be extended to all future integration tests.

3. **No component tests — the biggest coverage gap.** UI interactions, form submissions, bottom sheets, and navigation guards have zero automated verification. Consider adding `@testing-library/react-native` with a Jest config to cover critical flows like transaction submission and auth screens.

4. **Vitest+Node is pragmatic and fast** (~90s for 659 tests). The constraint is structural: anything touching `react-native`, `expo-*`, or `AsyncStorage` must be mocked or moved to a separate Jest/device test suite.

5. **SMS pipeline is well covered.** 15 test files cover the SMS auto-categorization pipeline end-to-end — a high-risk parsing feature that would otherwise be hard to validate manually.
