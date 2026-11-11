-- SPENDLY-504 acceptance checks. Run after the migrations; any failure raises,
-- so `psql -v ON_ERROR_STOP=1` exits non-zero.

-- 1. Every expected table exists.
do $$
declare
  missing text;
begin
  select string_agg(t, ', ') into missing
  from unnest(array[
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
    'sip_transactions', 'virtual_positions', 'net_worth_history', 'watchlists', 'watchlist_items', 'user_settings', 'financial_summaries', 'group_funds', 'group_fund_events', 'devices', 'notifications', 'recurring_suggestions', 'server_results', 'tax_profiles', 'tax_entries', 'tax_reviews', 'tax_documents', 'tax_snapshots',
    'salary_profiles', 'salary_records', 'salary_reviews',
    'sync_runs', 'sync_status', 'sync_checkpoints', 'sync_failures'
  ]) as t
  where not exists (select 1 from pg_tables where schemaname = 'public' and tablename = t);
  if missing is not null then
    raise exception 'missing read-model tables: %', missing;
  end if;
end
$$;

-- 2. RLS is enabled on every public table.
do $$
declare
  open_tables text;
begin
  select string_agg(tablename, ', ') into open_tables
  from pg_tables
  where schemaname = 'public' and not rowsecurity;
  if open_tables is not null then
    raise exception 'tables without row level security: %', open_tables;
  end if;
end
$$;

-- 3. anon holds no table privileges in public; authenticated holds SELECT
--    only, and only on the user-data tables plus sync_status (SPENDLY-505)
--    and the views the Phase 3 screens read (SPENDLY-513).
do $$
declare
  grants text;
begin
  select string_agg(format('%s:%s:%s', grantee, table_name, privilege_type), ', ') into grants
  from information_schema.role_table_grants
  where table_schema = 'public'
    and (
      grantee = 'anon'
      or (grantee = 'authenticated' and (
        privilege_type <> 'SELECT'
        or table_name not in (
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
    'sip_transactions', 'virtual_positions', 'net_worth_history', 'watchlists', 'watchlist_items', 'user_settings', 'financial_summaries', 'group_funds', 'group_fund_events', 'devices', 'notifications', 'recurring_suggestions', 'server_results', 'tax_profiles', 'tax_entries', 'tax_reviews', 'tax_documents', 'tax_snapshots',
    'salary_profiles', 'salary_records', 'salary_reviews', 'sync_status',
          'v_active_expenses', 'v_active_incomes', 'v_cash_flow_by_month'
        )
      ))
    );
  if grants is not null then
    raise exception 'client roles hold unexpected grants: %', grants;
  end if;
end
$$;

-- 3b. Effective privileges (PR #234 review): role_table_grants doesn't list
--     grants to PUBLIC, so also check what anon can actually do on every
--     table, view and materialized view, including through PUBLIC.
do $$
declare
  leaked text;
begin
  select string_agg(format('%s:%s', c.relname, p.priv), ', ') into leaked
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) as p(priv)
  where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p')
    and has_table_privilege('anon', c.oid, p.priv);
  if leaked is not null then
    raise exception 'anon (directly or via PUBLIC) holds privileges: %', leaked;
  end if;
end
$$;

-- 4. Exactly one owner-read policy per readable table: SELECT, for
--    authenticated, keyed on readmodel_auth.uid(). No write policies at all.
do $$
declare
  bad text;
  n integer;
begin
  select string_agg(format('%s.%s', tablename, policyname), ', ') into bad
  from pg_policies
  where schemaname = 'public'
    and (cmd <> 'SELECT' or roles <> array['authenticated']::name[]
         or qual not like '%readmodel_auth.uid()%');
  if bad is not null then
    raise exception 'unexpected policies: %', bad;
  end if;
  select count(*) into n from pg_policies where schemaname = 'public';
  if n <> 68 then  -- 10 Wave 1 + sync_status + SPENDLY-609 goals (2) + SPENDLY-589 Wave 2 (5) + SPENDLY-590 Wave 3 (14) + SPENDLY-591 (21) + SPENDLY-592 (1) + SPENDLY-685 group funds (2) + SPENDLY-224 devices (1) + SPENDLY-230 notifications (1) + SPENDLY-744 recurring suggestions (1) + SPENDLY-747 server results (1) + SPENDLY-709 tax (5) + SPENDLY-325 salary (3)
    raise exception 'expected 68 owner-read policies, found %', n;
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename in ('sync_runs', 'sync_checkpoints', 'sync_failures')
  ) then
    raise exception 'sync bookkeeping must stay server-only';
  end if;
end
$$;

-- 4b. The identity helper is not callable by anon or by PUBLIC.
do $$
begin
  if has_function_privilege('anon', 'readmodel_auth.uid()', 'execute') then
    raise exception 'anon can execute readmodel_auth.uid()';
  end if;
  if not has_function_privilege('authenticated', 'readmodel_auth.uid()', 'execute') then
    raise exception 'authenticated cannot execute readmodel_auth.uid()';
  end if;
end
$$;

-- 5. A table created after the migration is not granted to client roles.
create table public._grant_probe (id int);
do $$
begin
  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public' and table_name = '_grant_probe'
      and grantee in ('anon', 'authenticated')
  ) then
    raise exception 'default privileges still grant new tables to client roles';
  end if;
end
$$;
drop table public._grant_probe;

-- 6. Every user-data table carries the sync contract columns and key.
do $$
declare
  bad text;
begin
  select string_agg(t, ', ') into bad
  from unnest(array[
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
    'sip_transactions', 'virtual_positions', 'net_worth_history', 'watchlists', 'watchlist_items', 'user_settings', 'financial_summaries', 'group_funds', 'group_fund_events', 'devices', 'notifications', 'recurring_suggestions', 'server_results', 'tax_profiles', 'tax_entries', 'tax_reviews', 'tax_documents', 'tax_snapshots',
    'salary_profiles', 'salary_records', 'salary_reviews'
  ]) as t
  where (
    select count(*) from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = t
      and c.column_name in ('uid', 'doc_id', 'doc', 'source_path', 'source_update_time',
                            'source_deleted', 'deleted_at', 'schema_version',
                            'mapping_status', 'synced_at')
  ) <> 10
  or not exists (
    select 1 from information_schema.table_constraints tc
    join information_schema.key_column_usage k
      on k.constraint_name = tc.constraint_name and k.table_schema = tc.table_schema
    where tc.table_schema = 'public' and tc.table_name = t and tc.constraint_type = 'PRIMARY KEY'
    group by tc.constraint_name
    having array_agg(k.column_name::text order by k.ordinal_position) = array['uid', 'doc_id']
  );
  if bad is not null then
    raise exception 'tables missing the sync contract: %', bad;
  end if;
end
$$;

-- 7. Money columns are exact numerics, never floating point.
do $$
declare
  floats text;
begin
  select string_agg(format('%s.%s', table_name, column_name), ', ') into floats
  from information_schema.columns
  where table_schema = 'public' and data_type in ('real', 'double precision');
  if floats is not null then
    raise exception 'floating point columns found: %', floats;
  end if;
end
$$;

-- 8. SPENDLY-669: the app's only write path. rm_client_apply is security
--    definer with a fixed search_path, callable by authenticated only; every
--    synced table records who wrote each row.
do $$
declare
  fn oid := 'public.rm_client_apply(text, jsonb, jsonb)'::regprocedure;
  missing text;
begin
  if not (select prosecdef from pg_proc where oid = fn) then
    raise exception 'rm_client_apply must be security definer';
  end if;
  if not exists (select 1 from pg_proc where oid = fn and 'search_path=""' = any (proconfig)) then
    raise exception 'rm_client_apply must pin search_path to empty';
  end if;
  if has_function_privilege('anon', fn, 'execute') then
    raise exception 'anon (directly or via PUBLIC) can execute rm_client_apply';
  end if;
  if not has_function_privilege('authenticated', fn, 'execute') then
    raise exception 'authenticated cannot execute rm_client_apply';
  end if;
  if has_function_privilege('authenticated', 'public.readmodel_upsert(text, jsonb)'::regprocedure, 'execute')
     or has_function_privilege('authenticated', 'public.readmodel_repair(text, jsonb)'::regprocedure, 'execute')
     or has_function_privilege('authenticated', 'public.readmodel_tombstone(text, text, text[])'::regprocedure, 'execute') then
    raise exception 'a server write function is executable by authenticated';
  end if;
  select string_agg(t, ', ') into missing
  from unnest(array[
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
    'sip_transactions', 'virtual_positions', 'net_worth_history', 'watchlists', 'watchlist_items', 'user_settings', 'financial_summaries', 'group_funds', 'group_fund_events', 'devices', 'notifications', 'recurring_suggestions', 'server_results', 'tax_profiles', 'tax_entries', 'tax_reviews', 'tax_documents', 'tax_snapshots',
    'salary_profiles', 'salary_records', 'salary_reviews'
  ]) as t
  where (
    select count(*) from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = t
      and c.column_name in ('written_by', 'client_written_at')
  ) <> 2;
  if missing is not null then
    raise exception 'tables missing written_by/client_written_at: %', missing;
  end if;
  -- SPENDLY-591: the users/{uid} copy is server-only; the app can never write it.
  if public.readmodel_client_table_ok('user_settings') or not public.readmodel_sync_table_ok('user_settings') then
    raise exception 'user_settings must be on the sync allowlist only';
  end if;
end
$$;

-- 9. SPENDLY-593: realtime. Every synced table pings its owner's private topic
--    (insert and update statement triggers); the ping function and the
--    catch-up function are security definer with a pinned search_path; only
--    authenticated may catch up; only a topic's owner may join it.
do $$
declare
  missing text;
  fn regprocedure;
begin
  select string_agg(c.table_name, ', ' order by c.table_name) into missing
  from information_schema.columns c
  where c.table_schema = 'public' and c.column_name = 'written_by' and public.readmodel_sync_table_ok(c.table_name)
    and (select count(*) from pg_trigger g
         where g.tgrelid = format('public.%I', c.table_name)::regclass
           and g.tgname in (c.table_name || '_rm_ping_ins', c.table_name || '_rm_ping_upd')) <> 2;
  if missing is not null then
    raise exception 'synced tables without both realtime ping triggers: %', missing;
  end if;
  foreach fn in array array['public.readmodel_ping()'::regprocedure, 'public.readmodel_changes_since(timestamptz, integer)'::regprocedure] loop
    if not (select prosecdef from pg_proc where oid = fn) or not exists (select 1 from pg_proc where oid = fn and 'search_path=""' = any (proconfig)) then
      raise exception '% must be security definer with an empty search_path', fn;
    end if;
  end loop;
  if has_function_privilege('anon', 'public.readmodel_changes_since(timestamptz, integer)', 'execute')
     or not has_function_privilege('authenticated', 'public.readmodel_changes_since(timestamptz, integer)', 'execute') then
    raise exception 'readmodel_changes_since: authenticated only';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'realtime' and tablename = 'messages' and policyname = 'readmodel_user_topic_read') then
    raise exception 'the private-topic policy on realtime.messages is missing';
  end if;
end
$$;

-- 10. SPENDLY-595: the Free-plan capacity reading is numbers only, for the
--     health check (service role), never for clients.
do $$
declare
  fn regprocedure := 'public.readmodel_capacity()'::regprocedure;
  c jsonb;
begin
  if not (select prosecdef from pg_proc where oid = fn) or not exists (select 1 from pg_proc where oid = fn and 'search_path=""' = any (proconfig)) then
    raise exception 'readmodel_capacity must be security definer with an empty search_path';
  end if;
  if has_function_privilege('anon', fn, 'execute') or has_function_privilege('authenticated', fn, 'execute')
     or not has_function_privilege('service_role', fn, 'execute') then
    raise exception 'readmodel_capacity: service_role only';
  end if;
  c := public.readmodel_capacity();
  if (c->>'db_bytes')::bigint <= 0 or not (c ? 'realtime_messages_24h') or jsonb_typeof(c->'largest_tables') <> 'array' then
    raise exception 'readmodel_capacity returned %', c;
  end if;
  if (select count(*) from jsonb_object_keys(c)) <> 3 then
    raise exception 'readmodel_capacity returns exactly db_bytes, realtime_messages_24h, largest_tables: %', c;
  end if;
end
$$;

-- 11. SPENDLY-737: the bill-run queue is server-only. No client grants or
--     policies on its tables; its functions are definers with an empty
--     search_path that no client role can execute; every bill input carries
--     both queue triggers.
do $$
declare
  fn regprocedure;
  t text;
  missing text;
begin
  foreach t in array array['server_run_queue', 'server_run_dispatches'] loop
    if has_table_privilege('authenticated', 'public.' || t, 'select')
       or has_table_privilege('anon', 'public.' || t, 'select')
       or has_table_privilege('authenticated', 'public.' || t, 'insert')
       or has_table_privilege('authenticated', 'public.' || t, 'delete') then
      raise exception '% must be server-only', t;
    end if;
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = t) then
      raise exception '% must have no policies', t;
    end if;
  end loop;
  foreach fn in array array[
    'public.server_run_dispatch(text)'::regprocedure,
    'public.server_run_note_bill_inputs()'::regprocedure,
    'public.server_run_forget_purged()'::regprocedure
  ] loop
    if not (select p.prosecdef and p.proconfig @> array['search_path=""'] from pg_proc p where p.oid = fn) then
      raise exception '% must be security definer with an empty search_path', fn;
    end if;
    if has_function_privilege('authenticated', fn, 'execute') or has_function_privilege('anon', fn, 'execute') then
      raise exception '% must not be executable by client roles', fn;
    end if;
  end loop;
  select string_agg(x, ', ') into missing
  from unnest(array['expenses', 'account_payments', 'credit_card_bills', 'accounts']) as x
  where (
    select count(*) from pg_trigger g join pg_class c on c.oid = g.tgrelid
    where c.relname = x and g.tgname in (x || '_bill_run_ins', x || '_bill_run_upd') and not g.tgisinternal
  ) <> 2;
  if missing is not null then
    raise exception 'bill inputs without both bill-run triggers: %', missing;
  end if;
end
$$;

select 'read-model security assertions passed' as result;

-- 7. SPENDLY-513: the Phase 3 views run as the caller (security_invoker), so
--    RLS applies through them; a definer view would bypass it.
do $$
declare
  bad text;
begin
  select string_agg(c.relname, ', ') into bad
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'v'
    and c.relname in ('v_active_expenses', 'v_active_incomes', 'v_cash_flow_by_month')
    and not coalesce('security_invoker=true' = any(c.reloptions), false);
  if bad is not null then
    raise exception 'client-readable views must be security_invoker: %', bad;
  end if;
end
$$;
