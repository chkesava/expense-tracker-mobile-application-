-- SPENDLY-504 acceptance checks. Run after the migrations; any failure raises,
-- so `psql -v ON_ERROR_STOP=1` exits non-zero.

-- 1. Every expected table exists.
do $$
declare
  missing text;
begin
  select string_agg(t, ', ') into missing
  from unnest(array[
    'expenses', 'incomes', 'ledger_events', 'accounts', 'account_types',
    'account_transfers', 'account_entries', 'account_payments',
    'credit_card_bills', 'categories',
    'sync_runs', 'sync_status', 'sync_checkpoints', 'sync_failures'
  ]) as t
  where not exists (select 1 from pg_tables where schemaname = 'public' and tablename = t);
  if missing is not null then
    raise exception 'missing read-model tables: %', missing;
  end if;
end
$$;

-- 2. RLS is enabled on every public table.
do $$
declare
  open_tables text;
begin
  select string_agg(tablename, ', ') into open_tables
  from pg_tables
  where schemaname = 'public' and not rowsecurity;
  if open_tables is not null then
    raise exception 'tables without row level security: %', open_tables;
  end if;
end
$$;

-- 3. anon holds no table privileges in public; authenticated holds SELECT
--    only, and only on the user-data tables plus sync_status (SPENDLY-505).
do $$
declare
  grants text;
begin
  select string_agg(format('%s:%s:%s', grantee, table_name, privilege_type), ', ') into grants
  from information_schema.role_table_grants
  where table_schema = 'public'
    and (
      grantee = 'anon'
      or (grantee = 'authenticated' and (
        privilege_type <> 'SELECT'
        or table_name not in (
          'expenses', 'incomes', 'ledger_events', 'accounts', 'account_types',
          'account_transfers', 'account_entries', 'account_payments',
          'credit_card_bills', 'categories', 'sync_status'
        )
      ))
    );
  if grants is not null then
    raise exception 'client roles hold unexpected grants: %', grants;
  end if;
end
$$;

-- 4. Exactly one owner-read policy per readable table: SELECT, for
--    authenticated, keyed on readmodel_auth.uid(). No write policies at all.
do $$
declare
  bad text;
  n integer;
begin
  select string_agg(format('%s.%s', tablename, policyname), ', ') into bad
  from pg_policies
  where schemaname = 'public'
    and (cmd <> 'SELECT' or roles <> array['authenticated']::name[]
         or qual not like '%readmodel_auth.uid()%');
  if bad is not null then
    raise exception 'unexpected policies: %', bad;
  end if;
  select count(*) into n from pg_policies where schemaname = 'public';
  if n <> 11 then
    raise exception 'expected 11 owner-read policies, found %', n;
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename in ('sync_runs', 'sync_checkpoints', 'sync_failures')
  ) then
    raise exception 'sync bookkeeping must stay server-only';
  end if;
end
$$;

-- 4b. The identity helper is not callable by anon or by PUBLIC.
do $$
begin
  if has_function_privilege('anon', 'readmodel_auth.uid()', 'execute') then
    raise exception 'anon can execute readmodel_auth.uid()';
  end if;
  if not has_function_privilege('authenticated', 'readmodel_auth.uid()', 'execute') then
    raise exception 'authenticated cannot execute readmodel_auth.uid()';
  end if;
end
$$;

-- 5. A table created after the migration is not granted to client roles.
create table public._grant_probe (id int);
do $$
begin
  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public' and table_name = '_grant_probe'
      and grantee in ('anon', 'authenticated')
  ) then
    raise exception 'default privileges still grant new tables to client roles';
  end if;
end
$$;
drop table public._grant_probe;

-- 6. Every user-data table carries the sync contract columns and key.
do $$
declare
  bad text;
begin
  select string_agg(t, ', ') into bad
  from unnest(array[
    'expenses', 'incomes', 'ledger_events', 'accounts', 'account_types',
    'account_transfers', 'account_entries', 'account_payments',
    'credit_card_bills', 'categories'
  ]) as t
  where (
    select count(*) from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = t
      and c.column_name in ('uid', 'doc_id', 'doc', 'source_path', 'source_update_time',
                            'source_deleted', 'deleted_at', 'schema_version',
                            'mapping_status', 'synced_at')
  ) <> 10
  or not exists (
    select 1 from information_schema.table_constraints tc
    join information_schema.key_column_usage k
      on k.constraint_name = tc.constraint_name and k.table_schema = tc.table_schema
    where tc.table_schema = 'public' and tc.table_name = t and tc.constraint_type = 'PRIMARY KEY'
    group by tc.constraint_name
    having array_agg(k.column_name::text order by k.ordinal_position) = array['uid', 'doc_id']
  );
  if bad is not null then
    raise exception 'tables missing the sync contract: %', bad;
  end if;
end
$$;

-- 7. Money columns are exact numerics, never floating point.
do $$
declare
  floats text;
begin
  select string_agg(format('%s.%s', table_name, column_name), ', ') into floats
  from information_schema.columns
  where table_schema = 'public' and data_type in ('real', 'double precision');
  if floats is not null then
    raise exception 'floating point columns found: %', floats;
  end if;
end
$$;

select 'read-model security assertions passed' as result;
