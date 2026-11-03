# SPENDLY-589 — Wave 2 in the read model

| | |
|---|---|
| Epic | SPENDLY-586 (plan v2) |
| Branch | `feature/SPENDLY-589-sync-wave2` |
| Migration | `supabase-readmodel/supabase/migrations/20261031000000_readmodel_wave2.sql` |

## What is synced

| Table | Firestore | Typed columns (everything else stays in `doc`) |
|---|---|---|
| `borrowings` | `users/{uid}/borrowings` | lender type and name, principal, borrowed and due dates, credited account, **stored** outstanding principal, total outstanding, total paid, status, settled date |
| `borrowing_repayments` | `…/borrowingRepayments` | borrowing id, amount, principal and interest components, payment account, date, month (from `month`, else the date) |
| `receivables` | `…/receivables` | person type and name, original amount, lent and due dates, **source account (nullable) and `source_mode` (SPENDLY-668)**, space, **stored** totals received and outstanding, status, settled date |
| `receivable_repayments` | `…/receivableRepayments` | receivable id, amount, components, received account, date, month |
| `subscriptions` | `…/subscriptions` | name, amount, category, type, frequency, day of month, active and completed flags, account and to-account, last processed |

The stored totals are **copies** of Firestore's values (R4.1). Nothing recomputes them in SQL.

**SPENDLY-668:**
- an "already deducted" lend has `source_account_id = null` and `source_mode = 'already_deducted'`;
- a legacy receivable has `source_mode = null`, which means `account`.

Repayments are hard-deleted in Firestore. The push tombstones them on save, and the nightly full run catches any others (R1.3).

## The R2 contract

- **The migration:**
  - five tables with the contract columns, plus 669's `written_by`/`client_written_at`;
  - `(uid, doc_id)` keys and `(uid, …)` indexes;
  - RLS owner-read plus `grant select`;
  - the restated `readmodel_sync_table_ok`, `readmodel_client_table_ok` (the `rm_client_apply` allowlist), `readmodel_purge_user`, `readmodel_live_counts` and `v_data_quality`.
- **`TableSpec`s** in `shared/utils/readModel/mapping.ts`. The sync, the push (`PUSHABLE_COLLECTIONS`) and the client outbox all derive from them.
- **Writers** (the 671 guard flagged them once these collections were synced):
  - `hooks/useSubscriptions.ts` (add, update, delete);
  - the due-subscription update in `providers/ExpenseReferenceDataProvider.tsx`, now through `noteDirectWrites`.

  Borrowings and receivables already write through `commitMutations`.
- **Tests:**
  - `assert_security` (18 policies);
  - `rls_behaviour` (17 tables);
  - `purge` (37 rows);
  - `client_apply` (every allowlisted table);
  - `golden.sql`, regenerated: the fixture's Wave 2 rows;
  - the mapping tests: the 668 lend, a legacy receivable, repayment months, subscription typing, unmapped-not-dropped;
  - the push, sync-core and verify lists.
- **The nightly read budget:** +~25 documents a night (the 494 production inventory: `subscriptions` 22, `borrowings` 3, no repayments or receivables), against the full run's ~4.1K of 6K.

## Results

- **Local `postgres:17`, as CI runs it:** every migration plus every SQL test file passes (assert_security ×2, rls_behaviour, sync_functions, purge, verify, views, golden, push, client_apply).
- `npm test` (524 files), `npm run typecheck:shared` and `tsc`: pass.

## Production (needs the user's approval; see the plan)

1. **The migration:** additive (empty new tables, functions restated). It can go to production any time with a dry run plus approval. Main's sync and push are unaffected: they don't list the new tables until the epic reaches main.
2. **The backfill:** the first nightly full run after the epic reaches main copies the existing documents. **Before that**, run a `mode=full`, `dry_run=true` sync for the report, then get the user's approval (R7.2).
3. **The 14 clean parity days** for these tables start then. The epic doesn't ship before that (the user, 2026-11-03: no release until the epic is complete).
