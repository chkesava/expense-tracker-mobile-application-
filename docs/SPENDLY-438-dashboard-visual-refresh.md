# SPENDLY-438 — Dashboard visual modernization

| Field | Value |
| --- | --- |
| Jira | [SPENDLY-438](https://kesavach.atlassian.net/browse/SPENDLY-438) |
| Epic | [SPENDLY-437](https://kesavach.atlassian.net/browse/SPENDLY-437) |
| Branch | `feature/SPENDLY-438-dashboard-visual-refresh` (off the epic branch) |
| Status | In Progress |

Visual-only reskin of the existing Dashboard (`app/(app)/dashboard.tsx`), built on top of the `KAN-62` widget set and order. No hooks, calculations, or data contracts changed.

## What changed

- **`components/dashboard/primitives.tsx`**: added `HeroSection` (the dashboard's one bold gradient surface, for exactly the first-fold hero card), `DASH_TYPE` (hero number scale), and `mixColors` (derives the gradient's deep stop from `theme.colors.primary`, never a hardcoded hex — holds up across all 11 themes, including dark-appearance ones like `midnight`/`cyberpunk`/`deep-sea`).
- **`components/dashboard/SafeToSpendWidget.tsx`**: now renders through `HeroSection` instead of `Section`. Added a header eye/privacy toggle wired to the existing `settings.ghostMode` / `setGhostMode` (`providers/SettingsProvider.tsx`) — no new privacy mechanism. Status tone (healthy/watch/attention) kept as a tinted pill using the same `theme.colors.success/warning/destructive` vocabulary `BudgetAlertsWidget` uses, so the two cards still agree on tone per KAN-62.
- **`components/dashboard/BudgetAlertsWidget.tsx`**: the `%` used badge now renders through the shared `Pill` primitive (tone-matched) instead of a bare `Text`, for visual cohesion with the hero card's pill language.
- **`components/dashboard/QuickAddWidget.tsx`**: touch targets bumped to the 48dp accessibility target; featured glyph slightly larger.
- **`components/dashboard/NetWorthWidget.tsx`**: cash-movement sparkline bars widened/rounded.
- Everything else (`QuickInsightsWidget`, `RecentActivityWidget`, `SmartInsightsWidget`, `TopCategoriesWidget`, `SubscriptionsWidget`, `FinancialGoalsWidget`, Financial Health, `GamificationWidget`) is unchanged — they already render through the shared `Section`/`DataRow`/`MetaLabel` primitives and don't need a bespoke pass in this story.

## Explicitly not touched

- `shared/utils/spendlyBudget.ts`, `useUnifiedNetWorth`, `useDashboardSummary`, or any other data hook.
- `app/(app)/dashboard.tsx` widget order, lazy-mount thresholds, or perf marks.
- `components/BottomNav.tsx` / FAB.
- Any Firestore read/listener, rule, or index.

## Verification

- `npx tsc --noEmit -p tsconfig.json` — clean.
- `npx vitest run shared/utils/dashboardWidgets.test.ts shared/utils/spendlyBudget.test.ts` — 25/25 pass (no logic touched, as expected).
- `npm test` (full suite) — 5512/5515 pass. The 3 failures are in `scripts/metroQuickActionsResolution.test.ts` (expo-quick-actions Metro path resolution), unrelated to this change and not touching anything under `components/dashboard` — pre-existing/environment-specific on this machine, not introduced by this story.
- Manual/device check — **pending** (see below).

## Manual testing guide (pending)

1. `npx expo start`, open Dashboard.
2. Confirm Safe to Spend renders as a bold gradient hero card in **light**, **dark**, and at least one named theme (e.g. `midnight` or `cyberpunk`) — text must stay readable in all three.
3. Tap the eye icon in the hero card — amounts across the whole dashboard (hero, Quick Insights, Monthly Budget, Net Worth, Recent Transactions) hide/reveal together, since they all share `settings.ghostMode`.
4. Confirm Safe to Spend's status pill and the Monthly Budget card's `%` pill show the same tone (healthy/watch/attention) for the same budget state.
5. Confirm Recent Transactions still only shows 5 items and "View all" still opens `/ledger`.
6. Confirm the FAB and bottom nav are unchanged and the last card still clears the FAB.

## Leftovers (not this story)

- Bespoke restyle of `QuickInsightsWidget` / `RecentActivityWidget` rows beyond the shared primitives, if a future pass wants it.
- Other tabs (Ledger, Insights, etc.) — later stories under SPENDLY-437, after this one is reviewed.
