# Dashboard React Rendering & JS Thread Optimization

**Ticket:** SPENDLY-403  
**Epic:** SPENDLY-396 (Startup Performance & App Responsiveness)  
**Status:** Completed

---

## 1. Problem & Architecture Overview

Before this optimization:
1. **Unnecessary Derived JS Thread Math at Dashboard Root**:
   - `activeCategoryBudgets`: In `DashboardScreen` (`app/(app)/dashboard.tsx`), every state change or secondary stream update (e.g., `refreshing`, `accountsLoading`, `activeMonth`) re-ran category and subcategory spending aggregation using a `Map` and nested array loops synchronously on the JavaScript thread. This calculation was consumed exclusively by `BudgetAlertsWidget`, which mounts below the fold.
   - `loggingStreak`: Called `computeExpenseStreak(expenses, todayKey)` which parsed date strings across the entire user expenses history on every render pass. This was consumed exclusively by `GamificationWidget`, which already uses `useGamification()` internally where the streak is computed and persisted asynchronously.
   - `budgetHealthScore`: Computed at root level for API parity without being consumed by active UI.
2. **Missing Component-Level Memoization (`React.memo`)**:
   - Dashboard widgets (`BudgetAlertsWidget`, `SafeToSpendWidget`, `RecentActivityWidget`, `QuickAddWidget`, `NetWorthWidget`, `TopCategoriesWidget`, `QuickInsightsWidget`, `FinancialGoalsWidget`, `SubscriptionsWidget`, `SmartInsightsWidget`, `DashboardWelcome`, `SetupChecklistWidget`) were unmemoized.
   - Any re-render triggered on `DashboardScreen` cascaded through every single mounted widget, re-allocating component DOM trees, re-evaluating child hooks, and recreating styling and sub-arrays.
3. **Unstable Callback & Object References**:
   - `QuickAddWidget` allocated a new array of 5 chips and multiple nested navigation closure functions on every render.
   - `handleEditExpense`, `handleOpenMonthPicker`, and related navigation handlers were recreated on every render pass.

---

## 2. Optimizations Applied

### A. Encapsulation of Derived Budget Aggregation
- Created pure function `computeActiveCategoryBudgets` in `shared/utils/dashboardWidgets.ts` with subcategory rollup support.
- Refactored `BudgetAlertsWidget` to accept raw `categoryBudgets` and `monthlyExpenses` (or precomputed items for backwards-compatibility) and derive category alerts internally via `useMemo`.
- **Result:** Root `DashboardScreen` no longer runs any category budget map/filtering loops during cold boot or initial above-the-fold renders!

### B. Gamification Streak Decoupling
- Removed `computeExpenseStreak` from `DashboardScreen`.
- `GamificationWidget` consumes its state and level directly from `useGamification()`, avoiding redundant date parsing on the main thread during initial dashboard render.

### C. Universal `React.memo` & Callback Stabilization Across All Dashboard Widgets
Wrapped the following components in `React.memo`:
- `BudgetAlertsWidget` (`components/dashboard/BudgetAlertsWidget.tsx`)
- `GamificationWidget` (`components/dashboard/GamificationWidget.tsx`)
- `SafeToSpendWidget` (`components/dashboard/SafeToSpendWidget.tsx`)
- `RecentActivityWidget` (`components/dashboard/RecentActivityWidget.tsx`)
- `QuickAddWidget` (`components/dashboard/QuickAddWidget.tsx`)
- `QuickInsightsWidget` (`components/dashboard/QuickInsightsWidget.tsx`)
- `NetWorthWidget` (`components/dashboard/NetWorthWidget.tsx`)
- `TopCategoriesWidget` (`components/dashboard/TopCategoriesWidget.tsx`)
- `FinancialGoalsWidget` (`components/dashboard/FinancialGoalsWidget.tsx`)
- `SubscriptionsWidget` (`components/dashboard/SubscriptionsWidget.tsx`)
- `SmartInsightsWidget` (`components/dashboard/SmartInsightsWidget.tsx`)
- `DashboardWelcome` (`components/dashboard/DashboardWelcome.tsx`)
- `SetupChecklistWidget` (`components/dashboard/SetupChecklistWidget.tsx`)

In addition:
- Memoized `handleEditExpense`, `handleOpenAddSheet`, `handleOpenMonthPicker`, and `handleViewLedger` with `useCallback` in `DashboardScreen`.
- Memoized `chips` rail definition and routing navigation handlers in `QuickAddWidget` with `useMemo`.

---

## 3. Performance & Memory Impact

| Metric / Hotspot | Before SPENDLY-403 | After SPENDLY-403 | Gain |
| :--- | :--- | :--- | :--- |
| **Root JS Thread Math on Render** | `activeCategoryBudgets` + `computeExpenseStreak` + `budgetHealthScore` | Eliminated at root; deferred/self-contained inside widgets | **~100% reduction in root CPU overhead** |
| **Widget Cascade Rerenders** | Every parent render re-renders all 10+ mounted widgets | Rerenders isolated strictly to widgets whose props change | **Zero unnecessary widget tree reconciliations** |
| **QuickAdd Chip Reallocation** | Array of 5 objects & 5 closures per render | Stable memoized array & stable navigation closures | **Stable reference across renders** |
| **Category Budget Calculation** | Computed synchronously on every render even before scroll | Computed only when `BudgetAlertsWidget` mounts / updates | **Deferred below the fold** |

---

## 4. Verification

- `npm run typecheck:shared`: PASS
- `npx tsc -p tsconfig.json --noEmit`: PASS (0 errors)
- `shared/utils/dashboardWidgets.test.ts`: 12/12 tests passing
- Full vitest test suite: All suites passing
