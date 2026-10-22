-- SPENDLY-505 behaviour tests. Run after the migrations (and after
-- bootstrap_roles.sql, which provides auth.jwt() on plain Postgres).
--
-- Each case impersonates a request the way PostgREST does: SET ROLE to the
-- role the token maps to, and put the token's claims in request.jwt.claims.
-- Everything runs in one transaction that is rolled back, so the database is
-- left as it was. Any failed expectation raises and aborts the run.
--
-- Signature, expiry and issuer checks on the raw JWT are Supabase's job before
-- a request reaches Postgres. These tests cover the database layer, including
-- readmodel_auth.uid()'s defence-in-depth checks on the same claims.

begin;

-- Test helpers live in their own schema and are dropped by the rollback.
create schema rls_test;
grant usage on schema rls_test to authenticated, anon;

-- ─── Seed: per table, user A has two live rows and one tombstone; user B has
--     one row; A's duress tree has one row ─────────────────────────────────────

do $$
declare
  t text;
begin
  foreach t in array array[
    'expenses', 'incomes', 'ledger_events', 'accounts', 'account_types',
    'account_transfers', 'account_entries', 'account_payments',
    'credit_card_bills', 'categories'
  ] loop
    execute format(
      $sql$insert into public.%I (uid, doc_id, doc, source_path, source_update_time, source_deleted) values
         ('user-a', 'a1', '{}', 'users/user-a/x/a1', now(), false),
         ('user-a', 'a2', '{}', 'users/user-a/x/a2', now(), false),
         ('user-a', 'a3', '{}', 'users/user-a/x/a3', now(), true),
         ('user-b', 'b1', '{}', 'users/user-b/x/b1', now(), false),
         ('user-a_duress', 'd1', '{}', 'users/user-a_duress/x/d1', now(), false)$sql$,
      t
    );
  end loop;
  insert into public.sync_status (uid, collection) values ('user-a', 'expenses'), ('user-b', 'expenses');
end
$$;

-- Claims as the app's Firebase ID token carries them; cases override fields.
create function rls_test.claims(overrides jsonb default '{}') returns text
language sql as $$
  select (jsonb_build_object(
    'iss', 'https://securetoken.google.com/expenseapp-27f94',
    'aud', 'expenseapp-27f94',
    'sub', 'user-a',
    'role', 'authenticated',
    'exp', extract(epoch from now())::bigint + 3600
  ) || overrides)::text
$$;

-- Rows of every user-data table visible to the current role and claims.
create function rls_test.visible() returns table (tbl text, uid text, doc_id text)
language plpgsql as $$
declare
  t text;
begin
  foreach t in array array[
    'expenses', 'incomes', 'ledger_events', 'accounts', 'account_types',
    'account_transfers', 'account_entries', 'account_payments',
    'credit_card_bills', 'categories'
  ] loop
    return query execute format('select %L::text, r.uid, r.doc_id from public.%I r', t, t);
  end loop;
end
$$;
grant execute on all functions in schema rls_test to authenticated, anon;

-- ─── 1. User A sees exactly their two live rows in every table ──────────────
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', rls_test.claims(), true); end $$;
do $$
declare
  wrong text;
begin
  select string_agg(format('%s:%s/%s', v.tbl, v.uid, v.doc_id), ', ') into wrong
  from rls_test.visible() v where not (v.uid = 'user-a' and v.doc_id in ('a1', 'a2'));
  if wrong is not null then
    raise exception 'user A saw rows that are not theirs or are tombstoned: %', wrong;
  end if;
  if (select count(*) from rls_test.visible()) <> 20 then
    raise exception 'user A should see 2 rows in each of 10 tables, saw %', (select count(*) from rls_test.visible());
  end if;
  if (select count(*) from public.sync_status) <> 1
     or exists (select 1 from public.sync_status s where s.uid <> 'user-a') then
    raise exception 'user A saw another user''s sync_status';
  end if;
end
$$;

-- ─── 2. User B sees only B ──────────────────────────────────────────────────
do $$ begin perform set_config('request.jwt.claims', rls_test.claims('{"sub": "user-b"}'), true); end $$;
do $$
begin
  if exists (select 1 from rls_test.visible() v where v.uid <> 'user-b')
     or (select count(*) from rls_test.visible()) <> 10 then
    raise exception 'user B isolation failed';
  end if;
end
$$;

-- ─── 3. Claims that must yield nothing ──────────────────────────────────────
do $$
declare
  bad record;
  n bigint;
begin
  for bad in
    select * from (values
      ('other Firebase project (iss)', '{"iss": "https://securetoken.google.com/other-project"}'::jsonb),
      ('other Firebase project (aud)', '{"aud": "other-project"}'::jsonb),
      ('expired token',                jsonb_build_object('exp', extract(epoch from now())::bigint - 1)),
      ('non-numeric exp',              '{"exp": "never"}'::jsonb),
      ('no role claim',                '{"role": null}'::jsonb),
      ('anon role claim',              '{"role": "anon"}'::jsonb),
      ('empty sub',                    '{"sub": ""}'::jsonb),
      ('missing sub',                  '{"sub": null}'::jsonb),
      ('duress uid',                   '{"sub": "user-a_duress"}'::jsonb)
    ) as cases (name, overrides)
  loop
    perform set_config('request.jwt.claims', rls_test.claims(bad.overrides), true);
    select count(*) into n from rls_test.visible();
    if n <> 0 then raise exception '% returned % rows', bad.name, n; end if;
    select count(*) into n from public.sync_status;
    if n <> 0 then raise exception '% returned % sync_status rows', bad.name, n; end if;
  end loop;
end
$$;

-- No claims at all.
do $$ begin perform set_config('request.jwt.claims', '', true); end $$;
do $$
begin
  if (select count(*) from rls_test.visible()) <> 0 then
    raise exception 'a request without claims saw rows';
  end if;
end
$$;

-- ─── 4. authenticated cannot write anything ─────────────────────────────────
do $$ begin perform set_config('request.jwt.claims', rls_test.claims(), true); end $$;
do $$
declare
  t text;
  col text;
  stmt text;
begin
  foreach t in array array[
    'expenses', 'incomes', 'ledger_events', 'accounts', 'account_types',
    'account_transfers', 'account_entries', 'account_payments',
    'credit_card_bills', 'categories', 'sync_status',
    'sync_runs', 'sync_checkpoints', 'sync_failures'
  ] loop
    -- Column-free (or last-column) statements, so the probe fails on
    -- privilege and not on a column the table doesn't have.
    -- pg_attribute, not information_schema: the latter hides columns the
    -- current role has no privilege on.
    select attname into col from pg_attribute
    -- Last column: never an identity column here.
    where attrelid = format('public.%I', t)::regclass and attnum > 0 and not attisdropped
    order by attnum desc limit 1;
    foreach stmt in array array[
      format('insert into public.%I default values', t),
      format('update public.%I set %I = %I', t, col, col),
      format('delete from public.%I', t)
    ] loop
      begin
        execute stmt;
        raise exception 'authenticated could run: %', stmt;
      exception when insufficient_privilege then
        null;
      end;
    end loop;
  end loop;
end
$$;

-- Sync bookkeeping other than sync_status is unreadable.
do $$
declare
  t text;
begin
  foreach t in array array['sync_runs', 'sync_checkpoints', 'sync_failures'] loop
    begin
      execute format('select 1 from public.%I limit 1', t);
      raise exception 'authenticated could read %', t;
    exception when insufficient_privilege then
      null;
    end;
  end loop;
end
$$;

-- ─── 4b. SPENDLY-513: the cash-flow view only totals the caller's rows ──────
reset role;
insert into public.expenses (uid, doc_id, doc, source_path, source_update_time, source_deleted, amount, month) values
  ('user-a', 'cf-a1', '{}', 'users/user-a/expenses/cf-a1', now(), false, 100.25, '2026-01'),
  ('user-a', 'cf-a2', '{}', 'users/user-a/expenses/cf-a2', now(), true, 999.00, '2026-01'),
  ('user-b', 'cf-b1', '{}', 'users/user-b/expenses/cf-b1', now(), false, 555.00, '2026-01');
insert into public.incomes (uid, doc_id, doc, source_path, source_update_time, source_deleted, amount, month) values
  ('user-a', 'cf-a3', '{}', 'users/user-a/incomes/cf-a3', now(), false, 40.00, '2026-01');
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', rls_test.claims(), true); end $$;
do $$
declare
  r record;
  n integer;
begin
  select count(*) into n from public.v_cash_flow_by_month where uid <> 'user-a';
  if n <> 0 then
    raise exception 'user A saw another user''s cash flow';
  end if;
  select * into r from public.v_cash_flow_by_month where month = '2026-01';
  if r.total_expenses is distinct from 100.25 or r.total_income is distinct from 40.00 or r.transaction_count <> 2 then
    raise exception 'user A cash flow for 2026-01 is wrong: % / % / %', r.total_expenses, r.total_income, r.transaction_count;
  end if;
end
$$;
-- Other views stay closed to clients.
do $$
begin
  begin
    perform 1 from public.v_period_totals limit 1;
    raise exception 'authenticated could read v_period_totals';
  exception when insufficient_privilege then
    null;
  end;
end
$$;

-- ─── 5. anon reads nothing, even holding a valid user's claims ──────────────
reset role;
set local role anon;
do $$ begin perform set_config('request.jwt.claims', rls_test.claims(), true); end $$;
do $$
declare
  t text;
begin
  foreach t in array array[
    'expenses', 'incomes', 'ledger_events', 'accounts', 'account_types',
    'account_transfers', 'account_entries', 'account_payments',
    'credit_card_bills', 'categories',
    'sync_runs', 'sync_status', 'sync_checkpoints', 'sync_failures',
    'v_cash_flow_by_month'
  ] loop
    begin
      execute format('select 1 from public.%I limit 1', t);
      raise exception 'anon could read %', t;
    exception when insufficient_privilege then
      null;
    end;
  end loop;
  begin
    perform readmodel_auth.uid();
    raise exception 'anon could call readmodel_auth.uid()';
  exception when insufficient_privilege then
    null;
  end;
end
$$;

reset role;
rollback;

select 'read-model RLS behaviour tests passed' as result;
