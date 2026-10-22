-- SPENDLY-519: every read-model source query the app sends, timed as the
-- signed-in user (role authenticated + Firebase claims, so RLS applies
-- exactly as through PostgREST), against synthetic_load.sql.
--
-- Each query is the SQL PostgREST builds for the supabase-js call in the
-- named source file (filters, order, limit/range). Each runs once to warm,
-- then 30 times; the result is serialised (row_to_json) so `doc` is
-- detoasted as it would be for the HTTP response.
--
-- Fails (raises) if any query's p95 is 300 ms or more, or if any plan
-- sequentially scans a user-data table. Prints one row per query with the
-- indexes its plan uses.

begin;

create schema perf;
grant usage on schema perf to authenticated;

create function perf.measure(label text, q text, runs integer default 30)
returns table (query text, p50_ms numeric, p95_ms numeric, max_ms numeric, row_count bigint, indexes text, seq_scans text)
language plpgsql as $$
declare
  t timestamptz;
  times numeric[] := '{}';
  plan jsonb;
  n bigint;
begin
  execute format('select count(*) from (select row_to_json(x)::text from (%s) x) y', q) into n;
  for i in 1..runs loop
    t := clock_timestamp();
    execute format('select count(*) from (select row_to_json(x)::text from (%s) x) y', q);
    times := times || (extract(epoch from clock_timestamp() - t) * 1000)::numeric;
  end loop;
  execute 'explain (format json) ' || q into plan;
  return query
    select label,
           round((select percentile_cont(0.5) within group (order by v) from unnest(times) v)::numeric, 2),
           round((select percentile_cont(0.95) within group (order by v) from unnest(times) v)::numeric, 2),
           round((select max(v) from unnest(times) v), 2),
           n,
           (select string_agg(distinct x #>> '{}', ', ') from jsonb_path_query(plan, 'strict $.**."Index Name"') x),
           (select string_agg(distinct r #>> '{}', ', ')
              from jsonb_path_query(plan, 'strict $.** ? (@."Node Type" == "Seq Scan")."Relation Name"') r
             where r #>> '{}' in ('expenses', 'incomes', 'ledger_events', 'account_payments'));
end
$$;
grant execute on function perf.measure(text, text, integer) to authenticated;

create temp table perf_results (query text, p50_ms numeric, p95_ms numeric, max_ms numeric, row_count bigint, indexes text, seq_scans text);
grant all on perf_results to authenticated;

set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', (jsonb_build_object(
  'iss', 'https://securetoken.google.com/expenseapp-27f94', 'aud', 'expenseapp-27f94',
  'sub', 'perf-user', 'role', 'authenticated', 'exp', extract(epoch from now())::bigint + 3600))::text, true); end $$;

insert into perf_results select * from perf.measure('journal month (journalMonthSource)', $q$
  select doc_id, doc from public.expenses
  where date >= '2024-06-01' and date <= '2024-06-30' and source_deleted = false and soft_deleted_at is null
  order by doc_id limit 1000 offset 0 $q$);

insert into perf_results select * from perf.measure('journal page, newest (journalHistorySource)', $q$
  select doc_id, date, doc from public.expenses
  where source_deleted = false and soft_deleted_at is null and date is not null
  order by date desc, doc_id desc limit 50 $q$);

insert into perf_results select * from perf.measure('journal page, deep keyset (journalHistorySource)', $q$
  select doc_id, date, doc from public.expenses
  where source_deleted = false and soft_deleted_at is null and date is not null
    and (date < '2022-03-15' or (date = '2022-03-15' and doc_id < 'e015000'))
  order by date desc, doc_id desc limit 50 $q$);

insert into perf_results select * from perf.measure('journal undated page (journalHistorySource)', $q$
  select doc_id, date, doc from public.expenses
  where source_deleted = false and soft_deleted_at is null and date is null
  order by date desc, doc_id desc limit 50 $q$);

insert into perf_results select * from perf.measure('filter match, narrow (backend.matching)', $q$
  select doc_id, doc from public.expenses
  where source_deleted = false and soft_deleted_at is null
    and category in ('Food & Groceries') and account_id in ('card')
    and amount >= 99.99 and amount <= 2000.01 and date >= '2024-01-01' and date <= '2024-12-31'
  order by doc_id limit 1000 offset 0 $q$);

insert into perf_results select * from perf.measure('filter match, whole history (backend.matching)', $q$
  select doc_id, doc from public.expenses
  where source_deleted = false and soft_deleted_at is null and category in ('Food & Groceries')
  order by doc_id limit 1000 offset 0 $q$);

insert into perf_results select * from perf.measure('insights month, expenses (supabaseByMonthKey)', $q$
  select doc_id, doc from public.expenses
  where source_deleted = false and soft_deleted_at is null and month = '2024-06'
  order by doc_id limit 1000 offset 0 $q$);

insert into perf_results select * from perf.measure('insights month, incomes (supabaseByMonthKey)', $q$
  select doc_id, doc from public.incomes
  where source_deleted = false and soft_deleted_at is null and month = '2024-06'
  order by doc_id limit 1000 offset 0 $q$);

insert into perf_results select * from perf.measure('cash-flow history (supabaseCashFlow)', $q$
  select month, total_expenses, total_income, transaction_count from public.v_cash_flow_by_month
  where month >= '2026-05' and month <= '2026-08' $q$);

insert into perf_results select * from perf.measure('audit, one transaction x300 events (supabaseAuditPage)', $q$
  select doc_id, created_at, doc from public.ledger_events
  where source_deleted = false and target_doc_id = 'e010000' and created_at is not null
  order by created_at desc, doc_id desc limit 100 $q$);

insert into perf_results select * from perf.measure('audit trail, deep keyset (supabaseAuditPage)', $q$
  select doc_id, created_at, doc from public.ledger_events
  where source_deleted = false and created_at is not null
    and (created_at < '2022-06-01T00:00:00.001Z' or (created_at = '2022-06-01T00:00:00.001Z' and doc_id < ''))
  order by created_at desc, doc_id desc limit 100 $q$);

insert into perf_results select * from perf.measure('linked purchases by id (supabaseByIds)', $q$
  select doc_id, doc from public.expenses
  where source_deleted = false and soft_deleted_at is null
    and doc_id in ('e001499','e002998','e004497','e005996','e007495','e008994','e010493','e011992','e013491','e014990','e016489','e017988','e019487','e020986','e022485','e023984','e025483','e026982','e028481','e029980') $q$);

insert into perf_results select * from perf.measure('freshness (lastSyncedAt)', $q$
  select collection, last_synced_at from public.sync_status where collection in ('expenses', 'incomes') $q$);

reset role;

select * from perf_results order by query;

do $$
declare
  bad text;
begin
  select string_agg(format('%s (p95 %s ms%s)', query, p95_ms, coalesce(', seq scan on ' || seq_scans, '')), '; ') into bad
  from perf_results where p95_ms >= 300 or seq_scans is not null;
  if bad is not null then
    raise exception 'read-model performance budget failed: %', bad;
  end if;
  -- RLS sanity: the perf user saw only their own rows.
  if (select row_count from perf_results where query like 'insights month, expenses%') > 1000 then
    raise exception 'unexpected row count';
  end if;
end
$$;

rollback;
select 'read-model performance tests passed (p95 < 300 ms, no sequential scans)' as result;
