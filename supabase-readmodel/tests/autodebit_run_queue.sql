-- SPENDLY-796 behaviour tests for the auto-debit run queue. An app save that
-- can change whether an account covers its coming auto-debits queues its
-- owner for autodebit-daily. Once a minute, when a token is stored, it asks
-- GitHub to run autodebit-daily in queue mode.
-- Saves from users without auto-debits don't queue.
-- Run after bootstrap_roles.sql (which stands in for pg_net and Vault) and the
-- migrations. One transaction, rolled back. Any failed expectation raises.

begin;

create schema adq_test;
grant usage on schema adq_test to authenticated, anon, service_role;

create function adq_test.claims(p_sub text) returns text
language sql as $$
  select jsonb_build_object(
    'iss', 'https://securetoken.google.com/expenseapp-27f94',
    'aud', 'expenseapp-27f94',
    'sub', p_sub,
    'role', 'authenticated',
    'exp', extract(epoch from now())::bigint + 3600
  )::text
$$;

create function adq_test.sub(p_uid text, p_id text, p_account text, p_active boolean) returns jsonb
language sql as $$
  select jsonb_build_object(
    'uid', p_uid, 'doc_id', p_id, 'name', 'Home loan EMI', 'amount', 8000, 'type', 'emi',
    'day_of_month', 22, 'is_active', p_active, 'account_id', p_account,
    'doc', jsonb_strip_nulls(jsonb_build_object('name', 'Home loan EMI', 'amount', 8000, 'type', 'emi',
      'dayOfMonth', 22, 'isActive', p_active, 'accountId', p_account)),
    'source_path', 'users/' || p_uid || '/subscriptions/' || p_id,
    'schema_version', 1, 'mapping_status', 'mapped', 'client_written_at', clock_timestamp())
$$;

create function adq_test.account(p_uid text, p_id text, p_balance numeric, p_autopay text) returns jsonb
language sql as $$
  select jsonb_build_object(
    'uid', p_uid, 'doc_id', p_id, 'name', p_id, 'current_balance', p_balance,
    'doc', jsonb_strip_nulls(jsonb_build_object('name', p_id, 'currentBalance', p_balance, 'autopayFromAccountId', p_autopay)),
    'source_path', 'users/' || p_uid || '/accounts/' || p_id,
    'schema_version', 1, 'mapping_status', 'mapped', 'client_written_at', clock_timestamp())
$$;

-- Read back as the test's superuser (the queue is server-only).
create function adq_test.queued(p_uid text) returns timestamptz
language sql security definer as $$
  select requested_at from public.server_run_queue where uid = p_uid and job = 'autodebit-daily'
$$;
create function adq_test.clear() returns void
language sql security definer as $$ delete from public.server_run_queue where job = 'autodebit-daily' $$;
create function adq_test.requests(p_like text) returns integer
language sql security definer as $$ select count(*)::int from net._requests where url like p_like $$;
create function adq_test.last_request() returns jsonb
language sql security definer as $$ select to_jsonb(r) from net._requests r order by r.id desc limit 1 $$;
grant execute on all functions in schema adq_test to authenticated, anon, service_role;

-- ─── 1. Server writes never queue (the sync, the push) ─────────────────────
set local role service_role;
do $$
begin
  perform public.readmodel_upsert('subscriptions', jsonb_build_array(jsonb_build_object(
    'uid', 'user-a', 'doc_id', 'srv1', 'account_id', 'bank1', 'is_active', true,
    'doc', '{"accountId":"bank1","isActive":true,"amount":10}'::jsonb,
    'source_path', 'users/user-a/subscriptions/srv1', 'source_update_time', now(),
    'schema_version', 1, 'mapping_status', 'mapped')));
  if adq_test.queued('user-a') is not null then raise exception 'a server write queued its owner'; end if;
end
$$;
reset role;

-- ─── 2. A user with no auto-debits: an account save doesn't queue ──────────
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', adq_test.claims('user-b'), true); end $$;
do $$
begin
  perform public.rm_client_apply('accounts', jsonb_build_array(adq_test.account('user-b', 'bank9', 500, null)), '[]'::jsonb);
  perform public.rm_client_apply('subscriptions', jsonb_build_array(adq_test.sub('user-b', 'netflix', null, true)), '[]'::jsonb);
  if adq_test.queued('user-b') is not null then raise exception 'a user with no auto-debits queued'; end if;
end
$$;
reset role;

-- ─── 3. No token: a recurring item with an account queues, no dispatch ─────
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', adq_test.claims('user-a'), true); end $$;
do $$
begin
  perform public.rm_client_apply('subscriptions', jsonb_build_array(adq_test.sub('user-a', 'emi1', 'bank1', true)), '[]'::jsonb);
  if adq_test.queued('user-a') is null then raise exception 'an auto-debit item did not queue its owner'; end if;
  if adq_test.requests('%/autodebit-daily.yml/dispatches') <> 0 then raise exception 'dispatched without a token'; end if;
end
$$;
reset role;

-- ─── 4. Removing the account from the item (old row had one) queues ────────
select adq_test.clear();
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', adq_test.claims('user-a'), true); end $$;
do $$
begin
  perform public.rm_client_apply('subscriptions', jsonb_build_array(adq_test.sub('user-a', 'emi1', null, true)), '[]'::jsonb);
  if adq_test.queued('user-a') is null then raise exception 'unlinking an auto-debit did not queue'; end if;
end
$$;
reset role;

-- ─── 5. Token stored: a balance change for an auto-debit user dispatches ───
select adq_test.clear();
insert into vault.decrypted_secrets (name, decrypted_secret) values ('spendly_github_dispatch_token', 'test-token');
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', adq_test.claims('user-a'), true); end $$;
do $$
declare
  r jsonb;
begin
  perform public.rm_client_apply('subscriptions', jsonb_build_array(adq_test.sub('user-a', 'emi2', 'bank1', true)), '[]'::jsonb);
  perform adq_test.clear();
  perform public.rm_client_apply('accounts', jsonb_build_array(adq_test.account('user-a', 'bank1', 25000, null)), '[]'::jsonb);
  if adq_test.queued('user-a') is null then raise exception 'a top-up did not queue an auto-debit user'; end if;
  if adq_test.requests('%/autodebit-daily.yml/dispatches') <> 1 then raise exception 'expected 1 autodebit-daily dispatch'; end if;
  r := adq_test.last_request();
  if r->'body' <> '{"ref": "main", "inputs": {"dry_run": "false", "trigger": "queue"}}'::jsonb
     or r->'headers'->>'Authorization' <> 'Bearer test-token' then
    raise exception 'dispatch is wrong: %', r;
  end if;
  if (r->'body')::text like '%user-a%' or r->>'url' like '%user-a%' then raise exception 'the dispatch named the user'; end if;

  -- ─── 6. Debounce: another save within the minute, no second dispatch
  perform public.rm_client_apply('accounts', jsonb_build_array(adq_test.account('user-a', 'bank1', 26000, null)), '[]'::jsonb);
  if adq_test.requests('%/autodebit-daily.yml/dispatches') <> 1 then raise exception 'debounce failed'; end if;
end
$$;
reset role;

-- ─── 7. A card linked to a paying account queues; so does unlinking it ─────
select adq_test.clear();
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', adq_test.claims('user-c'), true); end $$;
do $$
begin
  perform public.rm_client_apply('accounts', jsonb_build_array(adq_test.account('user-c', 'card1', 0, 'bank7')), '[]'::jsonb);
  if adq_test.queued('user-c') is null then raise exception 'linking card autopay did not queue'; end if;
  perform adq_test.clear();
  perform public.rm_client_apply('accounts', jsonb_build_array(adq_test.account('user-c', 'card1', 0, null)), '[]'::jsonb);
  if adq_test.queued('user-c') is null then raise exception 'unlinking card autopay did not queue'; end if;
end
$$;
reset role;

-- ─── 8. An app delete (tombstone) of an auto-debit item queues ─────────────
select adq_test.clear();
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', adq_test.claims('user-a'), true); end $$;
do $$
begin
  perform public.rm_client_apply('subscriptions', '[]'::jsonb,
    jsonb_build_array(jsonb_build_object('uid', 'user-a', 'doc_id', 'emi2', 'client_written_at', clock_timestamp())));
  if adq_test.queued('user-a') is null then raise exception 'deleting an auto-debit item did not queue'; end if;
end
$$;
reset role;

-- ─── 9. Duress uids are never queued ────────────────────────────────────────
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', adq_test.claims('user-d_duress'), true); end $$;
do $$
begin
  begin
    perform public.rm_client_apply('subscriptions', jsonb_build_array(adq_test.sub('user-d_duress', 'd1', 'bank1', true)), '[]'::jsonb);
  exception when others then
    null; -- rm_client_apply may refuse a duress identity outright; either way nothing is queued
  end;
  if adq_test.queued('user-d_duress') is not null then raise exception 'a duress uid was queued'; end if;
end
$$;
reset role;

-- ─── 10. The queue still takes the earlier jobs ────────────────────────────
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'server_run_queue_job_check'
                 and pg_get_constraintdef(oid) like '%bill-daily%epf-daily%space-daily%autodebit-daily%') then
    raise exception 'the queue lost a job';
  end if;
end
$$;

-- ─── 11. A purge clears the auto-debit job for that user ───────────────────
do $$
begin
  perform public.readmodel_purge_user('user-a');
  if adq_test.queued('user-a') is not null then raise exception 'a purged user stayed queued'; end if;
end
$$;

rollback;

select 'autodebit-run queue tests passed' as result;
