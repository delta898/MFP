-- Development-only publish. Run after validating the draft with the release candidate.
-- Execute only against BlogGenius Development.

begin;

do $$
declare target_payload jsonb;
begin
    select payload into target_payload
      from public.ai_model_catalog_versions
     where version = '2026-10-01.1' and channel = 'stable' and status = 'draft'
       and minimum_app_version = '0.5.5-dev1'
     for update;
    if target_payload is null or jsonb_array_length(target_payload->'models') <> 41
       or not exists (
           select 1 from jsonb_array_elements(target_payload->'models') model
            where model->>'key' = 'openai:gpt-6.1-sol'
              and model->>'model_id' = 'gpt-6.1-sol'
              and model->>'status' = 'active'
       ) then raise exception 'Validated GPT-6.1 Sol Development draft was not found'; end if;
end
$$;

update public.ai_model_catalog_versions
   set status = 'published', published_at = timezone('utc', now())
 where version = '2026-10-01.1' and channel = 'stable' and status = 'draft'
   and minimum_app_version = '0.5.5-dev1';

commit;
