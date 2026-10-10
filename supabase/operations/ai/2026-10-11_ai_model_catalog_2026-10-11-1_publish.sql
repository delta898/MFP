-- Add and publish a new stable model catalog snapshot.
-- This SQL is environment-neutral: run it in the intended Supabase project.
-- It copies the latest published stable snapshot compatible with app 0.6.0-dev3,
-- replaces the requested direct-provider models, and inserts the new snapshot as
-- published with published_at set. It does not update, delete, or retire rows.

begin;

do $$
declare
    target_version constant text := '2026-10-11.1';
    target_minimum_app_version constant text := '0.6.0-dev3';
    source_row public.ai_model_catalog_versions%rowtype;
    next_payload jsonb;
    kept_models jsonb;
    added_models jsonb := jsonb_build_array(
        jsonb_build_object(
            'key', 'anthropic:claude-opus-5-5',
            'kind', 'text',
            'provider', 'anthropic',
            'transport', 'anthropic_openai_compat',
            'model_id', 'claude-opus-5-5',
            'display_name', 'Claude Opus 5.5',
            'status', 'active',
            'sort_order', 20,
            'capabilities', jsonb_build_object(
                'temperature', false,
                'structured_output', false,
                'image_input', true
            )
        ),
        jsonb_build_object(
            'key', 'anthropic:claude-sonnet-5-5',
            'kind', 'text',
            'provider', 'anthropic',
            'transport', 'anthropic_openai_compat',
            'model_id', 'claude-sonnet-5-5',
            'display_name', 'Claude Sonnet 5.5',
            'status', 'active',
            'sort_order', 30,
            'capabilities', jsonb_build_object(
                'temperature', false,
                'structured_output', false,
                'image_input', true
            )
        ),
        jsonb_build_object(
            'key', 'anthropic:claude-haiku-5-5',
            'kind', 'text',
            'provider', 'anthropic',
            'transport', 'anthropic_openai_compat',
            'model_id', 'claude-haiku-5-5',
            'display_name', 'Claude Haiku 5.5',
            'status', 'active',
            'sort_order', 40,
            'capabilities', jsonb_build_object(
                'temperature', false,
                'structured_output', false,
                'image_input', true
            )
        ),
        jsonb_build_object(
            'key', 'google:gemini-3.5-flash-lite',
            'kind', 'text',
            'provider', 'google',
            'transport', 'gemini_generate_content',
            'model_id', 'gemini-3.5-flash-lite',
            'display_name', 'Gemini 3.5 Flash-Lite',
            'status', 'active',
            'sort_order', 30,
            'capabilities', jsonb_build_object(
                'temperature', false,
                'structured_output', true,
                'image_input', true,
                'thinking_levels', jsonb_build_array('minimal', 'low', 'medium', 'high')
            )
        ),
        jsonb_build_object(
            'key', 'google:gemini-nano-banana-2.1',
            'kind', 'image',
            'provider', 'google',
            'transport', 'gemini_generate_content',
            'model_id', 'gemini-nano-banana-2.1',
            'display_name', 'Nano Banana 2.1',
            'status', 'active',
            'sort_order', 5,
            'capabilities', jsonb_build_object('aspect_ratio', true)
        ),
        jsonb_build_object(
            'key', 'google:gemini-3.1-flash-image',
            'kind', 'image',
            'provider', 'google',
            'transport', 'gemini_generate_content',
            'model_id', 'gemini-3.1-flash-image',
            'display_name', 'Nano Banana 2',
            'status', 'active',
            'sort_order', 10,
            'capabilities', jsonb_build_object('aspect_ratio', true)
        ),
        jsonb_build_object(
            'key', 'google:gemini-3.1-flash-lite-image',
            'kind', 'image',
            'provider', 'google',
            'transport', 'gemini_generate_content',
            'model_id', 'gemini-3.1-flash-lite-image',
            'display_name', 'Nano Banana 2 Lite',
            'status', 'active',
            'sort_order', 20,
            'capabilities', jsonb_build_object(
                'aspect_ratio', true,
                'image_size', jsonb_build_array('1K')
            )
        )
    );
    removed_text_keys constant text[] := array[
        'openai:gpt-5.6-sol',
        'openai:gpt-5.6-terra',
        'openai:gpt-5.6-luna',
        'google:gemini-3.7-flash',
        'anthropic:claude-opus-5',
        'anthropic:claude-sonnet-5',
        'anthropic:claude-haiku-4-5',
        'anthropic:claude-opus-5-5',
        'anthropic:claude-sonnet-5-5',
        'anthropic:claude-haiku-5-5',
        'google:gemini-3.5-flash-lite'
    ];
    added_keys constant text[] := array[
        'anthropic:claude-opus-5-5',
        'anthropic:claude-sonnet-5-5',
        'anthropic:claude-haiku-5-5',
        'google:gemini-3.5-flash-lite',
        'google:gemini-nano-banana-2.1',
        'google:gemini-3.1-flash-image',
        'google:gemini-3.1-flash-lite-image'
    ];
    expected_count integer;
    google_image_count integer;
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

    select coalesce(jsonb_agg(entry.value order by entry.ordinality), '[]'::jsonb)
      into kept_models
      from jsonb_array_elements(source_row.payload->'models')
           with ordinality as entry(value, ordinality)
     where coalesce(entry.value->>'key', '') <> all(removed_text_keys)
       and not (
           entry.value->>'provider' = 'google'
           and entry.value->>'kind' = 'image'
       );

    expected_count := jsonb_array_length(kept_models) + jsonb_array_length(added_models);
    next_payload := jsonb_set(
        jsonb_set(
            jsonb_set(source_row.payload, '{version}', to_jsonb(target_version), true),
            '{generated_at}', to_jsonb(timezone('utc', now())::text), true
        ),
        '{models}', kept_models || added_models, true
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

    select payload into next_payload
      from public.ai_model_catalog_versions
     where version = target_version
       and channel = 'stable'
       and status = 'published'
       and published_at is not null;

    if next_payload is null
       or next_payload->>'version' <> target_version
       or next_payload->>'minimum_app_version' <> target_minimum_app_version
       or jsonb_array_length(next_payload->'models') <> expected_count then
        raise exception 'Inserted published catalog metadata or model count did not validate';
    end if;

    if exists (
        select 1
          from jsonb_array_elements(next_payload->'models') as entry(value)
         where entry.value->>'key' = any(removed_text_keys[1:7])
    ) then
        raise exception 'Deprecated direct-provider models remain in the new catalog';
    end if;

    if exists (
        select expected.key
          from unnest(added_keys) as expected(key)
         where (select count(*)
                  from jsonb_array_elements(next_payload->'models') as entry(value)
                 where entry.value->>'key' = expected.key
                   and entry.value->>'status' = 'active') <> 1
    ) then
        raise exception 'One or more expected direct-provider models are missing, inactive, or duplicated';
    end if;

    select count(*)::integer into google_image_count
      from jsonb_array_elements(next_payload->'models') as entry(value)
     where entry.value->>'provider' = 'google'
       and entry.value->>'kind' = 'image';
    if google_image_count <> 3 then
        raise exception 'Google image catalog must contain exactly three models; found %', google_image_count;
    end if;

    if (select coalesce(jsonb_agg(entry.value order by entry.ordinality), '[]'::jsonb)
          from jsonb_array_elements(source_row.payload->'models')
               with ordinality as entry(value, ordinality)
         where entry.value->>'provider' = 'kie')
       is distinct from
       (select coalesce(jsonb_agg(entry.value order by entry.ordinality), '[]'::jsonb)
          from jsonb_array_elements(next_payload->'models')
               with ordinality as entry(value, ordinality)
         where entry.value->>'provider' = 'kie') then
        raise exception 'KIE catalog rows changed unexpectedly';
    end if;

    if (select public.get_ai_model_catalog('stable', target_minimum_app_version)->>'version')
       is distinct from target_version then
        raise exception 'Published catalog routing did not select the new version';
    end if;
end
$$;

commit;

-- Confirm the published snapshot and timestamp.
select version,
       status,
       channel,
       minimum_app_version,
       published_at,
       jsonb_array_length(payload->'models') as model_count,
       payload->'models' as models
  from public.ai_model_catalog_versions
 where version = '2026-10-11.1'
   and channel = 'stable'
   and status = 'published';
