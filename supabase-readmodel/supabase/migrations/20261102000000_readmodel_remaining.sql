-- SPENDLY-591 (epic SPENDLY-586, plan v2), part A: the remaining flat user
-- collections that screens read: budgets, decisions, reminders, fee reviews
-- and dismissals, merchant corrections, recurring dismissals, spaces,
-- categorisation rules, trips, runway settings and overrides, What-If
-- scenarios, goal funding plans, SIP plans/transactions/positions, net-worth
-- history and watchlists (the list documents).
--
-- Firestore is the source of truth (READ_MODEL_RULES R1.1). Stored values
-- (trip spent amount, SIP totals, positions) are copies (R4.1). Arrays and
-- maps (decision context, reminder completions, net-worth daily points, What-If
-- adjustments) stay in `doc` only.
--
-- Later parts of 591: the watchlist items (the first nested collection) and
-- the users/{uid} settings document.
--
-- Additive: new tables, then `create or replace` of every function and view
-- that lists the synced tables, restated in full.

-- ─── Tables ─────────────────────────────────────────────────────────────────

create table public.category_budgets (
  uid                           text        not null,
  doc_id                        text        not null,
  category                      text,
  subcategory                   text,
  amount                        numeric(18,2),
  month                         text,
  created_at                    timestamptz,
  doc                           jsonb       not null,
  source_path                   text        not null,
  source_update_time            timestamptz not null,
  source_deleted                boolean     not null default false,
  deleted_at                    timestamptz,
  schema_version                integer     not null default 1,
  mapping_status                text        not null default 'mapped' check (mapping_status in ('mapped', 'unmapped')),
  synced_at                     timestamptz not null default now(),
  written_by                    text        not null default 'server' check (written_by in ('client', 'server')),
  client_written_at             timestamptz,
  primary key (uid, doc_id)
);
create index if not exists category_budgets_idx1 on public.category_budgets (uid, month desc);
create index if not exists category_budgets_idx2 on public.category_budgets (uid, category);

create table public.decisions (
  uid                           text        not null,
  doc_id                        text        not null,
  title                         text,
  category                      text,
  status                        text,
  archived_from_status          text,
  template_id                   text,
  template_version              integer,
  review_date                   date,
  confidence                    integer,
  selected_alternative_id       text,
  revision                      integer,
  created_at                    timestamptz,
  updated_at                    timestamptz,
  decided_at                    timestamptz,
  closed_at                     timestamptz,
  doc                           jsonb       not null,
  source_path                   text        not null,
  source_update_time            timestamptz not null,
  source_deleted                boolean     not null default false,
  deleted_at                    timestamptz,
  schema_version                integer     not null default 1,
  mapping_status                text        not null default 'mapped' check (mapping_status in ('mapped', 'unmapped')),
  synced_at                     timestamptz not null default now(),
  written_by                    text        not null default 'server' check (written_by in ('client', 'server')),
  client_written_at             timestamptz,
  primary key (uid, doc_id)
);
create index if not exists decisions_idx1 on public.decisions (uid, status);

create table public.calendar_reminders (
  uid                           text        not null,
  doc_id                        text        not null,
  title                         text,
  category                      text,
  recurrence                    text,
  start_date                    date,
  until_date                    date,
  reminder_time                 text,
  estimated_amount              numeric(18,2),
  interval_days                 integer,
  remind_days_before            integer,
  created_at                    timestamptz,
  updated_at                    timestamptz,
  doc                           jsonb       not null,
  source_path                   text        not null,
  source_update_time            timestamptz not null,
  source_deleted                boolean     not null default false,
  deleted_at                    timestamptz,
  schema_version                integer     not null default 1,
  mapping_status                text        not null default 'mapped' check (mapping_status in ('mapped', 'unmapped')),
  synced_at                     timestamptz not null default now(),
  written_by                    text        not null default 'server' check (written_by in ('client', 'server')),
  client_written_at             timestamptz,
  primary key (uid, doc_id)
);
create index if not exists calendar_reminders_idx1 on public.calendar_reminders (uid, start_date);

create table public.fee_reviews (
  uid                           text        not null,
  doc_id                        text        not null,
  source_kind                   text,
  source_id                     text,
  decision                      text,
  role                          text,
  fee_type                      text,
  subtype                       text,
  linked_kind                   text,
  linked_id                     text,
  source_amount                 numeric(18,2),
  inferred_confidence           numeric(24,8),
  engine_version                integer,
  revision                      integer,
  created_at                    timestamptz,
  updated_at                    timestamptz,
  doc                           jsonb       not null,
  source_path                   text        not null,
  source_update_time            timestamptz not null,
  source_deleted                boolean     not null default false,
  deleted_at                    timestamptz,
  schema_version                integer     not null default 1,
  mapping_status                text        not null default 'mapped' check (mapping_status in ('mapped', 'unmapped')),
  synced_at                     timestamptz not null default now(),
  written_by                    text        not null default 'server' check (written_by in ('client', 'server')),
  client_written_at             timestamptz,
  primary key (uid, doc_id)
);
create index if not exists fee_reviews_idx1 on public.fee_reviews (uid, source_kind, source_id);

create table public.fee_signal_dismissals (
  uid                           text        not null,
  doc_id                        text        not null,
  kind                          text,
  resolution                    text,
  at                            timestamptz,
  doc                           jsonb       not null,
  source_path                   text        not null,
  source_update_time            timestamptz not null,
  source_deleted                boolean     not null default false,
  deleted_at                    timestamptz,
  schema_version                integer     not null default 1,
  mapping_status                text        not null default 'mapped' check (mapping_status in ('mapped', 'unmapped')),
  synced_at                     timestamptz not null default now(),
  written_by                    text        not null default 'server' check (written_by in ('client', 'server')),
  client_written_at             timestamptz,
  primary key (uid, doc_id)
);

create table public.merchant_overrides (
  uid                           text        not null,
  doc_id                        text        not null,
  kind                          text,
  ref_key                       text,
  merchant_id                   text,
  custom_name                   text,
  rejected                      boolean,
  category                      text,
  subcategory                   text,
  created_at                    timestamptz,
  updated_at                    timestamptz,
  doc                           jsonb       not null,
  source_path                   text        not null,
  source_update_time            timestamptz not null,
  source_deleted                boolean     not null default false,
  deleted_at                    timestamptz,
  schema_version                integer     not null default 1,
  mapping_status                text        not null default 'mapped' check (mapping_status in ('mapped', 'unmapped')),
  synced_at                     timestamptz not null default now(),
  written_by                    text        not null default 'server' check (written_by in ('client', 'server')),
  client_written_at             timestamptz,
  primary key (uid, doc_id)
);

create table public.recurring_dismissals (
  uid                           text        not null,
  doc_id                        text        not null,
  merchant_key                  text,
  reason                        text,
  dismissed_at                  timestamptz,
  doc                           jsonb       not null,
  source_path                   text        not null,
  source_update_time            timestamptz not null,
  source_deleted                boolean     not null default false,
  deleted_at                    timestamptz,
  schema_version                integer     not null default 1,
  mapping_status                text        not null default 'mapped' check (mapping_status in ('mapped', 'unmapped')),
  synced_at                     timestamptz not null default now(),
  written_by                    text        not null default 'server' check (written_by in ('client', 'server')),
  client_written_at             timestamptz,
  primary key (uid, doc_id)
);

create table public.spaces (
  uid                           text        not null,
  doc_id                        text        not null,
  name                          text,
  description                   text,
  color                         text,
  icon                          text,
  budget                        numeric(18,2),
  start_date                    date,
  end_date                      date,
  status                        text,
  created_at                    timestamptz,
  updated_at                    timestamptz,
  doc                           jsonb       not null,
  source_path                   text        not null,
  source_update_time            timestamptz not null,
  source_deleted                boolean     not null default false,
  deleted_at                    timestamptz,
  schema_version                integer     not null default 1,
  mapping_status                text        not null default 'mapped' check (mapping_status in ('mapped', 'unmapped')),
  synced_at                     timestamptz not null default now(),
  written_by                    text        not null default 'server' check (written_by in ('client', 'server')),
  client_written_at             timestamptz,
  primary key (uid, doc_id)
);
create index if not exists spaces_idx1 on public.spaces (uid, name);

create table public.categorization_rules (
  uid                           text        not null,
  doc_id                        text        not null,
  keyword                       text,
  category                      text,
  subcategory                   text,
  created_at                    timestamptz,
  doc                           jsonb       not null,
  source_path                   text        not null,
  source_update_time            timestamptz not null,
  source_deleted                boolean     not null default false,
  deleted_at                    timestamptz,
  schema_version                integer     not null default 1,
  mapping_status                text        not null default 'mapped' check (mapping_status in ('mapped', 'unmapped')),
  synced_at                     timestamptz not null default now(),
  written_by                    text        not null default 'server' check (written_by in ('client', 'server')),
  client_written_at             timestamptz,
  primary key (uid, doc_id)
);
create index if not exists categorization_rules_idx1 on public.categorization_rules (uid, created_at);

create table public.trips (
  uid                           text        not null,
  doc_id                        text        not null,
  destination                   text,
  trip_name                     text,
  start_date                    text,
  end_date                      text,
  total_budget                  numeric(18,2),
  spent_amount                  numeric(18,2),
  status                        text,
  created_at                    timestamptz,
  doc                           jsonb       not null,
  source_path                   text        not null,
  source_update_time            timestamptz not null,
  source_deleted                boolean     not null default false,
  deleted_at                    timestamptz,
  schema_version                integer     not null default 1,
  mapping_status                text        not null default 'mapped' check (mapping_status in ('mapped', 'unmapped')),
  synced_at                     timestamptz not null default now(),
  written_by                    text        not null default 'server' check (written_by in ('client', 'server')),
  client_written_at             timestamptz,
  primary key (uid, doc_id)
);
create index if not exists trips_idx1 on public.trips (uid, start_date desc);

create table public.runway_settings (
  uid                           text        not null,
  doc_id                        text        not null,
  mode                          text,
  threshold_kind                text,
  threshold_amount              numeric(18,2),
  threshold_months              numeric(24,8),
  window_months                 integer,
  method                        text,
  include_unusual               boolean,
  projection_months             integer,
  updated_at                    timestamptz,
  doc                           jsonb       not null,
  source_path                   text        not null,
  source_update_time            timestamptz not null,
  source_deleted                boolean     not null default false,
  deleted_at                    timestamptz,
  schema_version                integer     not null default 1,
  mapping_status                text        not null default 'mapped' check (mapping_status in ('mapped', 'unmapped')),
  synced_at                     timestamptz not null default now(),
  written_by                    text        not null default 'server' check (written_by in ('client', 'server')),
  client_written_at             timestamptz,
  primary key (uid, doc_id)
);

create table public.runway_overrides (
  uid                           text        not null,
  doc_id                        text        not null,
  kind                          text,
  ref_id                        text,
  included                      boolean,
  updated_at                    timestamptz,
  doc                           jsonb       not null,
  source_path                   text        not null,
  source_update_time            timestamptz not null,
  source_deleted                boolean     not null default false,
  deleted_at                    timestamptz,
  schema_version                integer     not null default 1,
  mapping_status                text        not null default 'mapped' check (mapping_status in ('mapped', 'unmapped')),
  synced_at                     timestamptz not null default now(),
  written_by                    text        not null default 'server' check (written_by in ('client', 'server')),
  client_written_at             timestamptz,
  primary key (uid, doc_id)
);

create table public.what_if_scenarios (
  uid                           text        not null,
  doc_id                        text        not null,
  name                          text,
  version                       integer,
  engine_version                integer,
  duration_months               integer,
  archived                      boolean,
  created_at                    timestamptz,
  updated_at                    timestamptz,
  doc                           jsonb       not null,
  source_path                   text        not null,
  source_update_time            timestamptz not null,
  source_deleted                boolean     not null default false,
  deleted_at                    timestamptz,
  schema_version                integer     not null default 1,
  mapping_status                text        not null default 'mapped' check (mapping_status in ('mapped', 'unmapped')),
  synced_at                     timestamptz not null default now(),
  written_by                    text        not null default 'server' check (written_by in ('client', 'server')),
  client_written_at             timestamptz,
  primary key (uid, doc_id)
);

create table public.goal_funding_plans (
  uid                           text        not null,
  doc_id                        text        not null,
  name                          text,
  mode                          text,
  planned_monthly               numeric(18,2),
  allow_over_allocation         boolean,
  engine_version                integer,
  archived                      boolean,
  created_at                    timestamptz,
  updated_at                    timestamptz,
  doc                           jsonb       not null,
  source_path                   text        not null,
  source_update_time            timestamptz not null,
  source_deleted                boolean     not null default false,
  deleted_at                    timestamptz,
  schema_version                integer     not null default 1,
  mapping_status                text        not null default 'mapped' check (mapping_status in ('mapped', 'unmapped')),
  synced_at                     timestamptz not null default now(),
  written_by                    text        not null default 'server' check (written_by in ('client', 'server')),
  client_written_at             timestamptz,
  primary key (uid, doc_id)
);

create table public.sip_plans (
  uid                           text        not null,
  doc_id                        text        not null,
  asset_type                    text,
  symbol                        text,
  quote_key                     text,
  asset_name                    text,
  currency                      text,
  frequency                     text,
  status                        text,
  investment_amount             numeric(18,2),
  total_invested                numeric(18,2),
  total_units                   numeric(24,8),
  execution_day                 integer,
  execution_count               integer,
  start_date                    text,
  end_date                      text,
  next_execution_date           text,
  last_execution_date           text,
  skip_next_execution           boolean,
  created_at                    timestamptz,
  updated_at                    timestamptz,
  doc                           jsonb       not null,
  source_path                   text        not null,
  source_update_time            timestamptz not null,
  source_deleted                boolean     not null default false,
  deleted_at                    timestamptz,
  schema_version                integer     not null default 1,
  mapping_status                text        not null default 'mapped' check (mapping_status in ('mapped', 'unmapped')),
  synced_at                     timestamptz not null default now(),
  written_by                    text        not null default 'server' check (written_by in ('client', 'server')),
  client_written_at             timestamptz,
  primary key (uid, doc_id)
);
create index if not exists sip_plans_idx1 on public.sip_plans (uid, status);

create table public.sip_transactions (
  uid                           text        not null,
  doc_id                        text        not null,
  sip_id                        text,
  date                          date,
  asset_type                    text,
  symbol                        text,
  quote_key                     text,
  asset_name                    text,
  market_price                  numeric(24,8),
  investment_amount             numeric(18,2),
  units_purchased               numeric(24,8),
  total_units_after_purchase    numeric(24,8),
  average_buy_price_after       numeric(24,8),
  status                        text,
  created_at                    timestamptz,
  doc                           jsonb       not null,
  source_path                   text        not null,
  source_update_time            timestamptz not null,
  source_deleted                boolean     not null default false,
  deleted_at                    timestamptz,
  schema_version                integer     not null default 1,
  mapping_status                text        not null default 'mapped' check (mapping_status in ('mapped', 'unmapped')),
  synced_at                     timestamptz not null default now(),
  written_by                    text        not null default 'server' check (written_by in ('client', 'server')),
  client_written_at             timestamptz,
  primary key (uid, doc_id)
);
create index if not exists sip_transactions_idx1 on public.sip_transactions (uid, sip_id, date desc);

create table public.virtual_positions (
  uid                           text        not null,
  doc_id                        text        not null,
  asset_type                    text,
  symbol                        text,
  quote_key                     text,
  asset_name                    text,
  total_units                   numeric(24,8),
  average_buy_price             numeric(24,8),
  total_invested                numeric(18,2),
  updated_at                    timestamptz,
  doc                           jsonb       not null,
  source_path                   text        not null,
  source_update_time            timestamptz not null,
  source_deleted                boolean     not null default false,
  deleted_at                    timestamptz,
  schema_version                integer     not null default 1,
  mapping_status                text        not null default 'mapped' check (mapping_status in ('mapped', 'unmapped')),
  synced_at                     timestamptz not null default now(),
  written_by                    text        not null default 'server' check (written_by in ('client', 'server')),
  client_written_at             timestamptz,
  primary key (uid, doc_id)
);

create table public.net_worth_history (
  uid                           text        not null,
  doc_id                        text        not null,
  month                         text,
  history_schema_version        integer,
  created_at                    timestamptz,
  updated_at                    timestamptz,
  doc                           jsonb       not null,
  source_path                   text        not null,
  source_update_time            timestamptz not null,
  source_deleted                boolean     not null default false,
  deleted_at                    timestamptz,
  schema_version                integer     not null default 1,
  mapping_status                text        not null default 'mapped' check (mapping_status in ('mapped', 'unmapped')),
  synced_at                     timestamptz not null default now(),
  written_by                    text        not null default 'server' check (written_by in ('client', 'server')),
  client_written_at             timestamptz,
  primary key (uid, doc_id)
);
create index if not exists net_worth_history_idx1 on public.net_worth_history (uid, month);

create table public.watchlists (
  uid                           text        not null,
  doc_id                        text        not null,
  name                          text,
  is_default                    boolean,
  imported_legacy_at            timestamptz,
  created_at                    timestamptz,
  updated_at                    timestamptz,
  doc                           jsonb       not null,
  source_path                   text        not null,
  source_update_time            timestamptz not null,
  source_deleted                boolean     not null default false,
  deleted_at                    timestamptz,
  schema_version                integer     not null default 1,
  mapping_status                text        not null default 'mapped' check (mapping_status in ('mapped', 'unmapped')),
  synced_at                     timestamptz not null default now(),
  written_by                    text        not null default 'server' check (written_by in ('client', 'server')),
  client_written_at             timestamptz,
  primary key (uid, doc_id)
);

-- ─── Default deny, then owner-only SELECT (as SPENDLY-504/505) ──────────────

do $$
declare
  t text;
begin
  foreach t in array array[
    'category_budgets', 'decisions', 'calendar_reminders', 'fee_reviews',
    'fee_signal_dismissals', 'merchant_overrides', 'recurring_dismissals', 'spaces',
    'categorization_rules', 'trips', 'runway_settings', 'runway_overrides',
    'what_if_scenarios', 'goal_funding_plans', 'sip_plans', 'sip_transactions',
    'virtual_positions', 'net_worth_history', 'watchlists'
  ] loop
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
    'virtual_positions', 'net_worth_history', 'watchlists'
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
    'virtual_positions', 'net_worth_history', 'watchlists'
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
    'virtual_positions', 'net_worth_history', 'watchlists', 'sync_status',
    'sync_checkpoints', 'sync_failures'
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
  select uid, 'watchlists', doc_id, 'unmapped' from public.watchlists where not source_deleted and mapping_status = 'unmapped';


-- Unchanged grants on the functions restated above (service role only).
revoke all on function public.readmodel_sync_table_ok(text) from public, anon, authenticated;
revoke all on function public.readmodel_client_table_ok(text) from public, anon, authenticated;
revoke all on function public.readmodel_purge_user(text) from public, anon, authenticated;
revoke all on function public.readmodel_live_counts() from public, anon, authenticated;
grant execute on function public.readmodel_sync_table_ok(text) to service_role;
grant execute on function public.readmodel_client_table_ok(text) to service_role;
grant execute on function public.readmodel_purge_user(text) to service_role;
grant execute on function public.readmodel_live_counts() to service_role;
