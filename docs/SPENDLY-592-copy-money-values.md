# SPENDLY-592 — Firestore's stored money values in the read model

| | |
|---|---|
| Epic | SPENDLY-586 (plan v2) |
| Branch | `feature/SPENDLY-592-copy-money-values` |
| Migration | `supabase-readmodel/supabase/migrations/20261103000000_readmodel_financial_summaries.sql` |

## What is copied

**`financial_summaries`** comes from `users/{uid}/financialSummaries/{docId}`, copied exactly as Firestore stores it (R4.1):

| Doc | Typed columns |
|---|---|
| `dashboard_{YYYY-MM}` | `period`, `total_expenses`, `total_income`, `transaction_count`, `summary_version`, `calculated_at`. The `categoryTotals` map stays in `doc` |
| `epf` | `current_balance`, `employee_contribution_total`, `employer_contribution_total`, `interest_total`, `adjustments_total`, `last_credit_period`, `calculated_at` |

**Never copied: `netWorth` and `investments`** (SPENDLY-499: retired, unread, and they disagree with what the app shows). The new `TableSpec.excludeDocIds` makes every path skip them:
- the sync core (read in passing, never mapped, never tombstoned);
- push refs (refused);
- the client outbox (never queued);
- verify (they are subtracted from Firestore's `count()`);
- the drill.

**Already typed before this story:**
- `accounts.current_balance`/`current_outstanding` (Wave 1);
- the bill dues: statement amount, minimum due, amount paid, remaining (Wave 1);
- the loan totals (589), cash balance (590) and SIP totals (591).

**Net worth, safe-to-spend and budget progress** are not copied. They come from the existing TypeScript helpers over the rows (SPENDLY-673).

## Write paths

The table is on both allowlists. The app's dual write copies the summary documents `commitMutations` stages (`shared/utils/dashboardMutations.ts`), and `rebuildFinancialSummaries` was already hooked (671). One direct writer needed routing: `hooks/useEpfSummarySync.ts` (the EPF summary reconcile, 653).

Server writers (`epf-cron`, `scripts/lib/rebuildRunner.ts`) reach the read model on the nightly run.

## The guard (R4.1b)

`scripts/readmodelMoneyGuard.test.ts` works over every migration's final view and function definitions. It checks three things.

**1. Every aggregating object (`sum`/`avg`) is listed with its purpose.** A new one fails the test until someone classifies it.
- Reconciliation:
  - `readmodel_invariants`;
  - `v_account_balances` (its `recomputed_balance` sits beside `stored_balance` for the check);
  - `v_account_flows`.
- History reports:
  - `v_cash_flow_by_month`;
  - `v_period_totals`;
  - `v_cashback_history`.

**2. None of them aggregates the stored-copy tables or columns:** `financial_summaries`, outstanding amounts, cash balance.

**3. The app reads only the history report** (`v_cash_flow_by_month`, behind the analytics switch). It never reads `recomputed_balance` or the invariant checks.

## Tests

- **Sync core:** the dashboard month and EPF are copied exactly (with categories kept in `doc`); `netWorth`/`investments` are never copied; a second full pass tombstones nothing.
- **Push refs:** summaries push; the retired docs are refused.
- **Outbox:** a summary dual-writes; a retired one never does.
- **The SQL tests:** 54 policies, 53 tables, purge 110, `client_apply` covers every allowlisted table, `golden.sql` regenerated.
- **The money guard:** 4 tests.

## Results

- `npm test`: 526 files, 7,421 tests. `npm run test:rules`: 31 files, 621 tests.
- `tsc` passes, and the changed scripts typecheck on their own.
- The Read-model schema CI and PR Checks run on push. Docker Desktop was off, so the SQL suite ran in CI.

## Production (needs the user's approval)

1. **The migration:** additive. Dry run, then approval, then apply.
2. **The backfill:** the first nightly full run after the epic reaches main. `mode=full`, `dry_run=true` first (R7.2).
3. **The acceptance gate:** field parity 0 for 14 days. The story stays In Progress until then.
