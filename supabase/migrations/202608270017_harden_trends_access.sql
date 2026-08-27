-- Harden an existing trends.items deployment for backend-only access.
-- Safe target architecture:
-- - trends-api uses SUPABASE_SECRET_KEY / service_role server-side only
-- - WordPress and browsers never query Supabase directly
-- - anon/authenticated should not have direct access to trends.items

revoke all on schema trends from anon, authenticated;
grant usage on schema trends to service_role;

revoke all on all tables in schema trends from anon, authenticated;
revoke all on all routines in schema trends from anon, authenticated;
revoke all on all sequences in schema trends from anon, authenticated;

grant all on all tables in schema trends to service_role;
grant all on all routines in schema trends to service_role;
grant all on all sequences in schema trends to service_role;

alter default privileges for role postgres in schema trends revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema trends revoke all on routines from anon, authenticated;
alter default privileges for role postgres in schema trends revoke all on sequences from anon, authenticated;

alter default privileges for role postgres in schema trends grant all on tables to service_role;
alter default privileges for role postgres in schema trends grant all on routines to service_role;
alter default privileges for role postgres in schema trends grant all on sequences to service_role;

alter table if exists trends.items enable row level security;
