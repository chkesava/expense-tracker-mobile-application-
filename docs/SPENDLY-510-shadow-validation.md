# SPENDLY-510: shadow validation and the 14-day parity gate

[SPENDLY-510](https://kesavach.atlassian.net/browse/SPENDLY-510) is part of the SPENDLY-494 epic.

- Branch: `feature/SPENDLY-510-shadow-validation`, cut from the epic branch after SPENDLY-509 was merged.
- Runbook: `docs/READMODEL_RUNBOOK.md`, section "Parity".

No screen may read Supabase until the copy, and the numbers SQL derives from it, are proven equal to Firestore and to the TypeScript calculations. The repo already had several "monthly spend" implementations. This story makes sure SQL is not a new one that quietly disagrees.

## What was built

| Piece | What |
|---|---|
| Views migration | `supabase-readmodel/supabase/migrations/20261026000000_readmodel_views.sql`. Details below |
| Golden harness | `scripts/lib/readmodelGolden.ts` generates `supabase-readmodel/tests/golden.sql` from the **SPENDLY-503 golden fixture**. It seeds the fixture through the real mapper and `readmodel_upsert`, then asserts every view equals the TypeScript reference, **to the paisa**, as a set difference both ways. `scripts/readmodelGolden.test.ts` fails if the committed file differs from what the TypeScript generates, so the SQL can't drift from it. CI runs the SQL |
| Field parity + repair | Inside the nightly **full** sync, at no extra Firestore reads. Details below |
| Data findings + 14-day gate | `scripts/readmodel-parity.ts` (core in `lib/readmodelParity.ts`) and a "Record parity findings" step after each nightly verify. Details below |

**The migration adds:**

| View or function | Reproduces / does |
|---|---|
| `v_period_totals` | `calculateDashboardSummaries` → `categoryTotals`: parent and `parent::sub` keys, bucketed by `month` else date (SPENDLY-495) |
| `v_cash_flow_by_month` | Its totals and transaction counts |
| `v_cashback_history` | `buildCashbackHistory`: kind defaults to statement credit; voided amounts kept apart |
| `v_account_flows` (and `v_account_flow_rows`) | Σ `ledgerRowAccountDeltas` over the Wave 1 rows (bank-balance semantics) |
| `v_account_balances` | Non-credit accounts recomputed from Wave 1 rows with the balance baseline (`effectiveBalanceAsOfDate`) |
| `v_data_quality` | Rows whose missing data would otherwise read as 0 or vanish from a total |
| `readmodel_invariants()` | The ticket's relationship checks, listed below |
| `readmodel_repair()` | Rewrites a diverged row even at the same version, never an older one; purged accounts stay refused |

**Relationship checks in `readmodel_invariants()`:**
- orphan account, bill and linked-expense references;
- duplicate live cashback for one linked expense (the Axis shape);
- a bill paid more than its linked live payments (promised vs received);
- stored vs Wave-1-recomputed balance.

**Missing data is never 0.** A group with any null amount totals **null**, and the row appears in `v_data_quality`.

**Access:** every view is `security_invoker` (the caller's RLS applies). There are **no client grants yet**: until SPENDLY-511 flips a screen, the SQL numbers own nothing user-facing.

**Field parity, in detail:**
- After a full pass of a (uid, collection), the stored rows are fetched from Supabase and every typed column is compared with what the mapper builds from the Firestore document (`shared/utils/readModel/parity.ts`).
- A diverged row (for example, edited in Postgres, which the version-guarded upsert would never heal) is **rewritten from Firestore** and recorded as a `parity` failure. The failure names the columns, never the values.
- The run shows `parityMismatches` and goes `partial`. The failure clears on the next clean pass.

**Data findings and the gate, in detail:**
- **Findings are counted by check,** never by user, and recorded as a `parity` run. They describe the data as Firestore has it, so they are reported, not failed on.
- **The gate:** 14 consecutive IST days, each with a full sync that had no field divergence, a passing count-parity verify, and no failed run.
- **Where to see it:** the health summary shows the streak. `mode=report` prints the day-by-day report for sign-off.

**Stored-value parity, and its limit.** "Copied vs Firestore" is guaranteed by field parity, since the balance columns are copied fields. "SQL recomputation" covers **non-credit accounts from Wave 1 rows only**: borrowings and receivables (Wave 2) aren't in the read model, so an account they touch shows `balance_mismatch` as an explained finding, not divergence. Card outstanding (statement and cycle logic) is **not** recomputed in SQL. Its TypeScript-vs-Firestore check is the SPENDLY-503 baseline.

## Tests

| Test | Proves |
|---|---|
| `tests/golden.sql`, generated (CI and local PG18) | All four views equal the TypeScript reference on the fixture, which covers: transfers both ways, a voided payment, a soft delete, a restore, a cross-month edit, a partial bill payment, cashback and a card refund |
| `scripts/readmodelGolden.test.ts` (2) | The committed file is exactly the generated one; the named cases are in it |
| `tests/views.sql` | A missing amount gives a null total plus a data-quality row. Voided cashback isn't received. The invariants find exactly the seeded orphan account, orphan bill, duplicate cashback, overpaid bill and unexplained balance, and nothing for the clean rows. Repair restores a same-version edit and refuses an older version. The views are `security_invoker` and unreadable by clients; the functions are server-only |
| **Mutation check** | Bucketing by date instead of month, counting soft-deleted rows, counting voided cashback, flipping a transfer leg, and counting voided payments: each fails golden or views. It also exposed two real gaps, now fixed: an outer-join null in `v_account_balances`, and no voided-cashback coverage |
| `shared/utils/readModel/parity.test.ts` (5) | Postgres representations compare equal; differing columns are named, never valued; null vs a value is a difference; a missing row is a difference |
| `scripts/readmodelSyncCore.test.ts` (+3) | **Injected divergence:** a row edited in "Postgres" at the same version is detected, repaired from Firestore and recorded; the next run is clean and resolves it. A hand-deleted row is restored. Dry runs don't check |
| `scripts/readmodelParity.test.ts` (5) | The gate passes at 14 clean days. Divergence, a failed verify, any failed run or a missing night breaks it. Today not having run yet doesn't reset it. Findings are summarized without uids |

Results (2026-10-22):
- The SQL chain (assertions → RLS → sync functions → purge → verify → views → golden → assertions) passes on local Postgres 18.
- The emulator end-to-end tests pass.
- `npm test` passes, as do `typecheck:shared` and full `tsc`.
- The script files were typechecked with a temporary config.

## Not done / open

- **The 14 days themselves** (the Definition of Done, and the Phase 2 exit evidence) start once the sync is live after the setup from 505 to 509. Then `mode=report`, paste it into `docs/`, and you sign it off.
- **Manual spot checks** (3 months of Journal totals against `v_period_totals`; one account's balance) need live data, as part of the 14 days.
