# SPENDLY-495: dashboard period summaries fix

[SPENDLY-495](https://kesavach.atlassian.net/browse/SPENDLY-495) is a standalone bug, P0-1 in `docs/HYBRID_READ_MODEL_AUDIT_AND_PLAN_2026-10-11.md` §5. It is the first item of the correctness track (495 → 496 → 497 → 499 → 500 → 503) that must finish before SPENDLY-510.

Branch: `fix/SPENDLY-495-dashboard-period-summaries`, cut from `main` `69c1c9e`.

## What was wrong

`users/{uid}/financialSummaries/dashboard_{YYYY-MM}` feeds the dashboard's monthly spend, Top Categories, budget alerts and cash-flow chart. It had four problems:

| # | Bug | Effect |
|---|---|---|
| 1 | Writes used `"categoryTotals.<cat>": increment()` inside `set({merge:true})` | In `set()` a dotted key is a **literal field name**. Every write created a top-level field such as `"categoryTotals.Food"`, and the real `categoryTotals` map was only filled by a rebuild. **Proven on the emulator** (`firestore/dashboardSummary.rules.test.ts`) |
| 2 | Create counted only the parent category; edit, delete and restore also adjusted `"parent::sub"` | Subcategory totals drifted and could go negative |
| 3 | An edit that moved an expense between two subcategories of the **same parent** overwrote the parent's delta (`-before`, then `= after`) | The parent ended at `+after` instead of `after − before`. *Found while fixing; it was not in the ticket* |
| 4 | Writes bucketed by `row.month`, the rebuild by `date.substring(0,7)` | A row whose `month` differs from its date landed in different months |

The rebuild script had two further faults:
- it merged `categoryTotals`, so stale or negative keys survived a rebuild;
- it never removed the literal dotted fields.

## The fix

| File | Change |
|---|---|
| `shared/utils/dashboardSummaryKeys.ts` (new, Firebase-free) | **One key scheme:** each expense counts under its parent **and**, when it has one, `"parent::sub"`. This keeps today's readers unchanged: `topCategoryShares` uses only the parent keys, and `computeActiveCategoryBudgets` uses the `::` keys. **One month rule:** `month`, else the date prefix (`monthKeyOf`) |
| `shared/utils/dashboardMutations.ts` | `categoryTotals` is now written as a **nested map** under `set({merge:true})`, which deep-merges per key. New `computeDashboardExpenseCreateOps` and `computeDashboardIncomeCreateOps`. Edits **sum** shared keys. Restore reuses create |
| `services/ledger/createLedgerTransaction.ts` | Expense and income create use the shared helpers, so create now counts the subcategory too |
| `shared/utils/reconciliation.ts` | `calculateDashboardSummaries` uses the same keys and month rule. New pure `planDashboardSummaryRepair` (per-month variance, stray dotted fields, the values to write) and `strayDottedCategoryFields` |
| `scripts/rebuild-domain-summaries.ts` | The dashboard step:<br>• compares every stored `dashboard_*` doc with the rebuild and prints the variance;<br>• on `--apply`, writes with `mergeFields`, so `categoryTotals` is **replaced** rather than merged;<br>• zeroes months whose rows are all gone;<br>• deletes stray dotted fields with one-segment `FieldPath`s (one update per doc).<br>It is still **dry-run by default** |

**Invariant now true for every month:** the parent keys of `categoryTotals` sum to `totalExpenses`, and no key is negative.

## Tests

| Test | What it proves |
|---|---|
| `shared/utils/dashboardMutations.test.ts` (10) | The nested map with no dotted keys; create, edits within a parent, across categories and across months; delete and restore are inverses; the month fallback. **A property test:** 25 random runs of 60 create/edit/delete/restore/income operations always end equal to `calculateDashboardSummaries`, with no negative key and parents summing to the total |
| `shared/utils/reconciliation.test.ts` (+5) | The repair planner: stray fields, variance lines, a stale month planned to zero, non-dashboard docs ignored |
| `firestore/dashboardSummary.rules.test.ts` (3, emulator) | **Real Firestore:** the old dotted key creates a literal field and leaves the map empty; the new nested map deep-merges and increments per key, creating the doc if missing; unrelated keys are untouched. The owner's write passes the rules |
| Emulator run of the rebuild script (manual, 2026-10-19) | On seeded demo data with an injected stray field, a −50 ghost key and a stale 2020-01 month:<br>• the dry-run listed exactly those and wrote nothing;<br>• `--apply` fixed them in 9 operations;<br>• a second dry-run reported **0 docs needing repair** |

Results:
- `npm test`: 5,696 tests passing.
- `npm run typecheck:shared`: passes.
- `npx tsc -p tsconfig.json --noEmit`: passes.
- `npx tsc -p scripts/tsconfig.json --noEmit`: passes.

## Production repair (not done; needs approval)

The order matters: **release first, then repair.** Clients running the old build keep writing dotted fields and parent-only increments until they update.

1. Merge to `main` and ship a release that carries this fix.
2. Run a production **dry-run**:
   ```
   GOOGLE_APPLICATION_CREDENTIALS=<key> npx tsx scripts/rebuild-domain-summaries.ts
   ```
   It is read-only. It prints per-user variance, including account, EPF and net-worth candidates, and reads every user's ledger collections. That is about 4,500 docs today.
3. The user reviews the report and approves.
4. Run it again with `--apply`, then repeat the dry-run. It must report 0 dashboard docs needing repair for anyone who has updated the app.
5. **Manual check:** Dashboard Top Categories matches the Journal totals for three sample months.

**Note:** the script's account, EPF and net-worth steps also apply on `--apply`. Review those lines of the dry-run too, or run with `--uid=<uid>` one user at a time.
