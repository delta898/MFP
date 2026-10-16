-- Production-only rollback for the Gemini 4 Argon catalog publish.
-- Execute only against BlogGenius Production.

begin;

update public.ai_model_catalog_versions
   set status = 'retired'
 where version = '2026-10-16.1'
   and channel = 'stable'
   and status = 'published';

do $$
declare
    fallback_payload jsonb;
begin
    fallback_payload := public.get_ai_model_catalog('stable', '0.6.1');
    if fallback_payload is null
       or fallback_payload->>'version' = '2026-10-16.1' then
        raise exception 'Production rollback did not restore a published fallback catalog';
    end if;
end
$$;

commit;

select version,
       status,
       channel,
       minimum_app_version,
       published_at
  from public.ai_model_catalog_versions
 where version = '2026-10-16.1'
   and channel = 'stable';
