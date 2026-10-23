# SPENDLY-575: Budget Progress overview and category budget drill-down

This story is part of epic SPENDLY-581.
- **Branch:** `feature/SPENDLY-575-budget-progress-drilldown`.
- **Cut from:** `feature/SPENDLY-581-dashboard-drilldowns` at `d111fa9e`, in the worktree `C:\dev\worktrees\spendly-581`.

The dashboard's Budget progress row now opens **Budget Progress** for the selected month. From there, every budget opens its own **budget detail** page.

The change reads existing data only:
- no write paths;
- no new collections, listeners or indexes;
- no new budget rule or threshold;
- no mockup values.

## Reference images
- **`spendly-budget-progress-drilldown.png` is mislabelled.** It shows Transactions → transaction detail → More Options, which is SPENDLY-576/577 territory.
- **The real Budget Progress flow** (dashboard card → overview → Home & Household budget) is `generated/a_clean_high_fidelity_ui_ux_mockup_image_consisti.png`.
- `spendly-dashboard-reference.png` was reviewed for the dashboard's look.

## Existing rules reused (inspected, not redefined)
| Concept | Source | Rule |
|---|---|---|
| Category budget | `categoryBudgets` docs `{category, subcategory?, amount, month}` via `useCategoryBudgets` (shared, ref-counted subscription) | One budget per category or `category › subcategory` per month |
| Category budget status | `computeActiveCategoryBudgets` | **over** = spent > amount; **close to limit** = ≥ 80 % and not over (`isWarning`); else **on track**. Labels are the dashboard's "Over limit / Close to limit / On track" |
| Category spent | the month summary's `categoryTotals[category]` or `["category::sub"]` | Same figure as the dashboard's budget cards |
| Monthly budget | `settings.monthlyBudget` + `computeSpendlyBudget` against the summary's `totalExpenses` | watch ≥ 80 %, attention when over budget or over pace. The status message comes from `budgetStatusMessage` |
| Pace, days left, daily allowance | `computeSpendlyBudget` | Run on the monthly budget and, on a detail page, on that one budget. The day passed in is today for the current month, the full month for a past month, and day 1 for a future month (`budgetDayOfMonth`) |

### What is new (pure, tested, `shared/utils/budgetDrilldown.ts`)
- `budgetStatusOf` and `budgetStatusCounts` map the existing flags to the three statuses.
- **`categoryBudgetRollup`:** totals across category budgets **without double counting**. A subcategory budget whose parent also has a budget is already inside the parent's figures, so only parent budgets and "orphan" subcategory budgets add up.
  - `rollupStatus` applies the same over / ≥ 80 % line to that total.
- **`budgetUsedPct`:** the uncapped % for display. The stored `pct` is capped at 100, so 120 % would otherwise read as 100 %.
- **Sorting, hrefs, and the budget lookup (`findBudget`):** budgets sort over-limit first; links carry the category key plus an optional `?sub=` for a subcategory budget.
- **Insights:**
  - `budgetOverviewInsights` covers over and close-to-limit budgets, monthly pace (current month only) and spending with no budget.
  - `budgetDetailInsights` covers over-by, daily allowance, pace and the change from last month.
- **`monthlyBudgetHistory`:** each of the last 6 months with category budgets, rolled up the same way.
- **`isEligibleExpense` / `eligibleExpenses` (in `spendingDrilldown.ts`):** these take an optional subcategory, so a subcategory budget's list matches its `Parent::Sub` total.

## Screens and routes
- **Dashboard (`SpendingOverviewCard`):**
  - With any budget, the Budget progress row opens `/budgets?month=<active month>`.
  - With no budget, it still opens settings to create one, as before.
- **`/budgets?month&tab=categories|insights|trends|transactions` — Budget Progress:**
  - The overall card is the monthly budget if one is set (ring, spent of budget, left or over, days left in the current month, and the shared status message). Otherwise it shows "Across category budgets" (the rollup).
  - Status counts appear when category budgets exist.
  - **Categories:** budget rows (icon, name, % used, status bar, spent of limit, status word) → detail; "Manage budgets" → settings.
  - **Insights:** the overview insights.
  - **Trends:** the shared spending trend panel, plus category budgets month by month.
  - **Transactions:** the month's rows in budgeted categories, with category chips.
- **`/budgets/<category>?sub&month&tab=overview|transactions|subcategories|insights` — one budget:**
  - Hero (icon, name, spent, vs last month), the usage card (bar, spent, budget, % used, status), and an over-budget alert that opens Transactions.
  - With no budget for that month, the page says so ("Set a budget") and still shows the spending.
  - **Overview:** pace card (current month, within budget), the trend panel (Amount / Transactions / Trend) and the transactions/average cards.
  - **Transactions:** the budget's rows, with subcategory chips.
  - **Subcategories:** breakdown, plus any subcategory budgets under the parent. Hidden for a subcategory budget.
  - **Insights.**
- Routes are registered in `app/(app)/_layout.tsx`, `SUB_SCREEN_PREFIXES` / `SUB_SCREEN_ROUTES` and `RESTORABLE_ROUTES`, with tests. Month and tab live in the route params.

## Reads
- The summaries come from the same bounded `financialSummaries` query the dashboard uses (6 docs). Budgets come from the shared reference-data subscription.
- Transaction lists use the existing `loadMonth` (one bounded date-range read per month, skipped when already loaded). The Transactions view of the trend chart loads its months only when opened.

## Known limitations
- **The monthly budget is a single current setting, not stored per month.** A past month is compared against today's monthly budget, the same as the dashboard does.
  - For that reason the Trends history shows category budgets only.
- **No device or browser screenshots for this story.** The local emulators were stopped by Claude Code for low memory and not restarted, so the owner will check the UI on local Expo web.

## Validation (2026-10-23, in the worktree)
- `npx vitest run` on the touched tests: `budgetDrilldown.test.ts` 14 passed; the spending, navigation and restoration tests passed.
- `npm test`: 437 files, 6155 tests passed.
- `npm run typecheck:shared`: clean.
- `npx tsc -p tsconfig.json --noEmit`: clean.
- `npx expo export --platform web` (to a scratch folder): succeeded, and the bundle contains the budget routes.
- Not run:
  - lint (the repo has no ESLint config);
  - the Android Gradle build;
  - rules tests (no rules changed).
