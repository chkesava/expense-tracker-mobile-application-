# SPENDLY-396: Startup Performance & App Responsiveness

## Overview
Improve Spendly Android startup performance and first-use responsiveness using measured, evidence-based performance engineering.

## State
- **SPENDLY-397**: Merged into epic branch
- **SPENDLY-398**: Merged into epic branch
- **SPENDLY-399**: Merged into epic branch
- **SPENDLY-400**: Merged into epic branch
- **SPENDLY-401**: Merged into epic branch
- **SPENDLY-402**: Merged into epic branch
- **SPENDLY-403**: Merged into epic branch
- **SPENDLY-404**: To Do
- **SPENDLY-405**: To Do

## Decisions
- Instrumented critical startup phases, Firestore listeners, and snapshot deliveries using the updated `lib/perf.ts` system (SPENDLY-397).
- Formalized the 5-scenario benchmark suite in `docs/PERF_BASELINE.md` and captured Scenario 1 baseline metrics (SPENDLY-398).
- Fixed the double-mount root cause in `SettingsProvider.tsx` (removed `SettingsBootSplash` gate), removed the layout spinner gate in `app/(app)/_layout.tsx`, and pruned non-critical stores/nav checks from the splash critical path in `app/_layout.tsx`. Achieved ~90% reduction in `app_ready` time (from 1938ms down to 193ms) (SPENDLY-399).
- Conducted exhaustive audit of 17 startup Firestore listeners. Reduced immediate listeners from 17 to 11 (35% reduction) by deferring non-critical collections (`categories`, `spaces`, `categorizationRules`, `borrowingRepayments`, `receivables`, `receivableRepayments`) to idle via `scheduleIdleWork`. Retained realtime synchronization, offline cache support, and zero regressions for Dashboard and Safe to Spend metrics (SPENDLY-400).
- Introduced the Active-On-Demand Lifecycle pattern with reference counting and 15-second grace period teardowns for feature-scoped providers (`BorrowingsReceivablesProvider`, `CreditCardBillsProvider`, `SmsReceiverProvider`). Decoupled `useBorrowings` and `useCreditCardBills` from `DashboardScreen`, moving extra dues calculation lazily into `SubscriptionsWidget`. Eliminated borrowing and credit card listener startup during initial dashboard render while maintaining 100% backward-compatible context APIs and cached data retention (SPENDLY-401).
- Implemented a 5-stage progressive critical-first dashboard loading architecture (SPENDLY-402). Eliminated the monolithic `<DashboardSkeleton />` screen takeover in favor of granular, inline widget shimmer states (`SafeToSpendWidget`, `RecentActivityWidget`, `QuickInsightsWidget`). Re-aligned critical widgets above the fold (`focus`, `quickAdd`, `recentActivity`) while staggering secondary widgets (`budgetAlerts`, `subscriptions`, `topCategories`, `overview`, `financialGoals`, `gamification`) via `LazyMount`. Added progressive hydration to `useUnifiedNetWorth` to render liquid bank balance immediately from accounts while deferring heavy secondary valuations (stocks, EPF, loans) to idle.
- Optimized React rendering and JS thread work on the Dashboard (SPENDLY-403). Extracted root derived financial calculations (`activeCategoryBudgets`, `computeExpenseStreak`, and `budgetHealthScore`) out of `DashboardScreen` root render loop and encapsulated category budget derivation inside `BudgetAlertsWidget` using the new `computeActiveCategoryBudgets` utility. Wrapped all dashboard widgets (`BudgetAlertsWidget`, `GamificationWidget`, `SafeToSpendWidget`, `RecentActivityWidget`, `QuickAddWidget`, `QuickInsightsWidget`, `NetWorthWidget`, `TopCategoriesWidget`, `FinancialGoalsWidget`, `SubscriptionsWidget`, `SmartInsightsWidget`, `DashboardWelcome`, `SetupChecklistWidget`) in `React.memo`. Memoized navigation callbacks and array allocations to prevent cascade re-renders.
