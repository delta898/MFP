-- Public Runtime Config must never expose provider or OAuth credentials.
-- Production rollout is gated until the compatible Desktop release and old-client policy are approved.

begin;

delete from public.app_runtime_configs
 where lower(config_key) in (
    'google_oauth_client_id',
    'google_oauth_client_secret',
    'naver_client_id',
    'naver_client_secret'
 );

drop function if exists public.get_runtime_config(text[]);

create function public.get_runtime_config(p_keys text[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_allowed_keys constant text[] := array[
        'NAVER_AUTO_CATEGORIES_MASTER',
        'BLOG_AUTO_CATEGORIES_MASTER',
        'blog_auto_categories_master',
        'naver_auto_categories_master'
    ];
    v_result jsonb;
begin
    if p_keys is null or cardinality(p_keys) = 0 then
        raise exception using errcode = '22023', message = 'runtime config keys are required';
    end if;

    if exists (
        select 1
          from unnest(p_keys) as requested(config_key)
         where trim(coalesce(requested.config_key, '')) = ''
            or not (requested.config_key = any(v_allowed_keys))
    ) then
        raise exception using errcode = '22023', message = 'runtime config key is not public';
    end if;

    select coalesce(jsonb_object_agg(config_key, config_value), '{}'::jsonb)
      into v_result
      from public.app_runtime_configs
     where is_active = true
       and config_key = any(p_keys)
       and config_key = any(v_allowed_keys);

    return v_result;
end;
$$;

revoke all on function public.get_runtime_config(text[]) from public;
grant execute on function public.get_runtime_config(text[]) to anon, authenticated, service_role;

commit;
