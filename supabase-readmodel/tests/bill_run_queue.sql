-- SPENDLY-737 behaviour tests for the bill-run queue: an app save to a bill
-- input queues its owner and (once a minute, when a token is stored) asks
-- GitHub to run bill-daily in queue mode. Run after bootstrap_roles.sql (which
-- stands in for pg_net and Vault) and the migrations. One transaction, rolled
-- back. Any failed expectation raises.

begin;

create schema brq_test;
grant usage on schema brq_test to authenticated, anon, service_role;

create function brq_test.claims(p_sub text) returns text
language sql as $$
  select jsonb_build_object(
    'iss', 'https://securetoken.google.com/expenseapp-27f94',
    'aud', 'expenseapp-27f94',
    'sub', p_sub,
    'role', 'authenticated',
    'exp', extract(epoch from now())::bigint + 3600
  )::text
$$;

create function brq_test.row(p_uid text, p_id text, p_amount numeric) returns jsonb
language sql as $$
  select jsonb_build_object(
    'uid', p_uid, 'doc_id', p_id, 'amount', p_amount, 'date', '2026-11-09', 'month', '2026-11',
    'category', 'Food', 'accountId', 'roar', 'doc', jsonb_build_object('amount', p_amount, 'accountId', 'roar'),
    'source_path', 'users/' || p_uid || '/expenses/' || p_id,
    'schema_version', 1, 'mapping_status', 'mapped', 'client_written_at', now())
$$;

-- Read back as the test's superuser (the queue is server-only).
create function brq_test.queued(p_uid text) returns timestamptz
language sql security definer as $$
  select requested_at from public.server_run_queue where uid = p_uid and job = 'bill-daily'
$$;
create function brq_test.requests() returns integer
language sql security definer as $$ select count(*)::int from net._requests $$;
create function brq_test.last_request() returns net._requests
language sql security definer as $$ select * from net._requests order by id desc limit 1 $$;
grant execute on all functions in schema brq_test to authenticated, anon, service_role;

-- ─── 1. Server writes never queue (the sync, the push, bill-daily's own bills) ─
set local role service_role;
do $$
begin
  perform public.readmodel_upsert('expenses', jsonb_build_array(jsonb_build_object(
    'uid', 'user-a', 'doc_id', 'srv1', 'amount', 10, 'doc', '{"amount":10}'::jsonb,
    'source_path', 'users/user-a/expenses/srv1', 'source_update_time', now(),
    'schema_version', 1, 'mapping_status', 'mapped')));
  if brq_test.queued('user-a') is not null then raise exception 'a server write queued its owner'; end if;
  if brq_test.requests() <> 0 then raise exception 'a server write sent a dispatch'; end if;
end
$$;
reset role;

-- ─── 2. No token stored: an app save queues the user, sends nothing ─────────
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', brq_test.claims('user-a'), true); end $$;
do $$
begin
  perform public.rm_client_apply('expenses', jsonb_build_array(brq_test.row('user-a', 'c1', 100)), '[]'::jsonb);
  if brq_test.queued('user-a') is null then raise exception 'an app save did not queue its owner'; end if;
  if brq_test.requests() <> 0 then raise exception 'dispatched without a token'; end if;
end
$$;
reset role;

-- ─── 3. Token stored: one dispatch, to bill-daily.yml in queue mode ─────────
insert into vault.decrypted_secrets (name, decrypted_secret) values ('spendly_github_dispatch_token', 'test-token');

set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', brq_test.claims('user-a'), true); end $$;
do $$
declare
  r net._requests;
  first_at timestamptz;
begin
  first_at := brq_test.queued('user-a');
  perform public.rm_client_apply('expenses', jsonb_build_array(brq_test.row('user-a', 'c2', 50)), '[]'::jsonb);
  if brq_test.requests() <> 1 then raise exception 'expected 1 dispatch, got %', brq_test.requests(); end if;
  r := brq_test.last_request();
  if r.url <> 'https://api.github.com/repos/chkesava/expense-tracker-mobile-application-/actions/workflows/bill-daily.yml/dispatches'
     or r.body <> '{"ref": "main", "inputs": {"dry_run": "false", "trigger": "queue"}}'::jsonb
     or r.headers->>'Authorization' <> 'Bearer test-token' then
    raise exception 'dispatch is wrong: %', row_to_json(r);
  end if;
  -- No uid anywhere in the request.
  if r.body::text like '%user-a%' or r.url like '%user-a%' then raise exception 'the dispatch named the user'; end if;
  if brq_test.queued('user-a') < first_at then raise exception 'the queue time did not move forward'; end if;

  -- ─── 4. Debounce: another save within the minute queues, no second dispatch
  perform public.rm_client_apply('expenses', jsonb_build_array(brq_test.row('user-a', 'c3', 25)), '[]'::jsonb);
  if brq_test.requests() <> 1 then raise exception 'debounce failed: % dispatches', brq_test.requests(); end if;
end
$$;
reset role;

-- After a minute, the next save dispatches again.
update public.server_run_dispatches set last_dispatch_at = now() - interval '2 minutes' where job = 'bill-daily';
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', brq_test.claims('user-b'), true); end $$;
do $$
begin
  perform public.rm_client_apply('expenses', jsonb_build_array(brq_test.row('user-b', 'b1', 5)), '[]'::jsonb);
  if brq_test.requests() <> 2 then raise exception 'expected a new dispatch after the minute, got %', brq_test.requests(); end if;
  if brq_test.queued('user-b') is null then raise exception 'user-b was not queued'; end if;
end
$$;
reset role;

-- ─── 5. Duress uids are never queued ────────────────────────────────────────
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', brq_test.claims('user-c_duress'), true); end $$;
do $$
begin
  begin
    perform public.rm_client_apply('expenses', jsonb_build_array(brq_test.row('user-c_duress', 'd1', 1)), '[]'::jsonb);
  exception when others then
    null; -- rm_client_apply may refuse a duress identity outright; either way nothing is queued
  end;
  if brq_test.queued('user-c_duress') is not null then raise exception 'a duress uid was queued'; end if;
end
$$;
reset role;

-- ─── 6. Clients can't see or touch the queue ────────────────────────────────
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', brq_test.claims('user-a'), true); end $$;
do $$
begin
  begin
    perform 1 from public.server_run_queue;
    raise exception 'authenticated could read server_run_queue';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.server_run_dispatch('bill-daily');
    raise exception 'authenticated could call server_run_dispatch';
  exception when insufficient_privilege then null;
  end;
end
$$;
reset role;

-- ─── 7. A purge leaves nothing queued ───────────────────────────────────────
do $$
begin
  perform public.readmodel_purge_user('user-b');
  if brq_test.queued('user-b') is not null then raise exception 'a purged user stayed queued'; end if;
  if brq_test.queued('user-a') is null then raise exception 'the purge removed another user''s request'; end if;
end
$$;

rollback;

select 'bill-run queue tests passed' as result;
