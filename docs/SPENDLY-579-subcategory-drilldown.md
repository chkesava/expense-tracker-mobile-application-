# SPENDLY-579: Spending by subcategory — breakdown, trend, merchants, transactions

This story is part of epic SPENDLY-581.
- **Branch:** `feature/SPENDLY-579-subcategory-drilldown`.
- **Cut from:** the epic branch at `e1bb8bb1`, in the worktree `C:\dev\worktrees\spendly-581`.

## Reference images
- **`spendly-spending-by-subcategory.png` is mislabelled.** It holds the dashboard mountain-background moodboard.
- **The real flow** (Spending Categories → Food & Groceries subcategories → Groceries trend and merchant breakdown → Groceries transactions) is `generated/wide_multi_panel_mobile_app_ui_mockup_screenshot.png`.

## Flow
- **Spending Overview → category page** (`/spending/<category>`, SPENDLY-574). Its **Breakdown** lists every subcategory with its share of the category and amount, plus an explicit **"No subcategory"** row for the rest.
  - **New:** tapping a subcategory (row or slice) now opens its own page. Before, it only filtered the category's transactions.
- **New `/spending/<category>/<subcategory>?month&tab=overview|merchants|transactions&merchant=`** (`app/(app)/spending/[category]/[sub].tsx`). Both keys are the stored names, URL-encoded; `__none__` is the no-subcategory bucket.
  - **Hero:**
    - the subcategory name and "In <category> · <month>";
    - the total;
    - the change from last month (only with a real, non-zero base);
    - both denominators, spelled out: "% of <category>" and "% of all spending".
  - **Overview:**
    - the 574 trend panel (Amount / Transactions / Trend, 6 months), scoped to the subcategory;
    - the Transactions and Average cards with their comparisons;
    - insights, or the insufficient-history note.
  - **Merchants:**
    - a breakdown (amount, % of the subcategory, count) built with the existing SPENDLY-186 recognition (`buildMerchantLedgerItems`). The user's merchant corrections are read once, only on this view.
    - Payees the resolver can't name are one **"Not recognised"** bucket, always last. The header shows how much is recognised.
    - Tapping a merchant opens Transactions filtered to it, with a removable chip.
  - **Transactions:** the 574 list (search, sort, Show more) over the subcategory's rows. Rows open `/transactions/[id]`.
- **Route move:** `app/(app)/spending/[category].tsx` → `[category]/index.tsx`, so the category URL is unchanged. `_layout.tsx` registers `spending/[category]/index` and `spending/[category]/[sub]`. Both are covered by the existing `/spending/` prefixes for Android back and restore, with tests.

## Data and reconciliation
- **Totals** come from the month summary:
  - a subcategory is its `"Parent::Sub"` key (`subcategoryAmount`);
  - "No subcategory" is the parent's remainder that no key covers.
  - So a category's subcategories **always add up to the category total**. This is tested against `calculateDashboardSummaries`.
- **Rows** use the summary's inclusion rule. `isEligibleExpense` now understands `NO_SUBCATEGORY` (rows with an empty subcategory), so the list, counts and merchants match the figure above them.
- **Monthly series** take an optional subcategory (`monthlySpendSeries(…, category, subcategory)`). The trend panel now uses that instead of building the key itself.
- **Sorting:** rows sort by amount. Sorting by percentage would give the same order, since every share has the same denominator, so it isn't offered separately.
- **Reads:**
  - the same bounded summaries window and per-month `loadMonth` as 574;
  - one `listMerchantOverrides` read, only when Merchants or a merchant filter is open.
  - No new listeners, collections or indexes.

## Validation (2026-10-23, worktree)
- `npx vitest run shared/utils/subcategoryDrilldown.test.ts`: 8 passed. It covers subcategory and remainder totals, denominators, row filtering, series, routes, merchant grouping and aliases, and merchant filtering.
- `npm test`: 441 files, 6198 tests passed.
- `npm run typecheck:shared`: clean.
- `npx tsc -p tsconfig.json --noEmit`: clean.
- `npx expo export --platform web`: succeeded, and the bundle has `spending/[category]/[sub]`.
- Not run: lint (no ESLint config), Android build, screenshots.
