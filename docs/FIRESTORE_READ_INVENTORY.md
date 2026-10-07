# Firestore Read Inventory & Attribution Report — SPENDLY-407

This document captures the baseline measurement, query shapes, listener lifecycle attribution, and root causes explaining the ~24,000 Firestore reads/day observation.

---

## 1. Executive Summary: Why Does Spendly Consume 24K Reads/Day?

Investigation of the snapshot lifecycle, query shapes, and provider implementations identified three primary drivers of high Firestore read consumption:

1. **The Automatic Background Unlimited Upgrade (P0 Root Cause - ~85% of volume)**:
   - In `FinanceDataProvider.tsx`, app startup loads a staged page of 300 expenses and 300 incomes.
   - However, a background timer (`scheduleIdleWork`) immediately un-subscribes those staged listeners and attaches **unbounded** queries (`query(expensesCol, orderBy("createdAt", "desc"))` and `query(incomesCol, orderBy("createdAt", "desc"))`).
   - If a user has 1,500 expenses and 500 incomes, every single app launch or process restore causes Firestore to read **2,000 documents** from the server/cache.
   - If the app is opened or resumed 10–12 times throughout the day, this single mechanism produces **~20,000–24,000 document reads**.
2. **Duplicate & Overlapping Listeners (P1 Root Cause - ~10% of volume)**:
   - Multiple secondary hooks query identical reference data or linked entity sets in parallel.
   - For example, `useCategories` performs direct `getDocs(collection(db, "users", uid, "expenses"))` during category edits and deletions rather than reading from cached state.
3. **AppState Resume & Reconnect Churn (P2 Root Cause - ~5% of volume)** — **resolved, see SPENDLY-414**:
   - This was the original hypothesis at baseline measurement. SPENDLY-414's full audit (every `AppState.addEventListener` call site, the `NetInfo` reconnect handler, and Firebase Auth's `onAuthStateChanged`) found it no longer holds: no code path anywhere tears down and recreates an `onSnapshot` listener on foreground, reconnect, or auth token refresh. The one AppState handler that does trigger a Firestore read (`ExpenseReferenceDataProvider`'s spaces/categorizationRules refetch, SPENDLY-412) is already throttled to once per 5 minutes. This P2 driver was addressed incidentally by SPENDLY-409–412's other changes rather than needing its own fix. Full findings: `docs/SPENDLY-414-appstate-reconnect-audit.md`.

---

## 2. Complete Inventory of Active Firestore Queries

| Provider / Hook | Collection Path | Query Shape | Mount Tier | Attribution Tag | Server/Cache Behavior | Read Impact |
|---|---|---|---|---|---|---|
| `FinanceDataProvider` | `users/{uid}/expenses` | `orderBy(createdAt, desc), limit(300)` | Immediate (startup) | `[finance]` | Cache first, then server updates | ~300 docs on cold launch |
| `FinanceDataProvider` | `users/{uid}/expenses` | `orderBy(createdAt, desc)` (UNLIMITED) | Deferred (idle) | `[finance]` | Full collection scan from server/cache | **Critical Multiplier** (1,000+ docs per session) |
| `FinanceDataProvider` | `users/{uid}/incomes` | `orderBy(createdAt, desc), limit(300)` | Immediate (startup) | `[finance]` | Cache first, then server updates | ~100–300 docs on cold launch |
| `FinanceDataProvider` | `users/{uid}/incomes` | `orderBy(createdAt, desc)` (UNLIMITED) | Deferred (idle) | `[finance]` | Full collection scan from server/cache | **Critical Multiplier** (500+ docs per session) |
| `FinanceDataProvider` | `users/{uid}/accounts` | `collection` (bounded by accounts) | Immediate (startup) | `[finance]` | Small (< 20 docs) | Low |
| `FinanceDataProvider` | `users/{uid}/accountTypes` | `collection` (system & user types) | Immediate (startup) | `[finance]` | Small (< 15 docs) | Low |
| `FinanceDataProvider` | `users/{uid}/accountPayments` | `collection` | Deferred (idle) | `[finance]` | Cumulative list of account payments | Medium (~50–200 docs) |
| `FinanceDataProvider` | `users/{uid}/accountEntries` | `collection` | Deferred (idle) | `[finance]` | Cumulative balance checkpoints | Medium (~50–100 docs) |
| `FinanceDataProvider` | `users/{uid}/accountTransfers` | `collection` | Deferred (idle) | `[finance]` | Cumulative inter-account transfers | Low (~20–50 docs) |
| `ExpenseReferenceDataProvider` | `users/{uid}/categories` | `collection, limit(500)` (realtime) | Deferred (idle) | `[reference]` | Reference list (< 50 docs) | Low |
| `ExpenseReferenceDataProvider` | `users/{uid}/subscriptions` | `orderBy(name, asc), limit(200)` (realtime) | Immediate (startup) | `[reference]` | Active recurring subscriptions | Low (< 25 docs) |
| `ExpenseReferenceDataProvider` | `users/{uid}/spaces` | `orderBy(name), limit(200)` — **one-shot `getDocs`** (SPENDLY-412), refetched after writes and on foreground if >5min stale | Deferred (idle) | `[reference]` | Spaces reference list | Low (< 10 docs) |
| `ExpenseReferenceDataProvider` | `users/{uid}/categorizationRules` | `orderBy(createdAt, asc), limit(500)` — **one-shot `getDocs`** (SPENDLY-412), refetched after writes and on foreground if >5min stale | Deferred (idle) | `[reference]` | SMS auto-categorization rules | Low (< 30 docs) |
| `ExpenseReferenceDataProvider` | `users/{uid}/categoryBudgets` | `orderBy(month, desc)` | Immediate (startup) | `[reference]` | Monthly category budget limits | Medium (~50–100 docs) |
| `ExpenseReferenceDataProvider` | `users/{uid}/financialGoals` | `orderBy(createdAt, asc)` | Immediate (startup) | `[reference]` | Goals and targets | Low (< 15 docs) |
| `CreditCardBillsProvider` | `users/{uid}/creditCardBills` | `collection` | On-Demand (active) | `[creditCardBills]` | Mounted only when viewing CC tab/widget | Low (~10–30 docs) |
| `BorrowingsReceivablesProvider` | `users/{uid}/borrowings` | `orderBy(borrowedDate, desc)` | On-Demand (active) | `[borrowings]` | Mounted only when viewing Borrowings tab | Low (~10–50 docs) |
| `BorrowingsReceivablesProvider` | `users/{uid}/borrowingRepayments` | `orderBy(date, desc)` | On-Demand (active) | `[borrowings]` | Mounted only when viewing Borrowings tab | Low (~10–50 docs) |
| `BorrowingsReceivablesProvider` | `users/{uid}/receivables` | `orderBy(lentDate, desc)` | On-Demand (active) | `[receivables]` | Mounted only when viewing Receivables tab | Low (~10–50 docs) |
| `BorrowingsReceivablesProvider` | `users/{uid}/receivableRepayments` | `orderBy(date, desc)` | On-Demand (active) | `[receivables]` | Mounted only when viewing Receivables tab | Low (~10–50 docs) |

---

## 3. Top Read Paths Breakdown

```
Estimated Daily Reads (Single User, 15 App Opens/Day):
┌─────────────────────────────────────────────────────────────┬──────────────┬────────┐
│ Query / Operation                                           │ Daily Reads  │ Share  │
├─────────────────────────────────────────────────────────────┼──────────────┼────────┤
│ 1. Idle Unlimited Expenses Snapshot Upgrade                 │ ~16,500 docs │  68.8% │
│ 2. Idle Unlimited Incomes Snapshot Upgrade                  │  ~4,500 docs │  18.8% │
│ 3. Category Budgets & Account Payments                     │  ~1,800 docs │   7.5% │
│ 4. Staged 300-doc Initial Viewport Queries                  │    ~900 docs │   3.8% │
│ 5. Reference Collections (Categories, Spaces, Subscriptions)│    ~300 docs │   1.2% │
├─────────────────────────────────────────────────────────────┼──────────────┼────────┤
│ TOTAL ESTIMATED DAILY CONSUMPTION                           │ ~24,000 docs │ 100.0% │
└─────────────────────────────────────────────────────────────┴──────────────┴────────┘
```

---

## 4. Remediation Roadmap for Epic SPENDLY-406

1. **SPENDLY-408 (Eliminate Duplicate Listeners)**: Remove redundant listener mounts and eradicate direct `getDocs` collection scans in category handlers.
2. **SPENDLY-409 (Remove Unlimited Startup Reads)**: Delete the idle `scheduleIdleWork` unlimited upgrade in `FinanceDataProvider.tsx`. Keep the bounded 300-item window as the active realtime stream.
3. **SPENDLY-410 (Cursor-Based Ledger Pagination)**: Add `startAfter` cursor-based pagination so historical records load on demand in 50-item pages only when the user scrolls the Journal.
4. **SPENDLY-411 (Feature-Scoped Listener Lifecycle)**: Ensure secondary domains (EPF, Portfolio, Insurance) never mount listeners until their screens are active.
5. **SPENDLY-412 (Optimize Reference Data Sync)** — done: `spaces`/`categorizationRules` converted from realtime `onSnapshot` to one-shot `getDocs` (refetched on write and on >5min-stale app foreground); `categories`/`subscriptions` stay realtime (pervasive/correctness-sensitive consumers) but gained defensive `limit(...)` bounds; `lib/ensureCategoryHierarchy.ts` and `services/sms/smsRecurringSync.ts`'s previously-uninstrumented direct reads now emit `logDirectRead`. See `docs/SPENDLY-412-reference-data-sync.md`.
6. **SPENDLY-413 (Dashboard Summary Optimization)** — safety-net scope (confirmed with user): the dashboard doesn't over-fetch (nothing calls `loadAll*`/gates on completeness), but `cashFlowByMonth` and net worth's liquid balance silently assumed more history than the staged page guarantees. Fixed by trimming the cash-flow chart to only trustworthy months (`oldestTrustedCashFlowMonth`/`trimToTrustedCashFlow`) and surfacing a `liquidBalanceMayBePartial` flag on `NetWorthWidget` when an account has no `balanceAsOfDate` baseline and the ledger is staged. The full per-account running-balance summary (the ticket's actual "denormalized summary" ask) is deferred to a follow-up ticket — see `docs/SPENDLY-413-dashboard-summary-optimization.md`.
7. **SPENDLY-414 (AppState Reconnect Debounce)** — done: full audit found no unbounded Firestore read amplification from AppState/reconnect/auth-token-refresh transitions (addressed incidentally by SPENDLY-409–412). One defensive code comment added (`lib/queryNetworkBinding.ts`); no behavior changes needed. See `docs/SPENDLY-414-appstate-reconnect-audit.md`.
8. **SPENDLY-415 & SPENDLY-416 (Read Budgets & Rollout)**: Enforce `< 25 server reads` cold startup budget via automated guardrails.

---

## 5. Verification & Telemetry Safety Guardrails

- **Zero PII & Zero Financial Data**: `lib/firestoreReadDebug.ts` logs only path prefixes, collection names, document counts, and cache flags (`[fs-read] attach users/u/expenses docs=300 source=cache [finance] query=limit=300`). No transaction amounts, merchant names, or user identifiers are emitted.
- **Production Safety**: Attribution is active only when `__DEV__` is true or `EXPO_PUBLIC_PERF_MARKS=1` is configured.
