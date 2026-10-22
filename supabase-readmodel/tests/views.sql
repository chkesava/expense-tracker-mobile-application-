-- SPENDLY-510: missing data, relationship invariants, repair, and access for
-- the reporting views. Service role, rolled back. (View-vs-TypeScript
-- equality is tests/golden.sql.)

begin;
set local role service_role;

create temp table seed (tbl text, row jsonb) on commit drop;
insert into seed values
  ('account_types', '{"uid":"u","doc_id":"tb","name":"Savings Bank"}'),
  ('account_types', '{"uid":"u","doc_id":"tc","name":"Credit Card"}'),
  ('accounts', '{"uid":"u","doc_id":"bank","name":"Bank","type_id":"tb","opening_balance":1000,"current_balance":900}'),
  ('accounts', '{"uid":"u","doc_id":"card","name":"Card","type_id":"tc","current_outstanding":0}'),
  ('accounts', '{"uid":"u","doc_id":"drift","name":"Drift","type_id":"tb","opening_balance":0,"current_balance":50}'),
  -- 100 spent from bank: stored 900 = 1000 - 100. drift has no rows but stores 50.
  ('expenses', '{"uid":"u","doc_id":"e1","amount":100,"date":"2026-10-01","month":"2026-10","category":"Food","account_id":"bank"}'),
  -- Missing amount: the October Fuel total must be null, not 70.
  ('expenses', '{"uid":"u","doc_id":"e2","amount":70,"date":"2026-10-02","month":"2026-10","category":"Fuel"}'),
  ('expenses', '{"uid":"u","doc_id":"e3","amount":null,"date":"2026-10-03","month":"2026-10","category":"Fuel"}'),
  -- Orphans.
  ('expenses', '{"uid":"u","doc_id":"e4","amount":5,"date":"2026-11-01","month":"2026-11","category":"Food","account_id":"gone","credit_card_bill_id":"nobill"}'),
  -- Duplicate cashback for one linked expense (the Axis shape), and a bill paid by it.
  ('account_payments', '{"uid":"u","doc_id":"cb1","from_account_id":"cashback","to_account_id":"card","amount":299,"date":"2026-09-02","source_type":"cashback","doc":{"linkedExpenseId":"e1"}}'),
  ('account_payments', '{"uid":"u","doc_id":"cb2","from_account_id":"cashback","to_account_id":"card","amount":299,"date":"2026-09-03","source_type":"cashback","doc":{"linkedExpenseId":"e1"}}'),
  -- A voided cashback: kept on file, never counted as received.
  ('account_payments', '{"uid":"u","doc_id":"cb3","from_account_id":"cashback","to_account_id":"card","amount":50,"date":"2026-09-04","source_type":"cashback","cashback_kind":"reward","voided_at":"2026-09-05T00:00:00Z"}'),
  ('credit_card_bills', '{"uid":"u","doc_id":"bill-ok","account_id":"card","amount_paid":299,"status":"PAID","doc":{"paymentIds":["cb1"]}}'),
  ('credit_card_bills', '{"uid":"u","doc_id":"bill-over","account_id":"card","amount_paid":500,"status":"PARTIALLY_PAID","doc":{"paymentIds":["cb2"]}}');

do $$
declare
  s record;
begin
  for s in select tbl, row from seed loop
    perform public.readmodel_upsert(s.tbl, jsonb_build_array(
      jsonb_build_object('doc', '{}'::jsonb, 'source_path', 'p', 'source_update_time', '2026-10-05T00:00:00Z',
                         'schema_version', 1, 'mapping_status', 'mapped') || s.row));
  end loop;
end
$$;

-- ─── Missing data is null plus a data-quality row, never 0 ──────────────────
do $$
begin
  if (select total from public.v_period_totals where uid = 'u' and month = '2026-10' and category_key = 'Fuel') is not null then
    raise exception 'a group with a missing amount must total null';
  end if;
  if (select total from public.v_period_totals where uid = 'u' and month = '2026-10' and category_key = 'Food') <> 100 then
    raise exception 'a complete group must still total';
  end if;
  if (select total_expenses from public.v_cash_flow_by_month where uid = 'u' and month = '2026-10') is not null then
    raise exception 'a month with a missing amount must total null';
  end if;
  if not exists (select 1 from public.v_data_quality where uid = 'u' and doc_id = 'e3' and problem = 'missing amount') then
    raise exception 'missing amount not reported in v_data_quality';
  end if;
end
$$;

-- ─── Cashback: voided rows are history, not money received ──────────────────
do $$
declare
  r record;
begin
  select * into r from public.v_cashback_history where uid = 'u' and card_id = 'card';
  if r.entries <> 3 or r.total_received <> 598 or r.total_voided <> 50 or r.statement_credits <> 598 or r.rewards <> 0 then
    raise exception 'cashback history wrong: %', row_to_json(r);
  end if;
end
$$;

-- ─── Invariants ──────────────────────────────────────────────────────────────
do $$
declare
  found text;
begin
  select string_agg(format('%s:%s', check_name, doc_id), ', ' order by check_name, doc_id) into found
  from public.readmodel_invariants() where uid = 'u';
  if found is distinct from
     'balance_mismatch:drift, bill_overpaid:bill-over, duplicate_cashback:cb1, orphan_account:e4, orphan_bill:e4' then
    raise exception 'invariants found: %', found;
  end if;
  -- bank: 1000 - 100 = 900 stored: no mismatch. bill-ok: paid by its live payment: fine.
end
$$;

-- ─── Repair rewrites a diverged row even at the same version ────────────────
do $$
declare
  n integer;
begin
  update public.expenses set amount = 999 where uid = 'u' and doc_id = 'e1';
  -- The normal upsert ignores a same-version row.
  n := public.readmodel_upsert('expenses', '[{"uid":"u","doc_id":"e1","amount":100,"doc":{},"source_path":"p","source_update_time":"2026-10-05T00:00:00Z","schema_version":1,"mapping_status":"mapped"}]');
  if n <> 0 or (select amount from public.expenses where uid = 'u' and doc_id = 'e1') <> 999 then
    raise exception 'setup: upsert should not have healed the row';
  end if;
  n := public.readmodel_repair('expenses', '[{"uid":"u","doc_id":"e1","amount":100,"date":"2026-10-01","month":"2026-10","category":"Food","account_id":"bank","doc":{},"source_path":"p","source_update_time":"2026-10-05T00:00:00Z","schema_version":1,"mapping_status":"mapped"}]');
  if n <> 1 or (select amount from public.expenses where uid = 'u' and doc_id = 'e1') <> 100 then
    raise exception 'repair did not restore the row';
  end if;
  -- Repair never goes back in time.
  n := public.readmodel_repair('expenses', '[{"uid":"u","doc_id":"e1","amount":1,"doc":{},"source_path":"p","source_update_time":"2026-09-01T00:00:00Z","schema_version":1,"mapping_status":"mapped"}]');
  if n <> 0 then raise exception 'repair applied an older version'; end if;
end
$$;

reset role;

-- ─── Views read as the caller. Clients may read only the ones a screen uses
--     (SPENDLY-513: the cash-flow chart); anon reads none ───────────────────
do $$
declare
  v text;
begin
  foreach v in array array['v_period_totals', 'v_cash_flow_by_month', 'v_cashback_history', 'v_account_flows',
                           'v_account_flow_rows', 'v_account_balances', 'v_data_quality', 'v_active_expenses', 'v_active_incomes'] loop
    if has_table_privilege('anon', format('public.%I', v), 'select') then
      raise exception '% is readable by anon', v;
    end if;
    if has_table_privilege('authenticated', format('public.%I', v), 'select')
       <> (v in ('v_cash_flow_by_month', 'v_active_expenses', 'v_active_incomes')) then
      raise exception '% client grant differs from the SPENDLY-513 list', v;
    end if;
    if not exists (select 1 from pg_class c where c.relname = v and c.relnamespace = 'public'::regnamespace
                   and 'security_invoker=true' = any(c.reloptions)) then
      raise exception '% is not security_invoker', v;
    end if;
  end loop;
  if has_function_privilege('authenticated', 'public.readmodel_invariants()', 'execute')
     or has_function_privilege('authenticated', 'public.readmodel_repair(text, jsonb)', 'execute') then
    raise exception 'a client role can call the parity functions';
  end if;
end
$$;

rollback;
select 'read-model views tests passed' as result;
