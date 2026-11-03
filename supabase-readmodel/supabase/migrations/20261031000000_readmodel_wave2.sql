-- SPENDLY-589 (epic SPENDLY-586, plan v2): Wave 2 in the read model.
--
--   borrowings              users/{uid}/borrowings
--   borrowing_repayments    users/{uid}/borrowingRepayments
--   receivables             users/{uid}/receivables
--   receivable_repayments   users/{uid}/receivableRepayments
--   subscriptions           users/{uid}/subscriptions
--
-- Firestore is the source of truth (READ_MODEL_RULES R1.1). These tables are
-- kept by the sync, the per-write push and the app's rm_client_apply writes
-- (SPENDLY-669/670/671). Stored totals (outstanding, totals paid/received)
-- are copies of Firestore's values, never recomputed for display (R4.1).
-- Receivables carry SPENDLY-668's source_mode; an "already deducted" lend has
-- no source account, so source_account_id is nullable like every typed column.
--
-- Additive: five new tables, then `create or replace` of every function and
-- view that lists the synced tables, restated in full with the new names.

-- ─── Tables ─────────────────────────────────────────────────────────────────

create table public.borrowings (
  uid                   text        not null,
  doc_id                text        not null,
  lender_type           text,
  lender_name           text,
  principal_amount      numeric(18,2),
  borrowed_date         date,
  due_date              date,
  credited_account_id   text,
  outstanding_principal numeric(18,2),
  total_outstanding     numeric(18,2),
  total_paid            numeric(18,2),
  status                text,
  settled_date          date,
  doc                   jsonb       not null,
  source_path           text        not null,
  source_update_time    timestamptz not null,
  source_deleted        boolean     not null default false,
  deleted_at            timestamptz,
  schema_version        integer     not null default 1,
  mapping_status        text        not null default 'mapped' check (mapping_status in ('mapped', 'unmapped')),
  synced_at             timestamptz not null default now(),
  written_by            text        not null default 'server' check (written_by in ('client', 'server')),
  client_written_at     timestamptz,
  primary key (uid, doc_id)
);
create index if not exists borrowings_uid_status_idx on public.borrowings (uid, status);

create table public.borrowing_repayments (
  uid                   text        not null,
  doc_id                text        not null,
  borrowing_id          text,
  amount                numeric(18,2),
  principal_component   numeric(18,2),
  interest_component    numeric(18,2),
  payment_account_id    text,
  date                  date,
  month                 text,
  doc                   jsonb       not null,
  source_path           text        not null,
  source_update_time    timestamptz not null,
  source_deleted        boolean     not null default false,
  deleted_at            timestamptz,
  schema_version        integer     not null default 1,
  mapping_status        text        not null default 'mapped' check (mapping_status in ('mapped', 'unmapped')),
  synced_at             timestamptz not null default now(),
  written_by            text        not null default 'server' check (written_by in ('client', 'server')),
  client_written_at     timestamptz,
  primary key (uid, doc_id)
);
create index if not exists borrowing_repayments_uid_borrowing_idx on public.borrowing_repayments (uid, borrowing_id, date desc);
create index if not exists borrowing_repayments_uid_month_idx     on public.borrowing_repayments (uid, month);

create table public.receivables (
  uid                   text        not null,
  doc_id                text        not null,
  person_type           text,
  person_name           text,
  original_amount       numeric(18,2),
  lent_date             date,
  due_date              date,
  source_account_id     text,                  -- null for an "already deducted" lend (SPENDLY-668)
  source_mode           text,                  -- account | already_deducted (null = legacy, account)
  space_id              text,
  total_received        numeric(18,2),
  outstanding_amount    numeric(18,2),
  status                text,
  settled_date          date,
  doc                   jsonb       not null,
  source_path           text        not null,
  source_update_time    timestamptz not null,
  source_deleted        boolean     not null default false,
  deleted_at            timestamptz,
  schema_version        integer     not null default 1,
  mapping_status        text        not null default 'mapped' check (mapping_status in ('mapped', 'unmapped')),
  synced_at             timestamptz not null default now(),
  written_by            text        not null default 'server' check (written_by in ('client', 'server')),
  client_written_at     timestamptz,
  primary key (uid, doc_id)
);
create index if not exists receivables_uid_status_idx on public.receivables (uid, status);

create table public.receivable_repayments (
  uid                   text        not null,
  doc_id                text        not null,
  receivable_id         text,
  amount                numeric(18,2),
  principal_component   numeric(18,2),
  interest_component    numeric(18,2),
  received_account_id   text,
  date                  date,
  month                 text,
  doc                   jsonb       not null,
  source_path           text        not null,
  source_update_time    timestamptz not null,
  source_deleted        boolean     not null default false,
  deleted_at            timestamptz,
  schema_version        integer     not null default 1,
  mapping_status        text        not null default 'mapped' check (mapping_status in ('mapped', 'unmapped')),
  synced_at             timestamptz not null default now(),
  written_by            text        not null default 'server' check (written_by in ('client', 'server')),
  client_written_at     timestamptz,
  primary key (uid, doc_id)
);
create index if not exists receivable_repayments_uid_receivable_idx on public.receivable_repayments (uid, receivable_id, date desc);
create index if not exists receivable_repayments_uid_month_idx      on public.receivable_repayments (uid, month);

create table public.subscriptions (
  uid                   text        not null,
  doc_id                text        not null,
  name                  text,
  amount                numeric(18,2),
  category              text,
  type                  text,                  -- subscription | emi | transfer
  frequency             text,
  day_of_month          integer,
  is_active             boolean,
  is_completed          boolean,
  account_id            text,
  to_account_id         text,
  last_processed        text,                  -- "YYYY-MM" for monthly cadence
  doc                   jsonb       not null,
  source_path           text        not null,
  source_update_time    timestamptz not null,
  source_deleted        boolean     not null default false,
  deleted_at            timestamptz,
  schema_version        integer     not null default 1,
  mapping_status        text        not null default 'mapped' check (mapping_status in ('mapped', 'unmapped')),
  synced_at             timestamptz not null default now(),
  written_by            text        not null default 'server' check (written_by in ('client', 'server')),
  client_written_at     timestamptz,
  primary key (uid, doc_id)
);
create index if not exists subscriptions_uid_active_idx on public.subscriptions (uid, is_active);

-- ─── Default deny, then owner-only SELECT (as SPENDLY-504/505) ──────────────

do $$
declare
  t text;
begin
  foreach t in array array['borrowings', 'borrowing_repayments', 'receivables', 'receivable_repayments', 'subscriptions'] loop
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
    'account_transfers', 'account_entries', 'account_payments',
    'credit_card_bills', 'categories', 'financial_goals', 'goal_events',
    'borrowings', 'borrowing_repayments', 'receivables', 'receivable_repayments', 'subscriptions'
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
    'account_transfers', 'account_entries', 'account_payments',
    'credit_card_bills', 'categories', 'financial_goals', 'goal_events',
    'borrowings', 'borrowing_repayments', 'receivables', 'receivable_repayments', 'subscriptions'
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
    'account_transfers', 'account_entries', 'account_payments',
    'credit_card_bills', 'categories', 'financial_goals', 'goal_events',
    'borrowings', 'borrowing_repayments', 'receivables', 'receivable_repayments', 'subscriptions',
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
  select uid, 'subscriptions', doc_id, 'unmapped' from public.subscriptions where not source_deleted and mapping_status = 'unmapped';

-- Unchanged grants on the functions restated above (service role only).
revoke all on function public.readmodel_sync_table_ok(text) from public, anon, authenticated;
revoke all on function public.readmodel_client_table_ok(text) from public, anon, authenticated;
revoke all on function public.readmodel_purge_user(text) from public, anon, authenticated;
revoke all on function public.readmodel_live_counts() from public, anon, authenticated;
grant execute on function public.readmodel_sync_table_ok(text) to service_role;
grant execute on function public.readmodel_client_table_ok(text) to service_role;
grant execute on function public.readmodel_purge_user(text) to service_role;
grant execute on function public.readmodel_live_counts() to service_role;
