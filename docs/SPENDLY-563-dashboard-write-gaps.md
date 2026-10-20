# SPENDLY-563: dashboard write gaps (due-posts, category rename/merge, split delete)

[SPENDLY-563](https://kesavach.atlassian.net/browse/SPENDLY-563) is a bug found by the SPENDLY-500 production dry-run (2026-10-20). It **blocks the SPENDLY-500 apply**: without it, dashboards drift again right after the repair.

Branch: `fix/SPENDLY-563-dashboard-write-gaps`, cut from `main` `1995db9`.

## The gaps

| Path | Before | After |
|---|---|---|
| **Recurring / EMI due-post** (`services/subscriptions/duePost.ts`) | Created the expense and moved the balance (SPENDLY-523), but **never** the month's dashboard summary. In production, one user's 2026-10 dashboard was ₹3,800 short | `computeDashboardExpenseCreateOps` in the same batch, behind the same first-write-only guard (`docAlreadyWritten`), so a replay or a second device can't count it twice. Recurring transfers are not spend and get no dashboard op |
| **Category rename** (`hooks/useCategories.ts`, `renameCategory`) | Rewrote expenses' category or subcategory names, but `categoryTotals` kept the money under the old key | Each chunk's moves are summed per month (`dashboardOpsForRelabel`) and staged into the **same** batch as that chunk's expense updates |
| **Category merge** (`mergeCategories`) | Same as rename: the money stayed under the source category | Same as rename |
| **Split delete** (`hooks/useSplits.ts`) | Soft-deleted the linked expenses without a dashboard decrement. **It also reversed the account balance for a linked expense that was already deleted, refunding it twice** | `computeDashboardDeleteOps` per linked expense, and **both** the balance and dashboard reversals apply only to expenses that were still live |

`dashboardOpsForRelabel` (in `shared/utils/dashboardMutations.ts`) skips soft-deleted rows, since the summary doesn't count them. It never changes `totalExpenses` or `transactionCount`, because a relabel moves money between keys, not in or out of the month.

## Tests

| Test | What it proves |
|---|---|
| `services/subscriptions/duePost.test.ts` (+3) | A posted expense adds `totalExpenses`, `transactionCount`, and parent + subcategory keys in the same batch. An already-posted charge adds nothing. A recurring transfer writes no dashboard op |
| `shared/utils/dashboardMutations.test.ts` (+3) | Relabel deltas per month (merge across categories, subcategory-only rename); deleted rows and empty chunks write nothing; month totals untouched |
| Split delete | Not unit-testable (hooks are outside the vitest include). It calls the already-tested `computeDashboardDeleteOps` |

Results:
- `npm test`: 386 files, 5,740 tests, all passing.
- `typecheck:shared`: passes.
- Full `tsc`: passes.
- `verify-performance-budgets`: passes.

**Not run:** device QA, meaning:
1. Post a due EMI.
2. Rename or merge a category.
3. Delete a split with an own share.
4. After each step, compare the dashboard with the Journal for that month.
