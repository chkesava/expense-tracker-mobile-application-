-- SPENDLY-509: count parity between Firestore and the read model.
--
-- After each nightly full sync, scripts/readmodel-verify.ts compares
-- Firestore count() per (uid, collection) with the live (non-tombstoned) rows
-- here, records both in sync_status.source_count / model_count, and logs the
-- run in sync_runs as mode `verify`. Service role only.

alter table public.sync_runs drop constraint if exists sync_runs_mode_check;
alter table public.sync_runs add constraint sync_runs_mode_check
  check (mode in ('sync', 'dry_run', 'backfill', 'incremental', 'full', 'verify'));

-- Live rows per (uid, Firestore collection name), in one call.
create or replace function public.readmodel_live_counts()
returns table (uid text, collection text, live bigint)
language sql
stable
set search_path = ''
as $$
  select uid, 'expenses', count(*) from public.expenses where not source_deleted group by uid
  union all select uid, 'incomes', count(*) from public.incomes where not source_deleted group by uid
  union all select uid, 'ledgerEvents', count(*) from public.ledger_events where not source_deleted group by uid
  union all select uid, 'accounts', count(*) from public.accounts where not source_deleted group by uid
  union all select uid, 'accountTypes', count(*) from public.account_types where not source_deleted group by uid
  union all select uid, 'accountTransfers', count(*) from public.account_transfers where not source_deleted group by uid
  union all select uid, 'accountEntries', count(*) from public.account_entries where not source_deleted group by uid
  union all select uid, 'accountPayments', count(*) from public.account_payments where not source_deleted group by uid
  union all select uid, 'creditCardBills', count(*) from public.credit_card_bills where not source_deleted group by uid
  union all select uid, 'categories', count(*) from public.categories where not source_deleted group by uid
$$;

revoke all on function public.readmodel_live_counts() from public, anon, authenticated;
grant execute on function public.readmodel_live_counts() to service_role;
