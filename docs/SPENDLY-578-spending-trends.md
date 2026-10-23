# SPENDLY-578: Spending Trends — charts, comparisons and insights

This story is part of epic SPENDLY-581.
- **Branch:** `feature/SPENDLY-578-spending-trends`.
- **Cut from:** the epic branch at `49a5fb36`, in the worktree `C:\dev\worktrees\spendly-581`.

## Reference images
- **`spendly-spending-trends-drilldown.png` is mislabelled.** It shows the Total Spending flow from SPENDLY-574.
- **The real Trends flow** (Spending Trend card → Spending Trends with Daily/Weekly/Monthly/Yearly → category trends → category comparison and key insights) is `generated/a_wide_high_fidelity_mobile_app_ui_concept_image.png`.
  - The same image is also saved as `spendly-recent-transactions-drilldown.png`.

## What changed
- **Dashboard:** the Spending Overview card gets a **Spending trend** row (above Budget progress). It opens `/trends?month=<month in view>`.
  - Before this, the dashboard had no trend card.
- **`/trends`** (`app/(app)/trends.tsx`, logic in `shared/utils/spendingTrends.ts`, pure and tested). Tabs: Overview / Categories / Compare / Insights.
  - **Overview:**
    - Daily / Weekly / Monthly / Yearly switch and a bar chart. Tapping a bar shows its period and total; the selection stays until another bar is tapped or it is tapped again (the existing `BarChart` behaviour, with an accessible button per bar).
    - Summary: change against the previous point, average, highest and lowest, over points with data only.
    - Breakdown of the month's categories.
  - **Categories:** each category this month against last month (↑/↓ %, "New this month", "Nothing this month"). A row opens the **SPENDLY-574 category page** (`/spending/<category>`), so there is no second category screen. That page already has the category's trend (Amount / Transactions / Trend), subcategories, transactions and insights.
  - **Compare:** month over month, year over year and against the earlier-months average. Each shows the absolute and % change and states its baseline. When there is no comparable data, it says why instead.
  - **Insights:**
    - month-over-month change;
    - against the average (needs ≥ 3 earlier months);
    - the biggest material category rise and fall (≥ 10 % and ≥ 5 % of the month's spend);
    - the highest week.
    - Otherwise an explicit "not enough history" state.
- **`BarChart`** gains an optional `detailLabel` per bar, used for the tooltip and the screen-reader label. Daily bars label every fifth day on the axis but still read "12 Oct" when selected. The change is additive, so other charts are unchanged.
- **Routes:** `trends` is registered in `app/(app)/_layout.tsx`, with `/trends` in `SUB_SCREEN_ROUTES` and `RESTORABLE_ROUTES`, with tests. Month, granularity (`gran`) and tab live in the route.

## Data and reconciliation
- **Monthly and yearly** sum the `dashboard_{YYYY-MM}` summaries' parent-category totals, which is the donut's own figure.
  - The window is bounded: 13 docs for daily, weekly and monthly (6 shown, plus a year back for year over year), and 36 for yearly.
  - The current year runs to the selected month and is labelled so ("2026 (Jan–Oct)").
- **Daily and weekly** split the selected month's ledger rows under the summary's own inclusion rule (`eligibleExpenses`).
  - A row filed in this month but dated outside it lands on the last day, so the days always add up to the month's total. This is tested against `calculateDashboardSummaries`.
  - Weeks start on the user's `firstDayOfWeek` setting and are clipped to the month.
  - The month comes from the existing `loadMonth`: one bounded read, skipped when already loaded.
- **No-data handling:** points with no data are marked as such, not shown as zeros. Days after today have no data yet. Comparisons need a real, non-zero base.
- **Reads:** no new listeners, collections or indexes. Dashboard startup is unchanged (the new row is static).

## Validation (2026-10-23, worktree)
- `npx vitest run shared/utils/spendingTrends.test.ts`: 13 passed.
- `npm test`: 440 files, 6190 tests passed.
- `npm run typecheck:shared`: clean.
- `npx tsc -p tsconfig.json --noEmit`: clean.
- `npx expo export --platform web`: succeeded.
- Not run: lint (no ESLint config), Android build, screenshots.
