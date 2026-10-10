-- Add and publish a new stable model catalog snapshot.
-- This SQL is environment-neutral: run it in the intended Supabase project.
-- It copies the latest published stable snapshot compatible with app 0.6.0-dev3,
-- preserves its existing models, appends GPT-5.6 and Gemini image model entries,
-- and inserts the new snapshot as published with published_at set.

begin;

do $$
declare
    target_version constant text := '2026-10-11.2';
    target_minimum_app_version constant text := '0.6.0-dev3';
    source_row public.ai_model_catalog_versions%rowtype;
    next_payload jsonb;
    next_models jsonb;
    added_models jsonb := jsonb_build_array(
        jsonb_build_object(
            'key', 'openai:gpt-5.6-sol',
            'kind', 'text',
            'provider', 'openai',
            'transport', 'openai_chat_completions',
            'model_id', 'gpt-5.6-sol',
            'display_name', 'GPT-5.6 Sol',
            'status', 'active',
            'sort_order', 30,
            'capabilities', jsonb_build_object(
                'temperature', false,
                'structured_output', true,
                'image_input', true,
                'reasoning_efforts', jsonb_build_array('none', 'low', 'medium', 'high', 'xhigh', 'max')
            )
        ),
        jsonb_build_object(
            'key', 'openai:gpt-5.6-terra',
            'kind', 'text',
            'provider', 'openai',
            'transport', 'openai_chat_completions',
            'model_id', 'gpt-5.6-terra',
            'display_name', 'GPT-5.6 Terra',
            'status', 'active',
            'sort_order', 40,
            'capabilities', jsonb_build_object(
                'temperature', false,
                'structured_output', true,
                'image_input', true,
                'reasoning_efforts', jsonb_build_array('none', 'low', 'medium', 'high', 'xhigh', 'max')
            )
        ),
        jsonb_build_object(
            'key', 'openai:gpt-5.6-luna',
            'kind', 'text',
            'provider', 'openai',
            'transport', 'openai_chat_completions',
            'model_id', 'gpt-5.6-luna',
            'display_name', 'GPT-5.6 Luna',
            'status', 'active',
            'sort_order', 50,
            'capabilities', jsonb_build_object(
                'temperature', false,
                'structured_output', true,
                'image_input', true,
                'reasoning_efforts', jsonb_build_array('none', 'low', 'medium', 'high', 'xhigh', 'max')
            )
        ),
        jsonb_build_object(
            'key', 'google:gemini-2.5-flash-image',
            'kind', 'image',
            'provider', 'google',
            'transport', 'gemini_generate_content',
            'model_id', 'gemini-2.5-flash-image',
            'display_name', 'Nano Banana',
            'status', 'active',
            'sort_order', 30,
            'capabilities', jsonb_build_object('aspect_ratio', true)
        ),
        jsonb_build_object(
            'key', 'google:gemini-3-pro-image',
            'kind', 'image',
            'provider', 'google',
            'transport', 'gemini_generate_content',
            'model_id', 'gemini-3-pro-image',
            'display_name', 'Nano Banana Pro',
            'status', 'active',
            'sort_order', 40,
            'capabilities', jsonb_build_object('aspect_ratio', true)
        )
    );
    added_keys constant text[] := array[
        'openai:gpt-5.6-sol',
        'openai:gpt-5.6-terra',
        'openai:gpt-5.6-luna',
        'google:gemini-2.5-flash-image',
        'google:gemini-3-pro-image'
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

    if exists (
        select 1
          from jsonb_array_elements(source_row.payload->'models') as existing(value)
         where existing.value->>'key' = any(added_keys)
    ) then
        raise exception 'One or more GPT-5.6 or Gemini image model keys already exist in source catalog %', source_row.version;
    end if;

    next_models := (source_row.payload->'models') || added_models;
    expected_count := jsonb_array_length(next_models);
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
        select expected.key
          from unnest(added_keys) as expected(key)
         where (select count(*)
                  from jsonb_array_elements(next_payload->'models') as entry(value)
                 where entry.value->>'key' = expected.key) <> 1
    ) then
        raise exception 'One or more expected model keys are missing or duplicated';
    end if;

    if exists (
        select 1
          from jsonb_array_elements(next_payload->'models') as entry(value)
         where entry.value->>'key' = any(added_keys[1:3])
           and entry.value->>'status' <> 'active'
    ) or not exists (
        select 1
          from jsonb_array_elements(next_payload->'models') as entry(value)
         where entry.value->>'key' = 'google:gemini-3-pro-image'
           and entry.value->>'status' = 'active'
    ) or not exists (
        select 1
          from jsonb_array_elements(next_payload->'models') as entry(value)
         where entry.value->>'key' = 'google:gemini-2.5-flash-image'
           and entry.value->>'status' = 'active'
    ) then
        raise exception 'Model availability status did not validate';
    end if;

    select count(*)::integer into google_image_count
      from jsonb_array_elements(next_payload->'models') as entry(value)
     where entry.value->>'provider' = 'google'
       and entry.value->>'kind' = 'image';
    if google_image_count <> 5 then
        raise exception 'Google image catalog must contain exactly five models; found %', google_image_count;
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
 where version = '2026-10-11.2'
   and channel = 'stable'
   and status = 'published';
