-- Development-only correction matching the direct Anthropic model priority.
-- KIE currently exposes Opus, Sonnet, and Haiku; Fable is not added here.
-- Execute only against BlogGenius Development.

begin;

do $$
declare
    target_version constant text := '2026-10-21.4';
    target_minimum_app_version constant text := '0.7.0';
    source_row public.ai_model_catalog_versions%rowtype;
    next_models jsonb;
    next_payload jsonb;
    published_payload jsonb;
begin
    if exists (select 1 from public.ai_model_catalog_versions where version = target_version) then
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

    select jsonb_agg(
        case
            when model->>'kind' = 'text'
             and model->>'provider' = 'kie'
             and lower(model->>'display_name') like 'claude%opus%5.5%'
                then jsonb_set(model, '{sort_order}', '210'::jsonb, true)
            when model->>'kind' = 'text'
             and model->>'provider' = 'kie'
             and lower(model->>'display_name') like 'claude%sonnet%5.5%'
                then jsonb_set(model, '{sort_order}', '220'::jsonb, true)
            when model->>'kind' = 'text'
             and model->>'provider' = 'kie'
             and lower(model->>'display_name') like 'claude%haiku%5.5%'
                then jsonb_set(model, '{sort_order}', '230'::jsonb, true)
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
       or published_payload->>'minimum_app_version' <> target_minimum_app_version then
        raise exception 'Published catalog metadata failed validation';
    end if;

    if exists (
        select 1
          from unnest(array[
              'Claude Opus 5.5', 'Claude Sonnet 5.5', 'Claude Haiku 5.5'
          ]) with ordinality expected(display_name, priority)
         where not exists (
             select 1 from jsonb_array_elements(published_payload->'models') as entries(model)
              where model->>'kind' = 'text'
                and model->>'provider' = 'kie'
                and model->>'display_name' = expected.display_name
                and model->>'transport' = 'kie_claude_messages'
                and model->>'status' = 'active'
                and (model->>'sort_order')::integer = 200 + expected.priority * 10
         )
    ) then
        raise exception 'KIE Claude models do not match the Anthropic priority order Opus, Sonnet, Haiku';
    end if;

    if (select public.get_ai_model_catalog('stable', target_minimum_app_version)->>'version') is distinct from target_version then
        raise exception 'Development catalog routing did not select the new version';
    end if;
end
$$;

commit;

select version, channel, status, minimum_app_version, published_at
  from public.ai_model_catalog_versions
 where version = '2026-10-21.4' and channel = 'stable';
