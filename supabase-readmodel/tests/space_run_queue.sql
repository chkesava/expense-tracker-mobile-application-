-- SPENDLY-791 behaviour tests for the Spaces run queue: an app save to a Space,
-- or to an expense that is (or was) in a Space, queues its owner for
-- space-daily and (once a minute, when a token is stored) asks GitHub to run
-- space-daily in queue mode. Other expenses don't queue. Run after
-- bootstrap_roles.sql (which stands in for pg_net and Vault) and the
-- migrations. One transaction, rolled back. Any failed expectation raises.

begin;

create schema srq_test;
grant usage on schema srq_test to authenticated, anon, service_role;

create function srq_test.claims(p_sub text) returns text
language sql as $$
  select jsonb_build_object(
    'iss', 'https://securetoken.google.com/expenseapp-27f94',
    'aud', 'expenseapp-27f94',
    'sub', p_sub,
    'role', 'authenticated',
    'exp', extract(epoch from now())::bigint + 3600
  )::text
$$;

create function srq_test.expense(p_uid text, p_id text, p_space text) returns jsonb
language sql as $$
  select jsonb_build_object(
    'uid', p_uid, 'doc_id', p_id, 'amount', 500, 'date', '2026-08-12', 'month', '2026-08',
    'category', 'Medical',
    'doc', jsonb_strip_nulls(jsonb_build_object('amount', 500, 'date', '2026-08-12', 'category', 'Medical', 'spaceId', p_space)),
    'source_path', 'users/' || p_uid || '/expenses/' || p_id,
    'schema_version', 1, 'mapping_status', 'mapped', 'client_written_at', clock_timestamp())
$$;

create function srq_test.space(p_uid text, p_id text, p_name text) returns jsonb
language sql as $$
  select jsonb_build_object(
    'uid', p_uid, 'doc_id', p_id, 'name', p_name, 'status', 'ACTIVE',
    'doc', jsonb_build_object('name', p_name, 'status', 'ACTIVE'),
    'source_path', 'users/' || p_uid || '/spaces/' || p_id,
    'schema_version', 1, 'mapping_status', 'mapped', 'client_written_at', clock_timestamp())
$$;

-- Read back as the test's superuser (the queue is server-only).
create function srq_test.queued(p_uid text, p_job text) returns timestamptz
language sql security definer as $$
  select requested_at from public.server_run_queue where uid = p_uid and job = p_job
$$;
create function srq_test.clear() returns void
language sql security definer as $$ delete from public.server_run_queue where job = 'space-daily' $$;
create function srq_test.requests(p_like text) returns integer
language sql security definer as $$ select count(*)::int from net._requests where url like p_like $$;
create function srq_test.last_request() returns jsonb
language sql security definer as $$ select to_jsonb(r) from net._requests r order by r.id desc limit 1 $$;
grant execute on all functions in schema srq_test to authenticated, anon, service_role;

-- ─── 1. Server writes never queue (the sync, the push) ─────────────────────
set local role service_role;
do $$
begin
  perform public.readmodel_upsert('expenses', jsonb_build_array(jsonb_build_object(
    'uid', 'user-a', 'doc_id', 'srv1', 'amount', 10, 'date', '2026-08-01', 'month', '2026-08',
    'doc', '{"amount":10,"spaceId":"s1"}'::jsonb,
    'source_path', 'users/user-a/expenses/srv1', 'source_update_time', now(),
    'schema_version', 1, 'mapping_status', 'mapped')));
  if srq_test.queued('user-a', 'space-daily') is not null then raise exception 'a server write queued its owner'; end if;
end
$$;
reset role;

-- ─── 2. An expense outside any Space doesn't queue ──────────────────────────
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', srq_test.claims('user-a'), true); end $$;
do $$
begin
  perform public.rm_client_apply('expenses', jsonb_build_array(srq_test.expense('user-a', 'e-plain', null)), '[]'::jsonb);
  if srq_test.queued('user-a', 'space-daily') is not null then raise exception 'an expense with no Space queued'; end if;
end
$$;
reset role;

-- ─── 3. No token: an expense in a Space queues, no dispatch ────────────────
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', srq_test.claims('user-a'), true); end $$;
do $$
begin
  perform public.rm_client_apply('expenses', jsonb_build_array(srq_test.expense('user-a', 'e-aug', 's1')), '[]'::jsonb);
  if srq_test.queued('user-a', 'space-daily') is null then raise exception 'an expense in a Space did not queue its owner'; end if;
  if srq_test.requests('%/space-daily.yml/dispatches') <> 0 then raise exception 'dispatched without a token'; end if;
end
$$;
reset role;

-- ─── 4. Removing an expense from its Space (old doc had spaceId) queues ────
select srq_test.clear();
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', srq_test.claims('user-a'), true); end $$;
do $$
begin
  perform public.rm_client_apply('expenses', jsonb_build_array(srq_test.expense('user-a', 'e-aug', null)), '[]'::jsonb);
  if srq_test.queued('user-a', 'space-daily') is null then raise exception 'removing an expense from a Space did not queue'; end if;
end
$$;
reset role;

-- ─── 5. Token stored: a Space save dispatches space-daily.yml, no uid ──────
select srq_test.clear();
insert into vault.decrypted_secrets (name, decrypted_secret) values ('spendly_github_dispatch_token', 'test-token');
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', srq_test.claims('user-a'), true); end $$;
do $$
declare
  r jsonb;
begin
  perform public.rm_client_apply('spaces', jsonb_build_array(srq_test.space('user-a', 's1', 'Brother hospital')), '[]'::jsonb);
  if srq_test.queued('user-a', 'space-daily') is null then raise exception 'a Space save did not queue its owner'; end if;
  if srq_test.requests('%/space-daily.yml/dispatches') <> 1 then raise exception 'expected 1 space-daily dispatch'; end if;
  r := srq_test.last_request();
  if r->'body' <> '{"ref": "main", "inputs": {"dry_run": "false", "trigger": "queue"}}'::jsonb
     or r->'headers'->>'Authorization' <> 'Bearer test-token' then
    raise exception 'dispatch is wrong: %', r;
  end if;
  if (r->'body')::text like '%user-a%' or r->>'url' like '%user-a%' then raise exception 'the dispatch named the user'; end if;

  -- ─── 6. Debounce: another save within the minute, no second dispatch
  perform public.rm_client_apply('expenses', jsonb_build_array(srq_test.expense('user-a', 'e-sep', 's1')), '[]'::jsonb);
  if srq_test.requests('%/space-daily.yml/dispatches') <> 1 then raise exception 'debounce failed'; end if;
end
$$;
reset role;

-- ─── 7. An app delete (tombstone) of a Space expense queues ────────────────
select srq_test.clear();
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', srq_test.claims('user-a'), true); end $$;
do $$
begin
  perform public.rm_client_apply('expenses', '[]'::jsonb,
    jsonb_build_array(jsonb_build_object('uid', 'user-a', 'doc_id', 'e-sep', 'client_written_at', clock_timestamp())));
  if srq_test.queued('user-a', 'space-daily') is null then raise exception 'deleting a Space expense did not queue'; end if;
end
$$;
reset role;

-- ─── 8. Duress uids are never queued ────────────────────────────────────────
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', srq_test.claims('user-c_duress'), true); end $$;
do $$
begin
  begin
    perform public.rm_client_apply('expenses', jsonb_build_array(srq_test.expense('user-c_duress', 'd1', 's1')), '[]'::jsonb);
  exception when others then
    null; -- rm_client_apply may refuse a duress identity outright; either way nothing is queued
  end;
  if srq_test.queued('user-c_duress', 'space-daily') is not null then raise exception 'a duress uid was queued'; end if;
end
$$;
reset role;

-- ─── 9. The queue still takes the earlier jobs ─────────────────────────────
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'server_run_queue_job_check'
                 and pg_get_constraintdef(oid) like '%bill-daily%epf-daily%space-daily%') then
    raise exception 'the queue lost a job';
  end if;
end
$$;

-- ─── 10. A purge clears the Spaces job for that user ───────────────────────
do $$
begin
  perform public.readmodel_purge_user('user-a');
  if srq_test.queued('user-a', 'space-daily') is not null then raise exception 'a purged user stayed queued'; end if;
end
$$;

rollback;

select 'space-run queue tests passed' as result;
