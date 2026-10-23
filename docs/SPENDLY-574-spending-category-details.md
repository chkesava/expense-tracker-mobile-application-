# SPENDLY-574: Spending Overview drill-downs (Total Spending and category details)

This story is part of epic SPENDLY-581 (Dashboard drill-down experiences). It is on branch `feature/SPENDLY-574-spending-category-details`, cut from `feature/SPENDLY-581-dashboard-drilldowns`, which was cut from `main` at `e57bf7eb`.

It makes the dashboard's Spending Overview interactive:
- tapping the donut's centre opens **Total Spending**;
- tapping a slice or a legend row opens that **category's details**;
- tapping the folded "Others" slice opens Total Spending's ranked **Categories** tab.

The change reads existing data only:
- no write-path changes;
- no new collections, query shapes or indexes;
- no changes to how totals are calculated;
- no hardcoded values from the mockups.

## Reference images
| File | What it actually shows | Used for |
|---|---|---|
| `spendly-dashboard-reference.png` | The Visual First dark dashboard | Dashboard card (already built in SPENDLY-566) |
| `spendly-total-spending-drilldown.png` | **Mislabelled.** It shows *Home & Household* category details: Overview / Transactions / Budget / Insights tabs, a breakdown donut, trend bars, a count and average, and a searchable list | The category details screen |
| `spendly-spending-category-details.png` | **Mislabelled.** It shows *Highest Spending Categories → Food & Groceries subcategories → Vegetables & Fruits* | Not this story (SPENDLY-580 / 579) |
| `generated/a_wide_high_resolution_ui_ux_concept_mockup_image.png` | The real donut-centre → Total Spending (Overview, Categories) flow | The Total Spending screen |

No filename the ticket names is missing; two of the aliases point at the wrong image. Consider swapping the two alias names in `design/references/`.

## Routes
| Route | Screen |
|---|---|
| `/spending?month=YYYY-MM&tab=overview\|categories\|transactions\|trends&range=3\|6\|12` | Total Spending |
| `/spending/<category>?month=YYYY-MM&tab=overview\|transactions\|budget\|insights&sub=<subcategory>` | Category details |

- Both routes are registered in `app/(app)/_layout.tsx`, in `shared/config/navigation.ts` (Android back pops) and in `RESTORABLE_ROUTES`.
- `<category>` is the URL-encoded **stored category key**. Expense rows and `categoryTotals` both key spending by the parent category name; there is no separate category id on an expense.
- **Month, tab and range all live in the route params.** They survive tab switches, drilling into a category and coming back. A missing or invalid month falls back to the dashboard's selected month.
- The dashboard stays mounted underneath, so going back returns to the same scroll position.

## Data sources and reconciliation
- **Headline totals, shares, subcategory splits and month trends** come from the materialized `users/{uid}/financialSummaries/dashboard_{YYYY-MM}` docs. These are read through `useDashboardCashFlow`, the same bounded query the dashboard uses: 6 docs, or 13 on the Trends tab.
  - The denominator is `topCategoryShares`' sum of parent-category totals, exactly the donut's "Total spent". A category's figure on its detail page always equals its dashboard slice for the same month.
- **Transaction lists, counts and averages** come from the app-wide `FinanceDataProvider` expense store, filtered by the summary's own inclusion rule (`isEligibleExpense`):
  - the row is not soft-deleted;
  - its month is `summaryMonthOf` (the `month` field, else the date prefix);
  - it matches the stored parent category name.
  - Refunds are incomes and transfers are their own collection, so neither is ever counted, just as in the summary.
  - A row that was re-categorised appears only under its current category.
- **Reads:** a screen asks the store for its month once (`loadMonth`, one bounded date-range `getDocs`). It is skipped when that month is already loaded.
  - No new listener is added.
  - The summary query matches the dashboard's own when the window is the same, so the Firestore SDK shares that listener.
- **Budgets** come from `useCategoryBudgets` + `computeActiveCategoryBudgets`, the same functions the dashboard card uses. The listener mounts only on the Budget tab (the SPENDLY-406 rule).

### Edge cases made explicit
- **Spending with no subcategory** is its own "No subcategory" row, so a category's split always adds back up to its total.
- **Spending with no category** counts in the summary's `totalExpenses` but in no category. Total Spending shows a note with that amount rather than dropping it silently.
- **Lists that don't match the summary:** if a month's full list doesn't add up to the summary figure (the summary is waiting on a rebuild), the list says so. If the month's older rows are still loading, or offline, the list says it may be incomplete.
- **Comparisons:**
  - Month-on-month changes appear only when the previous month has a summary and non-zero spending.
  - Averages need at least 3 earlier months with spending (`MIN_HISTORY_MONTHS`).
  - Otherwise the screens say there isn't enough history; nothing is invented.

## Files
- `shared/utils/spendingDrilldown.ts` (+ test): all the pure logic, including hrefs and params, category summary, subcategory split, comparisons, month series, the eligibility filter, search, filter and sort, reconciliation, and insights.
- `shared/utils/chartHitTest.ts` (+ test): `donutTapTarget`, which decides whether a tap hit the centre, a slice or nothing.
- `components/charts/DonutChart.tsx`: optional `onCenterPress` / `onSlicePress` / `centerAccessibilityLabel`. When these aren't passed, the chart behaves exactly as before.
- `components/dashboard/SpendingOverviewCard.tsx`:
  - the legend rows are now full-width 40dp buttons with chevrons;
  - the donut's centre and slices navigate;
  - the slice colours moved to `components/spending/palette.ts`.
- `components/spending/SpendingParts.tsx`: month selector, monthly bars, category share row, data note.
- `components/spending/SpendingTransactionList.tsx`: search, filter chips, a sort chip that cycles on tap, and 25-row "Show more" paging.
- `hooks/useSpendingDrilldown.ts`: `useSpendingSummaries` and `useMonthExpenseRows`.
- `app/(app)/spending/index.tsx`: Total Spending, with Overview, Categories, Transactions and Trends tabs.
- `app/(app)/spending/[category].tsx`: Category details, with Overview, Transactions, Budget and Insights tabs.
- `app/(app)/_layout.tsx`, `shared/config/navigation.ts`, `shared/config/routeRestoration.ts` (+ tests): route registration.

## Review round 1 (2026-10-23, owner's Expo web check)
Gaps the owner found against the category-details reference, now closed:
- **Amount / Transactions / Trend switch** above the spending trend (`components/spending/SpendingTrendPanel.tsx`).
  - *Amount* and *Trend* (a line) come from the month summaries.
  - *Transactions* counts ledger rows per month. It loads the earlier months only when that view is opened: 6 bounded `loadMonth` reads, each skipped when the month is already loaded.
- **Transactions** and **Average per transaction** cards sit under the chart, each with a vs-last-month chip and last month's figure (`TransactionComparisonCards`). Last month's rows cost one bounded `loadMonth` read.
- **Comparison callout** ("You spent N% less/more than last month"), shown only when last month had spending. It opens Insights (category page) or Trends (Total Spending).
- **Hero card** matches the reference: icon tile, share line, amount with a trend chip, and "vs last month (…)".
- **Breakdown:** the donut and legend now sit side by side on phone widths.
- **Shared charts:**
  - `BarChart` value axes round to clean steps (`shared/utils/chartScale.ts`: 0 / 5K / 10K, not 4.6K / 9.3K).
  - `BarChart` and `SpendingCurveChart` axis labels use the theme font. They rendered in a serif font on web.
  - These affect every screen that uses those charts, as a visual fix only.
- Total Spending got the same hero, trend panel, cards and callout.

## Review round 2 (2026-10-23): premium polish
The owner said the screens looked generated rather than polished. Before this pass they were checked at 390px in a headless browser against the local emulator:
- **Top bar:** the top bar now holds only a back button and the month stepper. The title moved into the hero, so it is never truncated.
- **Tabs:** `DrilldownTabs`, equal-width underline tabs with 44dp targets.
- **Icons:** line icons (`components/spending/categoryIcons.ts`) replace the taxonomy emoji on the hero, the category rows and the transaction rows. Transaction rows are tinted with their subcategory's breakdown colour, and their date sits under the amount.
- **Breakdown:** a centred donut above a full-width legend (name · share · amount), so long names don't truncate on phones.
- **One card style everywhere:** `SurfaceCard` (title plus a quiet meta) replaces `Section` on every tab.
  - The shared `Card` shell already pads about 16dp, so these cards no longer double-pad.
  - The stat-card labels no longer truncate.
- **Trends:** the summary is one card split into Average / Highest / Lowest columns.
- **Axis labels:** whole thousands read "5K", not "5.0K" (`components/charts/axis.ts`). This is shared, visual only.
- **Copy:** shorter footnotes and insight lines.

## Visual deviations from the references
- The period selector is a month stepper (‹ Oct 2026 ›), not a dropdown. It cannot go past the current month.
- **Sorting** is a single chip that cycles Latest → Oldest → Highest → Lowest, not a dropdown.
- **Subcategory-to-transactions:** tapping a subcategory in the category Overview opens its Transactions tab, already filtered to it. A separate subcategory page is SPENDLY-579.
- **Trend chart:** the reference pins a value bubble over the current month. Here the value shows when you tap a bar, using the chart's existing tooltip.
- **Insights** list only what the data supports:
  - month-on-month change;
  - the comparison with the 3+-month average;
  - the top subcategory;
  - one payment that dominates the month.
  - There is no merchant ranking (that belongs to SPENDLY-579/580).
- Colours, type and surfaces come from the current theme tokens (`Section`, `DataRow`, `Chip`, `PageHeader` underline tabs), not the mockup's palette.

## Validation (2026-10-23)
- `npx vitest run` on the four touched test files: 73 passed.
- `npm test`: 404 files, 5876 tests passed.
- `npm run typecheck:shared`: clean.
- `npx tsc -p tsconfig.json --noEmit`: clean.
- `npx expo export --platform web` (to a scratch folder): succeeded, and the bundle contains both routes.
- Not run:
  - **Lint:** the repo has no ESLint config.
  - **Android Gradle build:** not run.
  - **Rules tests:** no rules changed.
  - **Screenshots / device QA:** the user is checking the UI on local Expo web with demo data.
