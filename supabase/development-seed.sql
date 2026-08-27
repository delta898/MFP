-- Hosted development-only fake data.
-- Apply only after the development target preflight has passed. Never apply to production.

begin;

insert into public.licenses (
    license_key,
    status,
    hwid,
    usage_count,
    usage_limit,
    reset_date,
    email,
    note,
    plan_code,
    license_mode,
    expires_at
)
values (
    'BG-DEVELOPMENT-00000000-00000000-00000000',
    'active',
    null,
    0,
    100,
    date_trunc('month', timezone('utc', now())) + interval '1 month',
    'hosted-development@example.invalid',
    'hosted development smoke-test seed only',
    'pro',
    'metered',
    timezone('utc', now()) + interval '10 years'
)
on conflict (license_key) do update
set status = excluded.status,
    hwid = excluded.hwid,
    usage_count = excluded.usage_count,
    usage_limit = excluded.usage_limit,
    reset_date = excluded.reset_date,
    email = excluded.email,
    note = excluded.note,
    plan_code = excluded.plan_code,
    license_mode = excluded.license_mode,
    expires_at = excluded.expires_at,
    updated_at = timezone('utc', now());

insert into public.app_runtime_configs (config_key, config_value, is_active, note)
values
    ('bloggenius_environment', 'development', true, 'hosted development environment marker'),
    ('license_registration_code_ttl_seconds', '300', true, 'development fake configuration')
on conflict (config_key) do update
set config_value = excluded.config_value,
    is_active = excluded.is_active,
    note = excluded.note,
    updated_at = timezone('utc', now());

commit;
