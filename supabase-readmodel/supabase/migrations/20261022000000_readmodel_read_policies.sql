-- SPENDLY-505: signed-in users may read their own read-model rows, and
-- nothing else.
--
-- Identity is Supabase third-party auth with Firebase (ADR §7, option 1). The
-- app sends its Firebase ID token; Supabase verifies its signature against
-- Firebase's keys, and a token carrying the custom claim
-- `role: "authenticated"` (set by netlify/functions/readmodel-claims.ts) runs
-- as the `authenticated` role. Tokens without the claim run as `anon`, which
-- holds no grants at all.
--
-- `readmodel_auth.uid()` is defence in depth on top of Supabase's own check:
-- it returns the token's uid only when the token was issued for this Firebase
-- project, is unexpired, carries the role claim and is not a duress uid.
-- Anything else yields null, and `uid = null` matches no row.
--
-- authenticated gets SELECT only. There are no insert/update/delete grants or
-- policies: the sync job (service role, server-side only) is the only writer.
-- Sync bookkeeping stays server-only, except the caller's own sync_status
-- rows, which drive "last synced" labels.

-- ─── Identity helper ────────────────────────────────────────────────────────

create schema if not exists readmodel_auth;
revoke all on schema readmodel_auth from public, anon;
grant usage on schema readmodel_auth to authenticated;

create or replace function readmodel_auth.uid()
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when claims ->> 'iss' = 'https://securetoken.google.com/expenseapp-27f94'
     and claims ->> 'aud' = 'expenseapp-27f94'
     and claims ->> 'role' = 'authenticated'
     and coalesce(claims ->> 'sub', '') <> ''
     and right(claims ->> 'sub', 7) <> '_duress'
     and (claims ->> 'exp') ~ '^[0-9]+$'
     and (claims ->> 'exp')::bigint > extract(epoch from now())
    then claims ->> 'sub'
  end
  from (select auth.jwt() as claims) as token
$$;

revoke all on function readmodel_auth.uid() from public, anon;
grant execute on function readmodel_auth.uid() to authenticated;

-- ─── Owner-only SELECT on every user-data table ─────────────────────────────

do $$
declare
  t text;
begin
  foreach t in array array[
    'expenses', 'incomes', 'ledger_events', 'accounts', 'account_types',
    'account_transfers', 'account_entries', 'account_payments',
    'credit_card_bills', 'categories'
  ] loop
    execute format('grant select on public.%I to authenticated', t);
    execute format(
      'create policy %I on public.%I for select to authenticated '
      'using (uid = (select readmodel_auth.uid()) and not source_deleted)',
      t || '_owner_read', t
    );
  end loop;
end
$$;

grant select on public.sync_status to authenticated;
create policy sync_status_owner_read on public.sync_status
  for select to authenticated
  using (uid = (select readmodel_auth.uid()));
