-- SPENDLY-790 (follows SPENDLY-737 and SPENDLY-740): the read model notices an
-- EPF save and starts the server EPF job for that user. Since SPENDLY-740 only
-- epf-daily writes financialSummaries/epf (net worth, the Accounts EPF card,
-- the dashboard, runway); without this a backfill or "mark credited" made
-- after the 08:30 IST run stayed off those screens until the next morning.
--
-- * The same server-only queue as bill-daily (server_run_queue), job
--   'epf-daily'. A statement trigger on the EPF ledger inputs
--   (epf_establishments, epf_contributions, epf_transfers, epf_reconciliations)
--   queues the owner when an APP save changes them (written_by = 'client';
--   an app delete is an update with written_by = 'client' too). Server writes
--   (the sync, the push, epf-daily's own interest and summary) never queue.
-- * server_run_dispatch now also dispatches epf-daily.yml in queue mode, with
--   the same per-job once-a-minute debounce and no uid in the request. The
--   bill-daily dispatch is unchanged.
-- * Duress uids are never queued. The SPENDLY-737 purge trigger already clears
--   every job's rows for a purged user.
-- * Nothing here computes a displayed number: epf-daily re-reads Firestore and
--   derives the summary whole (decideEpfSummarySync, READ_MODEL_RULES R4.3a).

-- ─── The queue takes the EPF job ────────────────────────────────────────────

alter table public.server_run_queue drop constraint if exists server_run_queue_job_check;
alter table public.server_run_queue
  add constraint server_run_queue_job_check check (job in ('bill-daily', 'epf-daily'));

-- ─── Dispatch: bill-daily or epf-daily, in queue mode ──────────────────────

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

-- ─── The trigger: an app save to an EPF ledger input queues its owner ──────

create or replace function public.server_run_note_epf_inputs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  queued integer;
begin
  insert into public.server_run_queue as q (uid, job, requested_at)
  select distinct c.uid, 'epf-daily', now()
  from changed c
  where c.written_by = 'client'
    and coalesce(c.uid, '') <> ''
    and right(c.uid, 7) <> '_duress'
  on conflict (uid, job) do update set requested_at = excluded.requested_at;
  get diagnostics queued = row_count;
  if queued > 0 then
    perform public.server_run_dispatch('epf-daily');
  end if;
  return null;
exception when others then
  raise warning 'server_run_note_epf_inputs: %', sqlerrm;
  return null;
end
$$;

revoke all on function public.server_run_note_epf_inputs() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['epf_establishments', 'epf_contributions', 'epf_transfers', 'epf_reconciliations'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_epf_run_ins', t);
    execute format('drop trigger if exists %I on public.%I', t || '_epf_run_upd', t);
    execute format(
      'create trigger %I after insert on public.%I referencing new table as changed '
      'for each statement execute function public.server_run_note_epf_inputs()', t || '_epf_run_ins', t);
    execute format(
      'create trigger %I after update on public.%I referencing new table as changed '
      'for each statement execute function public.server_run_note_epf_inputs()', t || '_epf_run_upd', t);
  end loop;
end
$$;
