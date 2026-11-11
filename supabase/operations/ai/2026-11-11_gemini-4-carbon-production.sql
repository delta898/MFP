-- Production catalog update: add Gemini 4 Carbon and order Gemini models
-- version-first, then by capability within a version.
-- Execute only against BlogGenius Production.

begin;

do $$
declare
    source_row public.ai_model_catalog_versions%rowtype;
    next_payload jsonb;
    next_models jsonb;
    target_version constant text := '2026-11-11-gemini-4-carbon-production';
begin
    if exists (select 1 from public.ai_model_catalog_versions where version = target_version) then
        raise exception 'Catalog version % already exists; no rows were changed', target_version;
    end if;

    select * into source_row
      from public.ai_model_catalog_versions
     where status = 'published'
       and channel = 'production'
       and public.ai_catalog_version_tuple(minimum_app_version)
           <= public.ai_catalog_version_tuple('0.7.0')
     order by published_at desc nulls last, created_at desc
     limit 1;

    if source_row.version is null or jsonb_typeof(source_row.payload->'models') is distinct from 'array' then
        raise exception 'No compatible published Production catalog exists';
    end if;
    if exists (
        select 1 from jsonb_array_elements(source_row.payload->'models') model
         where model->>'key' = 'google:gemini-4-carbon'
    ) then
        raise exception 'Gemini 4 Carbon already exists in source catalog %', source_row.version;
    end if;
    if (select count(*) from jsonb_array_elements(source_row.payload->'models') model
         where model->>'key' in (
             'google:gemini-4-argon', 'google:gemini-3.8-flash',
             'google:gemini-3.6-flash', 'google:gemini-3.5-flash-lite',
             'google:gemini-3.1-pro-preview'
         )) <> 5 then
        raise exception 'Expected all five existing Google Gemini text models in the Production source catalog';
    end if;

    select jsonb_agg(
        case model->>'key'
            when 'google:gemini-4-argon' then jsonb_set(model, '{sort_order}', '10'::jsonb, true)
            when 'google:gemini-3.8-flash' then jsonb_set(model, '{sort_order}', '15'::jsonb, true)
            when 'google:gemini-3.6-flash' then jsonb_set(model, '{sort_order}', '20'::jsonb, true)
            when 'google:gemini-3.5-flash-lite' then jsonb_set(model, '{sort_order}', '25'::jsonb, true)
            when 'google:gemini-3.1-pro-preview' then jsonb_set(model, '{sort_order}', '30'::jsonb, true)
            else model
        end order by ordinal
    ) into next_models
      from jsonb_array_elements(source_row.payload->'models') with ordinality as entries(model, ordinal);

    next_models := next_models || jsonb_build_array(jsonb_build_object(
        'key', 'google:gemini-4-carbon',
        'kind', 'text',
        'provider', 'google',
        'transport', 'gemini_generate_content',
        'model_id', 'gemini-4-carbon',
        'display_name', 'Gemini 4 Carbon',
        'status', 'active',
        'sort_order', 5,
        'capabilities', jsonb_build_object(
            'image_input', true,
            'temperature', false,
            'thinking_levels', jsonb_build_array('low', 'medium', 'high'),
            'structured_output', true
        )
    ));

    next_payload := jsonb_set(
        jsonb_set(
            jsonb_set(source_row.payload, '{version}', to_jsonb(target_version), true),
            '{generated_at}', to_jsonb(timezone('utc', now())::text), true
        ),
        '{models}', next_models, true
    );

    insert into public.ai_model_catalog_versions (
        version, schema_version, channel, status, payload, minimum_app_version, published_at
    ) values (
        target_version, source_row.schema_version, 'production', 'published', next_payload,
        source_row.minimum_app_version, timezone('utc', now())
    );
end
$$;

commit;

select public.get_ai_model_catalog('production', '0.7.0')->>'version' as production_catalog;
