-- Development-only GPT-6 Sol/Luna and reasoning policy catalog draft.
-- Execute with an explicit BlogGenius Development project ref.

begin;

with source as (
    select payload
      from public.ai_model_catalog_versions
     where version = '2026-09-22.2'
       and channel = 'stable'
       and status = 'published'
), updated_models as (
    select jsonb_agg(
        case
            when model->>'key' = 'openai:gpt-6-astra'
                then jsonb_set(model, '{capabilities,reasoning_efforts}', '["low","medium","high","xhigh","max"]'::jsonb, true)
            when model->>'key' = 'openai:gpt-5.6-sol'
                then jsonb_set(
                    jsonb_set(model, '{sort_order}', '30'::jsonb, true),
                    '{capabilities,reasoning_efforts}', '["none","low","medium","high","xhigh","max"]'::jsonb, true
                )
            when model->>'key' = 'openai:gpt-5.6-terra'
                then jsonb_set(
                    jsonb_set(model, '{sort_order}', '40'::jsonb, true),
                    '{capabilities,reasoning_efforts}', '["none","low","medium","high","xhigh","max"]'::jsonb, true
                )
            when model->>'key' = 'openai:gpt-5.6-luna'
                then jsonb_set(
                    jsonb_set(model, '{sort_order}', '50'::jsonb, true),
                    '{capabilities,reasoning_efforts}', '["none","low","medium","high","xhigh","max"]'::jsonb, true
                )
            when model->>'key' in ('kie:gpt-6-astra', 'kie:gpt-5-6-sol', 'kie:gpt-5-6-terra', 'kie:gpt-5-6-luna')
                then jsonb_set(model, '{capabilities,reasoning_efforts}', '["low","medium","high","xhigh","max"]'::jsonb, true)
            else model
        end
        order by ordinal
    ) as models
      from source
      cross join lateral jsonb_array_elements(source.payload->'models')
          with ordinality as entries(model, ordinal)
), next_payload as (
    select jsonb_set(
        jsonb_set(
            jsonb_set(source.payload, '{version}', '"2026-09-23.1"'::jsonb, false),
            '{generated_at}',
            to_jsonb(timezone('utc', now())::text),
            false
        ),
        '{models}',
        updated_models.models || jsonb_build_array(
            jsonb_build_object(
                'key', 'openai:gpt-6-sol', 'kind', 'text',
                'provider', 'openai', 'transport', 'openai_chat_completions',
                'model_id', 'gpt-6-sol', 'display_name', 'GPT-6 Sol',
                'status', 'active', 'sort_order', 10,
                'capabilities', jsonb_build_object(
                    'temperature', false, 'structured_output', true, 'image_input', true,
                    'reasoning_efforts', jsonb_build_array('none', 'low', 'medium', 'high', 'xhigh', 'max')
                )
            ),
            jsonb_build_object(
                'key', 'openai:gpt-6-luna', 'kind', 'text',
                'provider', 'openai', 'transport', 'openai_chat_completions',
                'model_id', 'gpt-6-luna', 'display_name', 'GPT-6 Luna',
                'status', 'active', 'sort_order', 20,
                'capabilities', jsonb_build_object(
                    'temperature', false, 'structured_output', true, 'image_input', true,
                    'reasoning_efforts', jsonb_build_array('none', 'low', 'medium', 'high', 'xhigh', 'max')
                )
            )
        ),
        false
    ) as payload
      from source
      cross join updated_models
)
insert into public.ai_model_catalog_versions (
    version, schema_version, channel, status, payload, minimum_app_version, published_at
)
select '2026-09-23.1', 1, 'stable', 'draft', payload, '0.1.16', null
  from next_payload
on conflict (version) do update
set schema_version = excluded.schema_version,
    channel = excluded.channel,
    payload = excluded.payload,
    minimum_app_version = excluded.minimum_app_version,
    published_at = null
where public.ai_model_catalog_versions.status = 'draft';

do $$
declare
    model_count integer;
begin
    select jsonb_array_length(payload->'models')
      into model_count
      from public.ai_model_catalog_versions
     where version = '2026-09-23.1'
       and status = 'draft';

    if model_count is distinct from 39 then
        raise exception 'Expected 39 models in draft, found %', coalesce(model_count, -1);
    end if;
end
$$;

commit;
