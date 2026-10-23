-- SPENDLY-510: reporting views for Phase 3, and the checks that prove them.
--
-- Each view reproduces one TypeScript reference exactly (golden-tested in
-- tests/golden.sql, generated from the SPENDLY-503 fixture):
--   v_period_totals       calculateDashboardSummaries → categoryTotals
--                         (parent and "parent::sub" keys, SPENDLY-495)
--   v_cash_flow_by_month  calculateDashboardSummaries → totals and counts
--   v_cashback_history    buildCashbackHistory (per card)
--   v_account_flows       Σ ledgerRowAccountDeltas over the Wave 1 rows
--                         (bank-balance semantics, SPENDLY-523)
--
-- Missing data is never 0: a group with any null amount totals null, and the
-- row appears in v_data_quality.
--
-- security_invoker: a view reads its tables as the caller, so RLS (owner
-- only) applies. No client grants yet: until SPENDLY-511 flips a screen, the
-- SQL numbers are for parity checks only and own nothing user-facing.

-- Rows the ledger counts.
create or replace view public.v_active_expenses with (security_invoker = true) as
  select * from public.expenses where not source_deleted and soft_deleted_at is null;
create or replace view public.v_active_incomes with (security_invoker = true) as
  select * from public.incomes where not source_deleted and soft_deleted_at is null;

-- Null-preserving sum: any null amount makes the total null.
create or replace view public.v_period_totals with (security_invoker = true) as
  with keyed as (
    select uid, month, category as category_key, amount from public.v_active_expenses
    where month is not null and coalesce(category, '') <> ''
    union all
    select uid, month, category || '::' || subcategory, amount from public.v_active_expenses
    where month is not null and coalesce(category, '') <> '' and coalesce(subcategory, '') <> ''
  )
  select uid, month, category_key,
         case when bool_or(amount is null) then null else sum(amount) end as total,
         count(*)::int as rows
  from keyed
  group by uid, month, category_key;

create or replace view public.v_cash_flow_by_month with (security_invoker = true) as
  with flows as (
    select uid, month, amount as expense, 0::numeric as income, true as is_expense from public.v_active_expenses where month is not null
    union all
    select uid, month, 0::numeric, amount, false from public.v_active_incomes where month is not null
  )
  select uid, month,
         case when bool_or(is_expense and expense is null) then null else sum(expense) end as total_expenses,
         case when bool_or(not is_expense and income is null) then null else sum(income) end as total_income,
         count(*)::int as transaction_count
  from flows
  group by uid, month;

create or replace view public.v_cashback_history with (security_invoker = true) as
  select uid, to_account_id as card_id,
         count(*)::int as entries,
         case when bool_or(amount is null) then null
              else coalesce(sum(amount) filter (where voided_at is null), 0) end as total_received,
         case when bool_or(amount is null) then null
              else coalesce(sum(amount) filter (where voided_at is not null), 0) end as total_voided,
         case when bool_or(amount is null) then null
              else coalesce(sum(amount) filter (where voided_at is null and coalesce(cashback_kind, 'statement_credit') = 'statement_credit'), 0) end as statement_credits,
         case when bool_or(amount is null) then null
              else coalesce(sum(amount) filter (where voided_at is null and cashback_kind = 'reward'), 0) end as rewards
  from public.account_payments
  where not source_deleted and source_type = 'cashback' and to_account_id is not null
  group by uid, to_account_id;

-- One row per (ledger row, account leg), exactly as ledgerRowAccountDeltas.
create or replace view public.v_account_flow_rows with (security_invoker = true) as
  select uid, account_id, date, -amount as delta, 'expense' as kind, doc_id from public.v_active_expenses where account_id is not null
  union all
  select uid, account_id, date, amount, 'income', doc_id from public.v_active_incomes where account_id is not null
  union all
  select uid, from_account_id, date, -amount, 'accountPayment', doc_id from public.account_payments
    where not source_deleted and voided_at is null and from_account_id is not null
  union all
  select uid, account_id, date, case when direction = 'credit' then amount else -amount end, 'accountEntry', doc_id
    from public.account_entries where not source_deleted and account_id is not null
  union all
  select uid, from_account_id, date, -amount, 'accountTransfer', doc_id from public.account_transfers
    where not source_deleted and from_account_id is not null
  union all
  select uid, to_account_id, date, amount, 'accountTransfer', doc_id from public.account_transfers
    where not source_deleted and to_account_id is not null;

create or replace view public.v_account_flows with (security_invoker = true) as
  select uid, account_id,
         case when bool_or(delta is null) then null else sum(delta) filter (where delta > 0) end as inflow,
         case when bool_or(delta is null) then null else sum(delta) filter (where delta < 0) end as outflow,
         case when bool_or(delta is null) then null else sum(delta) end as net,
         count(*)::int as rows
  from public.v_account_flow_rows
  group by uid, account_id;

-- Non-credit accounts recomputed from Wave 1 rows, with the balance baseline
-- (effectiveBalanceAsOfDate: a baseline dated today or later is ignored).
-- Borrowings and receivables (Wave 2) are not in the read model, so an
-- account they touch differs: balance_mismatch is a warning, not an error.
create or replace view public.v_account_balances with (security_invoker = true) as
  with acc as (
    select a.uid, a.doc_id as account_id, a.name, a.opening_balance, a.current_balance,
           case when a.balance_as_of_date < (now() at time zone 'Asia/Kolkata')::date then a.balance_as_of_date end as baseline,
           lower(coalesce(t.name, '')) as type_name
    from public.accounts a
    left join public.account_types t on t.uid = a.uid and t.doc_id = a.type_id and not t.source_deleted
    where not a.source_deleted
  )
  select acc.uid, acc.account_id, acc.current_balance as stored_balance,
         case when acc.opening_balance is null and exists (select 1 from public.accounts x where x.uid = acc.uid and x.doc_id = acc.account_id and x.mapping_status = 'unmapped')
              then null
              -- f.kind is null on the outer-join row of an account with no flows.
              when bool_or(f.kind is not null and f.delta is null) then null
              else coalesce(acc.opening_balance, 0) + coalesce(sum(f.delta), 0) end as recomputed_balance
  from acc
  left join public.v_account_flow_rows f
    on f.uid = acc.uid and f.account_id = acc.account_id
   and (acc.baseline is null or f.date >= acc.baseline)
  where acc.type_name not like '%credit%'
  group by acc.uid, acc.account_id, acc.opening_balance, acc.current_balance;

-- Rows whose missing data would otherwise read as 0 or vanish from a total.
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
  select uid, 'accountTypes', doc_id, 'unmapped' from public.account_types where not source_deleted and mapping_status = 'unmapped';

-- ─── Relationship and invariant checks ──────────────────────────────────────
-- Findings about the data (as Firestore has it), reported in the nightly
-- parity summary; they are not sync divergence. Field and count parity
-- (sync + verify) are the divergence gate.
create or replace function public.readmodel_invariants()
returns table (uid text, check_name text, collection text, doc_id text, detail text)
language sql
stable
set search_path = ''
as $$
  with live_accounts as (select uid, doc_id from public.accounts where not source_deleted),
       live_bills as (select uid, doc_id from public.credit_card_bills where not source_deleted),
       live_expenses as (select uid, doc_id from public.expenses where not source_deleted)
  -- Ledger rows pointing at an account that doesn't exist.
  select e.uid, 'orphan_account', 'expenses', e.doc_id, 'account_id not found'
    from public.v_active_expenses e
    where e.account_id is not null and not exists (select 1 from live_accounts a where a.uid = e.uid and a.doc_id = e.account_id)
  union all
  select i.uid, 'orphan_account', 'incomes', i.doc_id, 'account_id not found'
    from public.v_active_incomes i
    where i.account_id is not null and not exists (select 1 from live_accounts a where a.uid = i.uid and a.doc_id = i.account_id)
  union all
  select n.uid, 'orphan_account', 'accountEntries', n.doc_id, 'account_id not found'
    from public.account_entries n
    where not n.source_deleted and n.account_id is not null and not exists (select 1 from live_accounts a where a.uid = n.uid and a.doc_id = n.account_id)
  union all
  select t.uid, 'orphan_account', 'accountTransfers', t.doc_id, 'from or to account not found'
    from public.account_transfers t
    where not t.source_deleted and (
      (t.from_account_id is not null and not exists (select 1 from live_accounts a where a.uid = t.uid and a.doc_id = t.from_account_id))
      or (t.to_account_id is not null and not exists (select 1 from live_accounts a where a.uid = t.uid and a.doc_id = t.to_account_id)))
  union all
  select p.uid, 'orphan_account', 'accountPayments', p.doc_id, 'from or to account not found'
    from public.account_payments p
    where not p.source_deleted and p.voided_at is null and (
      (p.from_account_id is not null and p.from_account_id not in ('cashback', 'external')
        and not exists (select 1 from live_accounts a where a.uid = p.uid and a.doc_id = p.from_account_id))
      or (p.to_account_id is not null and not exists (select 1 from live_accounts a where a.uid = p.uid and a.doc_id = p.to_account_id)))
  -- References to a bill that doesn't exist.
  union all
  select e.uid, 'orphan_bill', 'expenses', e.doc_id, 'credit_card_bill_id not found'
    from public.v_active_expenses e
    where e.credit_card_bill_id is not null and not exists (select 1 from live_bills b where b.uid = e.uid and b.doc_id = e.credit_card_bill_id)
  union all
  select p.uid, 'orphan_bill', 'accountPayments', p.doc_id, 'credit_card_bill_id not found'
    from public.account_payments p
    where not p.source_deleted and p.voided_at is null and p.credit_card_bill_id is not null
      and not exists (select 1 from live_bills b where b.uid = p.uid and b.doc_id = p.credit_card_bill_id)
  -- Cashback linked to an expense that doesn't exist.
  union all
  select p.uid, 'orphan_linked_expense', 'accountPayments', p.doc_id, 'linkedExpenseId not found'
    from public.account_payments p
    where not p.source_deleted and p.voided_at is null and p.source_type = 'cashback'
      and p.doc ->> 'linkedExpenseId' is not null
      and not exists (select 1 from live_expenses x where x.uid = p.uid and x.doc_id = p.doc ->> 'linkedExpenseId')
  -- Cashback counted once: one live cashback per (card, linked expense).
  union all
  select p.uid, 'duplicate_cashback', 'accountPayments', min(p.doc_id),
         format('%s live cashback rows for one linked expense', count(*))
    from public.account_payments p
    where not p.source_deleted and p.voided_at is null and p.source_type = 'cashback' and p.doc ->> 'linkedExpenseId' is not null
    group by p.uid, p.to_account_id, p.doc ->> 'linkedExpenseId'
    having count(*) > 1
  -- Promised vs received: a bill can't be paid more than its live payments.
  union all
  select b.uid, 'bill_overpaid', 'creditCardBills', b.doc_id,
         format('amount_paid %s exceeds linked live payments %s', b.amount_paid, coalesce(paid.total, 0))
    from public.credit_card_bills b
    left join lateral (
      select sum(coalesce(p.bill_applied_amount, p.amount)) as total
      from public.account_payments p
      where p.uid = b.uid and not p.source_deleted and p.voided_at is null
        and (p.credit_card_bill_id = b.doc_id
             or p.doc_id in (select jsonb_array_elements_text(coalesce(b.doc -> 'paymentIds', '[]'::jsonb))))
    ) paid on true
    where not b.source_deleted and coalesce(b.status, '') <> 'CANCELLED'
      and coalesce(b.amount_paid, 0) > coalesce(paid.total, 0) + 0.01
  -- Stored vs recomputed balance for non-credit accounts (Wave 1 only).
  union all
  select v.uid, 'balance_mismatch', 'accounts', v.account_id,
         format('stored %s, recomputed from Wave 1 rows %s (borrowings and receivables are not in the read model)', v.stored_balance, v.recomputed_balance)
    from public.v_account_balances v
    where v.stored_balance is not null and v.recomputed_balance is not null
      and abs(v.stored_balance - v.recomputed_balance) > 0.01
$$;

-- ─── Repair: rewrite rows whose typed columns diverged (SPENDLY-510) ────────
-- The version-guarded upsert ignores a same-version row, so a row edited in
-- Postgres would never heal. The sync calls this only for rows its field
-- parity check found different. Purged accounts stay refused.
create or replace function public.readmodel_repair(p_table text, p_rows jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  cols text;
  sets text;
  n integer;
begin
  if not public.readmodel_sync_table_ok(p_table) then
    raise exception 'readmodel_repair: unknown table %', p_table;
  end if;
  select string_agg(quote_ident(a.attname), ', ' order by a.attnum),
         string_agg(format('%1$I = excluded.%1$I', a.attname), ', ' order by a.attnum)
    into cols, sets
  from pg_attribute a
  where a.attrelid = format('public.%I', p_table)::regclass
    and a.attnum > 0 and not a.attisdropped
    and a.attname not in ('synced_at', 'source_deleted', 'deleted_at');
  execute format(
    'insert into public.%1$I as t (%2$s, synced_at, source_deleted, deleted_at)
       select %2$s, now(), false, null
       from jsonb_populate_recordset(null::public.%1$I, $1) r
       where not public.readmodel_is_purged(r.uid)
     on conflict (uid, doc_id) do update
       set %3$s, synced_at = now(), source_deleted = false, deleted_at = null
       where excluded.source_update_time >= t.source_update_time',
    p_table, cols, sets
  ) using p_rows;
  get diagnostics n = row_count;
  return n;
end
$$;

alter table public.sync_runs drop constraint if exists sync_runs_mode_check;
alter table public.sync_runs add constraint sync_runs_mode_check
  check (mode in ('sync', 'dry_run', 'backfill', 'incremental', 'full', 'verify', 'parity'));

revoke all on function public.readmodel_invariants() from public, anon, authenticated;
revoke all on function public.readmodel_repair(text, jsonb) from public, anon, authenticated;
grant execute on function public.readmodel_invariants() to service_role;
grant execute on function public.readmodel_repair(text, jsonb) to service_role;
