-- SPENDLY-583: the push rate limit, daily counters and their lockdown.
-- Run after the migrations. Rolled back at the end; any failure raises.

begin;

-- 1. The allowance: 4 × 30 fits a limit of 120, the 5th call doesn't, and a
--    refused call keeps the account refused until the window ends.
do $$
begin
  if not public.readmodel_push_allow('push-user', 30, 120, 600) then raise exception 'call 1 refused'; end if;
  if not public.readmodel_push_allow('push-user', 30, 120, 600) then raise exception 'call 2 refused'; end if;
  if not public.readmodel_push_allow('push-user', 30, 120, 600) then raise exception 'call 3 refused'; end if;
  if not public.readmodel_push_allow('push-user', 30, 120, 600) then raise exception 'call 4 refused'; end if;
  if public.readmodel_push_allow('push-user', 1, 120, 600) then raise exception 'call over the limit allowed'; end if;
  if public.readmodel_push_allow('push-user', 1, 120, 600) then raise exception 'retry over the limit allowed'; end if;
  -- Another account has its own allowance.
  if not public.readmodel_push_allow('other-user', 50, 120, 600) then raise exception 'other account refused'; end if;
end
$$;

-- 2. When the window has passed, the allowance starts again.
update public.push_quota set window_start = now() - interval '11 minutes'
 where uid_hash = public.readmodel_uid_hash('push-user');
do $$
begin
  if not public.readmodel_push_allow('push-user', 30, 120, 600) then raise exception 'not reset after the window'; end if;
  if (select used from public.push_quota where uid_hash = public.readmodel_uid_hash('push-user')) <> 30 then
    raise exception 'usage not reset to the new cost';
  end if;
end
$$;

-- 3. No uid is stored, only the hash.
do $$
begin
  if exists (select 1 from public.push_quota where uid_hash in ('push-user', 'other-user')) then
    raise exception 'push_quota stores a raw uid';
  end if;
end
$$;

-- 4. Daily counters add up.
select public.readmodel_push_record(1, 3, 0, 0, 0, 3);
select public.readmodel_push_record(1, 0, 1, 1, 1, 28);
do $$
declare
  r record;
begin
  select * into r from public.push_daily where day = (now() at time zone 'utc')::date;
  if r.requests <> 2 or r.docs <> 3 or r.user_syncs <> 1 or r.rejected <> 1 or r.failed <> 1 or r.reads <> 31 then
    raise exception 'push_daily totals wrong: %', row_to_json(r);
  end if;
end
$$;

-- 5. Erasing an account removes its quota row (trigger on purged_users).
do $$
begin
  perform public.readmodel_purge_user('push-user');
  if exists (select 1 from public.push_quota where uid_hash = public.readmodel_uid_hash('push-user')) then
    raise exception 'purge left the push quota row';
  end if;
  if not exists (select 1 from public.push_quota where uid_hash = public.readmodel_uid_hash('other-user')) then
    raise exception 'purge removed another account''s quota row';
  end if;
end
$$;

-- 6. Server only: client roles can't call the functions or read the tables.
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.readmodel_push_allow(text, integer, integer, integer)',
    'public.readmodel_push_record(integer, integer, integer, integer, integer, integer)',
    'public.readmodel_push_forget_purged()'
  ] loop
    if has_function_privilege('authenticated', f, 'execute') or has_function_privilege('anon', f, 'execute') then
      raise exception 'a client role can execute %', f;
    end if;
  end loop;
  if has_table_privilege('authenticated', 'public.push_quota', 'select') or has_table_privilege('anon', 'public.push_daily', 'select') then
    raise exception 'a client role can read the push tables';
  end if;
end
$$;

rollback;
select 'read-model push tests passed' as result;
