-- One-time Development and Production alignment for public.licenses and
-- public.license_plans. Run this same SQL against each project, Development
-- first and Production after its preflight. This is an operator action, not a
-- migration. Review the preflight and backup state before each apply.
-- It never copies, deletes, or rewrites license rows.

-- 1) READ-ONLY PREFLIGHT
-- Run this block first. It returns schema metadata, aggregate safety counts,
-- and only the two plan quota values; it does not expose license records.
select
    column_name,
    is_nullable,
    column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'licenses'
  and column_name in (
      'status', 'usage_count', 'usage_limit', 'plan_code',
      'license_mode', 'updated_at'
  )
order by ordinal_position;

select
    count(*) filter (where status is null) as null_status,
    count(*) filter (where status is not null and status not in ('active', 'inactive', 'expired', 'revoked')) as invalid_status,
    count(*) filter (where usage_count is null) as null_usage_count,
    count(*) filter (where usage_count < 0) as invalid_usage_count,
    count(*) filter (where usage_limit is null) as null_usage_limit,
    count(*) filter (where usage_limit < 0) as invalid_usage_limit,
    count(*) filter (where plan_code is null or btrim(plan_code) = '') as null_plan_code,
    count(*) filter (where license_mode is null or license_mode not in ('metered', 'unlimited')) as invalid_license_mode,
    count(*) filter (where updated_at is null) as null_updated_at
from public.licenses;

select plan_code, quota_mode, quota_limit, quota_cycle
from public.license_plans
where plan_code in ('test', 'free', 'pro', 'ultra')
order by plan_code;

-- Stop here if any license safety count is nonzero, or if test/free plan rows
-- are missing. Resolve that separately; do not modify license rows here.

-- 2) APPLY (transactional and repeatable)
begin;

do $$
begin
    if to_regclass('public.licenses') is null then
        raise exception 'Required table public.licenses is missing; this script does not create or replace it.';
    end if;
    if to_regclass('public.license_plans') is null then
        raise exception 'Required table public.license_plans is missing; stop and reconcile the Production baseline first.';
    end if;
    if exists (
        select 1
          from public.licenses
         where status is null
            or status not in ('active', 'inactive', 'expired', 'revoked')
            or usage_count is null
            or usage_count < 0
            or usage_limit is null
            or usage_limit < 0
            or plan_code is null
            or btrim(plan_code) = ''
            or license_mode is null
            or license_mode not in ('metered', 'unlimited')
            or updated_at is null
    ) then
        raise exception 'Existing public.licenses rows do not satisfy the target constraints. No alignment was applied.';
    end if;
    if not exists (select 1 from public.license_plans where plan_code = 'test')
       or not exists (select 1 from public.license_plans where plan_code = 'free') then
        raise exception 'Required test/free plan row is missing. No alignment was applied.';
    end if;
end;
$$;

-- Existing records are preserved. NOT NULL and CHECK constraints are added
-- only after the guard above confirms every current record already complies.
alter table public.licenses
    alter column status set not null,
    alter column usage_count set not null,
    alter column usage_limit set not null,
    alter column plan_code set not null,
    alter column license_mode set not null,
    alter column updated_at set not null,
    alter column usage_limit set default 20;

do $$
begin
    if not exists (
        select 1 from pg_constraint
         where conrelid = 'public.licenses'::regclass
           and conname = 'licenses_status_check'
    ) then
        alter table public.licenses
            add constraint licenses_status_check
            check (status in ('active', 'inactive', 'expired', 'revoked'));
    end if;
    if not exists (
        select 1 from pg_constraint
         where conrelid = 'public.licenses'::regclass
           and conname = 'licenses_usage_count_check'
    ) then
        alter table public.licenses
            add constraint licenses_usage_count_check
            check (usage_count >= 0);
    end if;
    if not exists (
        select 1 from pg_constraint
         where conrelid = 'public.licenses'::regclass
           and conname = 'licenses_usage_limit_check'
    ) then
        alter table public.licenses
            add constraint licenses_usage_limit_check
            check (usage_limit >= 0);
    end if;
    if not exists (
        select 1 from pg_constraint
         where conrelid = 'public.licenses'::regclass
           and conname = 'licenses_license_mode_check'
    ) then
        alter table public.licenses
            add constraint licenses_license_mode_check
            check (license_mode in ('metered', 'unlimited'));
    end if;
end;
$$;

-- Match the approved plan policy (using audited Production values). The UPDATE is a no-op when a row
-- already has the target value, and it does not touch license records.
update public.license_plans
   set quota_limit = 50
 where plan_code = 'test'
   and quota_limit is distinct from 50;

update public.license_plans
   set quota_limit = 20
 where plan_code = 'free'
   and quota_limit is distinct from 20;

commit;

-- 3) READ-ONLY POSTFLIGHT
-- Re-run the column and plan queries above. Also run the license aggregate
-- query; all violation counts must remain zero. No per-license rows are read.

-- 4) ROLLBACK NOTES (use only for the project where this operation ran)
-- Development rollback to the audited pre-alignment policy:
--   begin;
--   alter table public.licenses alter column usage_limit set default 0;
--   update public.license_plans set quota_limit = 20 where plan_code = 'test';
--   update public.license_plans set quota_limit = 15 where plan_code = 'free';
--   commit;
-- Dev already had the target NOT NULL and CHECK constraints, so keep them.
--
-- Production rollback to the audited pre-alignment schema:
--   begin;
--   alter table public.licenses alter column usage_limit set default 5;
--   alter table public.licenses alter column status drop not null;
--   alter table public.licenses alter column usage_count drop not null;
--   alter table public.licenses alter column usage_limit drop not null;
--   alter table public.licenses alter column plan_code drop not null;
--   alter table public.licenses alter column license_mode drop not null;
--   alter table public.licenses alter column updated_at drop not null;
--   alter table public.licenses drop constraint if exists licenses_status_check;
--   alter table public.licenses drop constraint if exists licenses_usage_count_check;
--   alter table public.licenses drop constraint if exists licenses_usage_limit_check;
--   alter table public.licenses drop constraint if exists licenses_license_mode_check;
--   commit;
-- Production already had the approved test=50/free=20 plan values, so this
-- operation does not change them there. Neither rollback changes license rows.

-- This operation does not reconcile supabase_migrations.schema_migrations,
-- deploy newsletter objects, or authorize a broad `supabase db push`.
