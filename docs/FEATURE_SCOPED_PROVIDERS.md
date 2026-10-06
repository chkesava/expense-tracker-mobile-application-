# Feature-Scoped Providers and Listener Lifecycle (SPENDLY-401)

## Overview

In Spendly, multiple data domains (such as Borrowings, Receivables, Credit Card Bills, and SMS Automation) are specific to particular screens and workflows. Previously, their Firestore snapshot listeners and initialization routines were mounted eagerly and globally at application launch, competing with the critical render path and initial paint.

SPENDLY-401 establishes an **Active-On-Demand Lifecycle Pattern** for feature-scoped providers and hooks:
- **Zero Inactive Listeners**: Listeners are attached only when an active consumer screen or component mounts.
- **Reference Counting**: Multiple components (e.g. nested modals, list items) increment and decrement a subscriber count without opening duplicate listeners.
- **Grace Period Teardown (15 Seconds)**: When subscriber count hits 0 (e.g. user toggles tabs or closes a modal), a 15-second grace period timer starts before detaching the Firestore snapshot listener. This eliminates listener thrashing during common navigation patterns.
- **Cache Retention**: In-memory state is preserved across listener detachments so subsequent visits display instantly with 0ms visual flicker.
- **100% Backward-Compatible Context API**: Hooks retain their signatures and types (`useBorrowings()`, `useCreditCardBills()`, `useReceivables()`), supporting an optional `{ enabled?: boolean }` parameter.

---

## Architecture: Active-On-Demand Lifecycle

```
[Screen / Component Mounts]
        │
        ▼ calls useFeature()
[Increment subscriber count]
        │
   Count was 0?
   ├── Yes ──► Cancel pending teardown timer (if any)
   │          Attach onSnapshot listener (realtime updates begin)
   └── No  ──► Already active, consume existing state immediately
        │
[Screen / Component Unmounts]
        │
        ▼
[Decrement subscriber count]
        │
   Count is 0?
   ├── Yes ──► Start Grace Period Timer (15 seconds)
   │           └── If timer expires without new subscribers:
   │               Detach onSnapshot listener
   │               (Preserve in-memory cached state for instant return)
   └── No  ──► Keep listener active for other mounted screens
```

---

## Implementation Details

### 1. `BorrowingsReceivablesProvider.tsx` & Hooks
- `borrowings` and `receivables` listeners are individually gated by `shouldListenBorrowings` and `shouldListenReceivables`.
- `registerBorrowingsSubscriber()` and `registerReceivablesSubscriber()` manage reference counters and 15s teardown timers.
- `useBorrowings(options?: { enabled?: boolean })` and `useReceivables(options?: { enabled?: boolean })` register subscribers on mount and unregister on unmount.
- Global UI shells (`GlobalAddModals.tsx`, `CalendarNotificationSync.tsx`) pass `{ enabled: false }` or check specific preferences (`prefs.duesEnabled`) to avoid starting listeners during startup.

### 2. `CreditCardBillsProvider.tsx` & `useCreditCardBills.ts`
- Gated by `shouldListen` state, managed via `registerSubscriber()` with a 15-second grace period teardown.
- `useCreditCardBills(options?: { enabled?: boolean })` automatically subscribes active consumers on mount.
- `LedgerHealthReport.tsx` consumes `useCreditCardBills()` directly to participate in subscriber counting.

### 3. `SmsReceiverProvider.tsx`
- Initial AsyncStorage reads (`loadSmsAutomationPrefs`, `loadSmsInboundStatus`) and native permission check (`syncPermission`) are scheduled via `scheduleIdleWork`.
- Prevents React Native bridge contention during cold app boot.

### 4. `SubscriptionsWidget.tsx` & `DashboardScreen`
- `DashboardScreen` (`app/(app)/dashboard.tsx`) is completely decoupled from `useBorrowings` and `useCreditCardBills`.
- Upcoming credit card and borrowing dues calculation is encapsulated inside `SubscriptionsWidget.tsx`.
- `SubscriptionsWidget` defers subscribing to `useCreditCardBills` and `useBorrowings` until idle via `scheduleIdleWork`.
- **Result:** Cold app startup attaches **zero** `creditCardBills`, `borrowings`, or `receivables` Firestore listeners during initial dashboard paint.

---

## Verification & Manual Testing Guide

1. **Cold Launch Verification**:
   - Launch app from cold start.
   - Observe in telemetry / console that no `firestore_listener_start` events fire for `creditCardBills`, `borrowings`, or `receivables` during initial splash and dashboard paint.
2. **On-Demand Activation**:
   - Navigate to **Accounts** -> select a Credit Card account or visit **Ledger** -> **Credit Cards**.
   - Observe `firestore_listener_start` event fires for `creditCardBills`.
   - Navigate to **Accounts** -> Borrowings or open Borrowing details.
   - Observe `firestore_listener_start` event fires for `borrowings`.
3. **Grace Period Verification**:
   - Switch between Borrowings and Receivables or open and close an Add modal within 15 seconds.
   - Verify listeners do not repeatedly teardown and recreate.
   - Remain on Dashboard for >15 seconds without visiting Borrowings; verify listener is cleanly detached.
