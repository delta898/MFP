-- Development catalog ordering correction for the OpenAI GPT text family.
-- Execute only against BlogGenius Development.

begin;

do $$
declare
    source_row public.ai_model_catalog_versions%rowtype;
    next_payload jsonb;
    next_models jsonb;
    target_version constant text := '2026-11-10-ai-model-additions-development-version-first';
begin
    if exists (select 1 from public.ai_model_catalog_versions where version = target_version) then
        raise exception 'Catalog version % already exists; no rows were changed', target_version;
    end if;

    select * into source_row
      from public.ai_model_catalog_versions
     where status = 'published'
       and channel = 'development'
       and public.ai_catalog_version_tuple(minimum_app_version)
           <= public.ai_catalog_version_tuple('0.7.0')
     order by published_at desc nulls last, created_at desc
     limit 1;

    if source_row.version is null or jsonb_typeof(source_row.payload->'models') is distinct from 'array' then
        raise exception 'No compatible published Development catalog exists';
    end if;
    if (select count(*) from jsonb_array_elements(source_row.payload->'models') model
         where model->>'key' in (
             'openai:gpt-6-astra', 'openai:gpt-6.1-sol', 'openai:gpt-6.1-terra',
             'openai:gpt-6-sol', 'openai:gpt-6-luna', 'openai:gpt-5.6-sol',
             'openai:gpt-5.6-terra', 'openai:gpt-5.6-luna'
         )) <> 8 then
        raise exception 'Expected all eight OpenAI GPT text models in the Development source catalog';
    end if;

    select jsonb_agg(
        case model->>'key'
            when 'openai:gpt-6.1-sol' then jsonb_set(model, '{sort_order}', '5'::jsonb, true)
            when 'openai:gpt-6.1-terra' then jsonb_set(model, '{sort_order}', '10'::jsonb, true)
            when 'openai:gpt-6-astra' then jsonb_set(model, '{sort_order}', '15'::jsonb, true)
            when 'openai:gpt-6-sol' then jsonb_set(model, '{sort_order}', '20'::jsonb, true)
            when 'openai:gpt-6-luna' then jsonb_set(model, '{sort_order}', '25'::jsonb, true)
            when 'openai:gpt-5.6-sol' then jsonb_set(model, '{sort_order}', '30'::jsonb, true)
            when 'openai:gpt-5.6-terra' then jsonb_set(model, '{sort_order}', '35'::jsonb, true)
            when 'openai:gpt-5.6-luna' then jsonb_set(model, '{sort_order}', '40'::jsonb, true)
            else model
        end order by ordinal
    ) into next_models
      from jsonb_array_elements(source_row.payload->'models') with ordinality as entries(model, ordinal);

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
        target_version, source_row.schema_version, 'development', 'published', next_payload,
        source_row.minimum_app_version, timezone('utc', now())
    );
end
$$;

commit;

select public.get_ai_model_catalog('development', '0.7.0')->>'version' as development_catalog;
