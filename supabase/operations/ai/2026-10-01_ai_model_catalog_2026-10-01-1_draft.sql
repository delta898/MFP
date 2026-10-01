-- Development-only GPT-6.1 Sol catalog draft.
-- Execute only against BlogGenius Development.

begin;

with source as (
    select payload
      from public.ai_model_catalog_versions
     where version = '2026-09-27.1'
       and channel = 'stable'
       and status = 'published'
), updated_models as (
    select jsonb_agg(
        case when model->>'key' = 'openai:gpt-6-sol'
            then jsonb_set(model, '{sort_order}', '15'::jsonb, true)
            else model
        end order by ordinal
    ) as models
      from source
      cross join lateral jsonb_array_elements(source.payload->'models')
          with ordinality as entries(model, ordinal)
), next_payload as (
    select jsonb_set(
        jsonb_set(
            jsonb_set(source.payload, '{version}', '"2026-10-01.1"'::jsonb, false),
            '{minimum_app_version}', '"0.5.5-dev1"'::jsonb, true
        ),
        '{models}', updated_models.models || jsonb_build_array(jsonb_build_object(
            'key', 'openai:gpt-6.1-sol',
            'kind', 'text',
            'provider', 'openai',
            'transport', 'openai_chat_completions',
            'model_id', 'gpt-6.1-sol',
            'display_name', 'GPT-6.1 Sol',
            'status', 'active',
            'sort_order', 10,
            'capabilities', jsonb_build_object(
                'temperature', false,
                'structured_output', true,
                'image_input', true,
                'reasoning_efforts', jsonb_build_array('low', 'medium', 'high', 'xhigh', 'max')
            )
        )),
        false
    ) as payload
      from source
      cross join updated_models
)
insert into public.ai_model_catalog_versions (
    version, schema_version, channel, status, payload, minimum_app_version, published_at
)
select '2026-10-01.1', 1, 'stable', 'draft', payload, '0.5.5-dev1', null
  from next_payload
on conflict (version) do update
set schema_version = excluded.schema_version,
    channel = excluded.channel,
    payload = excluded.payload,
    minimum_app_version = excluded.minimum_app_version,
    published_at = null
where public.ai_model_catalog_versions.status = 'draft';

do $$
declare target_payload jsonb;
begin
    select payload into target_payload
      from public.ai_model_catalog_versions
     where version = '2026-10-01.1' and channel = 'stable' and status = 'draft';
    if target_payload is null or jsonb_array_length(target_payload->'models') <> 41
       or target_payload->>'minimum_app_version' <> '0.5.5-dev1' then
        raise exception 'GPT-6.1 Sol Development draft validation failed';
    end if;
    if not exists (
        select 1 from jsonb_array_elements(target_payload->'models') model
         where model->>'key' = 'openai:gpt-6.1-sol'
           and model->>'model_id' = 'gpt-6.1-sol'
           and model->>'transport' = 'openai_chat_completions'
           and model->>'status' = 'active'
           and model->'capabilities'->'reasoning_efforts' = '["low","medium","high","xhigh","max"]'::jsonb
    ) then raise exception 'GPT-6.1 Sol Development draft entry did not validate'; end if;
end
$$;

commit;
