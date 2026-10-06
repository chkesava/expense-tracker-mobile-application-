# Startup Firestore Listener Inventory and Optimization Audit (SPENDLY-400)

## Executive Summary
Prior to SPENDLY-400, entering the Spendly authenticated app shell immediately and concurrently opened **17 separate Firestore realtime listeners** (`onSnapshot`). This created intense network socket and JS thread contention during startup, directly delaying first meaningful dashboard paint and snapshot delivery.

Under SPENDLY-400:
1. **Critical Startup Listeners (11)**: Only collections strictly required to render the Dashboard and Safe to Spend metric are initialized immediately upon entering the shell.
2. **Deferred Listeners (6)**: Collections only needed by secondary tabs, settings, or transaction edit dialogs are deferred to idle (`scheduleIdleWork`), completely freeing initial startup bandwidth.
3. **Listener Reduction**: 35% reduction in concurrent initial listeners (from 17 down to 11).

---

## Complete Startup Listener Inventory

| # | Provider | Target Path / Collection | Query Shape | Required for First Dashboard Paint? | Optimization Decision |
|---|---|---|---|---|---|
| 1 | `UserDocProvider` | `users/{uid}` | Single doc | **Yes** (Display currency, theme, role) | **Immediate** |
| 2 | `SystemSettingsProvider` | `system_settings/global` | Single doc | **Yes** (Maintenance status, default currency fallback) | **Immediate** |
| 3 | `FinanceDataProvider` | `users/{uid}/expenses` | `orderBy("createdAt", "desc"), limit(300)` | **Yes** (Recent expenses, monthly spend, streak) | **Immediate (Staged)**; upgraded to full on idle |
| 4 | `FinanceDataProvider` | `users/{uid}/incomes` | `orderBy("createdAt", "desc"), limit(300)` | **Yes** (Monthly cashflow, balance) | **Immediate (Staged)**; upgraded to full on idle |
| 5 | `FinanceDataProvider` | `users/{uid}/accounts` | `query(accounts)` | **Yes** (Account balances and cards) | **Immediate** |
| 6 | `FinanceDataProvider` | `users/{uid}/accountTypes` | `query(accountTypes)` | **Yes** (Account icon taxonomy & types) | **Immediate** |
| 7 | `CreditCardBillsProvider` | `users/{uid}/creditCardBills` | `query(creditCardBills)` | **Yes** (Safe to Spend card dues) | **Immediate** |
| 8 | `BorrowingsReceivablesProvider` | `users/{uid}/borrowings` | `orderBy("borrowedDate", "desc")` | **Yes** (Safe to Spend loan dues) | **Immediate** |
| 9 | `ExpenseReferenceDataProvider` | `users/{uid}/subscriptions` | `orderBy("name", "asc")` | **Yes** (Safe to Spend committed dues & subscriptions widget) | **Immediate** |
| 10 | `ExpenseReferenceDataProvider` | `users/{uid}/categoryBudgets` | `orderBy("month", "desc")` | **Yes** (Budget Alerts widget) | **Immediate** |
| 11 | `ExpenseReferenceDataProvider` | `users/{uid}/financialGoals` | `orderBy("createdAt", "asc")` | **Yes** (Financial Goals widget) | **Immediate** |
| 12 | `ExpenseReferenceDataProvider` | `users/{uid}/categories` | `query(categories)` | **No** (Dashboard computes categories from expenses; only used in modal dialogs) | **Deferred to idle** (`scheduleIdleWork`) |
| 13 | `ExpenseReferenceDataProvider` | `users/{uid}/spaces` | `orderBy("name")` | **No** (Only used in Spaces tab) | **Deferred to idle** (`scheduleIdleWork`) |
| 14 | `ExpenseReferenceDataProvider` | `users/{uid}/categorizationRules` | `orderBy("createdAt", "asc")` | **No** (Only used in Settings/Rule Manager) | **Deferred to idle** (`scheduleIdleWork`) |
| 15 | `BorrowingsReceivablesProvider` | `users/{uid}/borrowingRepayments` | `orderBy("date", "desc")` | **No** (Only used in Borrowing Details/history modal) | **Deferred to idle** (`scheduleIdleWork`) |
| 16 | `BorrowingsReceivablesProvider` | `users/{uid}/receivables` | `orderBy("lentDate", "desc")` | **No** (Dashboard does not display receivables) | **Deferred to idle** (`scheduleIdleWork`) |
| 17 | `BorrowingsReceivablesProvider` | `users/{uid}/receivableRepayments` | `orderBy("date", "desc")` | **No** (Only used in Receivable Details modal) | **Deferred to idle** (`scheduleIdleWork`) |

*(Note: `accountPayments`, `accountEntries`, and `accountTransfers` in `FinanceDataProvider` were previously deferred to idle in Phase 12).*

---

## Telemetry Added
All startup listeners now emit structured marks through `perfEvent`:
- `firestore_listener_start`: Emitted when an `onSnapshot` listener is initialized, with payload `{ collection: string }`.
- `firestore_first_snapshot`: Emitted when the first snapshot arrives, with payload `{ collection: string, docCount: number, fromCache: boolean }`.

---

## Correctness & Offline Safety
1. **Realtime behavior preserved**: All deferred listeners are attached via `scheduleIdleWork` and remain active realtime snapshot listeners for the life of the session.
2. **Offline support**: Queries continue to utilize Firestore local cache (`persistentLocalCache` on web, memory fallback on native).
3. **No Duplicate Listeners**: Centralized provider pattern maintained; downstream consumers continue reading from `ExpenseReferenceDataProvider` and `BorrowingsReceivablesProvider`.
