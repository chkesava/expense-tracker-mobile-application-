-- SPENDLY-583: per-write push to the read model (Netlify `readmodel-push`).
--
-- Two server-only tables. Neither holds a uid: the quota is keyed by the same
-- sha256 hash as purged_users, and the daily counters hold totals only.
--
-- push_quota   a rate limit per account: at most p_limit "cost" units (1 per
--              pushed document, 30 per per-user sync) in a rolling window.
-- push_daily   requests, documents, per-user syncs, rejected and failed
--              pushes, and Firestore reads, per UTC day (health summary).
--
-- Service role only, like the sync functions; RLS on, no policies, no client
-- grants (tests/assert_security.sql).

create table if not exists public.push_quota (
  uid_hash      text        primary key,
  window_start  timestamptz not null,
  used          integer     not null
);
alter table public.push_quota enable row level security;
revoke all on table public.push_quota from anon, authenticated;

create table if not exists public.push_daily (
  day          date    primary key,
  requests     integer not null default 0,
  docs         integer not null default 0,
  user_syncs   integer not null default 0,
  rejected     integer not null default 0,
  failed       integer not null default 0,
  reads        integer not null default 0
);
alter table public.push_daily enable row level security;
revoke all on table public.push_daily from anon, authenticated;

-- Spends p_cost from the account's allowance; true when the call is within
-- it. One atomic statement, so concurrent pushes can't both slip through.
-- A refused call still counts, so a client that keeps retrying stays refused
-- until its window ends.
create or replace function public.readmodel_push_allow(p_uid text, p_cost integer, p_limit integer, p_window_seconds integer)
returns boolean
language sql
set search_path = ''
as $$
  insert into public.push_quota as q (uid_hash, window_start, used)
  values (public.readmodel_uid_hash(p_uid), now(), greatest(p_cost, 0))
  on conflict (uid_hash) do update set
    window_start = case when q.window_start <= now() - make_interval(secs => p_window_seconds) then now() else q.window_start end,
    used         = case when q.window_start <= now() - make_interval(secs => p_window_seconds) then greatest(p_cost, 0)
                        else q.used + greatest(p_cost, 0) end
  returning used <= p_limit
$$;

create or replace function public.readmodel_push_record(
  p_requests integer, p_docs integer, p_user_syncs integer, p_rejected integer, p_failed integer, p_reads integer
)
returns void
language sql
set search_path = ''
as $$
  insert into public.push_daily as d (day, requests, docs, user_syncs, rejected, failed, reads)
  values ((now() at time zone 'utc')::date, p_requests, p_docs, p_user_syncs, p_rejected, p_failed, p_reads)
  on conflict (day) do update set
    requests   = d.requests + excluded.requests,
    docs       = d.docs + excluded.docs,
    user_syncs = d.user_syncs + excluded.user_syncs,
    rejected   = d.rejected + excluded.rejected,
    failed     = d.failed + excluded.failed,
    reads      = d.reads + excluded.reads
$$;

revoke all on function public.readmodel_push_allow(text, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.readmodel_push_record(integer, integer, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.readmodel_push_allow(text, integer, integer, integer) to service_role;
grant execute on function public.readmodel_push_record(integer, integer, integer, integer, integer, integer) to service_role;

-- An erased account's quota row goes with it: whenever readmodel_purge_user
-- records an account in purged_users, its push_quota row is deleted. A
-- trigger, so the purge function itself is unchanged.
create or replace function public.readmodel_push_forget_purged()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  delete from public.push_quota where uid_hash = new.uid_hash;
  return new;
end
$$;
revoke all on function public.readmodel_push_forget_purged() from public, anon, authenticated;

drop trigger if exists purged_users_forget_push_quota on public.purged_users;
create trigger purged_users_forget_push_quota
  after insert on public.purged_users
  for each row execute function public.readmodel_push_forget_purged();
