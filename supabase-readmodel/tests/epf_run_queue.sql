-- SPENDLY-790 behaviour tests for the EPF run queue: an app save to an EPF
-- ledger input queues its owner for epf-daily and (once a minute, when a token
-- is stored) asks GitHub to run epf-daily in queue mode. The bill-daily queue
-- and dispatch stay independent. Run after bootstrap_roles.sql (which stands
-- in for pg_net and Vault) and the migrations. One transaction, rolled back.
-- Any failed expectation raises.

begin;

create schema erq_test;
grant usage on schema erq_test to authenticated, anon, service_role;

create function erq_test.claims(p_sub text) returns text
language sql as $$
  select jsonb_build_object(
    'iss', 'https://securetoken.google.com/expenseapp-27f94',
    'aud', 'expenseapp-27f94',
    'sub', p_sub,
    'role', 'authenticated',
    'exp', extract(epoch from now())::bigint + 3600
  )::text
$$;

create function erq_test.contribution(p_uid text, p_id text, p_status text) returns jsonb
language sql as $$
  select jsonb_build_object(
    'uid', p_uid, 'doc_id', p_id, 'establishment_id', 'est1', 'month', '2026-10',
    'epf_credit', 6000, 'status', p_status,
    'doc', jsonb_build_object('establishmentId', 'est1', 'month', '2026-10', 'epfCredit', 6000, 'status', p_status),
    'source_path', 'users/' || p_uid || '/epfContributions/' || p_id,
    'schema_version', 1, 'mapping_status', 'mapped', 'client_written_at', clock_timestamp())
$$;

-- Read back as the test's superuser (the queue is server-only).
create function erq_test.queued(p_uid text, p_job text) returns timestamptz
language sql security definer as $$
  select requested_at from public.server_run_queue where uid = p_uid and job = p_job
$$;
create function erq_test.requests() returns integer
language sql security definer as $$ select count(*)::int from net._requests $$;
create function erq_test.last_request() returns jsonb
language sql security definer as $$ select to_jsonb(r) from net._requests r order by r.id desc limit 1 $$;
grant execute on all functions in schema erq_test to authenticated, anon, service_role;

-- ─── 1. Server writes never queue (the sync, the push, epf-daily's own rows) ─
set local role service_role;
do $$
begin
  perform public.readmodel_upsert('epf_contributions', jsonb_build_array(jsonb_build_object(
    'uid', 'user-a', 'doc_id', 'srv1', 'establishment_id', 'est1', 'month', '2026-09',
    'doc', '{"month":"2026-09"}'::jsonb,
    'source_path', 'users/user-a/epfContributions/srv1', 'source_update_time', now(),
    'schema_version', 1, 'mapping_status', 'mapped')));
  if erq_test.queued('user-a', 'epf-daily') is not null then raise exception 'a server write queued its owner'; end if;
  if erq_test.requests() <> 0 then raise exception 'a server write sent a dispatch'; end if;
end
$$;
reset role;

-- ─── 2. No token stored: an app save queues the user for epf-daily only ─────
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', erq_test.claims('user-a'), true); end $$;
do $$
begin
  perform public.rm_client_apply('epf_contributions', jsonb_build_array(erq_test.contribution('user-a', 'est1_2026-10', 'awaiting')), '[]'::jsonb);
  if erq_test.queued('user-a', 'epf-daily') is null then raise exception 'an EPF save did not queue its owner'; end if;
  if erq_test.queued('user-a', 'bill-daily') is not null then raise exception 'an EPF save queued the bill job'; end if;
  if erq_test.requests() <> 0 then raise exception 'dispatched without a token'; end if;
end
$$;
reset role;

-- ─── 3. Token stored: an update (mark credited) dispatches epf-daily.yml ────
insert into vault.decrypted_secrets (name, decrypted_secret) values ('spendly_github_dispatch_token', 'test-token');

set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', erq_test.claims('user-a'), true); end $$;
do $$
declare
  r jsonb;
begin
  perform public.rm_client_apply('epf_contributions', jsonb_build_array(erq_test.contribution('user-a', 'est1_2026-10', 'credited')), '[]'::jsonb);
  if erq_test.requests() <> 1 then raise exception 'expected 1 dispatch, got %', erq_test.requests(); end if;
  r := erq_test.last_request();
  if r->>'url' <> 'https://api.github.com/repos/chkesava/expense-tracker-mobile-application-/actions/workflows/epf-daily.yml/dispatches'
     or r->'body' <> '{"ref": "main", "inputs": {"dry_run": "false", "trigger": "queue"}}'::jsonb
     or r->'headers'->>'Authorization' <> 'Bearer test-token' then
    raise exception 'dispatch is wrong: %', r;
  end if;
  if (r->'body')::text like '%user-a%' or r->>'url' like '%user-a%' then raise exception 'the dispatch named the user'; end if;

  -- ─── 4. Debounce: another EPF save within the minute, no second dispatch
  perform public.rm_client_apply('epf_contributions', jsonb_build_array(erq_test.contribution('user-a', 'est1_2026-09', 'credited')), '[]'::jsonb);
  if erq_test.requests() <> 1 then raise exception 'debounce failed: % dispatches', erq_test.requests(); end if;

  -- ─── 5. Per-job debounce: a bill save in the same minute still dispatches bill-daily
  perform public.rm_client_apply('expenses', jsonb_build_array(jsonb_build_object(
    'uid', 'user-a', 'doc_id', 'e1', 'amount', 10, 'date', '2026-11-18', 'month', '2026-11',
    'category', 'Food', 'accountId', 'roar', 'doc', '{"amount":10}'::jsonb,
    'source_path', 'users/user-a/expenses/e1', 'schema_version', 1, 'mapping_status', 'mapped',
    'client_written_at', clock_timestamp())), '[]'::jsonb);
  if erq_test.requests() <> 2 then raise exception 'the EPF debounce held back the bill dispatch: %', erq_test.requests(); end if;
  if erq_test.last_request()->>'url' not like '%/bill-daily.yml/dispatches' then raise exception 'second dispatch was not bill-daily'; end if;
end
$$;
reset role;

-- ─── 6. An app delete (tombstone) queues too ────────────────────────────────
delete from public.server_run_queue where job = 'epf-daily';
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', erq_test.claims('user-a'), true); end $$;
do $$
begin
  perform public.rm_client_apply('epf_contributions', '[]'::jsonb,
    jsonb_build_array(jsonb_build_object('uid', 'user-a', 'doc_id', 'est1_2026-09', 'client_written_at', clock_timestamp())));
  if erq_test.queued('user-a', 'epf-daily') is null then raise exception 'an app delete did not queue its owner'; end if;
end
$$;
reset role;

-- ─── 7. Every EPF ledger input queues; epf_interest_entries does not ───────
do $$
declare
  t text;
  missing text;
begin
  select string_agg(x, ', ') into missing
  from unnest(array['epf_establishments', 'epf_contributions', 'epf_transfers', 'epf_reconciliations']) as x
  where (
    select count(*) from pg_trigger g join pg_class c on c.oid = g.tgrelid
    where c.relname = x and g.tgname in (x || '_epf_run_ins', x || '_epf_run_upd') and not g.tgisinternal
  ) <> 2;
  if missing is not null then raise exception 'EPF inputs without both epf-run triggers: %', missing; end if;
  if exists (
    select 1 from pg_trigger g join pg_class c on c.oid = g.tgrelid
    where c.relname = 'epf_interest_entries' and g.tgname like '%_epf_run_%'
  ) then
    raise exception 'epf_interest_entries is server-written and must not queue';
  end if;
end
$$;

-- ─── 8. Duress uids are never queued ────────────────────────────────────────
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', erq_test.claims('user-c_duress'), true); end $$;
do $$
begin
  begin
    perform public.rm_client_apply('epf_contributions', jsonb_build_array(erq_test.contribution('user-c_duress', 'd1', 'credited')), '[]'::jsonb);
  exception when others then
    null; -- rm_client_apply may refuse a duress identity outright; either way nothing is queued
  end;
  if erq_test.queued('user-c_duress', 'epf-daily') is not null then raise exception 'a duress uid was queued'; end if;
end
$$;
reset role;

-- ─── 9. Unknown jobs are refused by the queue and the dispatch ──────────────
do $$
begin
  begin
    insert into public.server_run_queue (uid, job) values ('user-a', 'other-daily');
    raise exception 'the queue took an unknown job';
  exception when check_violation then null;
  end;
  if public.server_run_dispatch('other-daily') then raise exception 'dispatched an unknown job'; end if;
end
$$;

-- ─── 10. A purge clears every job for that user ─────────────────────────────
do $$
begin
  perform public.readmodel_purge_user('user-a');
  if erq_test.queued('user-a', 'epf-daily') is not null or erq_test.queued('user-a', 'bill-daily') is not null then
    raise exception 'a purged user stayed queued';
  end if;
end
$$;

rollback;

select 'epf-run queue tests passed' as result;
