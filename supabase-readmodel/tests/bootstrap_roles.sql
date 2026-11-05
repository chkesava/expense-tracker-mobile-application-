-- SPENDLY-504: lets the migrations apply to a plain Postgres (CI service
-- container or a throwaway local cluster) by creating the roles a Supabase
-- database already has. Never run this against a Supabase project.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

-- Mimic Supabase's default: new public tables are granted to the API roles.
-- The migration must undo this, and assert_security.sql proves it did.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;

-- SPENDLY-505: Supabase's auth.jwt(), as Supabase defines it. PostgREST puts
-- the verified token's claims in request.jwt.claims; the behaviour tests set
-- that setting by hand to impersonate a token.
create schema if not exists auth;
create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.jwt() to anon, authenticated, service_role;

-- SPENDLY-593: a stand-in for Supabase Realtime's schema, as far as the read
-- model uses it: realtime.send (Broadcast from the database), realtime.topic()
-- and realtime.messages (where Broadcast authorization policies live). Sent
-- messages land in realtime.messages, so the tests can read the pings back.
-- Like Supabase's own send, a failure only warns: it never breaks the write.
create schema if not exists realtime;
create table if not exists realtime.messages (
  id          bigserial   primary key,
  topic       text        not null,
  extension   text        not null default 'broadcast',
  payload     jsonb,
  event       text,
  private     boolean     default false,
  inserted_at timestamptz not null default now()
);
alter table realtime.messages enable row level security;
create or replace function realtime.topic()
returns text
language sql
stable
as $$
  select nullif(current_setting('realtime.topic', true), '')
$$;
create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true)
returns void
language plpgsql
as $$
begin
  insert into realtime.messages (topic, payload, event, private) values (topic, payload, event, private);
exception when others then
  raise warning 'realtime.send failed: %', sqlerrm;
end
$$;
grant usage on schema realtime to anon, authenticated, service_role;
grant select on realtime.messages to authenticated;
