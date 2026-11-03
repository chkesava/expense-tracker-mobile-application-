-- SPENDLY-587 spike (local Docker Supabase only, never production).
-- Prototype of SPENDLY-669 rm_client_apply and SPENDLY-593 realtime ping.

alter table public.expenses
  add column if not exists written_by text not null default 'server' check (written_by in ('client', 'server')),
  add column if not exists client_written_at timestamptz;

-- The app's only write path. security definer: the caller has no table write
-- grant; every rule is enforced here, with the caller's verified JWT claims.
create or replace function public.rm_client_apply(p_table text, p_rows jsonb default '[]'::jsonb, p_deletes jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me text := readmodel_auth.uid();
  n_up integer := 0;
  n_del integer := 0;
begin
  if me is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_table not in ('expenses') then
    raise exception 'table not allowed: %', p_table using errcode = '42501';
  end if;
  if exists (select 1 from jsonb_array_elements(p_rows) r where r->>'uid' is distinct from me)
     or exists (select 1 from jsonb_array_elements(p_deletes) d where d->>'uid' is distinct from me) then
    raise exception 'rows for another user' using errcode = '42501';
  end if;
  if exists (select 1 from jsonb_array_elements(p_rows) r
             where jsonb_typeof(r->'doc') is distinct from 'object' or (r->>'client_written_at') is null) then
    raise exception 'bad row shape' using errcode = '22023';
  end if;

  -- Version guard: a client row lands only over nothing, an older client
  -- write, or a server row older than it. Server rows (push, sync) always win
  -- later, because the server writers don't consult client_written_at.
  insert into public.expenses as t (
    uid, doc_id, amount, date, month, category, subcategory, account_id, credit_card_bill_id, subscription_id,
    soft_deleted_at, doc, source_path, source_update_time, source_deleted, deleted_at, schema_version, mapping_status,
    synced_at, written_by, client_written_at)
  select uid, doc_id, amount, date, month, category, subcategory, account_id, credit_card_bill_id, subscription_id,
    soft_deleted_at, doc, coalesce(source_path, 'users/' || uid || '/expenses/' || doc_id),
    client_written_at, false, null, coalesce(schema_version, 1), coalesce(mapping_status, 'mapped'),
    now(), 'client', client_written_at
  from jsonb_populate_recordset(null::public.expenses, p_rows)
  on conflict (uid, doc_id) do update set
    amount = excluded.amount, date = excluded.date, month = excluded.month, category = excluded.category,
    subcategory = excluded.subcategory, account_id = excluded.account_id,
    credit_card_bill_id = excluded.credit_card_bill_id, subscription_id = excluded.subscription_id,
    soft_deleted_at = excluded.soft_deleted_at, doc = excluded.doc, source_deleted = false, deleted_at = null,
    synced_at = now(), written_by = 'client', client_written_at = excluded.client_written_at,
    source_update_time = excluded.source_update_time
  where (t.written_by = 'client' and t.client_written_at < excluded.client_written_at)
     or (t.written_by = 'server' and t.source_update_time < excluded.client_written_at);
  get diagnostics n_up = row_count;

  update public.expenses t set
    source_deleted = true, deleted_at = now(), synced_at = now(), written_by = 'client',
    client_written_at = (d->>'client_written_at')::timestamptz
  from jsonb_array_elements(p_deletes) d
  where t.uid = me and t.doc_id = d->>'doc_id'
    and coalesce(t.client_written_at, t.source_update_time) < (d->>'client_written_at')::timestamptz;
  get diagnostics n_del = row_count;

  return jsonb_build_object('upserted', n_up, 'tombstoned', n_del);
end
$$;
revoke all on function public.rm_client_apply(text, jsonb, jsonb) from public, anon;
grant execute on function public.rm_client_apply(text, jsonb, jsonb) to authenticated;

-- Realtime: a ping (no document data) on the owner's private topic, on any
-- real change. The version guards mean an unchanged row never fires it.
create or replace function public.rm_ping_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object('table', tg_table_name, 'doc_id', new.doc_id, 'synced_at', new.synced_at, 'deleted', new.source_deleted),
    'changed',
    'user:' || new.uid,
    true
  );
  return null;
end
$$;
drop trigger if exists expenses_rm_ping on public.expenses;
create trigger expenses_rm_ping after insert or update on public.expenses
  for each row execute function public.rm_ping_changes();

-- Who may receive a topic's pings: its owner, through the same identity check
-- as every read policy (refuses duress, expired, wrong issuer/audience).
drop policy if exists rm_user_topic_read on realtime.messages;
create policy rm_user_topic_read on realtime.messages
  for select to authenticated
  using ((select realtime.topic()) = 'user:' || (select readmodel_auth.uid()));
