-- Development-only publish. Validate the draft before execution.
-- Execute only against BlogGenius Development (bvtlwjbmjnfphxlrkzhm).

begin;

do $$
declare
    target_payload jsonb;
begin
    select payload into target_payload
      from public.ai_model_catalog_versions
     where version = '2026-09-27.1'
       and channel = 'stable'
       and status = 'draft'
     for update;

    if target_payload is null then
        raise exception 'Claude Opus 5.5 draft 2026-09-27.1 was not found';
    end if;
    if jsonb_array_length(target_payload->'models') <> 40 then
        raise exception 'Unexpected model count in 2026-09-27.1';
    end if;
    if not exists (
        select 1 from jsonb_array_elements(target_payload->'models') model
         where model->>'key' = 'anthropic:claude-opus-5-5'
           and model->>'model_id' = 'claude-opus-5-5'
           and model->>'transport' = 'anthropic_openai_compat'
           and model->>'status' = 'active'
    ) then
        raise exception 'Claude Opus 5.5 entry is missing or inactive';
    end if;
end
$$;

update public.ai_model_catalog_versions
   set status = 'published',
       published_at = timezone('utc', now())
 where version = '2026-09-27.1'
   and channel = 'stable'
   and status = 'draft';

commit;
