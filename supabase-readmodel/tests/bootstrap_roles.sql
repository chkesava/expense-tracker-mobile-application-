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
