-- SPENDLY-508: account purge. Runs as service_role, like the deletion
-- function and the sync job, in one transaction that is rolled back.

begin;
set local role service_role;

-- ─── Seed: user A (+ duress twin) everywhere, user B in one table ───────────
do $$
declare
  t text;
begin
  foreach t in array array[
    'expenses', 'incomes', 'ledger_events', 'accounts', 'account_types',
    'account_transfers', 'account_entries', 'account_payments',
    'credit_card_bills', 'categories'
  ] loop
    perform public.readmodel_upsert(t, jsonb_build_array(
      jsonb_build_object('uid', 'user-a', 'doc_id', 'd1', 'doc', '{}'::jsonb, 'source_path', 'p',
        'source_update_time', '2026-10-01T00:00:00Z', 'schema_version', 1, 'mapping_status', 'mapped'),
      jsonb_build_object('uid', 'user-a_duress', 'doc_id', 'd1', 'doc', '{}'::jsonb, 'source_path', 'p',
        'source_update_time', '2026-10-01T00:00:00Z', 'schema_version', 1, 'mapping_status', 'mapped'),
      jsonb_build_object('uid', 'user-b', 'doc_id', 'd1', 'doc', '{}'::jsonb, 'source_path', 'p',
        'source_update_time', '2026-10-01T00:00:00Z', 'schema_version', 1, 'mapping_status', 'mapped')));
  end loop;
  insert into public.sync_status (uid, collection) values ('user-a', 'expenses'), ('user-b', 'expenses');
  insert into public.sync_checkpoints (uid, collection) values ('user-a', 'expenses');
  insert into public.sync_failures (uid, collection, doc_id, error_class) values ('user-a', 'expenses', 'd1', 'mapping');
end
$$;

-- ─── Purge: every row for A and its duress twin, nothing of B's ─────────────
do $$
declare
  result jsonb;
  t text;
  left_over integer;
begin
  result := public.readmodel_purge_user('user-a');
  -- 10 tables × 2 uids + status + checkpoint + failure
  if (result ->> 'rows')::int <> 23 then raise exception 'purge removed % rows, expected 23', result ->> 'rows'; end if;

  foreach t in array array[
    'expenses', 'incomes', 'ledger_events', 'accounts', 'account_types',
    'account_transfers', 'account_entries', 'account_payments',
    'credit_card_bills', 'categories', 'sync_status', 'sync_checkpoints', 'sync_failures'
  ] loop
    execute format('select count(*) from public.%I where uid in (''user-a'', ''user-a_duress'')', t) into left_over;
    if left_over <> 0 then raise exception '% still holds % row(s) for the purged account', t, left_over; end if;
  end loop;

  if (select count(*) from public.expenses where uid = 'user-b') <> 1
     or (select count(*) from public.sync_status where uid = 'user-b') <> 1 then
    raise exception 'the purge touched another account';
  end if;

  -- Remembered by hash only.
  if exists (select 1 from public.purged_users where uid_hash like '%user-a%') then
    raise exception 'purged_users stores a raw uid';
  end if;
  if (select count(*) from public.purged_users) <> 2 then raise exception 'purged_users should hold the uid and duress hashes'; end if;

  -- Idempotent: a second call succeeds with zero counts.
  result := public.readmodel_purge_user('user-a');
  if (result ->> 'rows')::int <> 0 then raise exception 'second purge removed % rows', result ->> 'rows'; end if;
end
$$;

-- ─── A late sync after the purge cannot bring anything back ─────────────────
do $$
declare
  n integer;
begin
  n := public.readmodel_upsert('expenses', jsonb_build_array(
    jsonb_build_object('uid', 'user-a', 'doc_id', 'late', 'doc', '{}'::jsonb, 'source_path', 'p',
      'source_update_time', '2026-10-02T00:00:00Z', 'schema_version', 1, 'mapping_status', 'mapped'),
    jsonb_build_object('uid', 'user-b', 'doc_id', 'new', 'doc', '{}'::jsonb, 'source_path', 'p',
      'source_update_time', '2026-10-02T00:00:00Z', 'schema_version', 1, 'mapping_status', 'mapped')));
  if n <> 1 then raise exception 'late upsert wrote % rows, expected only user-b''s', n; end if;
  if exists (select 1 from public.expenses where uid = 'user-a') then raise exception 'purged account resurrected'; end if;

  insert into public.sync_status (uid, collection) values ('user-a', 'incomes');
  insert into public.sync_checkpoints (uid, collection) values ('user-a', 'incomes');
  insert into public.sync_failures (uid, collection, doc_id, error_class) values ('user-a_duress', 'incomes', '*', 'pair_failed');
  if exists (select 1 from public.sync_status where uid = 'user-a')
     or exists (select 1 from public.sync_checkpoints where uid = 'user-a')
     or exists (select 1 from public.sync_failures where uid = 'user-a_duress') then
    raise exception 'bookkeeping recreated for a purged account';
  end if;
  -- Other accounts' bookkeeping still works.
  insert into public.sync_status (uid, collection) values ('user-b', 'incomes');
  if not exists (select 1 from public.sync_status where uid = 'user-b' and collection = 'incomes') then
    raise exception 'the guard blocked a live account';
  end if;
end
$$;

-- ─── Refuses nonsense ────────────────────────────────────────────────────────
do $$
begin
  begin
    perform public.readmodel_purge_user('');
    raise exception 'purged an empty uid';
  exception when raise_exception then
    if sqlerrm not like 'readmodel_purge_user:%' then raise; end if;
  end;
  begin
    perform public.readmodel_purge_user('user-b_duress');
    raise exception 'purged by duress uid';
  exception when raise_exception then
    if sqlerrm not like 'readmodel_purge_user:%' then raise; end if;
  end;
end
$$;

reset role;

-- ─── Clients cannot purge, or read who was purged ────────────────────────────
do $$
begin
  if has_function_privilege('anon', 'public.readmodel_purge_user(text)', 'execute')
     or has_function_privilege('authenticated', 'public.readmodel_purge_user(text)', 'execute') then
    raise exception 'a client role can purge';
  end if;
  if has_table_privilege('authenticated', 'public.purged_users', 'select')
     or has_table_privilege('anon', 'public.purged_users', 'select') then
    raise exception 'a client role can read purged_users';
  end if;
end
$$;

rollback;

select 'read-model purge tests passed' as result;
