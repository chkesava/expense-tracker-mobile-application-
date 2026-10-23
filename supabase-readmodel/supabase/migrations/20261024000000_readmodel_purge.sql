-- SPENDLY-508: erase a deleted account from the read model, and keep it
-- erased.
--
-- Account deletion (netlify/functions/delete-account.ts, phase `readmodel`,
-- before the Auth user is deleted) calls readmodel_purge_user(uid). It
-- hard-deletes every read-model row and all sync bookkeeping for the uid and
-- its `_duress` twin. Tombstones are not enough: they keep the data.
--
-- purged_users remembers the account by a sha256 hash only (never the uid).
-- After a purge the database itself refuses anything for that uid: the sync
-- upsert skips its rows, and sync_status / sync_checkpoints / sync_failures
-- drop its rows. So a sync run that read the account just before it was
-- deleted cannot bring it back.

create table if not exists public.purged_users (
  uid_hash   text        primary key,  -- encode(sha256(uid), 'hex')
  purged_at  timestamptz not null default now()
);
alter table public.purged_users enable row level security;
revoke all on table public.purged_users from anon, authenticated;

create or replace function public.readmodel_uid_hash(p_uid text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(p_uid, 'UTF8')), 'hex')
$$;

create or replace function public.readmodel_is_purged(p_uid text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.purged_users where uid_hash = public.readmodel_uid_hash(p_uid))
$$;

-- ─── The purge ──────────────────────────────────────────────────────────────

create or replace function public.readmodel_purge_user(p_uid text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  t text;
  n integer;
  total integer := 0;
  counts jsonb := '{}'::jsonb;
  uids text[];
begin
  if coalesce(p_uid, '') = '' or right(p_uid, 7) = '_duress' then
    raise exception 'readmodel_purge_user: an account uid is required (not empty, not a duress uid)';
  end if;
  uids := array[p_uid, p_uid || '_duress'];

  foreach t in array array[
    'expenses', 'incomes', 'ledger_events', 'accounts', 'account_types',
    'account_transfers', 'account_entries', 'account_payments',
    'credit_card_bills', 'categories',
    'sync_status', 'sync_checkpoints', 'sync_failures'
  ] loop
    execute format('delete from public.%I where uid = any($1)', t) using uids;
    get diagnostics n = row_count;
    counts := counts || jsonb_build_object(t, n);
    total := total + n;
  end loop;

  insert into public.purged_users (uid_hash) values (public.readmodel_uid_hash(p_uid))
  on conflict (uid_hash) do nothing;
  insert into public.purged_users (uid_hash) values (public.readmodel_uid_hash(p_uid || '_duress'))
  on conflict (uid_hash) do nothing;

  return jsonb_build_object('rows', total, 'tables', counts);
end
$$;

-- ─── Guards: nothing comes back for a purged account ────────────────────────

-- The sync upsert, as in 20261023000000, minus rows for purged uids.
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
       from jsonb_populate_recordset(null::public.%1$I, $1) r
       where not public.readmodel_is_purged(r.uid)
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

create or replace function public.readmodel_skip_purged()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.readmodel_is_purged(new.uid) then
    return null;  -- silently drop: the account no longer exists
  end if;
  return new;
end
$$;

drop trigger if exists skip_purged on public.sync_status;
create trigger skip_purged before insert or update on public.sync_status
  for each row execute function public.readmodel_skip_purged();
drop trigger if exists skip_purged on public.sync_checkpoints;
create trigger skip_purged before insert or update on public.sync_checkpoints
  for each row execute function public.readmodel_skip_purged();
drop trigger if exists skip_purged on public.sync_failures;
create trigger skip_purged before insert or update on public.sync_failures
  for each row execute function public.readmodel_skip_purged();

-- ─── Server-only ────────────────────────────────────────────────────────────

revoke all on function public.readmodel_uid_hash(text) from public, anon, authenticated;
revoke all on function public.readmodel_is_purged(text) from public, anon, authenticated;
revoke all on function public.readmodel_purge_user(text) from public, anon, authenticated;
revoke all on function public.readmodel_skip_purged() from public, anon, authenticated;
grant execute on function public.readmodel_uid_hash(text) to service_role;
grant execute on function public.readmodel_is_purged(text) to service_role;
grant execute on function public.readmodel_purge_user(text) to service_role;
