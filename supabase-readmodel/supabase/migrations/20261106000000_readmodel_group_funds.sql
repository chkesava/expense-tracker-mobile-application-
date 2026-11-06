-- SPENDLY-685 (epic SPENDLY-678, Group Funds): users/{uid}/groupFunds and
-- users/{uid}/groupFundEvents in the read model.
--
-- The fund's stored totals (`totals.held` and the rest) stay in `doc` as an
-- exact copy (READ_MODEL_RULES R4.1; no typed column, R2.2: SQL never filters
-- or sums them). SQL never computes a fund balance, and the screens keep
-- reading the held amount from Firestore until a 14-day zero-difference shadow
-- passes. Group-fund account entries need nothing new:
-- they are ordinary account_entries rows (source group_fund_*).
--
-- On both allowlists: the app's dual write copies every commitMutations path.
--
-- Additive and re-runnable (R2.4): two new tables with their realtime ping
-- triggers (`if not exists` / `drop ... if exists`), then
-- `create or replace` of every function and view that lists the synced
-- tables, restated in full from 20261103000000.

-- ─── Tables ─────────────────────────────────────────────────────────────────

create table if not exists public.group_funds (
  uid                 text        not null,
  doc_id              text        not null,
  name                text,
  status              text,                  -- active | archived
  version             integer,
  created_at          timestamptz,           -- source `createdAtMs`
  doc                 jsonb       not null,
  source_path         text        not null,
  source_update_time  timestamptz not null,
  source_deleted      boolean     not null default false,
  deleted_at          timestamptz,
  schema_version      integer     not null default 1,
  mapping_status      text        not null default 'mapped' check (mapping_status in ('mapped', 'unmapped')),
  synced_at           timestamptz not null default now(),
  written_by          text        not null default 'server' check (written_by in ('client', 'server')),
  client_written_at   timestamptz,
  primary key (uid, doc_id)
);

create table if not exists public.group_fund_events (
  uid                 text        not null,
  doc_id              text        not null,
  fund_id             text,
  kind                text,                  -- opening | contribution | payout | transfer_* | account_move | reversal
  amount              numeric(18,2),
  purpose_id          text,
  member_id           text,
  date                date,
  period              text,                  -- YYYY-MM
  reversal_of         text,
  created_at          timestamptz,           -- source `createdAtMs`
  doc                 jsonb       not null,
  source_path         text        not null,
  source_update_time  timestamptz not null,
  source_deleted      boolean     not null default false,
  deleted_at          timestamptz,
  schema_version      integer     not null default 1,
  mapping_status      text        not null default 'mapped' check (mapping_status in ('mapped', 'unmapped')),
  synced_at           timestamptz not null default now(),
  written_by          text        not null default 'server' check (written_by in ('client', 'server')),
  client_written_at   timestamptz,
  primary key (uid, doc_id)
);
-- The history page: one fund's events, newest first, keyset on (created_at, doc_id).
create index if not exists group_fund_events_uid_fund_created_idx
  on public.group_fund_events (uid, fund_id, created_at desc, doc_id desc);

-- ─── Default deny, then owner-only SELECT (as SPENDLY-504/505) ──────────────

do $$
declare
  t text;
begin
  foreach t in array array['group_funds', 'group_fund_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_owner_read', t);
    execute format(
      'create policy %I on public.%I for select to authenticated '
      'using (uid = (select readmodel_auth.uid()) and not source_deleted)',
      t || '_owner_read', t
    );
  end loop;
end
$$;

-- ─── Realtime pings (SPENDLY-593) ───────────────────────────────────────────
-- 20261104000000 only covered the tables that existed then, so each new table
-- adds its own two triggers.

do $$
declare
  t text;
begin
  foreach t in array array['group_funds', 'group_fund_events'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_rm_ping_ins', t);
    execute format('drop trigger if exists %I on public.%I', t || '_rm_ping_upd', t);
    execute format(
      'create trigger %I after insert on public.%I referencing new table as changed '
      'for each statement execute function public.readmodel_ping()', t || '_rm_ping_ins', t);
    execute format(
      'create trigger %I after update on public.%I referencing new table as changed '
      'for each statement execute function public.readmodel_ping()', t || '_rm_ping_upd', t);
  end loop;
end
$$;


-- ─── Write paths: the server sync/push and the app's rm_client_apply ────────

create or replace function public.readmodel_sync_table_ok(p_table text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_table = any (array[
    'expenses', 'incomes', 'ledger_events', 'accounts', 'account_types',
    'account_transfers', 'account_entries', 'account_payments', 'credit_card_bills',
    'categories', 'financial_goals', 'goal_events', 'borrowings', 'borrowing_repayments',
    'receivables', 'receivable_repayments', 'subscriptions', 'investments', 'holdings',
    'portfolio_transactions', 'investment_cash_transactions', 'portfolio_settings',
    'epf_profile', 'epf_establishments', 'epf_contributions', 'epf_contribution_events',
    'epf_transfers', 'epf_transfer_events', 'epf_interest_entries', 'epf_reconciliations',
    'epf_wage_history', 'category_budgets', 'decisions', 'calendar_reminders',
    'fee_reviews', 'fee_signal_dismissals', 'merchant_overrides', 'recurring_dismissals',
    'spaces', 'categorization_rules', 'trips', 'runway_settings', 'runway_overrides',
    'what_if_scenarios', 'goal_funding_plans', 'sip_plans', 'sip_transactions',
    'virtual_positions', 'net_worth_history', 'watchlists', 'watchlist_items',
    'user_settings', 'financial_summaries', 'group_funds', 'group_fund_events'
  ])
$$;

create or replace function public.readmodel_client_table_ok(p_table text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_table = any (array[
    'expenses', 'incomes', 'ledger_events', 'accounts', 'account_types',
    'account_transfers', 'account_entries', 'account_payments', 'credit_card_bills',
    'categories', 'financial_goals', 'goal_events', 'borrowings', 'borrowing_repayments',
    'receivables', 'receivable_repayments', 'subscriptions', 'investments', 'holdings',
    'portfolio_transactions', 'investment_cash_transactions', 'portfolio_settings',
    'epf_profile', 'epf_establishments', 'epf_contributions', 'epf_contribution_events',
    'epf_transfers', 'epf_transfer_events', 'epf_interest_entries', 'epf_reconciliations',
    'epf_wage_history', 'category_budgets', 'decisions', 'calendar_reminders',
    'fee_reviews', 'fee_signal_dismissals', 'merchant_overrides', 'recurring_dismissals',
    'spaces', 'categorization_rules', 'trips', 'runway_settings', 'runway_overrides',
    'what_if_scenarios', 'goal_funding_plans', 'sip_plans', 'sip_transactions',
    'virtual_positions', 'net_worth_history', 'watchlists', 'watchlist_items',
    'financial_summaries', 'group_funds', 'group_fund_events'
  ])
$$;


-- ─── Account deletion: the purge covers the new tables (R5.1) ───────────────

create or replace function public.readmodel_purge_user(p_uid text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  t text;
  n integer;
  total integer := 0;
  counts jsonb := '{}'::jsonb;
  uids text[];
begin
  if coalesce(p_uid, '') = '' or right(p_uid, 7) = '_duress' then
    raise exception 'readmodel_purge_user: an account uid is required (not empty, not a duress uid)';
  end if;
  uids := array[p_uid, p_uid || '_duress'];

  foreach t in array array[
    'expenses', 'incomes', 'ledger_events', 'accounts', 'account_types',
    'account_transfers', 'account_entries', 'account_payments', 'credit_card_bills',
    'categories', 'financial_goals', 'goal_events', 'borrowings', 'borrowing_repayments',
    'receivables', 'receivable_repayments', 'subscriptions', 'investments', 'holdings',
    'portfolio_transactions', 'investment_cash_transactions', 'portfolio_settings',
    'epf_profile', 'epf_establishments', 'epf_contributions', 'epf_contribution_events',
    'epf_transfers', 'epf_transfer_events', 'epf_interest_entries', 'epf_reconciliations',
    'epf_wage_history', 'category_budgets', 'decisions', 'calendar_reminders',
    'fee_reviews', 'fee_signal_dismissals', 'merchant_overrides', 'recurring_dismissals',
    'spaces', 'categorization_rules', 'trips', 'runway_settings', 'runway_overrides',
    'what_if_scenarios', 'goal_funding_plans', 'sip_plans', 'sip_transactions',
    'virtual_positions', 'net_worth_history', 'watchlists', 'watchlist_items',
    'user_settings', 'financial_summaries', 'group_funds', 'group_fund_events',
    'sync_status', 'sync_checkpoints', 'sync_failures'
  ] loop
    execute format('delete from public.%I where uid = any($1)', t) using uids;
    get diagnostics n = row_count;
    counts := counts || jsonb_build_object(t, n);
    total := total + n;
  end loop;

  insert into public.purged_users (uid_hash) values (public.readmodel_uid_hash(p_uid))
  on conflict (uid_hash) do nothing;
  insert into public.purged_users (uid_hash) values (public.readmodel_uid_hash(p_uid || '_duress'))
  on conflict (uid_hash) do nothing;

  return jsonb_build_object('rows', total, 'tables', counts);
end
$$;


-- ─── Count parity (SPENDLY-509) ─────────────────────────────────────────────

create or replace function public.readmodel_live_counts()
returns table (uid text, collection text, live bigint)
language sql
stable
set search_path = ''
as $$
  select uid, 'expenses', count(*) from public.expenses where not source_deleted group by uid
  union all select uid, 'incomes', count(*) from public.incomes where not source_deleted group by uid
  union all select uid, 'ledgerEvents', count(*) from public.ledger_events where not source_deleted group by uid
  union all select uid, 'accounts', count(*) from public.accounts where not source_deleted group by uid
  union all select uid, 'accountTypes', count(*) from public.account_types where not source_deleted group by uid
  union all select uid, 'accountTransfers', count(*) from public.account_transfers where not source_deleted group by uid
  union all select uid, 'accountEntries', count(*) from public.account_entries where not source_deleted group by uid
  union all select uid, 'accountPayments', count(*) from public.account_payments where not source_deleted group by uid
  union all select uid, 'creditCardBills', count(*) from public.credit_card_bills where not source_deleted group by uid
  union all select uid, 'categories', count(*) from public.categories where not source_deleted group by uid
  union all select uid, 'financialGoals', count(*) from public.financial_goals where not source_deleted group by uid
  union all select uid, 'goalEvents', count(*) from public.goal_events where not source_deleted group by uid
  union all select uid, 'borrowings', count(*) from public.borrowings where not source_deleted group by uid
  union all select uid, 'borrowingRepayments', count(*) from public.borrowing_repayments where not source_deleted group by uid
  union all select uid, 'receivables', count(*) from public.receivables where not source_deleted group by uid
  union all select uid, 'receivableRepayments', count(*) from public.receivable_repayments where not source_deleted group by uid
  union all select uid, 'subscriptions', count(*) from public.subscriptions where not source_deleted group by uid
  union all select uid, 'investments', count(*) from public.investments where not source_deleted group by uid
  union all select uid, 'holdings', count(*) from public.holdings where not source_deleted group by uid
  union all select uid, 'portfolioTransactions', count(*) from public.portfolio_transactions where not source_deleted group by uid
  union all select uid, 'investmentCashTransactions', count(*) from public.investment_cash_transactions where not source_deleted group by uid
  union all select uid, 'portfolioSettings', count(*) from public.portfolio_settings where not source_deleted group by uid
  union all select uid, 'epfProfile', count(*) from public.epf_profile where not source_deleted group by uid
  union all select uid, 'epfEstablishments', count(*) from public.epf_establishments where not source_deleted group by uid
  union all select uid, 'epfContributions', count(*) from public.epf_contributions where not source_deleted group by uid
  union all select uid, 'epfContributionEvents', count(*) from public.epf_contribution_events where not source_deleted group by uid
  union all select uid, 'epfTransfers', count(*) from public.epf_transfers where not source_deleted group by uid
  union all select uid, 'epfTransferEvents', count(*) from public.epf_transfer_events where not source_deleted group by uid
  union all select uid, 'epfInterestEntries', count(*) from public.epf_interest_entries where not source_deleted group by uid
  union all select uid, 'epfReconciliations', count(*) from public.epf_reconciliations where not source_deleted group by uid
  union all select uid, 'epfWageHistory', count(*) from public.epf_wage_history where not source_deleted group by uid
  union all select uid, 'categoryBudgets', count(*) from public.category_budgets where not source_deleted group by uid
  union all select uid, 'decisions', count(*) from public.decisions where not source_deleted group by uid
  union all select uid, 'calendarReminders', count(*) from public.calendar_reminders where not source_deleted group by uid
  union all select uid, 'feeReviews', count(*) from public.fee_reviews where not source_deleted group by uid
  union all select uid, 'feeSignalDismissals', count(*) from public.fee_signal_dismissals where not source_deleted group by uid
  union all select uid, 'merchantOverrides', count(*) from public.merchant_overrides where not source_deleted group by uid
  union all select uid, 'recurringDismissals', count(*) from public.recurring_dismissals where not source_deleted group by uid
  union all select uid, 'spaces', count(*) from public.spaces where not source_deleted group by uid
  union all select uid, 'categorizationRules', count(*) from public.categorization_rules where not source_deleted group by uid
  union all select uid, 'trips', count(*) from public.trips where not source_deleted group by uid
  union all select uid, 'runwaySettings', count(*) from public.runway_settings where not source_deleted group by uid
  union all select uid, 'runwayOverrides', count(*) from public.runway_overrides where not source_deleted group by uid
  union all select uid, 'whatIfScenarios', count(*) from public.what_if_scenarios where not source_deleted group by uid
  union all select uid, 'goalFundingPlans', count(*) from public.goal_funding_plans where not source_deleted group by uid
  union all select uid, 'sipPlans', count(*) from public.sip_plans where not source_deleted group by uid
  union all select uid, 'sipTransactions', count(*) from public.sip_transactions where not source_deleted group by uid
  union all select uid, 'virtualPositions', count(*) from public.virtual_positions where not source_deleted group by uid
  union all select uid, 'netWorthHistory', count(*) from public.net_worth_history where not source_deleted group by uid
  union all select uid, 'watchlists', count(*) from public.watchlists where not source_deleted group by uid
  union all select uid, 'watchlists/items', count(*) from public.watchlist_items where not source_deleted group by uid
  union all select uid, 'userSettings', count(*) from public.user_settings where not source_deleted group by uid
  union all select uid, 'financialSummaries', count(*) from public.financial_summaries where not source_deleted group by uid
  union all select uid, 'groupFunds', count(*) from public.group_funds where not source_deleted group by uid
  union all select uid, 'groupFundEvents', count(*) from public.group_fund_events where not source_deleted group by uid
$$;


-- ─── Data quality: unmapped rows are flagged, never dropped (R2.2) ──────────

create or replace view public.v_data_quality with (security_invoker = true) as
  select uid, 'expenses' as collection, doc_id,
         case when mapping_status = 'unmapped' then 'unmapped'
              when amount is null then 'missing amount'
              else 'missing month and date' end as problem
  from public.v_active_expenses
  where mapping_status = 'unmapped' or amount is null or month is null
  union all
  select uid, 'incomes', doc_id,
         case when mapping_status = 'unmapped' then 'unmapped'
              when amount is null then 'missing amount'
              else 'missing month and date' end
  from public.v_active_incomes
  where mapping_status = 'unmapped' or amount is null or month is null
  union all
  select uid, 'accountPayments', doc_id, case when mapping_status = 'unmapped' then 'unmapped' else 'missing amount' end
  from public.account_payments where not source_deleted and (mapping_status = 'unmapped' or amount is null)
  union all
  select uid, 'accountTransfers', doc_id, case when mapping_status = 'unmapped' then 'unmapped' else 'missing amount or endpoint' end
  from public.account_transfers where not source_deleted
    and (mapping_status = 'unmapped' or amount is null or from_account_id is null or to_account_id is null)
  union all
  select uid, 'accountEntries', doc_id, case when mapping_status = 'unmapped' then 'unmapped' else 'missing amount or account' end
  from public.account_entries where not source_deleted and (mapping_status = 'unmapped' or amount is null or account_id is null)
  union all
  select uid, 'accounts', doc_id, 'unmapped' from public.accounts where not source_deleted and mapping_status = 'unmapped'
  union all
  select uid, 'creditCardBills', doc_id, 'unmapped' from public.credit_card_bills where not source_deleted and mapping_status = 'unmapped'
  union all
  select uid, 'categories', doc_id, 'unmapped' from public.categories where not source_deleted and mapping_status = 'unmapped'
  union all
  select uid, 'ledgerEvents', doc_id, 'unmapped' from public.ledger_events where not source_deleted and mapping_status = 'unmapped'
  union all
  select uid, 'accountTypes', doc_id, 'unmapped' from public.account_types where not source_deleted and mapping_status = 'unmapped'
  union all
  select uid, 'financialGoals', doc_id, 'unmapped' from public.financial_goals where not source_deleted and mapping_status = 'unmapped'
  union all
  select uid, 'goalEvents', doc_id, case when mapping_status = 'unmapped' then 'unmapped' else 'missing amount or goal' end
  from public.goal_events where not source_deleted and (mapping_status = 'unmapped' or amount_delta is null or goal_id is null)
  union all
  select uid, 'borrowings', doc_id, case when mapping_status = 'unmapped' then 'unmapped' else 'missing principal' end
  from public.borrowings where not source_deleted and (mapping_status = 'unmapped' or principal_amount is null)
  union all
  select uid, 'borrowingRepayments', doc_id, case when mapping_status = 'unmapped' then 'unmapped' else 'missing amount or borrowing' end
  from public.borrowing_repayments where not source_deleted and (mapping_status = 'unmapped' or amount is null or borrowing_id is null)
  union all
  select uid, 'receivables', doc_id, case when mapping_status = 'unmapped' then 'unmapped' else 'missing amount' end
  from public.receivables where not source_deleted and (mapping_status = 'unmapped' or original_amount is null)
  union all
  select uid, 'receivableRepayments', doc_id, case when mapping_status = 'unmapped' then 'unmapped' else 'missing amount or receivable' end
  from public.receivable_repayments where not source_deleted and (mapping_status = 'unmapped' or amount is null or receivable_id is null)
  union all
  select uid, 'subscriptions', doc_id, 'unmapped' from public.subscriptions where not source_deleted and mapping_status = 'unmapped'
  union all
  select uid, 'investments', doc_id, 'unmapped' from public.investments where not source_deleted and mapping_status = 'unmapped'
  union all
  select uid, 'holdings', doc_id, 'unmapped' from public.holdings where not source_deleted and mapping_status = 'unmapped'
  union all
  select uid, 'portfolioTransactions', doc_id, 'unmapped' from public.portfolio_transactions where not source_deleted and mapping_status = 'unmapped'
  union all
  select uid, 'investmentCashTransactions', doc_id, 'unmapped' from public.investment_cash_transactions where not source_deleted and mapping_status = 'unmapped'
  union all
  select uid, 'portfolioSettings', doc_id, 'unmapped' from public.portfolio_settings where not source_deleted and mapping_status = 'unmapped'
  union all
  select uid, 'epfProfile', doc_id, 'unmapped' from public.epf_profile where not source_deleted and mapping_status = 'unmapped'
  union all
  select uid, 'epfEstablishments', doc_id, 'unmapped' from public.epf_establishments where not source_deleted and mapping_status = 'unmapped'
  union all
  select uid, 'epfContributions', doc_id, 'unmapped' from public.epf_contributions where not source_deleted and mapping_status = 'unmapped'
  union all
  select uid, 'epfContributionEvents', doc_id, 'unmapped' from public.epf_contribution_events where not source_deleted and mapping_status = 'unmapped'
  union all
  select uid, 'epfTransfers', doc_id, 'unmapped' from public.epf_transfers where not source_deleted and mapping_status = 'unmapped'
  union all
  select uid, 'epfTransferEvents', doc_id, 'unmapped' from public.epf_transfer_events where not source_deleted and mapping_status = 'unmapped'
  union all
  select uid, 'epfInterestEntries', doc_id, 'unmapped' from public.epf_interest_entries where not source_deleted and mapping_status = 'unmapped'
  union all
  select uid, 'epfReconciliations', doc_id, 'unmapped' from public.epf_reconciliations where not source_deleted and mapping_status = 'unmapped'
  union all
  select uid, 'epfWageHistory', doc_id, 'unmapped' from public.epf_wage_history where not source_deleted and mapping_status = 'unmapped'
  union all
  select uid, 'categoryBudgets', doc_id, 'unmapped' from public.category_budgets where not source_deleted and mapping_status = 'unmapped'
  union all
  select uid, 'decisions', doc_id, 'unmapped' from public.decisions where not source_deleted and mapping_status = 'unmapped'
  union all
  select uid, 'calendarReminders', doc_id, 'unmapped' from public.calendar_reminders where not source_deleted and mapping_status = 'unmapped'
  union all
  select uid, 'feeReviews', doc_id, 'unmapped' from public.fee_reviews where not source_deleted and mapping_status = 'unmapped'
  union all
  select uid, 'feeSignalDismissals', doc_id, 'unmapped' from public.fee_signal_dismissals where not source_deleted and mapping_status = 'unmapped'
  union all
  select uid, 'merchantOverrides', doc_id, 'unmapped' from public.merchant_overrides where not source_deleted and mapping_status = 'unmapped'
  union all
  select uid, 'recurringDismissals', doc_id, 'unmapped' from public.recurring_dismissals where not source_deleted and mapping_status = 'unmapped'
  union all
  select uid, 'spaces', doc_id, 'unmapped' from public.spaces where not source_deleted and mapping_status = 'unmapped'
  union all
  select uid, 'categorizationRules', doc_id, 'unmapped' from public.categorization_rules where not source_deleted and mapping_status = 'unmapped'
  union all
  select uid, 'trips', doc_id, 'unmapped' from public.trips where not source_deleted and mapping_status = 'unmapped'
  union all
  select uid, 'runwaySettings', doc_id, 'unmapped' from public.runway_settings where not source_deleted and mapping_status = 'unmapped'
  union all
  select uid, 'runwayOverrides', doc_id, 'unmapped' from public.runway_overrides where not source_deleted and mapping_status = 'unmapped'
  union all
  select uid, 'whatIfScenarios', doc_id, 'unmapped' from public.what_if_scenarios where not source_deleted and mapping_status = 'unmapped'
  union all
  select uid, 'goalFundingPlans', doc_id, 'unmapped' from public.goal_funding_plans where not source_deleted and mapping_status = 'unmapped'
  union all
  select uid, 'sipPlans', doc_id, 'unmapped' from public.sip_plans where not source_deleted and mapping_status = 'unmapped'
  union all
  select uid, 'sipTransactions', doc_id, 'unmapped' from public.sip_transactions where not source_deleted and mapping_status = 'unmapped'
  union all
  select uid, 'virtualPositions', doc_id, 'unmapped' from public.virtual_positions where not source_deleted and mapping_status = 'unmapped'
  union all
  select uid, 'netWorthHistory', doc_id, 'unmapped' from public.net_worth_history where not source_deleted and mapping_status = 'unmapped'
  union all
  select uid, 'watchlists', doc_id, 'unmapped' from public.watchlists where not source_deleted and mapping_status = 'unmapped'
  union all
  select uid, 'watchlists/items', doc_id, 'unmapped' from public.watchlist_items where not source_deleted and mapping_status = 'unmapped'
  union all
  select uid, 'userSettings', doc_id, 'unmapped' from public.user_settings where not source_deleted and mapping_status = 'unmapped'
  union all
  select uid, 'financialSummaries', doc_id, 'unmapped' from public.financial_summaries where not source_deleted and mapping_status = 'unmapped'
  union all
  select uid, 'groupFunds', doc_id, 'unmapped' from public.group_funds where not source_deleted and mapping_status = 'unmapped'
  union all
  select uid, 'groupFundEvents', doc_id, case when mapping_status = 'unmapped' then 'unmapped' else 'missing amount or fund' end
  from public.group_fund_events where not source_deleted and (mapping_status = 'unmapped' or amount is null or fund_id is null);


-- Unchanged grants on the functions restated above (service role only).
revoke all on function public.readmodel_sync_table_ok(text) from public, anon, authenticated;
revoke all on function public.readmodel_client_table_ok(text) from public, anon, authenticated;
revoke all on function public.readmodel_purge_user(text) from public, anon, authenticated;
revoke all on function public.readmodel_live_counts() from public, anon, authenticated;
grant execute on function public.readmodel_sync_table_ok(text) to service_role;
grant execute on function public.readmodel_client_table_ok(text) to service_role;
grant execute on function public.readmodel_purge_user(text) to service_role;
grant execute on function public.readmodel_live_counts() to service_role;
