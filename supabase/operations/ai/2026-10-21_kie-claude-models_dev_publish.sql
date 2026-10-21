-- Development-only catalog publish for KIE Claude Messages support and family ordering.
-- Execute only against BlogGenius Development after deploying the app code.

begin;

do $$
declare
    target_version constant text := '2026-10-21.2';
    target_minimum_app_version constant text := '0.7.0';
    source_row public.ai_model_catalog_versions%rowtype;
    next_models jsonb;
    next_payload jsonb;
    source_model_count integer;
    missing_claude_count integer;
    published_payload jsonb;
begin
    if exists (
        select 1 from public.ai_model_catalog_versions where version = target_version
    ) then
        raise exception 'Catalog version % already exists; no rows were changed', target_version;
    end if;

    select * into source_row
      from public.ai_model_catalog_versions
     where status = 'published'
       and channel = 'stable'
       and public.ai_catalog_version_tuple(minimum_app_version)
           <= public.ai_catalog_version_tuple(target_minimum_app_version)
     order by published_at desc nulls last, created_at desc
     limit 1;

    if source_row.version is null or jsonb_typeof(source_row.payload->'models') is distinct from 'array' then
        raise exception 'No compatible published stable catalog exists for app version %', target_minimum_app_version;
    end if;

    select jsonb_array_length(source_row.payload->'models') into source_model_count;
    select count(*)::integer into missing_claude_count
      from unnest(array[
          'kie:claude-haiku-5-5',
          'kie:claude-sonnet-5-5',
          'kie:claude-opus-5-5'
      ]) expected(key)
     where not exists (
         select 1 from jsonb_array_elements(source_row.payload->'models') entry(value)
          where entry.value->>'key' = expected.key
     );

    select jsonb_agg(
        case model->>'key'
            -- KIE text model families: GPT, Gemini, then Claude.
            when 'kie:gpt-6-astra' then jsonb_set(model, '{sort_order}', '10'::jsonb, true)
            when 'kie:gpt-6-1-sol' then jsonb_set(model, '{sort_order}', '20'::jsonb, true)
            when 'kie:gpt-5-6-sol' then jsonb_set(model, '{sort_order}', '30'::jsonb, true)
            when 'kie:gpt-5-6-terra' then jsonb_set(model, '{sort_order}', '40'::jsonb, true)
            when 'kie:gpt-5-6-luna' then jsonb_set(model, '{sort_order}', '50'::jsonb, true)
            when 'kie:gemini-4-argon' then jsonb_set(model, '{sort_order}', '110'::jsonb, true)
            when 'kie:gemini-3-8-flash-openai' then jsonb_set(model, '{sort_order}', '120'::jsonb, true)
            when 'kie:gemini-3-6-flash-openai' then jsonb_set(model, '{sort_order}', '130'::jsonb, true)
            when 'kie:gemini-3.1-pro' then jsonb_set(model, '{sort_order}', '150'::jsonb, true)
            when 'kie:claude-haiku-5-5' then jsonb_set(jsonb_set(jsonb_set(model, '{transport}', '"kie_claude_messages"'::jsonb, true), '{status}', '"active"'::jsonb, true), '{sort_order}', '210'::jsonb, true)
            when 'kie:claude-sonnet-5-5' then jsonb_set(jsonb_set(jsonb_set(model, '{transport}', '"kie_claude_messages"'::jsonb, true), '{status}', '"active"'::jsonb, true), '{sort_order}', '220'::jsonb, true)
            when 'kie:claude-opus-5-5' then jsonb_set(jsonb_set(jsonb_set(model, '{transport}', '"kie_claude_messages"'::jsonb, true), '{status}', '"active"'::jsonb, true), '{sort_order}', '230'::jsonb, true)
            -- KIE image families: GPT Image, Nano Banana, then Seedream.
            when 'kie:gpt-image-2-5-sunburst-text-to-image' then jsonb_set(model, '{sort_order}', '10'::jsonb, true)
            when 'kie:gpt-image-2-5-flare-text-to-image' then jsonb_set(model, '{sort_order}', '20'::jsonb, true)
            when 'kie:gpt-image-2-text-to-image' then jsonb_set(model, '{sort_order}', '30'::jsonb, true)
            when 'kie:nano-banana-2.1' then jsonb_set(model, '{sort_order}', '110'::jsonb, true)
            when 'kie:nano-banana-2' then jsonb_set(model, '{sort_order}', '120'::jsonb, true)
            when 'kie:nano-banana-2-lite' then jsonb_set(model, '{sort_order}', '130'::jsonb, true)
            when 'kie:nano-banana-pro' then jsonb_set(model, '{sort_order}', '140'::jsonb, true)
            when 'kie:seedream/5-flash-text-to-image' then jsonb_set(model, '{sort_order}', '210'::jsonb, true)
            when 'kie:seedream/5-pro-text-to-image' then jsonb_set(model, '{sort_order}', '220'::jsonb, true)
            when 'kie:seedream/4.5-text-to-image' then jsonb_set(model, '{sort_order}', '230'::jsonb, true)
            else model
        end order by ordinal
    ) into next_models
      from jsonb_array_elements(source_row.payload->'models') with ordinality entries(model, ordinal);

    if not exists (select 1 from jsonb_array_elements(next_models) as entries(model) where model->>'key' = 'kie:claude-haiku-5-5') then
        next_models := next_models || jsonb_build_array(jsonb_build_object(
            'key', 'kie:claude-haiku-5-5', 'kind', 'text', 'provider', 'kie',
            'transport', 'kie_claude_messages', 'model_id', 'claude-haiku-5-5',
            'display_name', 'Claude Haiku 5.5', 'status', 'active', 'sort_order', 210
        ));
    end if;
    if not exists (select 1 from jsonb_array_elements(next_models) as entries(model) where model->>'key' = 'kie:claude-sonnet-5-5') then
        next_models := next_models || jsonb_build_array(jsonb_build_object(
            'key', 'kie:claude-sonnet-5-5', 'kind', 'text', 'provider', 'kie',
            'transport', 'kie_claude_messages', 'model_id', 'claude-sonnet-5-5',
            'display_name', 'Claude Sonnet 5.5', 'status', 'active', 'sort_order', 220
        ));
    end if;
    if not exists (select 1 from jsonb_array_elements(next_models) as entries(model) where model->>'key' = 'kie:claude-opus-5-5') then
        next_models := next_models || jsonb_build_array(jsonb_build_object(
            'key', 'kie:claude-opus-5-5', 'kind', 'text', 'provider', 'kie',
            'transport', 'kie_claude_messages', 'model_id', 'claude-opus-5-5',
            'display_name', 'Claude Opus 5.5', 'status', 'active', 'sort_order', 230
        ));
    end if;

    next_payload := jsonb_set(
        jsonb_set(
            jsonb_set(source_row.payload, '{version}', to_jsonb(target_version), true),
            '{generated_at}', to_jsonb(timezone('utc', now())::text), true
        ),
        '{models}', next_models, true
    );
    next_payload := jsonb_set(next_payload, '{minimum_app_version}', to_jsonb(target_minimum_app_version), true);

    insert into public.ai_model_catalog_versions (
        version, schema_version, channel, status, payload, minimum_app_version, published_at
    ) values (
        target_version, source_row.schema_version, 'stable', 'published', next_payload,
        target_minimum_app_version, timezone('utc', now())
    );

    select payload into published_payload
      from public.ai_model_catalog_versions
     where version = target_version and channel = 'stable' and status = 'published';

    if published_payload is null
       or published_payload->>'minimum_app_version' <> target_minimum_app_version
       or jsonb_array_length(published_payload->'models') <> source_model_count + missing_claude_count then
        raise exception 'Published catalog metadata or model count failed validation';
    end if;
    if exists (
        select 1 from unnest(array[
            'kie:claude-haiku-5-5', 'kie:claude-sonnet-5-5', 'kie:claude-opus-5-5'
        ]) expected(key)
        where (select count(*) from jsonb_array_elements(published_payload->'models') as entries(model) where model->>'key' = expected.key) <> 1
           or not exists (
               select 1 from jsonb_array_elements(published_payload->'models') as entries(model)
                where model->>'key' = expected.key
                  and model->>'kind' = 'text'
                  and model->>'provider' = 'kie'
                  and model->>'model_id' = split_part(expected.key, ':', 2)
                  and model->>'transport' = 'kie_claude_messages'
                  and model->>'status' = 'active'
           )
    ) then
        raise exception 'KIE Claude model entries did not validate';
    end if;
    if exists (
        select 1 from jsonb_array_elements(published_payload->'models') as entries(model)
         where model->>'model_id' = 'gemini-3.5-flash'
    ) then
        raise exception 'Gemini 3.5 Flash must be omitted from the published catalog';
    end if;
    if (select public.get_ai_model_catalog('stable', target_minimum_app_version)->>'version') is distinct from target_version then
        raise exception 'Development catalog routing did not select the new version';
    end if;
end
$$;

commit;

select version, channel, status, minimum_app_version, published_at,
       (select count(*) from jsonb_array_elements(payload->'models') as entries(model)
         where model->>'provider' = 'kie' and model->>'kind' = 'text' and model->>'transport' = 'kie_claude_messages')
           as active_kie_claude_transport_count
  from public.ai_model_catalog_versions
 where version = '2026-10-21.2' and channel = 'stable';
