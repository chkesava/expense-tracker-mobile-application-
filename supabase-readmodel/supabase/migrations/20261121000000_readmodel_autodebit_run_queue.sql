-- SPENDLY-796 (epic SPENDLY-793; follows SPENDLY-737, 790 and 791): the read
-- model notices an app save that can change whether an account covers its
-- coming auto-debits, and starts the server autodebit-daily job for that user.
-- The job re-reads Firestore and stores serverResults/autoDebitShortfall. Without
-- this, a top-up or an edit would leave the low-balance banner stale until the
-- next morning.
--
-- * The same server-only queue as bill-daily, epf-daily and space-daily
--   (server_run_queue), job 'autodebit-daily'. Triggers queue the owner only
--   for an APP save (written_by = 'client'). An app delete is an update with
--   written_by = 'client' too.
--     - subscriptions: an item that debits an account now, or did before the
--       update (`account_id`). Creating, editing, pausing and deleting it all
--       count.
--     - accounts, credit_card_bills, group_funds: only for a user who has an
--       auto-debit. That is an active subscription with an account, or a card
--       linked to a paying account (`doc->>'autopayFromAccountId'`, now or
--       before for accounts). This covers balance changes from expenses and
--       incomes, bill payments and held money.
--   Server writes (the sync, the push, the job's own result) never queue.
--   serverResults is not watched, so the job's own write can't loop.
-- * server_run_dispatch now also dispatches autodebit-daily.yml in queue mode,
--   with the same per-job once-a-minute debounce and no uid in the request.
--   The earlier jobs' dispatches are unchanged.
-- * Duress uids are never queued. The SPENDLY-737 purge trigger already clears
--   every job's rows for a purged user.
-- * Nothing here computes a displayed number. The job derives the result from
--   Firestore with the shared TypeScript engine (READ_MODEL_RULES R4.3a).

-- ─── The queue takes the auto-debit job ───────────────────────────────────

alter table public.server_run_queue drop constraint if exists server_run_queue_job_check;
alter table public.server_run_queue
  add constraint server_run_queue_job_check
  check (job in ('bill-daily', 'epf-daily', 'space-daily', 'autodebit-daily'));

-- ─── Dispatch: every queued job, in queue mode ─────────────────────────────

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
    when 'autodebit-daily' then 'autodebit-daily.yml'
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

-- ─── Who has an auto-debit (a filter, not a figure) ────────────────────────

create or replace function public.server_run_has_autodebits(p_uid text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.subscriptions s
    where s.uid = p_uid and s.deleted_at is null
      and coalesce(s.is_active, false) and coalesce(s.account_id, '') <> ''
  ) or exists (
    select 1 from public.accounts a
    where a.uid = p_uid and a.deleted_at is null
      and coalesce(a.doc->>'autopayFromAccountId', '') <> ''
  )
$$;

revoke all on function public.server_run_has_autodebits(text) from public, anon, authenticated;

-- ─── Queue helper: the owners of these rows ────────────────────────────────

create or replace function public.server_run_queue_autodebit_owners(p_uids text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  queued integer;
begin
  insert into public.server_run_queue as q (uid, job, requested_at)
  select distinct u, 'autodebit-daily', now()
  from unnest(p_uids) as u
  where coalesce(u, '') <> ''
    and right(u, 7) <> '_duress'
  on conflict (uid, job) do update set requested_at = excluded.requested_at;
  get diagnostics queued = row_count;
  if queued > 0 then
    perform public.server_run_dispatch('autodebit-daily');
  end if;
end
$$;

revoke all on function public.server_run_queue_autodebit_owners(text[]) from public, anon, authenticated;

-- ─── Trigger: an app save to a recurring item that debits an account ───────

create or replace function public.server_run_note_autodebit_subscriptions_ins()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.server_run_queue_autodebit_owners(array(
    select c.uid from changed c
    where c.written_by = 'client' and coalesce(c.account_id, '') <> ''
  ));
  return null;
exception when others then
  raise warning 'server_run_note_autodebit_subscriptions_ins: %', sqlerrm;
  return null;
end
$$;

create or replace function public.server_run_note_autodebit_subscriptions_upd()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.server_run_queue_autodebit_owners(array(
    select c.uid
    from changed c
    left join previous p on p.uid = c.uid and p.doc_id = c.doc_id
    where c.written_by = 'client'
      and (coalesce(c.account_id, '') <> '' or coalesce(p.account_id, '') <> '')
  ));
  return null;
exception when others then
  raise warning 'server_run_note_autodebit_subscriptions_upd: %', sqlerrm;
  return null;
end
$$;

revoke all on function public.server_run_note_autodebit_subscriptions_ins() from public, anon, authenticated;
revoke all on function public.server_run_note_autodebit_subscriptions_upd() from public, anon, authenticated;

drop trigger if exists subscriptions_autodebit_run_ins on public.subscriptions;
drop trigger if exists subscriptions_autodebit_run_upd on public.subscriptions;
create trigger subscriptions_autodebit_run_ins after insert on public.subscriptions
  referencing new table as changed
  for each statement execute function public.server_run_note_autodebit_subscriptions_ins();
create trigger subscriptions_autodebit_run_upd after update on public.subscriptions
  referencing old table as previous new table as changed
  for each statement execute function public.server_run_note_autodebit_subscriptions_upd();

-- ─── Trigger: an app save to an account (balance or autopay link) ──────────

create or replace function public.server_run_note_autodebit_accounts_ins()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.server_run_queue_autodebit_owners(array(
    select distinct c.uid from changed c
    where c.written_by = 'client'
      and (coalesce(c.doc->>'autopayFromAccountId', '') <> '' or public.server_run_has_autodebits(c.uid))
  ));
  return null;
exception when others then
  raise warning 'server_run_note_autodebit_accounts_ins: %', sqlerrm;
  return null;
end
$$;

create or replace function public.server_run_note_autodebit_accounts_upd()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.server_run_queue_autodebit_owners(array(
    select distinct c.uid
    from changed c
    left join previous p on p.uid = c.uid and p.doc_id = c.doc_id
    where c.written_by = 'client'
      and (coalesce(c.doc->>'autopayFromAccountId', '') <> ''
           or coalesce(p.doc->>'autopayFromAccountId', '') <> ''
           or public.server_run_has_autodebits(c.uid))
  ));
  return null;
exception when others then
  raise warning 'server_run_note_autodebit_accounts_upd: %', sqlerrm;
  return null;
end
$$;

revoke all on function public.server_run_note_autodebit_accounts_ins() from public, anon, authenticated;
revoke all on function public.server_run_note_autodebit_accounts_upd() from public, anon, authenticated;

drop trigger if exists accounts_autodebit_run_ins on public.accounts;
drop trigger if exists accounts_autodebit_run_upd on public.accounts;
create trigger accounts_autodebit_run_ins after insert on public.accounts
  referencing new table as changed
  for each statement execute function public.server_run_note_autodebit_accounts_ins();
create trigger accounts_autodebit_run_upd after update on public.accounts
  referencing old table as previous new table as changed
  for each statement execute function public.server_run_note_autodebit_accounts_upd();

-- ─── Trigger: an app save to a card bill or a group fund ──────────────────

create or replace function public.server_run_note_autodebit_owner_rows()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.server_run_queue_autodebit_owners(array(
    select distinct c.uid from changed c
    where c.written_by = 'client' and public.server_run_has_autodebits(c.uid)
  ));
  return null;
exception when others then
  raise warning 'server_run_note_autodebit_owner_rows: %', sqlerrm;
  return null;
end
$$;

revoke all on function public.server_run_note_autodebit_owner_rows() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['credit_card_bills', 'group_funds'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_autodebit_run_ins', t);
    execute format('drop trigger if exists %I on public.%I', t || '_autodebit_run_upd', t);
    execute format(
      'create trigger %I after insert on public.%I referencing new table as changed '
      'for each statement execute function public.server_run_note_autodebit_owner_rows()', t || '_autodebit_run_ins', t);
    execute format(
      'create trigger %I after update on public.%I referencing new table as changed '
      'for each statement execute function public.server_run_note_autodebit_owner_rows()', t || '_autodebit_run_upd', t);
  end loop;
end
$$;
