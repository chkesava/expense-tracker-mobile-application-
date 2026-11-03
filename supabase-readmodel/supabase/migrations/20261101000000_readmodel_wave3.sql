-- SPENDLY-590 (epic SPENDLY-586, plan v2): Wave 3 in the read model:
-- investments, the stock portfolio, investment cash and EPF.
--
-- Firestore is the source of truth (READ_MODEL_RULES R1.1); these tables are
-- kept by the sync, the per-write push and the app's rm_client_apply writes.
-- Stored values (balances, totals, closing balances) are copies, never
-- recomputed for display (R4.1). Quantities, prices, NAVs and rates are
-- numeric(24,8) (`decimal` in the mapping); money is numeric(18,2).
--
-- Not synced here: financialSummaries (incl. the EPF summary; SPENDLY-592),
-- holdingAdjustments, portfolioReconciliationAudits, watchlists and SIP (591).
-- epf-cron's server writes reach the read model on the nightly run.
--
-- Additive: new tables, then `create or replace` of every function and view
-- that lists the synced tables, restated in full.

-- ─── Tables ─────────────────────────────────────────────────────────────────

create table public.investments (
  uid                           text        not null,
  doc_id                        text        not null,
  name                          text,
  kind                          text,
  principal                     numeric(18,2),
  start_date                    date,
  annual_interest_rate          numeric(24,8),
  maturity_date                 date,
  linked_account_id             text,
  units                         numeric(24,8),
  purchase_nav                  numeric(24,8),
  current_nav                   numeric(24,8),
  status                        text,
  closed_date                   date,
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
create index if not exists investments_idx1 on public.investments (uid, status);

create table public.holdings (
  uid                           text        not null,
  doc_id                        text        not null,
  profile_id                    text,
  symbol                        text,
  yahoo_symbol                  text,
  name                          text,
  exchange                      text,
  instrument_type               text,
  quantity                      numeric(24,8),
  average_buy_price             numeric(24,8),
  date_purchased                date,
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
create index if not exists holdings_idx1 on public.holdings (uid, symbol);

create table public.portfolio_transactions (
  uid                           text        not null,
  doc_id                        text        not null,
  holding_id                    text,
  profile_id                    text,
  symbol                        text,
  type                          text,
  quantity                      numeric(24,8),
  price                         numeric(24,8),
  fees                          numeric(18,2),
  date                          date,
  order_status                  text,
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
create index if not exists portfolio_transactions_idx1 on public.portfolio_transactions (uid, holding_id, date desc);
create index if not exists portfolio_transactions_idx2 on public.portfolio_transactions (uid, date desc);

create table public.investment_cash_transactions (
  uid                           text        not null,
  doc_id                        text        not null,
  type                          text,
  amount                        numeric(18,2),
  direction                     text,
  date                          date,
  holding_id                    text,
  symbol                        text,
  quantity                      numeric(24,8),
  price                         numeric(24,8),
  account_id                    text,
  account_entry_id              text,
  reverses_id                   text,
  source                        text,
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
create index if not exists investment_cash_transactions_idx1 on public.investment_cash_transactions (uid, date desc);

create table public.portfolio_settings (
  uid                           text        not null,
  doc_id                        text        not null,
  initial_investment_amount     numeric(18,2),
  cash_balance                  numeric(18,2),
  has_existing_holdings         boolean,
  onboarding_complete           boolean,
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

create table public.epf_profile (
  uid                           text        not null,
  doc_id                        text        not null,
  active_establishment_id       text,
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

create table public.epf_establishments (
  uid                           text        not null,
  doc_id                        text        not null,
  profile_id                    text,
  employer_name                 text,
  date_joined                   date,
  date_left                     date,
  employment_status             text,
  archived                      boolean,
  eps_member                    boolean,
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
create index if not exists epf_establishments_idx1 on public.epf_establishments (uid, profile_id);

create table public.epf_contributions (
  uid                           text        not null,
  doc_id                        text        not null,
  establishment_id              text,
  month                         text,
  wage                          numeric(18,2),
  employee_share                numeric(18,2),
  employer_share                numeric(18,2),
  eps_share                     numeric(18,2),
  employer_epf_share            numeric(18,2),
  total_contribution            numeric(18,2),
  epf_credit                    numeric(18,2),
  status                        text,
  source                        text,
  eps_eligible                  boolean,
  credit_date                   date,
  credited_amount               numeric(18,2),
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
create index if not exists epf_contributions_idx1 on public.epf_contributions (uid, establishment_id, month);

create table public.epf_contribution_events (
  uid                           text        not null,
  doc_id                        text        not null,
  contribution_id               text,
  establishment_id              text,
  month                         text,
  from_status                   text,
  to_status                     text,
  amount                        numeric(18,2),
  actor                         text,
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
create index if not exists epf_contribution_events_idx1 on public.epf_contribution_events (uid, contribution_id);

create table public.epf_transfers (
  uid                           text        not null,
  doc_id                        text        not null,
  source_establishment_id       text,
  destination_establishment_id  text,
  amount                        numeric(18,2),
  date                          date,
  status                        text,
  reversal_of                   text,
  reversed_by                   text,
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
create index if not exists epf_transfers_idx1 on public.epf_transfers (uid, date desc);

create table public.epf_transfer_events (
  uid                           text        not null,
  doc_id                        text        not null,
  transfer_id                   text,
  from_status                   text,
  to_status                     text,
  amount                        numeric(18,2),
  actor                         text,
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
create index if not exists epf_transfer_events_idx1 on public.epf_transfer_events (uid, transfer_id);

create table public.epf_interest_entries (
  uid                           text        not null,
  doc_id                        text        not null,
  establishment_id              text,
  financial_year                text,
  rate                          numeric(24,8),
  basis                         text,
  opening_balance               numeric(18,2),
  interest                      numeric(18,2),
  closing_balance               numeric(18,2),
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
create index if not exists epf_interest_entries_idx1 on public.epf_interest_entries (uid, establishment_id, financial_year);

create table public.epf_reconciliations (
  uid                           text        not null,
  doc_id                        text        not null,
  establishment_id              text,
  date                          date,
  actual_balance                numeric(18,2),
  calculated_balance            numeric(18,2),
  adjustment_amount             numeric(18,2),
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
create index if not exists epf_reconciliations_idx1 on public.epf_reconciliations (uid, establishment_id, date desc);

create table public.epf_wage_history (
  uid                           text        not null,
  doc_id                        text        not null,
  establishment_id              text,
  effective_from_month          text,
  wage                          numeric(18,2),
  eps_eligible                  boolean,
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
create index if not exists epf_wage_history_idx1 on public.epf_wage_history (uid, establishment_id, effective_from_month);

-- ─── Default deny, then owner-only SELECT (as SPENDLY-504/505) ──────────────

do $$
declare
  t text;
begin
  foreach t in array array[
    'investments', 'holdings', 'portfolio_transactions', 'investment_cash_transactions',
    'portfolio_settings', 'epf_profile', 'epf_establishments', 'epf_contributions',
    'epf_contribution_events', 'epf_transfers', 'epf_transfer_events',
    'epf_interest_entries', 'epf_reconciliations', 'epf_wage_history'
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
    'epf_wage_history'
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
    'epf_wage_history'
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
    'epf_wage_history', 'sync_status', 'sync_checkpoints', 'sync_failures'
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
  select uid, 'epfWageHistory', doc_id, 'unmapped' from public.epf_wage_history where not source_deleted and mapping_status = 'unmapped';


-- Unchanged grants on the functions restated above (service role only).
revoke all on function public.readmodel_sync_table_ok(text) from public, anon, authenticated;
revoke all on function public.readmodel_client_table_ok(text) from public, anon, authenticated;
revoke all on function public.readmodel_purge_user(text) from public, anon, authenticated;
revoke all on function public.readmodel_live_counts() from public, anon, authenticated;
grant execute on function public.readmodel_sync_table_ok(text) to service_role;
grant execute on function public.readmodel_client_table_ok(text) to service_role;
grant execute on function public.readmodel_purge_user(text) to service_role;
grant execute on function public.readmodel_live_counts() to service_role;
