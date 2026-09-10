# KAN-62 — Spendly Dashboard Financial Control Center

| Field | Value |
| --- | --- |
| Jira | [KAN-62](https://kesavach.atlassian.net/browse/KAN-62) |
| Relates to | [KAN-63](https://kesavach.atlassian.net/browse/KAN-63) |
| Feature | Spendly dashboard |
| Type | Feature |
| Status | In Progress |
| Priority | High |
| Project | KAN (Ganesh seva board; this ticket is Spendly) |
| Scope shipped | P0 + P1 |

This file is the implementation brief. The dashboard is the only surface. Do not invent a second budget system, a net-worth snapshot collection, or new merchant-rule infrastructure.

## Ticket

Turn the Spendly home screen from equally weighted cards into a Financial Control Center: one budget meaning, Safe to Spend first, then forecast, a few insights, upcoming dues, one net-worth number, and a global Add sheet.

Visual language stays Spendly dashboard primitives. No Ganesh Seva styling. No Nutrition or Ganesh logic changes.

## Canonical model (already live)

| Concern | Source |
| --- | --- |
| Monthly budget | `settings.monthlyBudget` |
| Spend / income | `useExpenses` / `useIncomes` month filters |
| Recurring | `useSubscriptions` + `computeMonthlyCommitments` / `getNextRenewalDate` |
| Net worth | `useUnifiedNetWorth` |
| Goals | `useFinancialGoals` |
| Credit dues | `useCreditCardBills` + existing due dates |
| Borrowing dues | `useBorrowings` + existing due dates |
| Category budgets | `useCategoryBudgets` |
| Add flows | `AddTransactionModal`, `TransferFundsModal`, `CreateInvestmentModal`, `PayCreditBillModal` |

No new Firestore collections, indexes, stored formulas, or rules.

## One budget engine

`shared/utils/spendlyBudget.ts` is the only remaining / pace / status story.

Inputs: monthly budget, month spend, month key, today day, remaining committed this month.

Outputs:

- `spent`, `remaining`, `pctUsed`
- `daysLeft`, `projectedMonthEnd`, `requiredDailyLimit`
- `committedMonthly`, `flexibleRemaining`
- `safeToSpendDaily = flexibleRemaining / max(daysLeft, 1)` when remaining flexible > 0, else `0`
- `status`: `healthy` \| `watch` \| `attention`

Status rules: over budget or projected over → `attention`; ≥80% used → `watch`; else `healthy`. Widgets may not invent a second interpretation.

Minimum savings target is not in settings — left out of the formula.

## First viewport

1. Header — `DashboardWelcome`
2. Monthly money summary — `QuickInsightsWidget` (in / out / saved + vs previous month)
3. Safe to Spend — replaces Daily Focus (`focus` id)
4. Monthly Budget + Forecast — spent, %, remaining, projected, required daily, committed vs flexible

Then: Smart Insights (top 2–3, budget lines removed) → Upcoming Commitments → Top Categories → Net Worth → Goals (1–2 rows) → Recent → compressed Financial Health (no Shields tile).

## Settings id migration

Legacy ids stay parseable so old `dashboardOrder` does not crash:

| Saved id | Behavior |
| --- | --- |
| `focus` | Safe to Spend |
| `insight` | skipped (merged into Budget + Forecast) |
| `investments` | skipped (merged into Net Worth) |
| `overview` | one Net Worth card from `useUnifiedNetWorth` |
| `budgetAlerts` | Monthly Budget + Forecast |
| `subscriptions` | Upcoming Commitments |

Default order lives in `DEFAULT_DASHBOARD_ORDER` and `SETTINGS_DEFAULTS.dashboardOrder`.

## FAB / Add

- `PageShell` bottom clearance includes `BOTTOM_NAV_FAB_CLEARANCE` so the last card is not under the FAB.
- FAB opens `AddActionSheet`: Expense, Income, Transfer, Investment, Debt Payment.
- Those options open the existing modals. ExpenseForm is unchanged.
- Quick Add stays a shortcut rail; its primary chip opens the same Add sheet.

## Existing code to start from

- `app/(app)/dashboard.tsx`
- `shared/utils/spendlyBudget.ts`
- `shared/utils/dashboardWidgets.ts`
- `shared/utils/smartInsights.ts`
- `components/dashboard/*`
- `providers/ModalProvider.tsx`
- `components/AddActionSheet.tsx`
- `components/GlobalAddModals.tsx`

## Implementation status

- [x] Branch + KAN-62 In Progress
- [x] Budget engine + unit tests
- [x] Safe to Spend + Budget + Forecast
- [x] Insight cap + Upcoming Commitments (recurring + card/borrowing dues)
- [x] One Net Worth card + cash-flow sparkline
- [x] Compact goals + compressed Financial Health
- [x] FAB clearance + Add sheet
- [x] Settings labels / default order / skip migration
- [ ] Manual verification
- [ ] Jira KAN-62 Done after merge

## After merge

Move KAN-62 to **Done** and comment the PR/commit plus leftovers. Do not mark Done until merge succeeds.

## Manual testing guide

No new install is required if `npx expo start` is already running; hot reload picks the client up.

1. Combined build: Expense Tracker dashboard is the control center. Nutrition and Ganesh Seva screens are unchanged.
2. With a monthly budget set, the first cards are money summary → Safe to Spend → Monthly Budget. There is no Daily Focus ring and no standalone Daily Spending Pace card.
3. Safe to Spend and Monthly Budget show the same status tone (healthy / watch / attention). Changing spend updates both from one engine.
4. Smart Insights shows at most three rows and does not repeat the budget warning already on the Budget card.
5. Upcoming Commitments lists next recurring dues plus open credit-card / borrowing dues. Amount due in 7 days appears in the subtitle when present. Manage still opens Recurring.
6. Net Worth is a single card. The sparkline is labeled cash movement, not historical net worth.
7. Financial Goals shows at most two progress rows. Financial Health has no No-spend Shields tile and is not pinned as a hero.
8. Scroll the last card (Recent or Quick Add) fully above the FAB.
9. FAB opens Add. Expense and Income open the existing transaction sheet. Transfer, Investment, and Debt Payment open the existing modals. Android back closes the open sheet/modal first.
10. Settings → Dashboard: Safe to Spend / Monthly Budget / Upcoming Commitments / Net Worth labels. Insight and Investments are not offered as separate reorder rows. Existing saved orders still load.

## Leftovers (not this PR)

- Minimum savings target in Safe to Spend
- Stored net-worth history / true historical net-worth chart
- Merchant rules / categorization improvements (`categorizationRules`; not a dashboard job)
- [KAN-63](https://kesavach.atlassian.net/browse/KAN-63) Transactions hub IA
- Universal search, expanded gamification, personalized recommendations (P2)
- Focus-sprint as a dedicated surface
