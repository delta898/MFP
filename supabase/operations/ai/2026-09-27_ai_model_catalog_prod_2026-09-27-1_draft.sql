-- Production-only Claude Opus 5.5 catalog draft.
-- Do not execute until the matching Development snapshot is validated and published.

begin;

with source as (
    select payload
      from public.ai_model_catalog_versions
     where version = '2026-09-23.1'
       and channel = 'stable'
       and status = 'published'
       and minimum_app_version = '0.5.2'
), updated_models as (
    select jsonb_agg(
        case
            when model->>'key' = 'anthropic:claude-opus-5'
                then jsonb_set(model, '{sort_order}', '30'::jsonb, true)
            when model->>'key' = 'anthropic:claude-sonnet-5'
                then jsonb_set(model, '{sort_order}', '40'::jsonb, true)
            when model->>'key' = 'anthropic:claude-haiku-4-5'
                then jsonb_set(model, '{sort_order}', '50'::jsonb, true)
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
            jsonb_set(source.payload, '{version}', '"2026-09-27.1"'::jsonb, false),
            '{generated_at}', to_jsonb(timezone('utc', now())::text), false
        ),
        '{models}',
        updated_models.models || jsonb_build_array(jsonb_build_object(
            'key', 'anthropic:claude-opus-5-5',
            'kind', 'text',
            'provider', 'anthropic',
            'transport', 'anthropic_openai_compat',
            'model_id', 'claude-opus-5-5',
            'display_name', 'Claude Opus 5.5',
            'status', 'active',
            'sort_order', 20,
            'capabilities', jsonb_build_object(
                'temperature', true,
                'structured_output', false,
                'image_input', true
            )
        )),
        false
    ) as payload
      from source
      cross join updated_models
)
insert into public.ai_model_catalog_versions (
    version, schema_version, channel, status, payload, minimum_app_version, published_at
)
select '2026-09-27.1', 1, 'stable', 'draft', payload, '0.5.2', null
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
    target_payload jsonb;
begin
    select payload into target_payload
      from public.ai_model_catalog_versions
     where version = '2026-09-27.1' and channel = 'stable' and status = 'draft';

    if target_payload is null then
        raise exception 'Production source snapshot 2026-09-23.1 is missing or target is not a draft';
    end if;
    if jsonb_array_length(target_payload->'models') <> 40
       or target_payload->>'minimum_app_version' <> '0.5.2' then
        raise exception 'Production draft contract validation failed';
    end if;
    if not exists (
        select 1 from jsonb_array_elements(target_payload->'models') model
         where model->>'key' = 'anthropic:claude-opus-5-5'
           and model->>'model_id' = 'claude-opus-5-5'
           and model->>'transport' = 'anthropic_openai_compat'
           and model->>'status' = 'active'
    ) then
        raise exception 'Claude Opus 5.5 Production draft entry did not validate';
    end if;
end
$$;

commit;
