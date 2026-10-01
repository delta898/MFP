-- Production-only publish. Preserve older published snapshots for older app versions.

begin;

do $$
declare target_payload jsonb; prior_version text;
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
       ) then raise exception 'Validated GPT-6.1 Sol Production draft was not found'; end if;

    select public.get_ai_model_catalog('stable', '0.5.4')->>'version' into prior_version;
    if prior_version is distinct from '2026-09-27.1' then
        raise exception 'A compatible 0.5.4 catalog snapshot must remain available';
    end if;
end
$$;

update public.ai_model_catalog_versions
   set status = 'published', published_at = timezone('utc', now())
 where version = '2026-10-01.1' and channel = 'stable' and status = 'draft'
   and minimum_app_version = '0.5.5-dev1';

do $$
begin
    if (select public.get_ai_model_catalog('stable', '0.5.5')->>'version') is distinct from '2026-10-01.1'
       or (select public.get_ai_model_catalog('stable', '0.5.4')->>'version') is distinct from '2026-09-27.1' then
        raise exception 'Production catalog version routing failed';
    end if;
end
$$;

commit;
