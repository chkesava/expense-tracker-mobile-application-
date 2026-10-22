-- SPENDLY-506: behaviour of the sync write functions. Runs as service_role,
-- like the job, in one transaction that is rolled back.

begin;
set local role service_role;

-- ─── Insert, replay, older version, newer version ───────────────────────────
do $$
declare
  n integer;
  r record;
begin
  n := public.readmodel_upsert('expenses', jsonb_build_array(jsonb_build_object(
    'uid', 'u1', 'doc_id', 'e1', 'amount', 120.5, 'date', '2026-10-01', 'month', '2026-10',
    'doc', '{"amount":120.5}'::jsonb, 'source_path', 'users/u1/expenses/e1',
    'source_update_time', '2026-10-01T10:00:00Z', 'schema_version', 1, 'mapping_status', 'mapped')));
  if n <> 1 then raise exception 'insert affected % rows', n; end if;

  -- Replay of the same version: no-op.
  n := public.readmodel_upsert('expenses', jsonb_build_array(jsonb_build_object(
    'uid', 'u1', 'doc_id', 'e1', 'amount', 999, 'doc', '{}'::jsonb, 'source_path', 'users/u1/expenses/e1',
    'source_update_time', '2026-10-01T10:00:00Z', 'schema_version', 1, 'mapping_status', 'mapped')));
  if n <> 0 then raise exception 'replay of the same version changed % rows', n; end if;

  -- An older version arriving late: no-op.
  n := public.readmodel_upsert('expenses', jsonb_build_array(jsonb_build_object(
    'uid', 'u1', 'doc_id', 'e1', 'amount', 1, 'doc', '{}'::jsonb, 'source_path', 'users/u1/expenses/e1',
    'source_update_time', '2026-09-01T10:00:00Z', 'schema_version', 1, 'mapping_status', 'mapped')));
  if n <> 0 then raise exception 'an older version overwrote a newer one'; end if;
  select * into r from public.expenses where uid = 'u1' and doc_id = 'e1';
  if r.amount <> 120.50 then raise exception 'amount changed to %', r.amount; end if;

  -- A newer version wins.
  n := public.readmodel_upsert('expenses', jsonb_build_array(jsonb_build_object(
    'uid', 'u1', 'doc_id', 'e1', 'amount', 130, 'date', '2026-10-02', 'month', '2026-10',
    'doc', '{"amount":130}'::jsonb, 'source_path', 'users/u1/expenses/e1',
    'source_update_time', '2026-10-02T10:00:00Z', 'schema_version', 1, 'mapping_status', 'mapped')));
  select * into r from public.expenses where uid = 'u1' and doc_id = 'e1';
  if n <> 1 or r.amount <> 130 or r.date <> '2026-10-02' then
    raise exception 'newer version not applied (n=%, amount=%)', n, r.amount;
  end if;
  if r.synced_at is null or r.source_deleted then raise exception 'bookkeeping columns wrong'; end if;
end
$$;

-- ─── Exact money ─────────────────────────────────────────────────────────────
do $$
begin
  perform public.readmodel_upsert('account_entries', jsonb_build_array(jsonb_build_object(
    'uid', 'u1', 'doc_id', 'n1', 'amount', 0.1 + 0.2, 'doc', '{}'::jsonb, 'source_path', 'p',
    'source_update_time', '2026-10-01T00:00:00Z', 'schema_version', 1, 'mapping_status', 'mapped')));
  if (select amount from public.account_entries where doc_id = 'n1') <> 0.30 then
    raise exception 'money not stored as exact numeric(18,2)';
  end if;
end
$$;

-- ─── Live ids, tombstone, resurrection ───────────────────────────────────────
do $$
declare
  n integer;
begin
  perform public.readmodel_upsert('categories', jsonb_build_array(
    jsonb_build_object('uid', 'u1', 'doc_id', 'c1', 'name', 'Food', 'doc', '{}'::jsonb, 'source_path', 'p1',
      'source_update_time', '2026-10-01T00:00:00Z', 'schema_version', 1, 'mapping_status', 'mapped'),
    jsonb_build_object('uid', 'u1', 'doc_id', 'c2', 'name', 'Fuel', 'doc', '{}'::jsonb, 'source_path', 'p2',
      'source_update_time', '2026-10-01T00:00:00Z', 'schema_version', 1, 'mapping_status', 'mapped'),
    jsonb_build_object('uid', 'u2', 'doc_id', 'c1', 'name', 'Other user', 'doc', '{}'::jsonb, 'source_path', 'p3',
      'source_update_time', '2026-10-01T00:00:00Z', 'schema_version', 1, 'mapping_status', 'mapped')));

  if (select array_agg(x order by x) from public.readmodel_live_ids('categories', 'u1') x) <> array['c1', 'c2'] then
    raise exception 'live ids wrong';
  end if;

  n := public.readmodel_tombstone('categories', 'u1', array['c2']);
  if n <> 1 then raise exception 'tombstone affected % rows', n; end if;
  if not (select source_deleted and deleted_at is not null from public.categories where uid = 'u1' and doc_id = 'c2') then
    raise exception 'c2 not tombstoned';
  end if;
  if (select source_deleted from public.categories where uid = 'u2' and doc_id = 'c1') then
    raise exception 'tombstone crossed users';
  end if;
  if (select count(*) from public.categories) <> 3 then raise exception 'tombstone removed rows'; end if;
  if (select array_agg(x) from public.readmodel_live_ids('categories', 'u1') x) <> array['c1'] then
    raise exception 'tombstoned row still live';
  end if;

  -- Tombstoning again is a no-op.
  if public.readmodel_tombstone('categories', 'u1', array['c2']) <> 0 then raise exception 'double tombstone'; end if;

  -- The document is seen alive again (even at the same version): un-tombstoned.
  n := public.readmodel_upsert('categories', jsonb_build_array(jsonb_build_object(
    'uid', 'u1', 'doc_id', 'c2', 'name', 'Fuel', 'doc', '{}'::jsonb, 'source_path', 'p2',
    'source_update_time', '2026-10-01T00:00:00Z', 'schema_version', 1, 'mapping_status', 'mapped')));
  if n <> 1 or (select source_deleted or deleted_at is not null from public.categories where uid = 'u1' and doc_id = 'c2') then
    raise exception 'row seen again was not un-tombstoned';
  end if;
end
$$;

-- ─── Live ids page by doc_id, so a capped response is never mistaken for deletes
do $$
begin
  perform public.readmodel_upsert('account_types', (
    select jsonb_agg(jsonb_build_object('uid', 'u9', 'doc_id', format('t%s', lpad(i::text, 4, '0')), 'doc', '{}'::jsonb,
      'source_path', 'p', 'source_update_time', '2026-10-01T00:00:00Z', 'schema_version', 1, 'mapping_status', 'mapped'))
    from generate_series(1, 1500) i));
  if (select count(*) from public.readmodel_live_ids('account_types', 'u9')) <> 1000 then
    raise exception 'first page should be capped at 1000';
  end if;
  if (select count(*) from public.readmodel_live_ids('account_types', 'u9', 't1000')) <> 500 then
    raise exception 'second page should hold the remaining 500';
  end if;
  if (select min(x) from public.readmodel_live_ids('account_types', 'u9', 't1000') x) <> 't1001' then
    raise exception 'keyset paging out of order';
  end if;
  insert into public.sync_runs (mode) values ('incremental'), ('full');
end
$$;

-- ─── Unknown tables are refused (no dynamic SQL on arbitrary names) ─────────
do $$
begin
  begin
    perform public.readmodel_upsert('sync_runs', '[]'::jsonb);
    raise exception 'upsert accepted sync_runs';
  exception when raise_exception then
    if sqlerrm not like 'readmodel_upsert: unknown table%' then raise; end if;
  end;
  begin
    perform public.readmodel_tombstone('expenses; drop table public.expenses', 'u1', array['x']);
    raise exception 'tombstone accepted an injected name';
  exception when raise_exception then
    if sqlerrm not like 'readmodel_tombstone: unknown table%' then raise; end if;
  end;
end
$$;

reset role;

-- ─── Clients cannot call any of it ───────────────────────────────────────────
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.readmodel_upsert(text, jsonb)', 'public.readmodel_live_ids(text, text, text, integer)',
    'public.readmodel_tombstone(text, text, text[])', 'public.readmodel_sync_table_ok(text)'
  ] loop
    if has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute') then
      raise exception '% is executable by a client role', f;
    end if;
  end loop;
end
$$;

rollback;

select 'read-model sync function tests passed' as result;
