-- BlogGenius canonical license foundation.
-- This table existed in production before the repository gained migrations.

create extension if not exists pgcrypto with schema extensions;

create table public.licenses (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default timezone('utc', now()),
    license_key text not null unique,
    status text not null default 'active'
        check (status in ('active', 'inactive', 'expired', 'revoked')),
    hwid text,
    usage_count integer not null default 0 check (usage_count >= 0),
    usage_limit integer not null default 0 check (usage_limit >= 0),
    reset_date timestamptz,
    email text,
    note text,
    plan_code text not null default 'pro',
    license_mode text not null default 'metered'
        check (license_mode in ('metered', 'unlimited')),
    expires_at timestamptz,
    updated_at timestamptz not null default timezone('utc', now())
);

create index idx_licenses_license_key on public.licenses (license_key);
create index idx_licenses_email on public.licenses (email);
create index idx_licenses_plan_code on public.licenses (plan_code, status);

alter table public.licenses enable row level security;
revoke all on table public.licenses from public, anon, authenticated;
grant all on table public.licenses to service_role;
