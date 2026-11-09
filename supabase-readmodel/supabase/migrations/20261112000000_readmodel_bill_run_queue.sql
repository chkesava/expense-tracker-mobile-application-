-- SPENDLY-737 (epic SPENDLY-735: the app only delivers; calculations run on
-- the server). The read model notices a money action and starts the server
-- bill job for that user. The app sends nothing extra: its save already reaches
-- this database within seconds (rm_client_apply, written_by = 'client').
--
-- * A statement trigger on the bill inputs (expenses, account_payments,
--   credit_card_bills, accounts) queues the user in server_run_queue when an
--   APP save changes them (written_by = 'client'). Server writes (the sync,
--   the push, bill-daily's own bills) never queue: no loops.
-- * At most once a minute it asks GitHub to run bill-daily.yml in queue mode
--   (pg_net, async: sent only if the transaction commits). The job reads the
--   queue itself, so no uid ever appears in workflow inputs or public logs.
-- * Off until the owner stores a GitHub token (Actions: read and write, this
--   repository only) in Vault as 'spendly_github_dispatch_token'. Without it
--   the queue still fills and the daily 03:00 UTC run drains it.
-- * Duress uids are never queued. A purge removes the user's queue rows.
-- * Server-only: RLS on, no policies, no client grants. Nothing here computes a
--   displayed number; the job writes Firestore (READ_MODEL_RULES R4.3a).

-- pg_net is a Supabase extension; the CI Postgres stands in for it (tests/bootstrap_roles.sql).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
end
$$;

-- ─── The queue ──────────────────────────────────────────────────────────────

create table if not exists public.server_run_queue (
  uid           text        not null,
  job           text        not null check (job in ('bill-daily')),
  requested_at  timestamptz not null default now(),
  primary key (uid, job)
);
alter table public.server_run_queue enable row level security;
revoke all on public.server_run_queue from public, anon, authenticated;
grant select, delete on public.server_run_queue to service_role;

-- When a dispatch was last sent, per job (the once-a-minute debounce).
create table if not exists public.server_run_dispatches (
  job               text        primary key,
  last_dispatch_at  timestamptz not null
);
alter table public.server_run_dispatches enable row level security;
revoke all on public.server_run_dispatches from public, anon, authenticated;
grant select on public.server_run_dispatches to service_role;

-- ─── Dispatch: ask GitHub to run the job in queue mode ─────────────────────

create or replace function public.server_run_dispatch(p_job text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  token text;
begin
  if p_job is distinct from 'bill-daily' then
    return false;
  end if;
  begin
    select s.decrypted_secret into token
    from vault.decrypted_secrets s
    where s.name = 'spendly_github_dispatch_token'
    limit 1;
  exception when others then
    token := null;
  end;
  if coalesce(token, '') = '' then
    return false; -- not configured: the daily run drains the queue
  end if;

  -- Debounce: one dispatch a minute. A queued run (concurrency group
  -- bill-daily) picks up everything queued before it reads the queue.
  insert into public.server_run_dispatches as d (job, last_dispatch_at)
  values (p_job, now())
  on conflict (job) do update set last_dispatch_at = excluded.last_dispatch_at
    where d.last_dispatch_at < now() - interval '60 seconds';
  if not found then
    return false;
  end if;

  perform net.http_post(
    url := 'https://api.github.com/repos/chkesava/expense-tracker-mobile-application-/actions/workflows/bill-daily.yml/dispatches',
    body := jsonb_build_object('ref', 'main', 'inputs', jsonb_build_object('dry_run', 'false', 'trigger', 'queue')),
    headers := jsonb_build_object(
      'Accept', 'application/vnd.github+json',
      'Authorization', 'Bearer ' || token,
      'Content-Type', 'application/json',
      'User-Agent', 'spendly-readmodel',
      'X-GitHub-Api-Version', '2022-11-28'
    )
  );
  return true;
exception when others then
  -- Never fail the app's save over a dispatch: the daily run catches up.
  raise warning 'server_run_dispatch: %', sqlerrm;
  return false;
end
$$;

revoke all on function public.server_run_dispatch(text) from public, anon, authenticated;

-- ─── The trigger: an app save to a bill input queues its owner ─────────────

create or replace function public.server_run_note_bill_inputs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  queued integer;
begin
  insert into public.server_run_queue as q (uid, job, requested_at)
  select distinct c.uid, 'bill-daily', now()
  from changed c
  where c.written_by = 'client'
    and coalesce(c.uid, '') <> ''
    and right(c.uid, 7) <> '_duress'
  on conflict (uid, job) do update set requested_at = excluded.requested_at;
  get diagnostics queued = row_count;
  if queued > 0 then
    perform public.server_run_dispatch('bill-daily');
  end if;
  return null;
exception when others then
  raise warning 'server_run_note_bill_inputs: %', sqlerrm;
  return null;
end
$$;

revoke all on function public.server_run_note_bill_inputs() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['expenses', 'account_payments', 'credit_card_bills', 'accounts'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_bill_run_ins', t);
    execute format('drop trigger if exists %I on public.%I', t || '_bill_run_upd', t);
    execute format(
      'create trigger %I after insert on public.%I referencing new table as changed '
      'for each statement execute function public.server_run_note_bill_inputs()', t || '_bill_run_ins', t);
    execute format(
      'create trigger %I after update on public.%I referencing new table as changed '
      'for each statement execute function public.server_run_note_bill_inputs()', t || '_bill_run_upd', t);
  end loop;
end
$$;

-- ─── Purge: a purged account leaves nothing queued ──────────────────────────
-- readmodel_purge_user records each purged uid's hash in purged_users; the
-- queue is cleared from there, so the purge function itself is untouched.

create or replace function public.server_run_forget_purged()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.server_run_queue q
  where public.readmodel_uid_hash(q.uid) = new.uid_hash;
  return null;
end
$$;

revoke all on function public.server_run_forget_purged() from public, anon, authenticated;

drop trigger if exists purged_users_server_run_forget on public.purged_users;
create trigger purged_users_server_run_forget
  after insert on public.purged_users
  for each row execute function public.server_run_forget_purged();
