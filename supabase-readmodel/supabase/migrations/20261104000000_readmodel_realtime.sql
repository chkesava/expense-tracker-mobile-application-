-- SPENDLY-593 (epic SPENDLY-586, ADR v2 D2): realtime from the read model.
--
-- Not postgres_changes: the owner read policy hides tombstones
-- (`not source_deleted`), so deletes would never reach a subscriber. Instead,
-- every real change to a synced table sends a **ping** to the owner's private
-- Broadcast topic `user:<uid>`. A ping carries table, doc ids, the deleted flag
-- and synced_at, never document data. The app refetches through PostgREST
-- (RLS), or applies the delete.
--
-- * One ping per user per write statement (statement-level triggers with
--   transition tables), not one per row: a 200-row sync batch is one message.
--   Over 100 changed rows for one user, the ping says `resync` instead of
--   listing them.
-- * The version guards mean an unchanged row is never updated, so a nightly
--   pass over unchanged data sends nothing.
-- * readmodel_changes_since: what the app missed while realtime was down
--   (reconnect, or polling while it stays down). Ids and times only,
--   tombstones included, for the caller's own uid.
-- * realtime.messages RLS: only the topic's owner, through the same identity
--   check as every read policy (refuses duress, expired, wrong issuer/audience).

-- ─── The ping ───────────────────────────────────────────────────────────────

create or replace function public.readmodel_ping()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select c.uid,
           count(*) as n,
           max(c.synced_at) as synced_at,
           jsonb_agg(jsonb_build_object('doc_id', c.doc_id, 'deleted', c.source_deleted) order by c.doc_id) as changes
    from changed c
    group by c.uid
  loop
    perform realtime.send(
      case
        when r.n > 100 then jsonb_build_object('table', tg_table_name, 'synced_at', r.synced_at, 'resync', true)
        else jsonb_build_object('table', tg_table_name, 'synced_at', r.synced_at, 'changes', r.changes)
      end,
      'changed',
      'user:' || r.uid,
      true
    );
  end loop;
  return null;
end
$$;

revoke all on function public.readmodel_ping() from public, anon, authenticated;

-- Every table the sync writes (they all carry written_by). A table added later
-- must get these two triggers in its own migration (assert_security checks).
do $$
declare
  t text;
begin
  for t in
    select c.table_name
    from information_schema.columns c
    where c.table_schema = 'public' and c.column_name = 'written_by' and public.readmodel_sync_table_ok(c.table_name)
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_rm_ping_ins', t);
    execute format('drop trigger if exists %I on public.%I', t || '_rm_ping_upd', t);
    execute format(
      'create trigger %I after insert on public.%I referencing new table as changed '
      'for each statement execute function public.readmodel_ping()', t || '_rm_ping_ins', t);
    execute format(
      'create trigger %I after update on public.%I referencing new table as changed '
      'for each statement execute function public.readmodel_ping()', t || '_rm_ping_upd', t);
  end loop;
end
$$;

-- ─── Who may receive a topic's pings ────────────────────────────────────────

drop policy if exists readmodel_user_topic_read on realtime.messages;
create policy readmodel_user_topic_read on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and (select realtime.topic()) = 'user:' || (select readmodel_auth.uid())
  );

-- ─── What the app missed ────────────────────────────────────────────────────

create or replace function public.readmodel_changes_since(p_since timestamptz, p_limit integer default 500)
returns table (table_name text, doc_id text, synced_at timestamptz, deleted boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me text := readmodel_auth.uid();
  q text;
begin
  if me is null then
    raise exception 'readmodel_changes_since: not allowed' using errcode = '42501';
  end if;
  select string_agg(
           format('select %L::text, t.doc_id, t.synced_at, t.source_deleted from public.%I t where t.uid = $1 and t.synced_at > $2',
                  c.table_name, c.table_name),
           ' union all ' order by c.table_name)
    into q
  from information_schema.columns c
  where c.table_schema = 'public' and c.column_name = 'written_by' and public.readmodel_sync_table_ok(c.table_name);
  return query execute q || ' order by 3, 1, 2 limit $3'
    using me, coalesce(p_since, '-infinity'::timestamptz), least(greatest(coalesce(p_limit, 500), 1), 1000);
end
$$;

revoke all on function public.readmodel_changes_since(timestamptz, integer) from public, anon;
grant execute on function public.readmodel_changes_since(timestamptz, integer) to authenticated;
