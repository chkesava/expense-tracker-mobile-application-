-- SPENDLY-519: synthetic load for the read-model performance tests.
--
-- Run only against a throwaway database (see run_perf.sh). Never against a
-- Supabase project: it inserts ~300K fake rows.
--
-- The SPENDLY-423 success metric: a 30K-transaction user. Here:
--   perf-user  30,000 expenses over 5 years (1 in 50 soft-deleted, 1 in 200
--              tombstoned, 150 undated), 3,000 incomes, 2,000 payments
--              (500 cashback), 20,000 ledger events, one transaction
--              (e010000) with 300 events of its own
--   49 others  5,000 expenses, 500 incomes and 2,000 events each, so `uid`
--              selectivity is realistic (perf-user is ~10% of the table)
-- Docs carry a realistic payload (~350 bytes). Deterministic (setseed).

select setseed(0.519);

-- Expenses.
insert into public.expenses (uid, doc_id, amount, date, month, category, subcategory, account_id,
                             soft_deleted_at, doc, source_path, source_update_time, source_deleted)
select s.uid, s.doc_id, s.amount, s.d, to_char(s.d, 'YYYY-MM'), s.category, s.subcategory, s.account_id,
       case when s.i % 50 = 0 then timestamptz '2026-01-01' end,
       jsonb_build_object(
         'amount', s.amount, 'date', s.d, 'month', to_char(s.d, 'YYYY-MM'), 'category', s.category,
         'subcategory', s.subcategory, 'accountId', s.account_id, 'paymentMethod', 'UPI',
         'note', 'Synthetic purchase ' || s.i || ' at merchant ' || (s.i % 400),
         'tags', jsonb_build_array('synthetic', 'perf'), 'source', 'manual',
         'createdAt', '2026-01-01T10:00:00.000Z', 'updatedAt', '2026-01-02T10:00:00.000Z'),
       'users/' || s.uid || '/expenses/' || s.doc_id, now(), s.i % 200 = 0
from (
  select u.uid, g.i,
         'e' || lpad(g.i::text, 6, '0') as doc_id,
         round((1 + random() * 4999)::numeric, 2) as amount,
         case when u.uid = 'perf-user' and g.i % 200 = 7 then null
              else date '2021-11-01' + (g.i * 7919 % 1826) end as d,
         (array['Food & Groceries', 'Transport & Vehicles', 'Shopping & Clothing', 'Health & Medical',
                'Bills & Communication', 'Entertainment & Hobbies', 'Home & Household', 'Finance'])[1 + g.i % 8] as category,
         (array['Groceries / Kirana', 'Petrol', 'Electronics', null, 'Mobile', 'OTT'])[1 + g.i % 6] as subcategory,
         (array['bank', 'card', 'wallet', 'sbi', 'axis'])[1 + g.i % 5] as account_id
  from (select 'perf-user' as uid, 30000 as n
        union all select 'noise-' || k, 5000 from generate_series(1, 49) k) u
  cross join lateral generate_series(1, u.n) g(i)
) s;

-- Incomes.
insert into public.incomes (uid, doc_id, amount, date, month, source, account_id, doc, source_path, source_update_time)
select s.uid, s.doc_id, s.amount, s.d, to_char(s.d, 'YYYY-MM'), 'Salary', 'bank',
       jsonb_build_object('amount', s.amount, 'date', s.d, 'month', to_char(s.d, 'YYYY-MM'), 'source', 'Salary',
                          'accountId', 'bank', 'note', 'Synthetic income ' || s.i, 'createdAt', '2026-01-01T10:00:00.000Z'),
       'users/' || s.uid || '/incomes/' || s.doc_id, now()
from (
  select u.uid, g.i, 'i' || lpad(g.i::text, 6, '0') as doc_id,
         round((100 + random() * 90000)::numeric, 2) as amount,
         date '2021-11-01' + (g.i * 613 % 1826) as d
  from (select 'perf-user' as uid, 3000 as n
        union all select 'noise-' || k, 500 from generate_series(1, 49) k) u
  cross join lateral generate_series(1, u.n) g(i)
) s;

-- Account payments (a quarter are cashback on the card).
insert into public.account_payments (uid, doc_id, from_account_id, to_account_id, amount, date, cashback_kind,
                                     source_type, voided_at, doc, source_path, source_update_time)
select 'perf-user', 'p' || lpad(g.i::text, 6, '0'),
       case when g.i % 4 = 0 then 'cashback' else 'bank' end, 'card',
       round((10 + random() * 20000)::numeric, 2), date '2021-11-01' + (g.i * 331 % 1826),
       case when g.i % 4 = 0 then 'statement_credit' end,
       case when g.i % 4 = 0 then 'cashback' else 'account' end,
       case when g.i % 97 = 0 then timestamptz '2026-01-01' end,
       jsonb_build_object('amount', 1, 'linkedExpenseId', 'e' || lpad((g.i * 13 % 30000 + 1)::text, 6, '0')),
       'users/perf-user/accountPayments/p' || g.i, now()
from generate_series(1, 2000) g(i);

-- Ledger events: 20,000 for perf-user spread over transactions, plus 300 on
-- e010000; 2,000 per noise user.
insert into public.ledger_events (uid, doc_id, kind, action, target_doc_id, created_at, doc, source_path, source_update_time)
select s.uid, s.doc_id, 'expense', (array['update', 'delete', 'restore'])[1 + s.i % 3], s.target, s.at,
       jsonb_build_object('kind', 'expense', 'action', (array['update', 'delete', 'restore'])[1 + s.i % 3],
                          'docId', s.target, 'createdAt', to_char(s.at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                          'before', jsonb_build_object('amount', 100), 'after', jsonb_build_object('amount', 120)),
       'users/' || s.uid || '/ledgerEvents/' || s.doc_id, now()
from (
  select u.uid, g.i, 'le' || lpad(g.i::text, 6, '0') as doc_id,
         case when u.uid = 'perf-user' and g.i <= 300 then 'e010000'
              else 'e' || lpad((g.i * 7 % 30000 + 1)::text, 6, '0') end as target,
         timestamptz '2021-11-01' + (g.i * 9973 % 157766400) * interval '1 second' as at
  from (select 'perf-user' as uid, 20300 as n
        union all select 'noise-' || k, 2000 from generate_series(1, 49) k) u
  cross join lateral generate_series(1, u.n) g(i)
) s;

-- SPENDLY-609 Save Goals: 60 goals and 20,000 goal events for perf-user (one
-- goal, g0001, holds 5,000 of them); 1,000 events per noise user.
insert into public.financial_goals (uid, doc_id, name, status, target_amount, current_amount, created_at, pinned, doc, source_path, source_update_time)
select 'perf-user', 'g' || lpad(g.i::text, 4, '0'), 'Goal ' || g.i,
       (array['active', 'paused', 'completed', 'archived', 'cancelled'])[1 + g.i % 5],
       100000, round((random() * 100000)::numeric, 2), timestamptz '2021-11-01' + g.i * interval '9 days', g.i % 7 = 0,
       jsonb_build_object('name', 'Goal ' || g.i), 'users/perf-user/financialGoals/g' || g.i, now()
from generate_series(1, 60) g(i);

insert into public.goal_events (uid, doc_id, goal_id, type, amount_delta, reason, created_at, doc, source_path, source_update_time)
select s.uid, s.doc_id, s.goal_id, (array['contribution', 'reduction', 'correction'])[1 + s.i % 3],
       case when s.i % 3 = 1 then -50 else 500 end, 'savings', s.at,
       jsonb_build_object('goalId', s.goal_id, 'note', 'perf'), 'users/' || s.uid || '/goalEvents/' || s.doc_id, now()
from (
  select u.uid, g.i, 'ge' || lpad(g.i::text, 6, '0') as doc_id,
         case when u.uid = 'perf-user' and g.i <= 5000 then 'g0001'
              else 'g' || lpad((g.i % 60 + 1)::text, 4, '0') end as goal_id,
         timestamptz '2021-11-01' + (g.i * 9973 % 157766400) * interval '1 second' as at
  from (select 'perf-user' as uid, 20000 as n
        union all select 'noise-' || k, 1000 from generate_series(1, 49) k) u
  cross join lateral generate_series(1, u.n) g(i)
) s;

insert into public.sync_status (uid, collection, last_synced_at)
select u, c, now() from unnest(array['perf-user']) u, unnest(array['expenses', 'incomes', 'ledgerEvents', 'accountPayments']) c;

analyze;

select 'synthetic load: ' ||
  (select count(*) from public.expenses where uid = 'perf-user') || ' perf-user expenses, ' ||
  (select count(*) from public.expenses) || ' expenses total, ' ||
  (select count(*) from public.ledger_events) || ' ledger events' as result;
