-- Development-only rollback for the KIE Claude catalog publish.
-- Execute only against BlogGenius Development.

begin;

update public.ai_model_catalog_versions
   set status = 'retired'
 where version = '2026-10-21.2'
   and channel = 'stable'
   and status = 'published';

do $$
declare
    fallback_payload jsonb;
begin
    fallback_payload := public.get_ai_model_catalog('stable', '0.7.0');
    if fallback_payload is null or fallback_payload->>'version' = '2026-10-21.2' then
        raise exception 'Development rollback did not restore a published fallback catalog';
    end if;
end
$$;

commit;

select version, status, channel, minimum_app_version, published_at
  from public.ai_model_catalog_versions
 where version = '2026-10-21.2' and channel = 'stable';
