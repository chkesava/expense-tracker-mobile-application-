-- SPENDLY-595 (epic SPENDLY-586): the read model runs on the Supabase **Free
-- plan** (the user's decision, 2026-11-04). The hourly health check watches its
-- limits through this function: database size (500 MB on Free) and realtime
-- messages sent in the last 24 h (counted against the monthly allowance).
-- Egress and concurrent realtime connections aren't visible from SQL; the
-- runbook's monthly check reads them from the dashboard.
--
-- Numbers only, no user data. Service role only, like readmodel_live_counts.

create or replace function public.readmodel_capacity()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  messages bigint := null;
begin
  -- realtime.messages keeps a few days of Broadcast messages (593's pings).
  if to_regclass('realtime.messages') is not null then
    execute 'select count(*) from realtime.messages where inserted_at > now() - interval ''24 hours'''
      into messages;
  end if;
  return jsonb_build_object(
    'db_bytes', pg_database_size(current_database()),
    'realtime_messages_24h', messages,
    'largest_tables', (
      select coalesce(jsonb_agg(jsonb_build_object('table', t.relname, 'bytes', t.bytes) order by t.bytes desc), '[]'::jsonb)
      from (
        select c.relname, pg_total_relation_size(c.oid) as bytes
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
        order by pg_total_relation_size(c.oid) desc
        limit 5
      ) t
    )
  );
end
$$;

revoke all on function public.readmodel_capacity() from public, anon, authenticated;
grant execute on function public.readmodel_capacity() to service_role;
