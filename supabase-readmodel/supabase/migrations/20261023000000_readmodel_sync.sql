-- SPENDLY-506: write path for the read-model sync job.
--
-- Only the sync job writes here, as service_role from GitHub Actions
-- (scripts/readmodel-sync.ts). Clients have no execute right on these
-- functions and no write grants on any table (SPENDLY-504/505).
--
-- readmodel_upsert      batch upsert, version-guarded on the Firestore
--                       document updateTime: an older or equal version never
--                       overwrites a newer one, so replays and overlapping
--                       runs are no-ops. A row seen alive again is
--                       un-tombstoned.
-- readmodel_live_ids    ids of a user's non-tombstoned rows in a table, so the
--                       job can work out which documents vanished.
-- readmodel_tombstone   marks the given ids deleted (never removes rows).
--
-- The job only tombstones after a *complete* full pass of a (uid, collection),
-- and refuses to tombstone a large share of one in a single run.

alter table public.sync_checkpoints add column if not exists high_water timestamptz;

-- The run modes the job records (504 anticipated sync/backfill).
alter table public.sync_runs drop constraint if exists sync_runs_mode_check;
alter table public.sync_runs add constraint sync_runs_mode_check
  check (mode in ('sync', 'dry_run', 'backfill', 'incremental', 'full'));

create or replace function public.readmodel_sync_table_ok(p_table text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_table = any (array[
    'expenses', 'incomes', 'ledger_events', 'accounts', 'account_types',
    'account_transfers', 'account_entries', 'account_payments',
    'credit_card_bills', 'categories'
  ])
$$;

create or replace function public.readmodel_upsert(p_table text, p_rows jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  cols text;
  sets text;
  n integer;
begin
  if not public.readmodel_sync_table_ok(p_table) then
    raise exception 'readmodel_upsert: unknown table %', p_table;
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'readmodel_upsert: rows must be a JSON array';
  end if;

  -- Every column except the ones this function owns.
  select string_agg(quote_ident(a.attname), ', ' order by a.attnum),
         string_agg(format('%1$I = excluded.%1$I', a.attname), ', ' order by a.attnum)
    into cols, sets
  from pg_attribute a
  where a.attrelid = format('public.%I', p_table)::regclass
    and a.attnum > 0 and not a.attisdropped
    and a.attname not in ('synced_at', 'source_deleted', 'deleted_at');

  execute format(
    'insert into public.%1$I as t (%2$s, synced_at, source_deleted, deleted_at)
       select %2$s, now(), false, null
       from jsonb_populate_recordset(null::public.%1$I, $1)
     on conflict (uid, doc_id) do update
       set %3$s, synced_at = now(), source_deleted = false, deleted_at = null
       where excluded.source_update_time > t.source_update_time
          or t.source_deleted',
    p_table, cols, sets
  ) using p_rows;
  get diagnostics n = row_count;
  return n;
end
$$;

-- Keyset-paged (doc_id > p_after, ordered): the API caps a response at
-- max_rows (1,000), and a truncated list would look like deleted documents.
create or replace function public.readmodel_live_ids(p_table text, p_uid text, p_after text default '', p_limit integer default 1000)
returns setof text
language plpgsql
stable
set search_path = ''
as $$
begin
  if not public.readmodel_sync_table_ok(p_table) then
    raise exception 'readmodel_live_ids: unknown table %', p_table;
  end if;
  return query execute format(
    'select doc_id from public.%I where uid = $1 and not source_deleted and doc_id > $2
     order by doc_id limit least(greatest($3, 1), 1000)', p_table
  ) using p_uid, coalesce(p_after, ''), p_limit;
end
$$;

create or replace function public.readmodel_tombstone(p_table text, p_uid text, p_doc_ids text[])
returns integer
language plpgsql
set search_path = ''
as $$
declare
  n integer;
begin
  if not public.readmodel_sync_table_ok(p_table) then
    raise exception 'readmodel_tombstone: unknown table %', p_table;
  end if;
  execute format(
    'update public.%I set source_deleted = true, deleted_at = now(), synced_at = now()
     where uid = $1 and doc_id = any($2) and not source_deleted',
    p_table
  ) using p_uid, p_doc_ids;
  get diagnostics n = row_count;
  return n;
end
$$;

-- Server-only: the sync job runs as service_role. No client may call these.
revoke all on function public.readmodel_sync_table_ok(text) from public, anon, authenticated;
revoke all on function public.readmodel_upsert(text, jsonb) from public, anon, authenticated;
revoke all on function public.readmodel_live_ids(text, text, text, integer) from public, anon, authenticated;
revoke all on function public.readmodel_tombstone(text, text, text[]) from public, anon, authenticated;
grant execute on function public.readmodel_sync_table_ok(text) to service_role;
grant execute on function public.readmodel_upsert(text, jsonb) to service_role;
grant execute on function public.readmodel_live_ids(text, text, text, integer) to service_role;
grant execute on function public.readmodel_tombstone(text, text, text[]) to service_role;
