-- Production-only Gemini 4 Argon catalog publish.
-- Run only against BlogGenius Production after validating the model in Development.
-- Publishes a new stable snapshot for app 0.6.1 and preserves older snapshots
-- for older app versions.

begin;

do $$
declare
    target_version constant text := '2026-10-16.1';
    target_minimum_app_version constant text := '0.6.1';
    source_row public.ai_model_catalog_versions%rowtype;
    next_models jsonb;
    next_payload jsonb;
    published_payload jsonb;
begin
    if exists (
        select 1
          from public.ai_model_catalog_versions
         where version = target_version
    ) then
        raise exception 'Catalog version % already exists in this Supabase project; no rows were changed', target_version;
    end if;

    select * into source_row
      from public.ai_model_catalog_versions
     where status = 'published'
       and channel = 'stable'
       and public.ai_catalog_version_tuple(minimum_app_version)
           <= public.ai_catalog_version_tuple(target_minimum_app_version)
     order by published_at desc nulls last, created_at desc
     limit 1;

    if source_row.version is null then
        raise exception 'No published stable catalog is compatible with app version %', target_minimum_app_version;
    end if;
    if jsonb_typeof(source_row.payload->'models') is distinct from 'array' then
        raise exception 'Source catalog % has no models array', source_row.version;
    end if;

    if exists (
        select 1
          from jsonb_array_elements(source_row.payload->'models') as entry(value)
         where entry.value->>'key' = 'google:gemini-4-argon'
    ) then
        raise exception 'Gemini 4 Argon already exists in source catalog %', source_row.version;
    end if;

    select coalesce(jsonb_agg(model order by ordinal), '[]'::jsonb) into next_models
      from jsonb_array_elements(source_row.payload->'models')
           with ordinality as entries(model, ordinal);

    next_models := next_models || jsonb_build_array(jsonb_build_object(
        'key', 'google:gemini-4-argon',
        'kind', 'text',
        'provider', 'google',
        'transport', 'gemini_generate_content',
        'model_id', 'gemini-4-argon',
        'display_name', 'Gemini 4 Argon',
        'status', 'active',
        'sort_order', 5,
        'capabilities', jsonb_build_object(
            'temperature', false,
            'structured_output', true,
            'image_input', true,
            'thinking_levels', jsonb_build_array('low', 'medium', 'high')
        )
    ));

    next_payload := jsonb_set(
        jsonb_set(
            jsonb_set(source_row.payload, '{version}', to_jsonb(target_version), true),
            '{generated_at}', to_jsonb(timezone('utc', now())::text), true
        ),
        '{models}', next_models, true
    );
    next_payload := jsonb_set(
        next_payload,
        '{minimum_app_version}',
        to_jsonb(target_minimum_app_version),
        true
    );

    insert into public.ai_model_catalog_versions (
        version, schema_version, channel, status, payload, minimum_app_version, published_at
    ) values (
        target_version,
        source_row.schema_version,
        'stable',
        'published',
        next_payload,
        target_minimum_app_version,
        timezone('utc', now())
    );

    select payload into published_payload
      from public.ai_model_catalog_versions
     where version = target_version
       and channel = 'stable'
       and status = 'published'
       and published_at is not null;

    if published_payload is null
       or published_payload->>'version' <> target_version
       or published_payload->>'minimum_app_version' <> target_minimum_app_version
       or jsonb_array_length(published_payload->'models') <> jsonb_array_length(source_row.payload->'models') + 1 then
        raise exception 'Published catalog metadata or model count did not validate';
    end if;
    if not exists (
            select 1
              from jsonb_array_elements(published_payload->'models') as entry(value)
             where entry.value->>'key' = 'google:gemini-4-argon'
               and entry.value->>'model_id' = 'gemini-4-argon'
               and entry.value->>'transport' = 'gemini_generate_content'
               and entry.value->>'status' = 'active'
               and entry.value->'capabilities'->'temperature' = 'false'::jsonb
               and entry.value->'capabilities'->'structured_output' = 'true'::jsonb
               and entry.value->'capabilities'->'image_input' = 'true'::jsonb
               and entry.value->'capabilities'->'thinking_levels' = '["low","medium","high"]'::jsonb
       ) then
        raise exception 'Gemini 4 Argon catalog entry did not validate';
    end if;
    if (select public.get_ai_model_catalog('stable', target_minimum_app_version)->>'version')
       is distinct from target_version then
        raise exception 'Production catalog routing did not select the new version';
    end if;
end
$$;

commit;

select version,
       channel,
       status,
       minimum_app_version,
       published_at,
       payload->'models' @> '[{"key":"google:gemini-4-argon","status":"active"}]'::jsonb
           as contains_active_gemini_4_argon
  from public.ai_model_catalog_versions
 where version = '2026-10-16.1'
   and channel = 'stable';
