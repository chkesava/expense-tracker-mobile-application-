-- SPENDLY-791 (follows SPENDLY-737 and SPENDLY-790): the read model notices a
-- Space save, or a save to an expense in a Space, and starts the server Spaces
-- job for that user. Only space-daily writes financialSummaries/spaces (every
-- Space's totals from every expense assigned to it, any month); without this a
-- new or moved expense stayed off the Spaces screen until the next morning.
--
-- * The same server-only queue as bill-daily and epf-daily (server_run_queue),
--   job 'space-daily'. Triggers queue the owner when an APP save
--   (written_by = 'client'; an app delete is an update with written_by =
--   'client' too):
--     - changes a Space (spaces: insert or update);
--     - changes an expense that is in a Space now, or was before the update
--       (expenses: the doc's `spaceId`, new or old). Assigning, moving,
--       removing, editing and deleting all count; other expenses don't queue.
--   Server writes (the sync, the push, space-daily's own summary) never queue.
-- * server_run_dispatch now also dispatches space-daily.yml in queue mode, with
--   the same per-job once-a-minute debounce and no uid in the request. The
--   bill-daily and epf-daily dispatches are unchanged.
-- * Duress uids are never queued. The SPENDLY-737 purge trigger already clears
--   every job's rows for a purged user.
-- * Nothing here computes a displayed number: space-daily re-reads Firestore
--   and derives the summary whole (READ_MODEL_RULES R4.3a).

-- ─── The queue takes the Spaces job ────────────────────────────────────────

alter table public.server_run_queue drop constraint if exists server_run_queue_job_check;
alter table public.server_run_queue
  add constraint server_run_queue_job_check check (job in ('bill-daily', 'epf-daily', 'space-daily'));

-- ─── Dispatch: bill-daily, epf-daily or space-daily, in queue mode ─────────

create or replace function public.server_run_dispatch(p_job text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  token text;
  workflow text;
begin
  workflow := case p_job
    when 'bill-daily' then 'bill-daily.yml'
    when 'epf-daily' then 'epf-daily.yml'
    when 'space-daily' then 'space-daily.yml'
  end;
  if workflow is null then
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

  -- Debounce per job: one dispatch a minute. A queued run (the job's
  -- concurrency group) picks up everything queued before it reads the queue.
  insert into public.server_run_dispatches as d (job, last_dispatch_at)
  values (p_job, now())
  on conflict (job) do update set last_dispatch_at = excluded.last_dispatch_at
    where d.last_dispatch_at < now() - interval '60 seconds';
  if not found then
    return false;
  end if;

  perform net.http_post(
    url := 'https://api.github.com/repos/chkesava/expense-tracker-mobile-application-/actions/workflows/' || workflow || '/dispatches',
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

-- ─── Queue helper: the owners of these rows, app saves only ────────────────

create or replace function public.server_run_queue_space_owners(p_uids text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  queued integer;
begin
  insert into public.server_run_queue as q (uid, job, requested_at)
  select distinct u, 'space-daily', now()
  from unnest(p_uids) as u
  where coalesce(u, '') <> ''
    and right(u, 7) <> '_duress'
  on conflict (uid, job) do update set requested_at = excluded.requested_at;
  get diagnostics queued = row_count;
  if queued > 0 then
    perform public.server_run_dispatch('space-daily');
  end if;
end
$$;

revoke all on function public.server_run_queue_space_owners(text[]) from public, anon, authenticated;

-- ─── Trigger: an app save to a Space ───────────────────────────────────────

create or replace function public.server_run_note_spaces()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.server_run_queue_space_owners(array(
    select c.uid from changed c where c.written_by = 'client'
  ));
  return null;
exception when others then
  raise warning 'server_run_note_spaces: %', sqlerrm;
  return null;
end
$$;

revoke all on function public.server_run_note_spaces() from public, anon, authenticated;

drop trigger if exists spaces_space_run_ins on public.spaces;
drop trigger if exists spaces_space_run_upd on public.spaces;
create trigger spaces_space_run_ins after insert on public.spaces
  referencing new table as changed
  for each statement execute function public.server_run_note_spaces();
create trigger spaces_space_run_upd after update on public.spaces
  referencing new table as changed
  for each statement execute function public.server_run_note_spaces();

-- ─── Trigger: an app save to an expense in a Space (now or before) ─────────

create or replace function public.server_run_note_space_expense_ins()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.server_run_queue_space_owners(array(
    select c.uid from changed c
    where c.written_by = 'client'
      and coalesce(c.doc->>'spaceId', '') <> ''
  ));
  return null;
exception when others then
  raise warning 'server_run_note_space_expense_ins: %', sqlerrm;
  return null;
end
$$;

create or replace function public.server_run_note_space_expense_upd()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.server_run_queue_space_owners(array(
    select c.uid
    from changed c
    left join previous p on p.uid = c.uid and p.doc_id = c.doc_id
    where c.written_by = 'client'
      and (coalesce(c.doc->>'spaceId', '') <> '' or coalesce(p.doc->>'spaceId', '') <> '')
  ));
  return null;
exception when others then
  raise warning 'server_run_note_space_expense_upd: %', sqlerrm;
  return null;
end
$$;

revoke all on function public.server_run_note_space_expense_ins() from public, anon, authenticated;
revoke all on function public.server_run_note_space_expense_upd() from public, anon, authenticated;

drop trigger if exists expenses_space_run_ins on public.expenses;
drop trigger if exists expenses_space_run_upd on public.expenses;
create trigger expenses_space_run_ins after insert on public.expenses
  referencing new table as changed
  for each statement execute function public.server_run_note_space_expense_ins();
create trigger expenses_space_run_upd after update on public.expenses
  referencing old table as previous new table as changed
  for each statement execute function public.server_run_note_space_expense_upd();
