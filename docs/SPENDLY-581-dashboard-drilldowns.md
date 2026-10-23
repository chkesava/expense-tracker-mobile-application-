# SPENDLY-581: Dashboard drill-down experiences & financial insights (epic tracker)

- **Epic branch:** `feature/SPENDLY-581-dashboard-drilldowns`, cut from `main` at `e57bf7eb` on 2026-10-23.
- **Story branches:** `feature/SPENDLY-<story>-<slug>`, cut from the epic branch.
- **Design contract:** `design/references/DESIGN.md`.
- **Handoff prompt:** `CLAUDE-HANDOFF-PROMPT.md`.

## Stories
| Story | Title | State | Branch / commit | Doc |
|---|---|---|---|---|
| SPENDLY-574 | Spending Overview category details + Total Spending (donut centre) | Merged into the epic branch (`88218d57`) after the owner's Expo web review; Jira In Progress until main | `feature/SPENDLY-574-spending-category-details` (`47f14d27`, `f37a2831`, `19d9bcad`) | `docs/SPENDLY-574-spending-category-details.md` |
| SPENDLY-575 | Budget Progress overview and category drill-down | Merged into the epic branch (`3d3fb336`); Jira In Progress until main | `feature/SPENDLY-575-budget-progress-drilldown` (`a80bebdf`) | `docs/SPENDLY-575-budget-progress-drilldown.md` |
| SPENDLY-576 | Recent Transactions list and transaction details | Merged into the epic branch; Jira In Progress until main | `feature/SPENDLY-576-recent-transactions` (`772573ac`) | `docs/SPENDLY-576-recent-transactions.md` |
| SPENDLY-577 | Individual transaction details and contextual actions | Merged into the epic branch; Jira In Progress until main | `feature/SPENDLY-577-transaction-detail-actions` (`25048dbc`) | `docs/SPENDLY-577-transaction-detail-actions.md` |
| SPENDLY-578 | Spending Trends charts, comparisons and insights | Merged into the epic branch; Jira In Progress until main | `feature/SPENDLY-578-spending-trends` (`5014a8bc`) | `docs/SPENDLY-578-spending-trends.md` |
| SPENDLY-579 | Spending-by-subcategory analytics and drill-down | Merged into the epic branch; Jira In Progress until main | `feature/SPENDLY-579-subcategory-drilldown` (`b8845093`) | `docs/SPENDLY-579-subcategory-drilldown.md` |
| SPENDLY-580 | Highest Spending Categories ranking and drill-down | Merged into the epic branch; Jira In Progress until main | `feature/SPENDLY-580-highest-spending-categories` (`c5512dd3`) | `docs/SPENDLY-580-highest-spending-categories.md` |
| SPENDLY-582 | Recurring expenses overview, schedules and payments | Merged into the epic branch; Jira In Progress until main | `feature/SPENDLY-582-recurring-expenses` (`bfc6c216`) | `docs/SPENDLY-582-recurring-expenses.md` |

## Decisions
- **Data sources (574):**
  - Drill-down totals come from the `dashboard_{YYYY-MM}` summaries.
  - Lists come from the `FinanceDataProvider` expense store under the summary's own inclusion rule (`shared/utils/spendingDrilldown.ts`).
  - Later stories should reuse these helpers, not add a second aggregation.
- **Route state (574):**
  - Drill-down state (month, tab, range, subcategory) lives in route params.
  - `/spending` and `/spending/<category>` are the shared entry points.
- **Category identity (574):** the category route key is the stored parent category name, URL-encoded. Expenses carry no other category id.
- **Reference aliases are mislabelled (574):**
  - `spendly-total-spending-drilldown.png` shows category details.
  - `spendly-spending-category-details.png` shows the highest-categories → subcategory flow.
  - The real Total Spending flow is `generated/a_wide_high_resolution_ui_ux_concept_mockup_image.png`.
- **Worktree (2026-10-23):** epic work happens in `C:\dev\worktrees\spendly-581`. Story branches are cut there from the epic branch.
- **Budget aggregation (575):**
  - Budget figures and statuses come only from `computeActiveCategoryBudgets` / `computeSpendlyBudget`.
  - Totals across category budgets use `categoryBudgetRollup`, which never counts a subcategory budget inside its parent's.
  - The real budget reference is `generated/a_clean_high_fidelity_ui_ux_mockup_image_consisti.png`; the alias shows the transactions flow.
- **Transactions list (576):**
  - `/transactions` is the Journal pipeline plus transfers (`shared/utils/transactionsFeed.ts`).
  - Transfers are listed, never totalled.
  - The detail stays `/transactions/[id]`.
  - The real reference is `generated/a_wide_high_resolution_ui_mockup_triptych_of_a_mo.png`.
- **Detail actions (577):**
  - Only actions with an existing flow are offered (`transactionActions`).
  - "Make it recurring" marks the expense's month processed, so it is never posted twice.
  - Split, Duplicate and attachments are omitted.
- **Spending Trends (578):**
  - Monthly and yearly figures come from summaries; daily and weekly from one month's ledger rows under the summary rule.
  - Category taps reuse the 574 category page.
  - The real reference is `generated/a_wide_high_fidelity_mobile_app_ui_concept_image.png`.
- **Subcategories (579):**
  - `/spending/<category>/<subcategory>`; the category route moved to `[category]/index.tsx` with the same URL.
  - "No subcategory" is an explicit `__none__` bucket.
  - Merchants come from SPENDLY-186 recognition, with unrecognised payees in one bucket.
  - The real reference is `generated/wide_multi_panel_mobile_app_ui_mockup_screenshot.png`.
- **Highest categories (580):**
  - `/top-categories`: whole-month periods summed from summaries, ranked by the donut rule.
  - Taps reuse the 574 and 579 pages.
  - The real reference is `generated/a_wide_detailed_ui_mockup_composite_image_of_a_mo.png`.
- **Recurring (582):**
  - `/recurring` reuses the Money tab's `SubscriptionsList`; `/recurring/[id]` is the new detail.
  - Upcoming dates are projections; history is only rows that carry `subscriptionId`.
  - Skip and mark-paid are left out, because no domain rule supports them.
- **UI review (574):** the user reviews UI personally on local Expo web with demo data. Agents stop after each story and do not capture screenshots.
