-- Development-only AI model catalog draft.
-- Execute with an explicit BlogGenius Development project ref.

begin;

with source as (
    select payload
      from public.ai_model_catalog_versions
     where version = '2026-08-21.1'
       and channel = 'stable'
       and status = 'published'
), updated_models as (
    select jsonb_agg(
        case
            when model->>'key' = 'kie:gemini-3-5-flash-openai'
                then jsonb_set(model, '{status}', '"hidden"'::jsonb, false)
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
            jsonb_set(
                source.payload,
                '{version}',
                '"2026-09-22.1"'::jsonb,
                false
            ),
            '{generated_at}',
            to_jsonb(timezone('utc', now())::text),
            false
        ),
        '{models}',
        updated_models.models || jsonb_build_array(
            jsonb_build_object(
                'key', 'openai:gpt-6-astra',
                'kind', 'text',
                'provider', 'openai',
                'transport', 'openai_chat_completions',
                'model_id', 'gpt-6-astra',
                'display_name', 'GPT-6 Astra',
                'status', 'active',
                'sort_order', 5,
                'capabilities', jsonb_build_object(
                    'temperature', false,
                    'structured_output', true,
                    'image_input', true
                )
            ),
            jsonb_build_object(
                'key', 'google:gemini-3.8-flash',
                'kind', 'text',
                'provider', 'google',
                'transport', 'gemini_generate_content',
                'model_id', 'gemini-3.8-flash',
                'display_name', 'Gemini 3.8 Flash',
                'status', 'active',
                'sort_order', 5,
                'capabilities', jsonb_build_object(
                    'temperature', false,
                    'structured_output', true,
                    'image_input', true,
                    'thinking_levels', jsonb_build_array('low', 'medium', 'high')
                )
            ),
            jsonb_build_object(
                'key', 'google:gemini-3.5-flash',
                'kind', 'text',
                'provider', 'google',
                'transport', 'gemini_generate_content',
                'model_id', 'gemini-3.5-flash',
                'display_name', 'Gemini 3.5 Flash',
                'status', 'hidden',
                'sort_order', 30,
                'capabilities', jsonb_build_object(
                    'temperature', true,
                    'structured_output', true,
                    'image_input', true
                )
            ),
            jsonb_build_object(
                'key', 'kie:gpt-6-astra',
                'kind', 'text',
                'provider', 'kie',
                'transport', 'kie_responses',
                'model_id', 'gpt-6-astra',
                'display_name', 'GPT-6 Astra',
                'status', 'active',
                'sort_order', 5,
                'capabilities', jsonb_build_object(
                    'temperature', false,
                    'structured_output', false,
                    'image_input', false
                )
            ),
            jsonb_build_object(
                'key', 'kie:gemini-3-8-flash-openai',
                'kind', 'text',
                'provider', 'kie',
                'transport', 'kie_openai_chat',
                'model_id', 'gemini-3-8-flash-openai',
                'display_name', 'Gemini 3.8 Flash',
                'status', 'active',
                'sort_order', 35,
                'capabilities', jsonb_build_object(
                    'temperature', false,
                    'structured_output', false,
                    'image_input', false
                )
            )
        ),
        false
    ) as payload
      from source
      cross join updated_models
)
insert into public.ai_model_catalog_versions (
    version,
    schema_version,
    channel,
    status,
    payload,
    minimum_app_version,
    published_at
)
select
    '2026-09-22.1',
    1,
    'stable',
    'draft',
    payload,
    '0.1.16',
    null
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
     where version = '2026-09-22.1'
       and status = 'draft';

    if model_count is distinct from 25 then
        raise exception 'Expected 25 models in draft, found %', coalesce(model_count, -1);
    end if;
end
$$;

commit;
