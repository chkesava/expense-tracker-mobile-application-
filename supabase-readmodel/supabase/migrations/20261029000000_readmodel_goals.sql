-- SPENDLY-609 (epic SPENDLY-606 Save Goals): goals and their audit history in
-- the read model.
--
-- Firestore stays the only writer and the source of truth
-- (docs/READ_MODEL_RULES.md). These tables are read-only copies kept by the
-- existing sync job and per-write push, for history, analytics and exports
-- (SPENDLY-611). A goal's current saved amount is current-state money: screens
-- always read it from Firestore. `current_amount` here exists for parity and
-- reconciliation only (R4).
--
--   financial_goals  users/{uid}/financialGoals  — goal summaries
--   goal_events      users/{uid}/goalEvents      — append-only goal history
--
-- users/{uid}/goalNames (a uniqueness lock) is not synced.
--
-- Additive, like the earlier migrations: two new tables, then `create or
-- replace` of every function and view that lists the synced tables, each
-- restated in full with the two new names added.

-- ─── Tables ─────────────────────────────────────────────────────────────────

create table public.financial_goals (
  uid                 text        not null,
  doc_id              text        not null,
  name                text,
  status              text,                  -- active | paused | completed | archived | cancelled (null = legacy, active)
  target_amount       numeric(18,2),
  current_amount      numeric(18,2),         -- parity only; never displayed from here
  deadline            date,                  -- optional target date
  created_at          timestamptz,           -- source `createdAtMs`
  pinned              boolean,
  doc                 jsonb       not null,
  source_path         text        not null,
  source_update_time  timestamptz not null,
  source_deleted      boolean     not null default false,
  deleted_at          timestamptz,
  schema_version      integer     not null default 1,
  mapping_status      text        not null default 'mapped' check (mapping_status in ('mapped', 'unmapped')),
  synced_at           timestamptz not null default now(),
  primary key (uid, doc_id)
);
create index financial_goals_uid_status_idx on public.financial_goals (uid, status);

create table public.goal_events (
  uid                 text        not null,
  doc_id              text        not null,
  goal_id             text,
  type                text,                  -- contribution | reduction | correction | reversal | …
  amount_delta        numeric(18,2),
  reason              text,
  correction_of       text,
  created_at          timestamptz,           -- source `createdAtMs`
  doc                 jsonb       not null,
  source_path         text        not null,
  source_update_time  timestamptz not null,
  source_deleted      boolean     not null default false,
  deleted_at          timestamptz,
  schema_version      integer     not null default 1,
  mapping_status      text        not null default 'mapped' check (mapping_status in ('mapped', 'unmapped')),
  synced_at           timestamptz not null default now(),
  primary key (uid, doc_id)
);
create index goal_events_uid_created_idx      on public.goal_events (uid, created_at desc, doc_id desc);
create index goal_events_uid_goal_created_idx on public.goal_events (uid, goal_id, created_at desc, doc_id desc);

-- ─── Default deny, then owner-only SELECT (as SPENDLY-504/505) ──────────────

do $$
declare
  t text;
begin
  foreach t in array array['financial_goals', 'goal_events'] loop
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

-- ─── Sync write path: the two tables become valid targets ───────────────────

create or replace function public.readmodel_sync_table_ok(p_table text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_table = any (array[
    'expenses', 'incomes', 'ledger_events', 'accounts', 'account_types',
    'account_transfers', 'account_entries', 'account_payments',
    'credit_card_bills', 'categories', 'financial_goals', 'goal_events'
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
$$;

-- ─── Data quality: unmapped goal rows are flagged, never dropped (R2.2) ─────

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
  from public.goal_events where not source_deleted and (mapping_status = 'unmapped' or amount_delta is null or goal_id is null);

-- Unchanged grants on the functions restated above (service role only).
revoke all on function public.readmodel_sync_table_ok(text) from public, anon, authenticated;
revoke all on function public.readmodel_purge_user(text) from public, anon, authenticated;
revoke all on function public.readmodel_live_counts() from public, anon, authenticated;
grant execute on function public.readmodel_sync_table_ok(text) to service_role;
grant execute on function public.readmodel_purge_user(text) to service_role;
grant execute on function public.readmodel_live_counts() to service_role;
