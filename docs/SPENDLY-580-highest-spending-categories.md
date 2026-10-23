# SPENDLY-580: Highest Spending Categories — ranking and drill-down

This story is part of epic SPENDLY-581.
- **Branch:** `feature/SPENDLY-580-highest-spending-categories`.
- **Cut from:** the epic branch at `87daf207`, in the worktree `C:\dev\worktrees\spendly-581`.

## Reference images
- **`spendly-highest-spending-categories.png` is mislabelled.** It shows Budget Progress (SPENDLY-575).
- **The real flow** (dashboard "Highest spending categories" → ranked list with This Month / Last Month / Last 3 Months / This Year and a key insight → category subcategories → subcategory trend and merchants) is `generated/a_wide_detailed_ui_mockup_composite_image_of_a_mo.png`.
  - The same image is also saved as `spendly-spending-category-details.png`.

## What changed
- **Dashboard:** the Spending Overview card gets a **Highest spending categories** row (above Spending trend). It opens `/top-categories?month=<month in view>`.
  - The card now has three entry rows: highest categories, trend and budget.
- **`/top-categories?month&period=this_month|last_month|last_3_months|this_year`** (`app/(app)/top-categories.tsx`, logic in `shared/utils/topCategories.ts`, pure and tested):
  - **Hero:** total for the period and the change against the previous equivalent period. The change appears only when both periods are fully recorded.
  - **Period chips:** This month / Last month / Last 3 months / This year, all anchored on the month in the top bar.
  - **"Ranked by amount":** rank, icon, amount, a bar, and the share, labelled **"Share of total spending"** (the donut's denominator).
  - **Taps:** a category opens the **SPENDLY-574 category page**. Its subcategories open **SPENDLY-579's subcategory page** (trend, merchants, transactions), so there is no second implementation.
  - **Key insights:**
    - the fewest top categories that make up half of spending (always computable);
    - the biggest material mover (≥ 10 % and ≥ 5 % of the period's spend) against the previous equivalent period, only when that period is fully recorded.
  - **Notes:** months with no summary are named and left out of the totals, never counted as zero. A missing-comparison note appears when needed. For multi-month periods, a note says which month the category page opens on.
- **Routes:** `top-categories` is registered in `_layout.tsx`, `SUB_SCREEN_ROUTES` and `RESTORABLE_ROUTES`, with tests.

## Data and reconciliation
- **One source, one rule:** a period is whole months. Its category totals are the sum of those months' `dashboard_{YYYY-MM}` summaries, ranked by `topCategoryShares`.
  - So "This month" equals the dashboard donut exactly. This is tested against `calculateDashboardSummaries` and `spendingBreakdown`.
  - Uncategorised spending stays out, as it does in the donut.
  - Transfers and refunds never reach the summaries.
- **Previous equivalent period:** the same number of months immediately before. For "This year", it is the same months last year.
- **Reads:** one bounded summaries window that covers the period and its comparison (`topCategoriesWindow`). This is at most 22 docs, for "This year" in December. No ledger reads, new listeners or indexes.

## Known limitation
- **The category page shows a single month.** From a multi-month period it opens on the anchor month (or last month for "Last month"), and says so.

## Validation (2026-10-23, worktree)
- `npx vitest run shared/utils/topCategories.test.ts`: 10 passed. It covers period boundaries, previous periods, the window, ranking and reconciliation with the donut, missing months, insights and hrefs.
- `npm test`: 442 files, 6208 tests passed.
- `npm run typecheck:shared`: clean.
- `npx tsc -p tsconfig.json --noEmit`: clean.
- `npx expo export --platform web`: succeeded.
- Not run: lint (no ESLint config), Android build, screenshots.
