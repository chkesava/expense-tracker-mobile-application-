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
-- There is no table here on purpose: the function reads nothing, writes
-- nothing and returns the constant 1. Granting it to `anon` is harmless even
-- though the publishable key ships in the APK -- anyone calling it learns only
-- that the project is awake.
--
-- ROLLBACK
-- --------
--   drop function if exists public.keep_alive();

create or replace function public.keep_alive()
returns integer
language sql
stable
security invoker
set search_path = ''
as $$ select 1 $$;

-- Supabase's default privileges grant EXECUTE on new public functions to
-- anon and authenticated; reset to exactly one grantee.
revoke all on function public.keep_alive() from public, anon, authenticated;
grant execute on function public.keep_alive() to anon;

-- Make PostgREST expose /rest/v1/rpc/keep_alive without waiting for its
-- schema cache to refresh.
notify pgrst, 'reload schema';

-- Verify. Expected: one row, keep_alive = 1.
select public.keep_alive() as keep_alive;
