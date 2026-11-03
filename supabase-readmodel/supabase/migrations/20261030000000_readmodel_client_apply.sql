-- SPENDLY-669 — the app's write path into the read model (plan v2, ADR v2 §2).
--
-- The app writes every save to Firestore (the source of truth) and also to
-- Supabase, only through public.rm_client_apply. It is security definer, so
-- tables stay SELECT-only for clients; every rule is enforced here with the
-- caller's verified claims (readmodel_auth.uid()). The server writers (sync,
-- push, repair) now stamp written_by = 'server' and always replace a client
-- row: Firestore wins every difference.
--
-- Additive and re-runnable.

-- ─── 1. Who wrote each row ──────────────────────────────────────────────────

do $$
declare
  t text;
begin
  foreach t in array array[
    'expenses', 'incomes', 'ledger_events', 'accounts', 'account_types',
    'account_transfers', 'account_entries', 'account_payments',
    'credit_card_bills', 'categories', 'financial_goals', 'goal_events'
  ] loop
    execute format('alter table public.%I add column if not exists written_by text not null default %L', t, 'server');
    execute format('alter table public.%I add column if not exists client_written_at timestamptz', t);
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_written_by_check');
    execute format('alter table public.%I add constraint %I check (written_by in (%L, %L))',
      t, t || '_written_by_check', 'client', 'server');
  end loop;
end
$$;

-- Columns the write functions own, never taken from the incoming rows.
create or replace function public.readmodel_owned_column(p_column text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_column = any (array['synced_at', 'source_deleted', 'deleted_at', 'written_by', 'client_written_at'])
$$;

-- ─── 2. Server writers: stamp 'server', and Firestore replaces client rows ──

-- As in 20261024000000 (purged accounts refused), plus: the new columns are
-- owned, and a client-written row is always replaced by Firestore's version.
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
    and not public.readmodel_owned_column(a.attname);

  execute format(
    'insert into public.%1$I as t (%2$s, synced_at, source_deleted, deleted_at, written_by, client_written_at)
       select %2$s, now(), false, null, ''server'', null
       from jsonb_populate_recordset(null::public.%1$I, $1) r
       where not public.readmodel_is_purged(r.uid)
     on conflict (uid, doc_id) do update
       set %3$s, synced_at = now(), source_deleted = false, deleted_at = null,
           written_by = ''server'', client_written_at = null
       where excluded.source_update_time > t.source_update_time
          or t.source_deleted
          or t.written_by = ''client''',
    p_table, cols, sets
  ) using p_rows;
  get diagnostics n = row_count;
  return n;
end
$$;

-- As in 20261026000000, with the same two changes.
create or replace function public.readmodel_repair(p_table text, p_rows jsonb)
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
    raise exception 'readmodel_repair: unknown table %', p_table;
  end if;
  select string_agg(quote_ident(a.attname), ', ' order by a.attnum),
         string_agg(format('%1$I = excluded.%1$I', a.attname), ', ' order by a.attnum)
    into cols, sets
  from pg_attribute a
  where a.attrelid = format('public.%I', p_table)::regclass
    and a.attnum > 0 and not a.attisdropped
    and not public.readmodel_owned_column(a.attname);
  execute format(
    'insert into public.%1$I as t (%2$s, synced_at, source_deleted, deleted_at, written_by, client_written_at)
       select %2$s, now(), false, null, ''server'', null
       from jsonb_populate_recordset(null::public.%1$I, $1) r
       where not public.readmodel_is_purged(r.uid)
     on conflict (uid, doc_id) do update
       set %3$s, synced_at = now(), source_deleted = false, deleted_at = null,
           written_by = ''server'', client_written_at = null
       where excluded.source_update_time >= t.source_update_time
          or t.written_by = ''client''',
    p_table, cols, sets
  ) using p_rows;
  get diagnostics n = row_count;
  return n;
end
$$;

-- As in 20261023000000; a Firestore delete also replaces a client row.
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
    'update public.%I set source_deleted = true, deleted_at = now(), synced_at = now(),
            written_by = ''server'', client_written_at = null
     where uid = $1 and doc_id = any($2) and (not source_deleted or written_by = ''client'')',
    p_table
  ) using p_uid, p_doc_ids;
  get diagnostics n = row_count;
  return n;
end
$$;

-- ─── 3. The client write allowlist ──────────────────────────────────────────

-- Tables the app may write. A story that syncs a new table adds it here, in
-- its own migration (589–592).
create or replace function public.readmodel_client_table_ok(p_table text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_table = any (array[
    'expenses', 'incomes', 'ledger_events', 'accounts', 'account_types',
    'account_transfers', 'account_entries', 'account_payments',
    'credit_card_bills', 'categories', 'financial_goals', 'goal_events'
  ])
$$;

-- ─── 4. rm_client_apply ─────────────────────────────────────────────────────

-- p_rows:    rows as shared/utils/readModel/mapping.ts builds them, plus
--            client_written_at (the device's save time, ISO 8601).
-- p_deletes: [{uid, <the table's key columns besides uid>, client_written_at}].
-- Returns {"upserted": n, "tombstoned": n}. Any invalid input refuses the
-- whole call; nothing is half applied.
create or replace function public.rm_client_apply(
  p_table text,
  p_rows jsonb default '[]'::jsonb,
  p_deletes jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me text := readmodel_auth.uid();
  max_batch constant integer := 50;
  key_cols text[];
  cols text;
  sets text;
  key_match text;
  n_up integer := 0;
  n_del integer := 0;
begin
  if me is null or public.readmodel_is_purged(me) then
    raise exception 'rm_client_apply: not allowed' using errcode = '42501';
  end if;
  if p_table is null or not public.readmodel_client_table_ok(p_table) then
    raise exception 'rm_client_apply: table not allowed: %', p_table using errcode = '42501';
  end if;
  p_rows := coalesce(p_rows, '[]'::jsonb);
  p_deletes := coalesce(p_deletes, '[]'::jsonb);
  if jsonb_typeof(p_rows) <> 'array' or jsonb_typeof(p_deletes) <> 'array' then
    raise exception 'rm_client_apply: rows and deletes must be arrays' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > max_batch or jsonb_array_length(p_deletes) > max_batch then
    raise exception 'rm_client_apply: at most % rows and % deletes per call', max_batch, max_batch using errcode = '22023';
  end if;

  -- Ownership and shape, before anything is written.
  if exists (select 1 from jsonb_array_elements(p_rows) r where r->>'uid' is distinct from me)
     or exists (select 1 from jsonb_array_elements(p_deletes) d where d->>'uid' is distinct from me) then
    raise exception 'rm_client_apply: rows for another user' using errcode = '42501';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_rows) r
    where jsonb_typeof(r) <> 'object'
       or coalesce(r->>'doc_id', '') = ''
       or jsonb_typeof(r->'doc') is distinct from 'object'
       or left(coalesce(r->>'source_path', ''), length('users/' || me || '/')) <> 'users/' || me || '/'
       or coalesce(r->>'client_written_at', '') = ''
  ) or exists (
    select 1 from jsonb_array_elements(p_deletes) d
    where jsonb_typeof(d) <> 'object' or coalesce(d->>'doc_id', '') = '' or coalesce(d->>'client_written_at', '') = ''
  ) then
    raise exception 'rm_client_apply: bad row shape' using errcode = '22023';
  end if;
  -- A device clock more than a day ahead would lock rows against later
  -- client writes (server writes still win); refuse it.
  if exists (
    select 1 from (
      select (r->>'client_written_at')::timestamptz as at from jsonb_array_elements(p_rows) r
      union all
      select (d->>'client_written_at')::timestamptz from jsonb_array_elements(p_deletes) d
    ) x where x.at > now() + interval '1 day'
  ) then
    raise exception 'rm_client_apply: client_written_at is in the future' using errcode = '22023';
  end if;

  -- The table's key, from the catalog: (uid, doc_id) today; nested tables
  -- (591) add their parent column without changing this function.
  select array_agg(a.attname::text order by array_position(i.indkey::int2[], a.attnum))
    into key_cols
  from pg_index i
  join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
  where i.indrelid = format('public.%I', p_table)::regclass and i.indisprimary;

  select string_agg(quote_ident(a.attname), ', ' order by a.attnum),
         string_agg(format('%1$I = excluded.%1$I', a.attname), ', ' order by a.attnum)
    into cols, sets
  from pg_attribute a
  where a.attrelid = format('public.%I', p_table)::regclass
    and a.attnum > 0 and not a.attisdropped
    and not public.readmodel_owned_column(a.attname)
    and a.attname <> 'source_update_time';

  -- Version guard: a client row lands over no row, an older client write, or
  -- a server row older than it (and not deleted after it). The server writers
  -- don't consult client_written_at, so Firestore's version wins afterwards.
  if jsonb_array_length(p_rows) > 0 then
    execute format(
      'insert into public.%1$I as t (%2$s, source_update_time, synced_at, source_deleted, deleted_at, written_by, client_written_at)
         select %2$s, r.client_written_at, now(), false, null, ''client'', r.client_written_at
         from jsonb_populate_recordset(null::public.%1$I, $1) r
       on conflict (%4$s) do update
         set %3$s, source_update_time = excluded.client_written_at, synced_at = now(),
             source_deleted = false, deleted_at = null, written_by = ''client'',
             client_written_at = excluded.client_written_at
         where ((t.written_by = ''client'' and t.client_written_at < excluded.client_written_at)
                or (t.written_by = ''server'' and t.source_update_time < excluded.client_written_at))
           and (not t.source_deleted or t.deleted_at < excluded.client_written_at)',
      p_table, cols, sets, (select string_agg(quote_ident(k), ', ') from unnest(key_cols) k)
    ) using p_rows;
    get diagnostics n_up = row_count;
  end if;

  if jsonb_array_length(p_deletes) > 0 then
    select string_agg(format('t.%1$I = d->>%2$L', k, k), ' and ')
      into key_match
    from unnest(key_cols) k
    where k <> 'uid';
    execute format(
      'update public.%1$I t
          set source_deleted = true, deleted_at = now(), synced_at = now(),
              written_by = ''client'', client_written_at = (d->>''client_written_at'')::timestamptz
         from jsonb_array_elements($1) d
        where t.uid = $2 and %2$s
          and not t.source_deleted
          and coalesce(t.client_written_at, t.source_update_time) < (d->>''client_written_at'')::timestamptz',
      p_table, key_match
    ) using p_deletes, me;
    get diagnostics n_del = row_count;
  end if;

  return jsonb_build_object('upserted', n_up, 'tombstoned', n_del);
end
$$;

-- ─── 5. Grants ──────────────────────────────────────────────────────────────

revoke all on function public.readmodel_owned_column(text) from public, anon, authenticated;
revoke all on function public.readmodel_client_table_ok(text) from public, anon, authenticated;
revoke all on function public.readmodel_upsert(text, jsonb) from public, anon, authenticated;
revoke all on function public.readmodel_repair(text, jsonb) from public, anon, authenticated;
revoke all on function public.readmodel_tombstone(text, text, text[]) from public, anon, authenticated;
revoke all on function public.rm_client_apply(text, jsonb, jsonb) from public, anon;
grant execute on function public.readmodel_owned_column(text) to service_role;
grant execute on function public.readmodel_client_table_ok(text) to service_role;
grant execute on function public.readmodel_upsert(text, jsonb) to service_role;
grant execute on function public.readmodel_repair(text, jsonb) to service_role;
grant execute on function public.readmodel_tombstone(text, text, text[]) to service_role;
grant execute on function public.rm_client_apply(text, jsonb, jsonb) to authenticated;
