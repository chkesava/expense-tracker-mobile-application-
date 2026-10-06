# Progressive Critical-First Dashboard Loading (SPENDLY-402)

## Overview

Previously, the Spendly dashboard suffered from a monolithic screen-level skeleton period (`<DashboardSkeleton />`) that intercepted the entire view whenever core collections (`expenses`, `incomes`, or `accounts`) were resolving. Furthermore, secondary heavy widgets (such as Net Worth with Yahoo Finance market quotes and EPF projections) were mounted eagerly above the fold, while critical sections like Recent Activity were delayed.

SPENDLY-402 implements a **Progressive 5-Stage Critical-First Dashboard Architecture**:
1. **Zero Monolithic Skeleton Takeover**: The dashboard shell, greeting, month chip, and Quick Add action render immediately from frame 1 (0ms).
2. **Granular Inline Shimmers**: Individual widgets (`QuickInsightsWidget`, `SafeToSpendWidget`, `RecentActivityWidget`, `NetWorthWidget`) display modular inline shimmers when their specific data slice is pending, eliminating layout thrashing and false empty states.
3. **Critical-First Widget Prioritization**:
   - Above the fold: `focus` (`SafeToSpendWidget`), `quickAdd` (`QuickAddWidget`), `recentActivity` (`RecentActivityWidget`).
   - Below the fold / Staggered: `budgetAlerts`, `subscriptions`, `topCategories`, `overview`, `financialGoals`, `gamification`.
4. **Progressive Net Worth Hydration**:
   - `useUnifiedNetWorth({ progressive: true })` immediately calculates and displays `liquidBankAssets` from account snapshots.
   - Secondary listener attachments (`useBorrowings`, `useCreditCardBills`, `useReceivables`, `useInvestments`) and network quote requests are deferred until post-startup idle (`scheduleIdleWork`).
5. **Computation Optimization**:
   - `cashFlowByMonth` is skipped unless the `overview` widget is enabled.
   - Smart Insights is lazily mounted after initial paint.

---

## 5-Stage Progressive Loading Hierarchy

| Stage | Target Delay | Components / Data | UX Behavior |
|---|---|---|---|
| **Stage 1: Immediate Shell** | 0ms | `DashboardWelcome` (Greeting, month chip, FAB/Add actions), `QuickAddWidget` | Renders immediately with zero data blocking. Interactive from frame 1. |
| **Stage 2: Critical Financial Numbers** | 0–100ms | `SafeToSpendWidget` (`focus`), `QuickInsightsWidget` | Computes from cached/staged accounts & expenses. If first snap pending, displays compact inline skeleton. |
| **Stage 3: Recent Activity** | 100–200ms | `RecentActivityWidget` | Shows recent transactions immediately upon staged expenses load. Displays compact transaction list shimmer while loading. |
| **Stage 4: Secondary Widgets** | 200–400ms | `SubscriptionsWidget`, `BudgetAlertsWidget`, `TopCategoriesWidget`, `FinancialGoalsWidget` | Staggered mounting via `LazyMount` after initial paint to keep JS thread fluid. |
| **Stage 5: Advanced Analytics & Valuations** | 400ms+ (Idle) | `NetWorthWidget` (`overview`), `GamificationWidget` | Progressive hydration: liquid bank balance displays instantly from `accounts`; secondary valuations (stocks, EPF, loans) hydrate smoothly in the background. |

```
[App Launch]
    │
    ├── Frame 1 (0ms) ────────► Render Dashboard Shell & QuickAdd
    │
    ├── Frame 2 (Cache Read) ─► Render Safe-to-Spend & Quick Insights (Inline Shimmer if pending)
    │
    ├── Frame 3 (Staged Snap) ─► Render Recent Activity (Inline List Shimmer if pending)
    │
    ├── Idle (Staggered) ─────► Mount Secondary Widgets (Budget Alerts, Subscriptions, Goals)
    │
    └── Background Idle ──────► Hydrate Net Worth Valuations & Advanced Analytics
```

---

## Technical Details

### Granular Loading Contracts

- **`SafeToSpendWidget`**:
  ```tsx
  export interface SafeToSpendWidgetProps {
    budget: SpendlyBudget;
    currency: string;
    loading?: boolean;
  }
  ```
  When `loading: true`, the hero amount and flexible remaining values render pulsing `<Skeleton>` elements without collapsing the container.

- **`RecentActivityWidget`**:
  ```tsx
  export interface RecentActivityWidgetProps {
    expenses: Expense[];
    currency: string;
    loading?: boolean;
    onEditExpense: (expense: Expense) => void;
    onViewAll: () => void;
  }
  ```
  When `loading: true` and `expenses.length === 0`, 3 compact skeleton rows are displayed. `EmptyState` ("No Recent Transactions") only renders after loading completes with 0 records.

- **`QuickInsightsWidget`**:
  ```tsx
  export interface QuickInsightsWidgetProps {
    monthlySpent: number;
    monthlyIncome: number;
    previousSpent: number;
    previousIncome: number;
    currency: string;
    loading?: boolean;
    monthLabel?: string;
    onOpenMonthPicker?: () => void;
  }
  ```
  When `loading: true` and totals are 0, skeleton bars are shown in place of numeric totals.

- **`useUnifiedNetWorth`**:
  ```tsx
  export interface UseUnifiedNetWorthOptions {
    progressive?: boolean;
  }
  ```
  When `progressive: true`, core bank assets render immediately while secondary listeners are attached via `scheduleIdleWork`.

---

## Verification & Manual Testing Guide

1. **Cold Launch Verification**:
   - Close the app and launch from cold start.
   - Observe that the dashboard shell, greeting, and Quick Add action render immediately from frame 1 without any full-screen skeleton flicker.
   - Verify that individual widgets display clean, compact shimmer states until data arrives, then transition smoothly without layout jumps.
2. **Recent Transactions vs Empty State**:
   - Launch with an account that has transactions.
   - Confirm that the "No Recent Transactions" empty state does **not** flash before transactions are loaded.
3. **Progressive Net Worth**:
   - Scroll to the Net Worth card.
   - Confirm that liquid bank balance renders immediately.
   - Confirm that secondary valuations ("Updating valuations...") transition to complete without blocking interaction.
