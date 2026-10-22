# SPENDLY-581: Dashboard drill-down experiences & financial insights (epic tracker)

- **Epic branch:** `feature/SPENDLY-581-dashboard-drilldowns`, cut from `main` at `e57bf7eb` on 2026-10-23.
- **Story branches:** `feature/SPENDLY-<story>-<slug>`, cut from the epic branch.
- **Design contract:** `design/references/DESIGN.md`.
- **Handoff prompt:** `CLAUDE-HANDOFF-PROMPT.md`.

## Stories
| Story | Title | State | Branch / commit | Doc |
|---|---|---|---|---|
| SPENDLY-574 | Spending Overview category details + Total Spending (donut centre) | Built on story branch; awaiting the user's UI check on Expo web, then merge approval | `feature/SPENDLY-574-spending-category-details` | `docs/SPENDLY-574-spending-category-details.md` |
| SPENDLY-575 | Budget Progress overview and category drill-down | To Do | — | — |
| SPENDLY-576 | Recent Transactions list and transaction details | To Do | — | — |
| SPENDLY-577 | Individual transaction details and contextual actions | To Do | — | — |
| SPENDLY-578 | Spending Trends charts, comparisons and insights | To Do | — | — |
| SPENDLY-579 | Spending-by-subcategory analytics and drill-down | To Do | — | — |
| SPENDLY-580 | Highest Spending Categories ranking and drill-down | To Do | — | — |
| SPENDLY-582 | Recurring expenses overview, schedules and payments | To Do | — | — |

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
- **UI review (574):** the user reviews UI personally on local Expo web with demo data. Agents stop after each story and do not capture screenshots.
