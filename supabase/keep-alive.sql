-- Keep-alive probe for the Supabase Free project (SPENDLY-125).
--
-- Run this once in the Supabase SQL editor. SAFE TO RERUN: it only
-- (re)creates one function and resets its grants.
--
-- WHY THIS EXISTS
-- ---------------
-- Free projects are paused after a stretch of low database activity. Spendly
-- keeps its data in Firestore and uses Supabase only for Storage and Edge
-- Functions, so on a quiet week nothing reaches Postgres. The
-- `Supabase Keep Alive` GitHub workflow calls this function every ~3 days.
-- See docs/SUPABASE_KEEP_ALIVE.md.
--
-- Supabase requires actual compute/storage activity to reset the pause timer.
-- Pure `select 1` is not enough, so this creates a single-row table to record
-- the ping. The function is security definer so anon can ping without table access.
--
-- ROLLBACK
-- --------
--   drop function if exists public.keep_alive();
--   drop table if exists public._keep_alive_logs;

create table if not exists public._keep_alive_logs (
  id integer primary key,
  last_ping timestamp with time zone not null default now()
);

-- Deny direct access to the table.
revoke all on table public._keep_alive_logs from public, anon, authenticated;

create or replace function public.keep_alive()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public._keep_alive_logs (id, last_ping)
  values (1, now())
  on conflict (id) do update set last_ping = now();
  
  return 1;
end;
$$;

-- Supabase's default privileges grant EXECUTE on new public functions to
-- anon and authenticated; reset to exactly one grantee.
revoke all on function public.keep_alive() from public, anon, authenticated;
grant execute on function public.keep_alive() to anon;

-- Make PostgREST expose /rest/v1/rpc/keep_alive without waiting for its
-- schema cache to refresh.
notify pgrst, 'reload schema';

-- Verify. Expected: one row, keep_alive = 1.
select public.keep_alive() as keep_alive;
