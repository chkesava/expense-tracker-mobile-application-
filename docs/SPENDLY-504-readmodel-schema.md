# SPENDLY-504: read-model Supabase project and Wave 1 schema

[SPENDLY-504](https://kesavach.atlassian.net/browse/SPENDLY-504) is part of epic SPENDLY-494. Its decisions come from the `docs/SPENDLY-494-adr.md` §0 decision: GO, option C (a daily sync job, no Blaze), and a **dedicated** Supabase project.

## Layout

The read model has its **own** Supabase workdir, `supabase-readmodel/`, separate from `supabase/`.
- `supabase/` deploys Ganesh Seva's Edge Functions to the shared `ganesh-seva-storage` project.
- A `config.toml` or a `migrations/` folder there would change how those deploys behave.

| Path | What |
|---|---|
| `supabase-readmodel/supabase/config.toml` | CLI config (`project_id = "spendly-read-model"`), from `supabase init` |
| `supabase-readmodel/supabase/migrations/20261017000000_readmodel_wave1.sql` | The Wave 1 tables, sync bookkeeping and default-deny security |
| `supabase-readmodel/tests/bootstrap_roles.sql` | Creates `anon`, `authenticated` and `service_role` on a **plain** Postgres for tests. Never run it on Supabase |
| `supabase-readmodel/tests/assert_security.sql` | The acceptance checks. Every failed check raises an error |
| `.github/workflows/readmodel-schema.yml` | CI: Postgres 17 → roles → migrations → assertions, on every PR that touches `supabase-readmodel/` |
| `scripts/readmodelMigrations.test.ts` | Static guards in `npm test`: every created table is covered by RLS and revoke, no policies, no float |
| `scripts/readmodelSecrets.test.ts` | Read-model secrets never appear in app code or `EXPO_PUBLIC_*` |

## Security model

- **RLS is enabled on all 14 tables.** There are no policies yet, so every client role is denied.
- **`anon` and `authenticated` have no privileges at all.** This also covers future tables: the migration revokes Supabase's default grants.
- **Read policies for signed-in users arrive with SPENDLY-505.**
- **Only the sync job writes.** It uses the service role (which bypasses RLS). The key is held in GitHub Actions secrets and nowhere else.
- **Reserved secret names:** `READMODEL_SUPABASE_SERVICE_ROLE_KEY`, `READMODEL_SUPABASE_DB_URL`, `READMODEL_FIREBASE_SERVICE_ACCOUNT`.

## Shared columns (every user-data table)

| Column | Meaning |
|---|---|
| `uid`, `doc_id` | **Primary key**: the Firestore path `users/{uid}/<collection>/{doc_id}` |
| `doc jsonb` | The normalised source document. Nothing is dropped |
| `source_path` | The full Firestore path |
| `source_update_time` | The Firestore document `updateTime`. This is the version guard: an older version never overwrites a newer one (SPENDLY-506) |
| `source_deleted`, `deleted_at` | The tombstone: set when a complete sync pass no longer finds the document |
| `schema_version` | The mapper version that wrote the row |
| `mapping_status` | `mapped` or `unmapped`. Unmapped means the typed columns are null and `doc` holds the data |
| `synced_at` | When the row was last written |

## Field map (Firestore → column)

Money is always `numeric(18,2)`. Fields that are not listed stay in `doc`.

| Table (collection) | Typed columns ← source field | Kept only in `doc` (examples) |
|---|---|---|
| `expenses` (`expenses`) | `amount`, `date`, `month`, `category`, `subcategory`, `account_id`←`accountId`, `credit_card_bill_id`←`creditCardBillId`, `subscription_id`←`subscriptionId`, `soft_deleted_at`←`deletedAt` | `note`, `tags`, `time`, `tripId`, `spaceId`, `vaultId`, `splitId`, `statementImportFingerprint`, `deletedBy`/`deletedReason` |
| `incomes` (`incomes`) | `amount`, `date`, `month`, `source`, `account_id`, `soft_deleted_at`←`deletedAt` | `note`, `time`, `deletedBy`/`deletedReason` |
| `ledger_events` (`ledgerEvents`) | `kind`, `action`, `target_doc_id`←`docId`, `created_at`←`createdAt` | `before`, `after`, `actorUid`, `reason` |
| `accounts` (`accounts`) | `name`, `type_id`←`typeId`, `currency`, `opening_balance`, `balance_as_of_date`, `balance_initialized`, `credit_limit`, `bill_generation_day`, `current_balance`, `current_outstanding`, `statement_due`, `unbilled_spend`, `balance_reconciliation_status` | `availableCredit`, `paidThisCycle`, `cashbackThisCycle`, cycle fields, `institution*`, `color`, `accountNumber` |
| `account_types` (`accountTypes`) | `name` (decides credit vs bank) | everything else |
| `account_transfers` (`accountTransfers`) | `from_account_id`, `to_account_id`, `amount`, `date`, `month`, `subscription_id` | `note`, `recurringTransfer` |
| `account_entries` (`accountEntries`) | `account_id`, `amount`, `direction`, `date`, `transfer_id`, `source` | `note`, `linkedSplitId`, `reversalOf`, `correlationId` |
| `account_payments` (`accountPayments`) | `from_account_id`, `to_account_id`, `amount`, `date`, `credit_card_bill_id`, `bill_applied_amount`, `cashback_kind`, `source_type`, `voided_at`←`voidedAt` | `note`, `appliedCycleStart/End`, `linkedExpenseId`, `providerRef`, `cashbackSource`, `voidReason` |
| `credit_card_bills` (`creditCardBills`) | `account_id`, `billing_period_start/end`, `statement_date`, `due_date`, `statement_amount`, `minimum_due_amount`, `amount_paid`, `remaining_amount`, `currency`, `status` | `paymentIds`, reminder fields, `paymentDate`, `previousStatementAmount`, `version` |
| `categories` (`categories`) | `name`, `kind`, `parent_id`, `semantic_key`, `is_default`, `is_archived`, `is_hidden`, `sort_order` | `icon`, `createdAt` |

**Copies, not truth.** `accounts.current_balance` and the other materialized columns are display copies of Firestore values. Firestore owns them (ADR §9).

## Sync bookkeeping tables

| Table | Purpose |
|---|---|
| `sync_runs` | One row per job run: mode (`sync`, `dry_run`, `backfill`), status (`running`, `succeeded`, `partial`, `failed`), Firestore reads used vs the read budget, upserts, tombstones, unmapped rows, failures |
| `sync_status` | Per user and collection: last sync, last **complete** pass (tombstones are only trusted after one), source count vs model count, pending failures. Drives the "last synced at" labels |
| `sync_checkpoints` | Where a budget-limited run stopped, so the next run resumes there |
| `sync_failures` | Documents that could not be applied. A failure open longer than 24 h fails the scheduled run (SPENDLY-507) |

## Creating the project (user, one time)

**Done 2026-10-17:** project ref `spmsgncjbnbkxvsbpqlu` (`https://spmsgncjbnbkxvsbpqlu.supabase.co`), created by the user.

1. Go to https://supabase.com/dashboard and choose **New project**.
2. Set the name to `spendly-read-model` and the region to **South Asia (Mumbai)**. Store the database password in a password manager.
3. Record the **project ref** (the `xxxx` in `https://xxxx.supabase.co`) in a Jira comment on SPENDLY-504.
4. Do **not** add any of its keys to `.env`, `EXPO_PUBLIC_*` or Netlify. The app does not talk to it until SPENDLY-505.

## Applying the migration to production (manual, reviewed)

There is no automatic production migration at this stage. Run from the repo root, in a terminal you control. The CLI asks for the database password; never paste it into a chat.

```
supabase link --workdir supabase-readmodel --project-ref <ref>
supabase db push --workdir supabase-readmodel --dry-run   # review the plan
supabase db push --workdir supabase-readmodel
```

Then confirm, in the SQL editor:

```
select tablename, rowsecurity from pg_tables where schemaname = 'public' order by 1;
select grantee, table_name, privilege_type from information_schema.role_table_grants
 where table_schema = 'public' and grantee in ('anon','authenticated');   -- expect 0 rows
```

Finally, run the manual test from the ticket: with the project's **publishable** key, a `select` on `expenses` must fail with a permission error.

**Rollback:** drop the tables, or delete the project. Nothing reads it yet, and Firestore is untouched.

## Not done here (later stories)

| Item | Story |
|---|---|
| `readmodel_upsert` and tombstone SQL, mappers, the sync job | SPENDLY-506 |
| Read policies, the Firebase third-party auth link, cross-user tests | SPENDLY-505 |
| `supabase db lint` in CI | Not added. It needs the full local Supabase stack (Docker). CI applies the migrations to plain Postgres 17 and runs the assertions instead |

## Tests run (2026-10-17)

- **Local apply + assertions** on a throwaway Postgres 18 cluster (temporary folder, port 55432, removed afterwards):
  - all 7 assertion blocks passed;
  - `set role anon; select … from expenses` returned **permission denied**.
- **Negative check:** after granting `anon` access and disabling RLS on one table, the assertions failed as intended ("tables without row level security: incomes").
- **`npm test`:** see the story's Jira comment.
