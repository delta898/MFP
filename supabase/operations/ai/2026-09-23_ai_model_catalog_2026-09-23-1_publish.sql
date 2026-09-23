-- Development-only publish. The target draft must already be validated.

begin;

do $$
declare
    target_payload jsonb;
begin
    select payload
      into target_payload
      from public.ai_model_catalog_versions
     where version = '2026-09-23.1'
       and channel = 'stable'
       and status = 'draft'
     for update;

    if target_payload is null then
        raise exception 'Validated draft 2026-09-23.1 was not found';
    end if;
    if jsonb_array_length(target_payload->'models') <> 39 then
        raise exception 'Unexpected model count in 2026-09-23.1';
    end if;
    if not exists (
        select 1 from jsonb_array_elements(target_payload->'models') model
         where model->>'key' = 'openai:gpt-6-sol'
           and model->'capabilities'->'reasoning_efforts' ? 'medium'
    ) or not exists (
        select 1 from jsonb_array_elements(target_payload->'models') model
         where model->>'key' = 'openai:gpt-6-luna'
           and model->'capabilities'->'reasoning_efforts' ? 'low'
    ) or not exists (
        select 1 from jsonb_array_elements(target_payload->'models') model
         where model->>'key' = 'kie:gpt-6-astra'
           and model->'capabilities'->'reasoning_efforts' ? 'max'
    ) then
        raise exception '2026-09-23.1 reasoning policy validation failed';
    end if;
end
$$;

update public.ai_model_catalog_versions
   set status = 'retired'
 where channel = 'stable'
   and status = 'published';

update public.ai_model_catalog_versions
   set status = 'published',
       published_at = timezone('utc', now())
 where version = '2026-09-23.1'
   and channel = 'stable'
   and status = 'draft';

commit;
