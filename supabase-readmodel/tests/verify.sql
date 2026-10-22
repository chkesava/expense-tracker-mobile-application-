-- SPENDLY-509: live counts for count parity. Service role, rolled back.

begin;
set local role service_role;

do $$
declare
  r record;
begin
  perform public.readmodel_upsert('expenses', jsonb_build_array(
    jsonb_build_object('uid', 'u1', 'doc_id', 'a', 'doc', '{}'::jsonb, 'source_path', 'p',
      'source_update_time', '2026-10-01T00:00:00Z', 'schema_version', 1, 'mapping_status', 'mapped'),
    jsonb_build_object('uid', 'u1', 'doc_id', 'b', 'doc', '{}'::jsonb, 'source_path', 'p',
      'source_update_time', '2026-10-01T00:00:00Z', 'schema_version', 1, 'mapping_status', 'mapped'),
    jsonb_build_object('uid', 'u1', 'doc_id', 'c', 'doc', '{}'::jsonb, 'source_path', 'p',
      'source_update_time', '2026-10-01T00:00:00Z', 'schema_version', 1, 'mapping_status', 'mapped')));
  perform public.readmodel_upsert('ledger_events', jsonb_build_array(
    jsonb_build_object('uid', 'u2', 'doc_id', 'l', 'doc', '{}'::jsonb, 'source_path', 'p',
      'source_update_time', '2026-10-01T00:00:00Z', 'schema_version', 1, 'mapping_status', 'mapped')));
  perform public.readmodel_tombstone('expenses', 'u1', array['c']);

  select * into r from public.readmodel_live_counts() where uid = 'u1' and collection = 'expenses';
  if r.live <> 2 then raise exception 'tombstoned rows must not count: %', r.live; end if;
  select * into r from public.readmodel_live_counts() where uid = 'u2' and collection = 'ledgerEvents';
  if r.live <> 1 then raise exception 'collection names must be the Firestore names'; end if;
  if (select count(*) from public.readmodel_live_counts()) <> 2 then raise exception 'unexpected count rows'; end if;

  insert into public.sync_runs (mode) values ('verify');
end
$$;

reset role;
do $$
begin
  if has_function_privilege('anon', 'public.readmodel_live_counts()', 'execute')
     or has_function_privilege('authenticated', 'public.readmodel_live_counts()', 'execute') then
    raise exception 'a client role can call readmodel_live_counts';
  end if;
end
$$;

rollback;
select 'read-model verify tests passed' as result;
