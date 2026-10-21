-- Development Supabase: move the existing catalog history from `stable` to `development`.
-- This preserves the already-applied 2026-10-21.5 payload and does not depend on
-- another catalog row or insert a duplicate version.

begin;

do $$
begin
    if not exists (
        select 1
          from public.ai_model_catalog_versions
         where version = '2026-10-21.5'
           and status = 'published'
           and channel in ('stable', 'development')
    ) then
        raise exception 'Expected published catalog 2026-10-21.5 in the Development project';
    end if;
end
$$;

update public.ai_model_catalog_versions
   set channel = 'development'
 where channel = 'stable';

create or replace function public.get_ai_model_catalog(
    p_channel text default 'production',
    p_app_version text default '0.0.0'
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
    select jsonb_build_object(
        'version', version,
        'schema_version', schema_version,
        'payload', payload,
        'minimum_app_version', minimum_app_version,
        'published_at', published_at
    )
      from public.ai_model_catalog_versions
     where status = 'published'
       and channel = coalesce(nullif(trim(p_channel), ''), 'production')
       and public.ai_catalog_version_tuple(minimum_app_version)
           <= public.ai_catalog_version_tuple(p_app_version)
     order by published_at desc nulls last, created_at desc
     limit 1;
$$;

grant execute on function public.get_ai_model_catalog(text, text)
    to anon, authenticated, service_role;
revoke all on function public.get_ai_model_catalog(text, text) from public;

commit;

select channel, status, count(*) as catalog_versions
  from public.ai_model_catalog_versions
 group by channel, status
 order by channel, status;

select public.get_ai_model_catalog('development', '0.7.0')->>'version' as development_catalog;
