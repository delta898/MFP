-- Make function ownership boundaries explicit for the canonical baseline.

alter function public._license_calc_period_bounds(text, timestamptz)
    set search_path = public, extensions;
alter function public._smart_usage_kst_period_bounds(timestamptz)
    set search_path = public, extensions;
alter function public.set_current_timestamp_updated_at()
    set search_path = public, extensions;

revoke all on function public._license_calc_period_bounds(text, timestamptz)
    from public, anon, authenticated;
revoke all on function public._smart_usage_kst_period_bounds(timestamptz)
    from public, anon, authenticated;
revoke all on function public._smart_usage_authorize(text, text)
    from public, anon, authenticated;
revoke all on function public.set_current_timestamp_updated_at()
    from public, anon, authenticated;
revoke all on function public.set_app_surface_updated_at()
    from public, anon, authenticated;
revoke all on function public.ai_catalog_version_tuple(text)
    from public, anon, authenticated;
revoke all on function public.app_surface_version_tuple(text)
    from public, anon, authenticated;
revoke all on function public.mark_license_registration_code_send_status(text, text, text, text, text)
    from public, anon, authenticated;

grant execute on function public._license_calc_period_bounds(text, timestamptz)
    to service_role;
grant execute on function public._smart_usage_kst_period_bounds(timestamptz)
    to service_role;
grant execute on function public._smart_usage_authorize(text, text)
    to service_role;
grant execute on function public.set_current_timestamp_updated_at()
    to service_role;
grant execute on function public.set_app_surface_updated_at()
    to service_role;
grant execute on function public.ai_catalog_version_tuple(text)
    to service_role;
grant execute on function public.app_surface_version_tuple(text)
    to service_role;
grant execute on function public.mark_license_registration_code_send_status(text, text, text, text, text)
    to service_role;

alter table public.license_plans enable row level security;
alter table public.license_device_states enable row level security;
alter table public.licenses enable row level security;

revoke all on table public.license_plans from public, anon, authenticated;
revoke all on table public.license_device_states from public, anon, authenticated;
revoke all on table public.licenses from public, anon, authenticated;

grant all on table public.license_plans to service_role;
grant all on table public.license_device_states to service_role;
grant all on table public.licenses to service_role;
