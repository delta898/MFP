-- Development-only correction for KIE family ordering.
-- Uses catalog display names because some KIE model keys vary by catalog source.
-- Execute only against BlogGenius Development.

begin;

do $$
declare
    target_version constant text := '2026-10-21.3';
    target_minimum_app_version constant text := '0.7.0';
    source_row public.ai_model_catalog_versions%rowtype;
    next_models jsonb;
    next_payload jsonb;
    source_model_count integer;
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

    select jsonb_array_length(source_row.payload->'models') into source_model_count;
    select jsonb_agg(
        case
            when sort_order is null then model
            else jsonb_set(model, '{sort_order}', to_jsonb(sort_order), true)
        end order by ordinal
    ) into next_models
      from jsonb_array_elements(source_row.payload->'models') with ordinality as entries(model, ordinal)
      cross join lateral (
          select case
              -- KIE text family order: GPT, Gemini, Claude.
              when model->>'kind' = 'text' and model->>'provider' = 'kie'
                   and lower(model->>'display_name') like 'gpt%6.1%sol%' then 10
              when model->>'kind' = 'text' and model->>'provider' = 'kie'
                   and lower(model->>'display_name') like 'gpt%6%astra%' then 20
              when model->>'kind' = 'text' and model->>'provider' = 'kie'
                   and lower(model->>'display_name') like 'gpt%5.6%sol%' then 30
              when model->>'kind' = 'text' and model->>'provider' = 'kie'
                   and lower(model->>'display_name') like 'gpt%5.6%terra%' then 40
              when model->>'kind' = 'text' and model->>'provider' = 'kie'
                   and lower(model->>'display_name') like 'gpt%5.6%luna%' then 50
              when model->>'kind' = 'text' and model->>'provider' = 'kie'
                   and lower(model->>'display_name') like 'gemini%4%argon%' then 110
              when model->>'kind' = 'text' and model->>'provider' = 'kie'
                   and lower(model->>'display_name') like 'gemini%3.8%flash%' then 120
              when model->>'kind' = 'text' and model->>'provider' = 'kie'
                   and lower(model->>'display_name') like 'gemini%3.6%flash%' then 130
              when model->>'kind' = 'text' and model->>'provider' = 'kie'
                   and lower(model->>'display_name') like 'gemini%3.1%pro%' then 140
              when model->>'kind' = 'text' and model->>'provider' = 'kie'
                   and lower(model->>'display_name') like 'claude%haiku%5.5%' then 210
              when model->>'kind' = 'text' and model->>'provider' = 'kie'
                   and lower(model->>'display_name') like 'claude%sonnet%5.5%' then 220
              when model->>'kind' = 'text' and model->>'provider' = 'kie'
                   and lower(model->>'display_name') like 'claude%opus%5.5%' then 230
              -- KIE image family order: GPT Image, Nano Banana, Seedream.
              when model->>'kind' = 'image' and model->>'provider' = 'kie'
                   and lower(model->>'display_name') like 'gpt image%2.5%sunburst%' then 10
              when model->>'kind' = 'image' and model->>'provider' = 'kie'
                   and lower(model->>'display_name') like 'gpt image%2.5%flare%' then 20
              when model->>'kind' = 'image' and model->>'provider' = 'kie'
                   and lower(model->>'display_name') like 'gpt image%2%' then 30
              when model->>'kind' = 'image' and model->>'provider' = 'kie'
                   and lower(model->>'display_name') = 'nano banana 2.1' then 110
              when model->>'kind' = 'image' and model->>'provider' = 'kie'
                   and lower(model->>'display_name') = 'nano banana 2' then 120
              when model->>'kind' = 'image' and model->>'provider' = 'kie'
                   and lower(model->>'display_name') like 'nano banana 2 lite%' then 130
              when model->>'kind' = 'image' and model->>'provider' = 'kie'
                   and lower(model->>'display_name') like 'nano banana pro%' then 140
              when model->>'kind' = 'image' and model->>'provider' = 'kie'
                   and lower(model->>'display_name') like 'seedream%5.0%flash%' then 210
              when model->>'kind' = 'image' and model->>'provider' = 'kie'
                   and lower(model->>'display_name') like 'seedream%5%pro%' then 220
              when model->>'kind' = 'image' and model->>'provider' = 'kie'
                   and lower(model->>'display_name') like 'seedream%4.5%' then 230
              else null
          end as sort_order
      ) ordering;

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
       or jsonb_array_length(published_payload->'models') <> source_model_count
       or published_payload->>'minimum_app_version' <> target_minimum_app_version then
        raise exception 'Published catalog metadata or model count failed validation';
    end if;
    if exists (
        select 1 from unnest(array[
            'Claude Haiku 5.5', 'Claude Sonnet 5.5', 'Claude Opus 5.5'
        ]) expected(display_name)
        where not exists (
            select 1 from jsonb_array_elements(published_payload->'models') as entries(model)
             where model->>'kind' = 'text'
               and model->>'provider' = 'kie'
               and model->>'display_name' = expected.display_name
               and model->>'transport' = 'kie_claude_messages'
               and model->>'status' = 'active'
        )
    ) then
        raise exception 'Published KIE Claude entries are missing or not active on the Messages transport';
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

select version, channel, status, minimum_app_version, published_at
  from public.ai_model_catalog_versions
 where version = '2026-10-21.3' and channel = 'stable';
