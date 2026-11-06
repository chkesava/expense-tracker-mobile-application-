-- SPENDLY-669 behaviour tests for rm_client_apply, the app's only write path
-- into the read model. Run after the migrations and bootstrap_roles.sql.
--
-- Each case impersonates a request the way PostgREST does (SET ROLE to the
-- token's role, claims in request.jwt.claims). One transaction, rolled back.
-- Any failed expectation raises and aborts the run.

begin;

create schema ca_test;
grant usage on schema ca_test to authenticated, anon;

create function ca_test.claims(overrides jsonb default '{}') returns text
language sql as $$
  select (jsonb_build_object(
    'iss', 'https://securetoken.google.com/expenseapp-27f94',
    'aud', 'expenseapp-27f94',
    'sub', 'user-a',
    'role', 'authenticated',
    'exp', extract(epoch from now())::bigint + 3600
  ) || overrides)::text
$$;

-- A row as the shared mapper builds it, plus the device's save time.
create function ca_test.row(p_uid text, p_id text, p_amount numeric, p_at timestamptz default now()) returns jsonb
language sql as $$
  select jsonb_build_object(
    'uid', p_uid, 'doc_id', p_id, 'amount', p_amount, 'date', '2026-11-03', 'month', '2026-11',
    'category', 'Food', 'doc', jsonb_build_object('amount', p_amount),
    'source_path', 'users/' || p_uid || '/expenses/' || p_id,
    'schema_version', 1, 'mapping_status', 'mapped', 'client_written_at', p_at)
$$;

-- Expects the call to raise; returns the SQLSTATE.
create function ca_test.refused(p_table text, p_rows jsonb, p_deletes jsonb default '[]') returns text
language plpgsql as $$
begin
  perform public.rm_client_apply(p_table, p_rows, p_deletes);
  return null;
exception when others then
  return sqlstate;
end
$$;
-- The stored row as it really is, tombstones included (RLS hides those from
-- the owner, as it should). Definer: runs as the test's superuser.
create function ca_test.raw(p_doc text) returns jsonb
language sql security definer as $$
  select to_jsonb(t) from public.expenses t where t.uid = 'user-a' and t.doc_id = p_doc
$$;
grant execute on all functions in schema ca_test to authenticated, anon;

-- A server-written row to test the guard against (as the sync would write it).
set local role service_role;
do $$
begin
  perform public.readmodel_upsert('expenses', jsonb_build_array(jsonb_build_object(
    'uid', 'user-a', 'doc_id', 'srv1', 'amount', 10, 'doc', '{"amount":10}'::jsonb,
    'source_path', 'users/user-a/expenses/srv1', 'source_update_time', now() - interval '1 hour',
    'schema_version', 1, 'mapping_status', 'mapped')));
end
$$;
reset role;

set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', ca_test.claims(), true); end $$;

-- ─── 1. A writes its own rows ───────────────────────────────────────────────
do $$
declare
  res jsonb;
  r record;
begin
  res := public.rm_client_apply('expenses', jsonb_build_array(ca_test.row('user-a', 'c1', 100)));
  if (res->>'upserted')::int <> 1 then raise exception 'own write: %', res; end if;
  select * into r from public.expenses where doc_id = 'c1';
  if r.amount <> 100 or r.written_by <> 'client' or r.client_written_at is null
     or r.source_update_time <> r.client_written_at or r.source_deleted then
    raise exception 'own write stored wrongly: %', row_to_json(r);
  end if;
end
$$;

-- ─── 2. Refusals ────────────────────────────────────────────────────────────
do $$
declare
  st text;
  big jsonb;
begin
  st := ca_test.refused('expenses', jsonb_build_array(ca_test.row('user-b', 'x1', 1)));
  if st is distinct from '42501' then raise exception 'a row for another user was not refused (%)', st; end if;

  st := ca_test.refused('accounts_typo', jsonb_build_array(ca_test.row('user-a', 'x2', 1)));
  if st is distinct from '42501' then raise exception 'an unknown table was not refused (%)', st; end if;
  st := ca_test.refused('sync_runs', '[]');
  if st is distinct from '42501' then raise exception 'a bookkeeping table was not refused (%)', st; end if;

  st := ca_test.refused('expenses', jsonb_build_array(ca_test.row('user-a', 'x3', 1) - 'client_written_at'));
  if st is distinct from '22023' then raise exception 'a row without client_written_at was not refused (%)', st; end if;
  st := ca_test.refused('expenses', jsonb_build_array(ca_test.row('user-a', 'x4', 1) || '{"doc": "text"}'));
  if st is distinct from '22023' then raise exception 'a non-object doc was not refused (%)', st; end if;
  st := ca_test.refused('expenses', jsonb_build_array(ca_test.row('user-a', 'x5', 1) || '{"source_path": "users/user-b/expenses/x5"}'));
  if st is distinct from '22023' then raise exception 'a path under another user was not refused (%)', st; end if;
  st := ca_test.refused('expenses', jsonb_build_array(ca_test.row('user-a', 'x6', 1, now() + interval '2 days')));
  if st is distinct from '22023' then raise exception 'a far-future client time was not refused (%)', st; end if;
  st := ca_test.refused('expenses', jsonb_build_array(ca_test.row('user-a', 'x7', 1) || '{"amount": "lots"}'));
  if st is null then raise exception 'a bad typed value was stored'; end if;

  select jsonb_agg(ca_test.row('user-a', 'b' || g, 1)) into big from generate_series(1, 51) g;
  st := ca_test.refused('expenses', big);
  if st is distinct from '22023' then raise exception 'a batch of 51 was not refused (%)', st; end if;

  if exists (select 1 from public.expenses where doc_id like 'x%' or doc_id like 'b%') then
    raise exception 'a refused call left rows behind';
  end if;
end
$$;

-- Claims that must not write at all.
do $$
declare
  bad record;
  st text;
begin
  for bad in
    select * from (values
      ('duress uid',     '{"sub": "user-a_duress"}'::jsonb),
      ('expired token',  jsonb_build_object('exp', extract(epoch from now())::bigint - 1)),
      ('other issuer',   '{"iss": "https://securetoken.google.com/other-project"}'::jsonb),
      ('other audience', '{"aud": "other-project"}'::jsonb),
      ('anon role',      '{"role": "anon"}'::jsonb)
    ) as cases (name, overrides)
  loop
    perform set_config('request.jwt.claims', ca_test.claims(bad.overrides), true);
    st := ca_test.refused('expenses', jsonb_build_array(ca_test.row(coalesce(bad.overrides->>'sub', 'user-a'), 'z1', 1)));
    if st is distinct from '42501' then raise exception '% could write (%)', bad.name, st; end if;
  end loop;
  perform set_config('request.jwt.claims', ca_test.claims(), true);
end
$$;

-- ─── 3. Tables stay SELECT-only for the client ──────────────────────────────
do $$
begin
  begin
    insert into public.expenses (uid, doc_id, doc, source_path, source_update_time)
    values ('user-a', 'direct', '{}', 'users/user-a/expenses/direct', now());
    raise exception 'a direct insert succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.expenses set amount = 1 where doc_id = 'c1';
    raise exception 'a direct update succeeded';
  exception when insufficient_privilege then null;
  end;
end
$$;

-- ─── 4. Version guard ───────────────────────────────────────────────────────
do $$
declare
  res jsonb;
  amt numeric;
begin
  -- An older client write never replaces a newer one.
  res := public.rm_client_apply('expenses', jsonb_build_array(ca_test.row('user-a', 'c1', 999, now() - interval '10 minutes')));
  select amount into amt from public.expenses where doc_id = 'c1';
  if (res->>'upserted')::int <> 0 or amt <> 100 then raise exception 'an older client write landed (%)', amt; end if;

  -- A newer client write lands (a later time in the same transaction).
  res := public.rm_client_apply('expenses', jsonb_build_array(ca_test.row('user-a', 'c1', 150, now() + interval '1 second')));
  select amount into amt from public.expenses where doc_id = 'c1';
  if amt <> 150 then raise exception 'a newer client write did not land (%)', amt; end if;

  -- A client write newer than a server row replaces it…
  res := public.rm_client_apply('expenses', jsonb_build_array(ca_test.row('user-a', 'srv1', 20)));
  select amount into amt from public.expenses where doc_id = 'srv1';
  if amt <> 20 then raise exception 'a newer client write did not replace an older server row (%)', amt; end if;
end
$$;

-- …but one older than the server row doesn't.
reset role;
set local role service_role;
do $$
begin
  perform public.readmodel_upsert('expenses', jsonb_build_array(jsonb_build_object(
    'uid', 'user-a', 'doc_id', 'srv2', 'amount', 30, 'doc', '{"amount":30}'::jsonb,
    'source_path', 'users/user-a/expenses/srv2', 'source_update_time', now(),
    'schema_version', 1, 'mapping_status', 'mapped')));
end
$$;
reset role;
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', ca_test.claims(), true); end $$;
do $$
declare
  amt numeric;
begin
  perform public.rm_client_apply('expenses', jsonb_build_array(ca_test.row('user-a', 'srv2', 99, now() - interval '5 minutes')));
  select amount into amt from public.expenses where doc_id = 'srv2';
  if amt <> 30 then raise exception 'an older client write replaced a newer server row (%)', amt; end if;
end
$$;

-- ─── 5. Deletes are tombstones, version-guarded ─────────────────────────────
do $$
declare
  res jsonb;
  j jsonb;
begin
  res := public.rm_client_apply('expenses', '[]'::jsonb,
    jsonb_build_array(jsonb_build_object('uid', 'user-a', 'doc_id', 'c1', 'client_written_at', now() + interval '2 seconds')));
  j := ca_test.raw('c1');
  if (res->>'tombstoned')::int <> 1 or not (j->>'source_deleted')::boolean or j->>'deleted_at' is null
     or j->>'written_by' <> 'client' then
    raise exception 'delete was not a client tombstone: %', j;
  end if;
  -- The row is gone from the owner's reads (RLS hides tombstones)…
  if exists (select 1 from public.expenses where doc_id = 'c1') then
    raise exception 'a tombstone is still visible to its owner';
  end if;
  -- …and a write from before the delete can't bring it back.
  perform public.rm_client_apply('expenses', jsonb_build_array(ca_test.row('user-a', 'c1', 1, now() + interval '1500 milliseconds')));
  if not (ca_test.raw('c1')->>'source_deleted')::boolean then
    raise exception 'a write older than the delete resurrected the row';
  end if;

  -- A delete of another user's row does nothing (and is refused).
  if ca_test.refused('expenses', '[]'::jsonb,
       jsonb_build_array(jsonb_build_object('uid', 'user-b', 'doc_id', 'c1', 'client_written_at', now()))) is distinct from '42501' then
    raise exception 'a delete for another user was not refused';
  end if;
end
$$;

-- ─── 6. Firestore wins: the server writers replace client rows ──────────────
reset role;
set local role service_role;
do $$
declare
  n integer;
  r record;
begin
  -- srv1 is now a client row (20) with a client time newer than the server
  -- version about to arrive. The server version still wins.
  n := public.readmodel_upsert('expenses', jsonb_build_array(jsonb_build_object(
    'uid', 'user-a', 'doc_id', 'srv1', 'amount', 11, 'doc', '{"amount":11}'::jsonb,
    'source_path', 'users/user-a/expenses/srv1', 'source_update_time', now() - interval '30 minutes',
    'schema_version', 1, 'mapping_status', 'mapped')));
  select * into r from public.expenses where doc_id = 'srv1';
  if n <> 1 or r.amount <> 11 or r.written_by <> 'server' or r.client_written_at is not null then
    raise exception 'the server upsert did not replace a client row: %', row_to_json(r);
  end if;

  -- The repair does the same.
  perform public.readmodel_repair('expenses', jsonb_build_array(jsonb_build_object(
    'uid', 'user-a', 'doc_id', 'c1', 'amount', 5, 'doc', '{"amount":5}'::jsonb,
    'source_path', 'users/user-a/expenses/c1', 'source_update_time', now() - interval '1 day',
    'schema_version', 1, 'mapping_status', 'mapped')));
  select * into r from public.expenses where doc_id = 'c1';
  if r.written_by <> 'server' or r.source_deleted or r.amount <> 5 then
    raise exception 'the repair did not replace a client row: %', row_to_json(r);
  end if;

  -- A Firestore delete replaces a client row too.
  perform public.readmodel_tombstone('expenses', 'user-a', array['c1']);
  select * into r from public.expenses where doc_id = 'c1';
  if not r.source_deleted or r.written_by <> 'server' then
    raise exception 'the server tombstone did not apply: %', row_to_json(r);
  end if;
end
$$;

-- ─── 7. Every allowlisted table takes a write ───────────────────────────────
reset role;
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', ca_test.claims(), true); end $$;
do $$
declare
  t text;
  res jsonb;
begin
  foreach t in array array[
    'expenses', 'incomes', 'ledger_events', 'accounts', 'account_types',
    'account_transfers', 'account_entries', 'account_payments',
    'credit_card_bills', 'categories', 'financial_goals', 'goal_events',
    'borrowings', 'borrowing_repayments', 'receivables', 'receivable_repayments', 'subscriptions',
    'investments', 'holdings', 'portfolio_transactions', 'investment_cash_transactions', 'portfolio_settings',
    'epf_profile', 'epf_establishments', 'epf_contributions', 'epf_contribution_events', 'epf_transfers',
    'epf_transfer_events', 'epf_interest_entries', 'epf_reconciliations', 'epf_wage_history',
    'category_budgets', 'decisions', 'calendar_reminders', 'fee_reviews', 'fee_signal_dismissals',
    'merchant_overrides', 'recurring_dismissals', 'spaces', 'categorization_rules', 'trips',
    'runway_settings', 'runway_overrides', 'what_if_scenarios', 'goal_funding_plans', 'sip_plans',
    'sip_transactions', 'virtual_positions', 'net_worth_history', 'watchlists', 'watchlist_items', 'financial_summaries', 'devices'
  ] loop
    res := public.rm_client_apply(t, jsonb_build_array(jsonb_build_object(
      'uid', 'user-a', 'doc_id', 'all-' || t, 'doc', '{}'::jsonb,
      'source_path', 'users/user-a/' || t || '/all-' || t,
      'schema_version', 1, 'mapping_status', 'mapped', 'client_written_at', now())));
    if (res->>'upserted')::int <> 1 then raise exception '% did not take a client write: %', t, res; end if;
  end loop;
end
$$;

-- ─── 7a. The users/{uid} copy is server-only (SPENDLY-591) ─────────────────
do $$
begin
  if ca_test.refused('user_settings', jsonb_build_array(jsonb_build_object(
       'uid', 'user-a', 'doc_id', 'settings', 'doc', '{}'::jsonb, 'source_path', 'users/user-a/x',
       'schema_version', 1, 'mapping_status', 'mapped', 'client_written_at', now()))) is distinct from '42501' then
    raise exception 'a client write to user_settings was not refused';
  end if;
end
$$;

-- ─── 7b. A nested row (SPENDLY-591): doc_id "{listId}/{itemId}" ─────────────
do $$
declare
  res jsonb;
  r record;
begin
  res := public.rm_client_apply('watchlist_items', jsonb_build_array(jsonb_build_object(
    'uid', 'user-a', 'doc_id', 'default/INFY.NS', 'list_id', 'default', 'symbol', 'INFY', 'sort_order', 1.5,
    'doc', '{"symbol":"INFY"}'::jsonb, 'source_path', 'users/user-a/watchlists/default/items/INFY.NS',
    'schema_version', 1, 'mapping_status', 'mapped', 'client_written_at', now())));
  select * into r from public.watchlist_items where doc_id = 'default/INFY.NS';
  if (res->>'upserted')::int <> 1 or r.list_id <> 'default' or r.sort_order <> 1.5 or r.written_by <> 'client' then
    raise exception 'nested client write stored wrongly: % %', res, row_to_json(r);
  end if;
  -- The same symbol in another list is another row.
  perform public.rm_client_apply('watchlist_items', jsonb_build_array(jsonb_build_object(
    'uid', 'user-a', 'doc_id', 'wl_2/INFY.NS', 'list_id', 'wl_2', 'doc', '{}'::jsonb,
    'source_path', 'users/user-a/watchlists/wl_2/items/INFY.NS',
    'schema_version', 1, 'mapping_status', 'mapped', 'client_written_at', now())));
  if (select count(*) from public.watchlist_items where uid = 'user-a' and doc_id like '%/INFY.NS') <> 2 then
    raise exception 'one symbol in two lists did not make two rows';
  end if;
  -- A nested delete tombstones only that list's row.
  res := public.rm_client_apply('watchlist_items', '[]'::jsonb,
    jsonb_build_array(jsonb_build_object('uid', 'user-a', 'doc_id', 'default/INFY.NS', 'client_written_at', now() + interval '1 second')));
  if (res->>'tombstoned')::int <> 1
     or exists (select 1 from public.watchlist_items where doc_id = 'default/INFY.NS')
     or not exists (select 1 from public.watchlist_items where doc_id = 'wl_2/INFY.NS') then
    raise exception 'nested delete: %', res;
  end if;
end
$$;

-- ─── 8. Performance: a full batch (50 rows) stays under 100 ms at p95 ──────
-- Each run is newer than the last, so every row is really rewritten (no
-- version-guard no-ops). Runs as the signed-in user, like the app.
do $$
declare
  batch jsonb;
  t timestamptz;
  times numeric[] := '{}';
  p95 numeric;
  run integer;
begin
  for run in 1..30 loop
    select jsonb_agg(ca_test.row('user-a', 'perf' || g, g, now() + make_interval(secs => run))) into batch
    from generate_series(1, 50) g;
    t := clock_timestamp();
    perform public.rm_client_apply('expenses', batch);
    times := times || (extract(epoch from clock_timestamp() - t) * 1000)::numeric;
  end loop;
  select percentile_cont(0.95) within group (order by v) into p95 from unnest(times) v;
  raise notice 'rm_client_apply 50-row batch: p95 % ms', round(p95, 2);
  if p95 >= 100 then
    raise exception 'rm_client_apply p95 % ms for 50 rows (budget 100 ms)', round(p95, 2);
  end if;
end
$$;

reset role;
rollback;

select 'read-model client write (rm_client_apply) tests passed' as result;
