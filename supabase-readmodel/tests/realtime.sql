-- SPENDLY-593 behaviour tests: the realtime ping, readmodel_changes_since and
-- the private-topic policy. Run after bootstrap_roles.sql (which stands in for
-- Supabase's realtime schema: sent messages land in realtime.messages) and the
-- migrations. One transaction, rolled back. Any failed expectation raises.

begin;

create schema rt_test;
grant usage on schema rt_test to authenticated, anon, service_role;

create function rt_test.claims(overrides jsonb default '{}') returns text
language sql as $$
  select (jsonb_build_object(
    'iss', 'https://securetoken.google.com/expenseapp-27f94',
    'aud', 'expenseapp-27f94',
    'sub', 'user-a',
    'role', 'authenticated',
    'exp', extract(epoch from now())::bigint + 3600
  ) || overrides)::text
$$;

create function rt_test.row(p_uid text, p_id text, p_amount numeric, p_at timestamptz) returns jsonb
language sql as $$
  select jsonb_build_object(
    'uid', p_uid, 'doc_id', p_id, 'amount', p_amount, 'date', '2026-11-04', 'month', '2026-11',
    'doc', jsonb_build_object('amount', p_amount), 'source_path', 'users/' || p_uid || '/expenses/' || p_id,
    'source_update_time', p_at, 'schema_version', 1, 'mapping_status', 'mapped')
$$;

-- The pings sent since `p_after` (message id), oldest first.
create function rt_test.pings(p_after bigint) returns setof realtime.messages
language sql security definer as $$
  select * from realtime.messages where id > p_after order by id
$$;
grant execute on all functions in schema rt_test to authenticated, anon, service_role;

-- ─── 1. Server writes ping the owner's topic, once per statement ────────────
set local role service_role;
do $$
declare
  mark bigint := coalesce((select max(id) from rt_test.pings(0)), 0);
  m record;
  n integer;
begin
  -- One batch: two rows for A, one for B → one ping per user, not per row.
  perform public.readmodel_upsert('expenses', jsonb_build_array(
    rt_test.row('user-a', 'e1', 10, now() - interval '1 hour'),
    rt_test.row('user-a', 'e2', 20, now() - interval '1 hour'),
    rt_test.row('user-b', 'b1', 30, now() - interval '1 hour')));
  select count(*) into n from rt_test.pings(mark);
  if n <> 2 then raise exception 'expected 2 pings (one per user), got %', n; end if;
  select * into m from rt_test.pings(mark) where topic = 'user:user-a';
  if m.event <> 'changed' or not m.private or m.extension <> 'broadcast'
     or m.payload->>'table' <> 'expenses'
     or m.payload->'changes' <> '[{"doc_id": "e1", "deleted": false}, {"doc_id": "e2", "deleted": false}]'::jsonb
     or m.payload->>'synced_at' is null then
    raise exception 'A''s ping is wrong: %', row_to_json(m);
  end if;
  -- No document data in a ping, ever.
  if m.payload ? 'doc' or m.payload::text like '%amount%' then raise exception 'a ping carried document data: %', m.payload; end if;

  -- The same version again changes nothing, so nothing is sent.
  mark := (select max(id) from rt_test.pings(0));
  perform public.readmodel_upsert('expenses', jsonb_build_array(rt_test.row('user-a', 'e1', 10, now() - interval '1 hour')));
  if exists (select 1 from rt_test.pings(mark)) then raise exception 'an unchanged row sent a ping'; end if;

  -- A tombstone pings with deleted = true.
  perform public.readmodel_tombstone('expenses', 'user-a', array['e2']);
  select * into m from rt_test.pings(mark);
  if m.topic <> 'user:user-a' or m.payload->'changes' <> '[{"doc_id": "e2", "deleted": true}]'::jsonb then
    raise exception 'tombstone ping wrong: %', row_to_json(m);
  end if;

  -- Over 100 rows for one user: one `resync` ping instead of a list.
  mark := (select max(id) from rt_test.pings(0));
  perform public.readmodel_upsert('expenses',
    (select jsonb_agg(rt_test.row('user-a', 'bulk' || g, g, now() - interval '1 hour')) from generate_series(1, 101) g));
  select count(*) into n from rt_test.pings(mark);
  select * into m from rt_test.pings(mark);
  if n <> 1 or (m.payload->>'resync')::boolean is not true or m.payload ? 'changes' then
    raise exception 'a 101-row batch should be one resync ping: % (%)', n, row_to_json(m);
  end if;
end
$$;
reset role;

-- ─── 2. App writes (rm_client_apply) ping too ───────────────────────────────
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', rt_test.claims(), true); end $$;
do $$
declare
  mark bigint := (select max(id) from rt_test.pings(0));
  m record;
begin
  perform public.rm_client_apply('expenses', jsonb_build_array(
    rt_test.row('user-a', 'c1', 5, now()) - 'source_update_time' || jsonb_build_object('client_written_at', now())));
  select * into m from rt_test.pings(mark);
  if m.topic <> 'user:user-a' or m.payload->'changes' <> '[{"doc_id": "c1", "deleted": false}]'::jsonb then
    raise exception 'client write ping wrong: %', row_to_json(m);
  end if;
end
$$;

-- ─── 3. readmodel_changes_since: own changes only, tombstones included ──────
do $$
declare
  n integer;
begin
  if not exists (select 1 from public.readmodel_changes_since(now() - interval '1 day') where table_name = 'expenses' and doc_id = 'e2' and deleted) then
    raise exception 'changes_since must include own tombstones (RLS hides them from plain reads)';
  end if;
  if exists (select 1 from public.readmodel_changes_since(now() - interval '1 day') where doc_id = 'b1') then
    raise exception 'changes_since returned another user''s change';
  end if;
  select count(*) into n from public.readmodel_changes_since(now() - interval '1 day', 5);
  if n <> 5 then raise exception 'the limit was not applied: %', n; end if;
  -- Ordered by time, so a client can resume from the last one it saw.
  if exists (
    select 1 from (select synced_at, lag(synced_at) over () as prev from public.readmodel_changes_since(now() - interval '1 day', 1000)) s
    where s.prev > s.synced_at
  ) then raise exception 'changes_since is not ordered by synced_at'; end if;
  if exists (select 1 from public.readmodel_changes_since(now() + interval '1 minute')) then
    raise exception 'changes after "now" should be empty';
  end if;
end
$$;

-- A duress token, an expired one, and anon get nothing.
do $$
declare
  state text;
begin
  perform set_config('request.jwt.claims', rt_test.claims('{"sub": "user-a_duress"}'), true);
  begin
    perform public.readmodel_changes_since(now() - interval '1 day');
    raise exception 'duress token was allowed';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claims', rt_test.claims(jsonb_build_object('exp', extract(epoch from now())::bigint - 1)), true);
  begin
    perform public.readmodel_changes_since(now() - interval '1 day');
    raise exception 'expired token was allowed';
  exception when insufficient_privilege then null;
  end;
end
$$;
reset role;
do $$
begin
  if has_function_privilege('anon', 'public.readmodel_changes_since(timestamptz, integer)', 'execute') then
    raise exception 'anon can execute readmodel_changes_since';
  end if;
  if has_function_privilege('authenticated', 'public.readmodel_ping()', 'execute') then
    raise exception 'authenticated can execute the ping trigger function';
  end if;
end
$$;

-- ─── 4. Only the owner may join a topic (realtime.messages policy) ──────────
set local role authenticated;
do $$
begin
  perform set_config('request.jwt.claims', rt_test.claims(), true);
  perform set_config('realtime.topic', 'user:user-a', true);
  if not exists (select 1 from realtime.messages) then raise exception 'A cannot read its own topic'; end if;
  perform set_config('realtime.topic', 'user:user-b', true);
  if exists (select 1 from realtime.messages) then raise exception 'A can read B''s topic'; end if;
  perform set_config('request.jwt.claims', rt_test.claims('{"sub": "user-a_duress"}'), true);
  perform set_config('realtime.topic', 'user:user-a_duress', true);
  if exists (select 1 from realtime.messages) then raise exception 'a duress token joined a topic'; end if;
end
$$;
reset role;

rollback;

select 'read-model realtime tests passed' as result;
