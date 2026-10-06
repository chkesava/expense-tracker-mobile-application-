# SPENDLY-411: Feature-Scoped Firestore Listener Lifecycle

## Objective

Stop non-dashboard features from creating realtime listeners before the user opens those features. Part of the SPENDLY-406 Firestore Read Optimization epic.

## Findings

A full scan of the app-root provider tree and the per-domain hooks found most of the named domains already compliant:

| Domain | State | Notes |
|---|---|---|
| Credit Cards | Already scoped | `CreditCardBillsProvider` — `registerSubscriber` ref-counting + 15s grace teardown (SPENDLY-401) |
| Borrowings / Receivables | Already scoped | `BorrowingsReceivablesProvider` — dual-gated `registerBorrowingsSubscriber`/`registerReceivablesSubscriber` (SPENDLY-401) |
| EPF | Already scoped by construction | `useEpf`/`useEpfEstablishment` are plain hooks never wired into the app-root tree; listeners only exist while their screen is mounted |
| Investments | Already scoped by construction | `useInvestments` — only called from `InvestmentsList`; `{ enabled: false }` used from the global FAB path |
| SIP | Already scoped by construction | `useSips` — only called from `SipDashboard` |
| Planning (budgets/goals) | **Gap — fixed by this story** | See below |

## The gap

`providers/ExpenseReferenceDataProvider.tsx` is mounted globally (`app/(app)/_layout.tsx`) and started 6 Firestore listeners unconditionally on every session: `categories`, `subscriptions`, `spaces`, `categorizationRules`, `categoryBudgets`, `financialGoals`. Of these, only `categoryBudgets`/`financialGoals` are read exclusively from screens/widgets that are optional or feature-specific:

- `app/(app)/dashboard.tsx` called `useCategoryBudgets()`/`useFinancialGoals()` unconditionally at the top of the screen, then threaded the data down as props into `BudgetAlertsWidget`/`FinancialGoalsWidget` — two widgets that are present in `DEFAULT_DASHBOARD_ORDER` but removable via `settings.dashboardOrder`/`dashboardWidgets`. This meant the listener started even when a user had hidden both widgets.
- Unlike Credit Cards/Borrowings/Receivables, the provider's own `categoryBudgets`/`financialGoals` effects were not gated by any subscriber count at all — they always ran once `uid`/`db` were available.

`categories`, `subscriptions`, `spaces`, and `categorizationRules` were left untouched: they're read from `ExpenseList`/`ExpenseForm` (pervasive across ledger, transactions, and dashboard "recent activity") or drive the app-wide subscription auto-posting side effect in the same provider. Scoping those would require re-plumbing the whole ledger surface and isn't what this ticket asked for.

## Changes

1. **`providers/ExpenseReferenceDataProvider.tsx`** — added `shouldListenBudgets`/`shouldListenGoals` gates with independent `registerBudgetsSubscriber()`/`registerGoalsSubscriber()` ref-counted + 15s grace-period teardown (mirrors `BorrowingsReceivablesProvider`'s dual-gate shape exactly). Exposed both register functions on the context.
2. **`hooks/useCategoryBudgets.ts`, `hooks/useFinancialGoals.ts`** — added the subscriber-registration effect (`useBorrowings`/`useReceivables` pattern) so mounting the hook with `{ enabled: true }` (the default) actually starts the provider's listener, and unmounting starts the grace-period teardown.
3. **`app/(app)/dashboard.tsx`** — removed the top-level `useCategoryBudgets()`/`useFinancialGoals()` calls and the `categoryBudgets`/`goals` props passed into the two widgets.
4. **`components/dashboard/BudgetAlertsWidget.tsx`, `components/dashboard/FinancialGoalsWidget.tsx`** — now self-fetch via `useCategoryBudgets()`/`useFinancialGoals()` (same pattern as `components/dashboard/SubscriptionsWidget.tsx`), so the listener only starts when the widget actually renders. `BudgetAlertsWidget` skips its own subscription when the caller passes `activeCategoryBudgets` explicitly (no current caller does, but the escape hatch is preserved).
5. **`lib/featureScopedProviders.test.ts`** — added a dual-gate test verifying the budgets/goals gates (and by extension the borrowings/receivables shape they mirror) tear down independently.
6. **`docs/FEATURE_SCOPED_PROVIDERS.md`** — documented the new §4 and a budgets/goals verification step.

## Verification

- `npm test` — 364 test files / 5439 tests passed.
- `npm run typecheck:shared` — clean.
- `npx tsc -p tsconfig.json --noEmit` — clean.
- `git diff --stat feature/SPENDLY-406-firestore-read-optimization` — touches exactly the 7 files listed above (5 source + 1 test + 1 doc), nothing outside this story's scope.
- Manual/emulator verification (toggle dashboard widgets off/on, confirm `firestore_listener_start` behavior) still to be run against Spendly Test on the Firebase emulator per `docs/LOCAL_TEST_MODE.md`.

## Left alone, and why

`categories`, `subscriptions`, `spaces`, `categorizationRules` remain eager (already idle-deferred where they were before). They're read from `ExpenseList`/`ExpenseForm`, which mount across the ledger, transactions, and dashboard recent-activity surfaces, or (for `subscriptions`) drive the always-on due-subscription auto-posting job inside the same provider. Scoping them would be a much larger, separate change than "planning," and wasn't requested by this ticket.
