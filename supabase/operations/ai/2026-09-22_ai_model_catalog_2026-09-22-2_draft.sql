-- Development-only AI model catalog expansion for the v0.5.2 app candidate.
-- Execute with an explicit BlogGenius Development project ref.

begin;

with source as (
    select payload
      from public.ai_model_catalog_versions
     where version = '2026-09-22.1'
       and channel = 'stable'
       and status = 'published'
), updated_models as (
    select jsonb_agg(
        case
            when model->>'key' = 'anthropic:claude-fable-5'
                then jsonb_set(model, '{status}', '"hidden"'::jsonb, false)
            when model->>'key' = 'anthropic:claude-sonnet-5'
                then jsonb_set(model, '{capabilities,temperature}', 'false'::jsonb, true)
            when model->>'key' = 'openai:gpt-image-2'
                then jsonb_set(model, '{sort_order}', '30'::jsonb, true)
            when model->>'key' = 'kie:gpt-image-2-text-to-image'
                then jsonb_set(model, '{sort_order}', '30'::jsonb, true)
            when model->>'key' = 'kie:nano-banana-2'
                then jsonb_set(model, '{sort_order}', '50'::jsonb, true)
            when model->>'key' = 'kie:nano-banana-pro'
                then jsonb_set(model, '{sort_order}', '60'::jsonb, true)
            when model->>'key' = 'kie:seedream/5-pro-text-to-image'
                then jsonb_set(model, '{sort_order}', '70'::jsonb, true)
            when model->>'key' = 'kie:seedream/4.5-text-to-image'
                then jsonb_set(model, '{sort_order}', '80'::jsonb, true)
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
            jsonb_set(source.payload, '{version}', '"2026-09-22.2"'::jsonb, false),
            '{generated_at}',
            to_jsonb(timezone('utc', now())::text),
            false
        ),
        '{models}',
        updated_models.models || jsonb_build_array(
            jsonb_build_object(
                'key', 'anthropic:claude-fable-5-1', 'kind', 'text',
                'provider', 'anthropic', 'transport', 'anthropic_openai_compat',
                'model_id', 'claude-fable-5-1', 'display_name', 'Claude Fable 5.1',
                'status', 'active', 'sort_order', 10,
                'capabilities', jsonb_build_object('temperature', true, 'structured_output', false, 'image_input', true)
            ),
            jsonb_build_object(
                'key', 'anthropic:claude-haiku-4-5', 'kind', 'text',
                'provider', 'anthropic', 'transport', 'anthropic_openai_compat',
                'model_id', 'claude-haiku-4-5', 'display_name', 'Claude Haiku 4.5',
                'status', 'active', 'sort_order', 40,
                'capabilities', jsonb_build_object('temperature', true, 'structured_output', false, 'image_input', true)
            ),
            jsonb_build_object(
                'key', 'anthropic:claude-opus-4-6', 'kind', 'text',
                'provider', 'anthropic', 'transport', 'anthropic_openai_compat',
                'model_id', 'claude-opus-4-6', 'display_name', 'Claude Opus 4.6',
                'status', 'hidden', 'sort_order', 100,
                'capabilities', jsonb_build_object('temperature', true, 'structured_output', false, 'image_input', true)
            ),
            jsonb_build_object(
                'key', 'anthropic:claude-sonnet-4-6', 'kind', 'text',
                'provider', 'anthropic', 'transport', 'anthropic_openai_compat',
                'model_id', 'claude-sonnet-4-6', 'display_name', 'Claude Sonnet 4.6',
                'status', 'hidden', 'sort_order', 110,
                'capabilities', jsonb_build_object('temperature', true, 'structured_output', false, 'image_input', true)
            ),
            jsonb_build_object(
                'key', 'anthropic:claude-opus-4-5', 'kind', 'text',
                'provider', 'anthropic', 'transport', 'anthropic_openai_compat',
                'model_id', 'claude-opus-4-5', 'display_name', 'Claude Opus 4.5',
                'status', 'hidden', 'sort_order', 120,
                'capabilities', jsonb_build_object('temperature', true, 'structured_output', false, 'image_input', true)
            ),
            jsonb_build_object(
                'key', 'anthropic:claude-sonnet-4-5', 'kind', 'text',
                'provider', 'anthropic', 'transport', 'anthropic_openai_compat',
                'model_id', 'claude-sonnet-4-5', 'display_name', 'Claude Sonnet 4.5',
                'status', 'hidden', 'sort_order', 130,
                'capabilities', jsonb_build_object('temperature', true, 'structured_output', false, 'image_input', true)
            ),
            jsonb_build_object(
                'key', 'openai:gpt-image-2.5-sunburst', 'kind', 'image',
                'provider', 'openai', 'transport', 'openai_images',
                'model_id', 'gpt-image-2.5-sunburst', 'display_name', 'GPT Image 2.5 Sunburst',
                'status', 'active', 'sort_order', 10,
                'capabilities', jsonb_build_object(
                    'response_format', false, 'arbitrary_size', true,
                    'output_format', jsonb_build_array('png', 'jpeg', 'webp'),
                    'quality', jsonb_build_array('low', 'medium', 'high', 'xhigh', 'max', 'auto')
                )
            ),
            jsonb_build_object(
                'key', 'openai:gpt-image-2.5-flare', 'kind', 'image',
                'provider', 'openai', 'transport', 'openai_images',
                'model_id', 'gpt-image-2.5-flare', 'display_name', 'GPT Image 2.5 Flare',
                'status', 'active', 'sort_order', 20,
                'capabilities', jsonb_build_object(
                    'response_format', false, 'arbitrary_size', true,
                    'output_format', jsonb_build_array('png', 'jpeg', 'webp'),
                    'quality', jsonb_build_array('low', 'medium', 'high', 'xhigh', 'max', 'auto')
                )
            ),
            jsonb_build_object(
                'key', 'google:gemini-3.1-flash-lite-image', 'kind', 'image',
                'provider', 'google', 'transport', 'gemini_generate_content',
                'model_id', 'gemini-3.1-flash-lite-image', 'display_name', 'Nano Banana 2 Lite',
                'status', 'active', 'sort_order', 20,
                'capabilities', jsonb_build_object('aspect_ratio', true, 'image_size', jsonb_build_array('1K'))
            ),
            jsonb_build_object(
                'key', 'kie:gpt-image-2-5-sunburst-text-to-image', 'kind', 'image',
                'provider', 'kie', 'transport', 'kie_market_image_jobs',
                'model_id', 'gpt-image-2-5-sunburst-text-to-image', 'display_name', 'GPT Image 2.5 Sunburst',
                'status', 'active', 'sort_order', 10,
                'capabilities', jsonb_build_object('aspect_ratio', true, 'image_size', jsonb_build_array('1K', '2K'))
            ),
            jsonb_build_object(
                'key', 'kie:gpt-image-2-5-flare-text-to-image', 'kind', 'image',
                'provider', 'kie', 'transport', 'kie_market_image_jobs',
                'model_id', 'gpt-image-2-5-flare-text-to-image', 'display_name', 'GPT Image 2.5 Flare',
                'status', 'active', 'sort_order', 20,
                'capabilities', jsonb_build_object('aspect_ratio', true, 'image_size', jsonb_build_array('1K', '2K'))
            ),
            jsonb_build_object(
                'key', 'kie:nano-banana-2-lite', 'kind', 'image',
                'provider', 'kie', 'transport', 'kie_market_image_jobs',
                'model_id', 'nano-banana-2-lite', 'display_name', 'Nano Banana 2 Lite',
                'status', 'active', 'sort_order', 40,
                'capabilities', jsonb_build_object(
                    'aspect_ratio', true, 'image_size', jsonb_build_array('1K'),
                    'output_format', jsonb_build_array('png')
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
select '2026-09-22.2', 1, 'stable', 'draft', payload, '0.1.16', null
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
     where version = '2026-09-22.2'
       and status = 'draft';

    if model_count is distinct from 37 then
        raise exception 'Expected 37 models in draft, found %', coalesce(model_count, -1);
    end if;
end
$$;

commit;
