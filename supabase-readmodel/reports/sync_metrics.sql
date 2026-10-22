-- SPENDLY-519: the sync's 30-day health, for the Phase 5 report.
--
-- Read-only. Paste into the Supabase SQL editor of the read-model project
-- (spmsgncjbnbkxvsbpqlu) once the sync has run for 30 days, and copy the
-- result rows into docs/SPENDLY-519-performance-security-cost.md. No uids
-- are selected.

with runs as (
  select mode, status, reads_used, read_budget, failures,
         extract(epoch from (finished_at - started_at)) as seconds,
         started_at
  from public.sync_runs
  where started_at >= now() - interval '30 days' and mode in ('sync', 'backfill')
)
select
  'runs (30 d)' as metric,
  count(*)::text as value
from runs
union all
select 'run duration p50 / p95 (s)',
       round(percentile_cont(0.5) within group (order by seconds)::numeric, 1) || ' / ' ||
       round(percentile_cont(0.95) within group (order by seconds)::numeric, 1)
from runs where seconds is not null
union all
select 'failure rate (failed + partial)',
       round(100.0 * count(*) filter (where status in ('failed', 'partial')) / nullif(count(*), 0), 2) || ' %'
from runs
union all
select 'never finished (still running / crashed)', count(*) filter (where status = 'running' and started_at < now() - interval '1 hour')::text
from runs
union all
select 'Firestore reads by the sync, per day (avg / max)',
       round(avg(day_reads)) || ' / ' || max(day_reads)
from (select date_trunc('day', started_at) d, sum(reads_used) day_reads from runs group by 1) per_day
union all
select 'documents failed (sum of failures)', coalesce(sum(failures), 0)::text from runs
union all
-- Data age as the app sees it: now − last_synced_at, over every (user, collection).
select 'data age now, p50 / p95 / max (min)',
       round(percentile_cont(0.5) within group (order by age)::numeric) || ' / ' ||
       round(percentile_cont(0.95) within group (order by age)::numeric) || ' / ' ||
       round(max(age)::numeric)
from (select extract(epoch from now() - last_synced_at) / 60 as age
      from public.sync_status where last_synced_at is not null) s
union all
select 'open sync failures', count(*)::text from public.sync_failures where resolved_at is null;
