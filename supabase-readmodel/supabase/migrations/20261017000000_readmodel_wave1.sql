-- SPENDLY-504: Spendly read model, Wave 1 tables and sync bookkeeping.
--
-- Firestore stays the only writer of user data. These tables are a copy kept
-- by the daily sync job (SPENDLY-506, option C in docs/SPENDLY-494-adr.md).
-- Nothing here is a source of truth.
--
-- Every user-data table shares one shape:
--   (uid, doc_id)        the Firestore path users/{uid}/<collection>/{doc_id}
--   doc                  the normalised source document, so no field is lost
--   source_update_time   the Firestore document updateTime: the version guard
--   source_deleted /     tombstone set when the document no longer exists in
--   deleted_at           Firestore (hard delete); rows are never removed here
--   mapping_status       'unmapped' when a document's shape was not understood;
--                        typed columns are then null and `doc` holds the data
-- Typed columns exist only for fields the planned reads filter or sum on;
-- everything else stays in `doc`. Money is numeric(18,2), never float.
--
-- Security: RLS is enabled on every table with no policies, so every client
-- role is denied. anon and authenticated hold no privileges at all. Read
-- policies for signed-in users come with SPENDLY-505.

-- ─── Wave 1 tables ──────────────────────────────────────────────────────────

create table public.expenses (
  uid                 text        not null,
  doc_id              text        not null,
  amount              numeric(18,2),
  date                date,
  month               text,
  category            text,
  subcategory         text,
  account_id          text,
  credit_card_bill_id text,
  subscription_id     text,
  soft_deleted_at     timestamptz,           -- source `deletedAt` (soft delete)
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
create index expenses_uid_month_idx        on public.expenses (uid, month);
create index expenses_uid_account_date_idx on public.expenses (uid, account_id, date);
create index expenses_uid_date_idx         on public.expenses (uid, date desc);

create table public.incomes (
  uid                 text        not null,
  doc_id              text        not null,
  amount              numeric(18,2),
  date                date,
  month               text,
  source              text,
  account_id          text,
  soft_deleted_at     timestamptz,           -- source `deletedAt`
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
create index incomes_uid_month_idx        on public.incomes (uid, month);
create index incomes_uid_account_date_idx on public.incomes (uid, account_id, date);
create index incomes_uid_date_idx         on public.incomes (uid, date desc);

create table public.ledger_events (
  uid                 text        not null,
  doc_id              text        not null,
  kind                text,                  -- expense | income | …
  action              text,                  -- update | delete | restore
  target_doc_id       text,                  -- source `docId`
  created_at          timestamptz,
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
create index ledger_events_uid_created_idx on public.ledger_events (uid, created_at desc);
create index ledger_events_uid_target_idx  on public.ledger_events (uid, target_doc_id);

create table public.accounts (
  uid                   text        not null,
  doc_id                text        not null,
  name                  text,
  type_id               text,
  currency              text,
  opening_balance       numeric(18,2),
  balance_as_of_date    date,
  balance_initialized   boolean,
  credit_limit          numeric(18,2),
  bill_generation_day   integer,
  -- Materialized values copied from Firestore (SPENDLY-422/423). Display
  -- copies only; Firestore owns them (ADR §9).
  current_balance       numeric(18,2),
  current_outstanding   numeric(18,2),
  statement_due         numeric(18,2),
  unbilled_spend        numeric(18,2),
  balance_reconciliation_status text,
  doc                   jsonb       not null,
  source_path           text        not null,
  source_update_time    timestamptz not null,
  source_deleted        boolean     not null default false,
  deleted_at            timestamptz,
  schema_version        integer     not null default 1,
  mapping_status        text        not null default 'mapped' check (mapping_status in ('mapped', 'unmapped')),
  synced_at             timestamptz not null default now(),
  primary key (uid, doc_id)
);
create index accounts_uid_type_idx on public.accounts (uid, type_id);

create table public.account_types (
  uid                 text        not null,
  doc_id              text        not null,
  name                text,                  -- the name decides credit vs bank
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

create table public.account_transfers (
  uid                 text        not null,
  doc_id              text        not null,
  from_account_id     text,
  to_account_id       text,
  amount              numeric(18,2),
  date                date,
  month               text,
  subscription_id     text,
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
create index account_transfers_uid_date_idx on public.account_transfers (uid, date desc);
create index account_transfers_uid_from_idx on public.account_transfers (uid, from_account_id, date);
create index account_transfers_uid_to_idx   on public.account_transfers (uid, to_account_id, date);

create table public.account_entries (
  uid                 text        not null,
  doc_id              text        not null,
  account_id          text,
  amount              numeric(18,2),
  direction           text,                  -- credit | debit
  date                date,
  transfer_id         text,
  source              text,
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
create index account_entries_uid_account_date_idx on public.account_entries (uid, account_id, date);

create table public.account_payments (
  uid                 text        not null,
  doc_id              text        not null,
  from_account_id     text,
  to_account_id       text,
  amount              numeric(18,2),
  date                date,
  credit_card_bill_id text,
  bill_applied_amount numeric(18,2),
  cashback_kind       text,
  source_type         text,
  voided_at           timestamptz,           -- source `voidedAt` (soft void)
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
create index account_payments_uid_date_idx on public.account_payments (uid, date desc);
create index account_payments_uid_bill_idx on public.account_payments (uid, credit_card_bill_id);
create index account_payments_uid_to_idx   on public.account_payments (uid, to_account_id, date);

create table public.credit_card_bills (
  uid                 text        not null,
  doc_id              text        not null,  -- `${accountId}_${statementDate}`, or a legacy auto id
  account_id          text,
  billing_period_start date,
  billing_period_end  date,
  statement_date      date,
  due_date            date,
  statement_amount    numeric(18,2),
  minimum_due_amount  numeric(18,2),
  amount_paid         numeric(18,2),
  remaining_amount    numeric(18,2),
  currency            text,
  status              text,                  -- includes CANCELLED (soft)
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
create index credit_card_bills_uid_account_stmt_idx on public.credit_card_bills (uid, account_id, statement_date desc);

create table public.categories (
  uid                 text        not null,
  doc_id              text        not null,
  name                text,
  kind                text,                  -- category | subcategory
  parent_id           text,
  semantic_key        text,
  is_default          boolean,
  is_archived         boolean,
  is_hidden           boolean,
  sort_order          integer,
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
create index categories_uid_parent_idx on public.categories (uid, parent_id);

-- ─── Sync bookkeeping (audit plan §4.5–4.6; ADR §0 option C) ────────────────

-- One row per scheduled or manual run of the sync job.
create table public.sync_runs (
  id            bigint generated always as identity primary key,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  mode          text        not null check (mode in ('sync', 'dry_run', 'backfill')),
  status        text        not null default 'running'
                check (status in ('running', 'succeeded', 'partial', 'failed')),
  reads_used    integer     not null default 0,  -- Firestore reads this run spent
  read_budget   integer,                         -- the allowance it ran under
  upserts       integer     not null default 0,
  tombstones    integer     not null default 0,
  unmapped      integer     not null default 0,
  failures      integer     not null default 0,
  notes         jsonb
);

-- Freshness per user and collection; drives "last synced at" labels.
create table public.sync_status (
  uid                     text        not null,
  collection              text        not null,
  last_synced_at          timestamptz,
  last_complete_pass_at   timestamptz,  -- tombstones are only trusted after one
  last_source_update_time timestamptz,
  source_count            integer,      -- Firestore count() at the last check
  model_count             integer,      -- live rows here at the same moment
  pending_failures        integer     not null default 0,
  updated_at              timestamptz not null default now(),
  primary key (uid, collection)
);

-- Where a run stopped when it hit its read budget, so the next run resumes.
create table public.sync_checkpoints (
  uid            text        not null,
  collection     text        not null,
  cursor_doc_id  text,                   -- last doc id read, ordered by __name__
  run_id         bigint      references public.sync_runs (id) on delete set null,
  updated_at     timestamptz not null default now(),
  primary key (uid, collection)
);

-- Documents that could not be applied. A failure older than 24 h fails the
-- scheduled run (SPENDLY-507), so none can sit unnoticed.
create table public.sync_failures (
  id            bigint generated always as identity primary key,
  uid           text        not null,
  collection    text        not null,
  doc_id        text        not null,
  run_id        bigint      references public.sync_runs (id) on delete set null,
  error_class   text        not null,
  message       text,
  attempts      integer     not null default 1,
  first_seen    timestamptz not null default now(),
  last_seen     timestamptz not null default now(),
  resolved_at   timestamptz
);
create index sync_failures_open_idx on public.sync_failures (first_seen) where resolved_at is null;
create unique index sync_failures_doc_open_idx
  on public.sync_failures (uid, collection, doc_id) where resolved_at is null;

-- ─── Default deny ───────────────────────────────────────────────────────────

do $$
declare
  t text;
begin
  foreach t in array array[
    'expenses', 'incomes', 'ledger_events', 'accounts', 'account_types',
    'account_transfers', 'account_entries', 'account_payments',
    'credit_card_bills', 'categories',
    'sync_runs', 'sync_status', 'sync_checkpoints', 'sync_failures'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end
$$;

-- Supabase grants new public tables to anon/authenticated by default. Stop
-- that for anything later migrations add, so a forgotten revoke can't leak.
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
