-- Production-only version-segmented publish.
-- Keeps the existing compatible stable snapshot published for v0.5.1 and older clients.

begin;

do $$
declare
    target_payload jsonb;
    legacy_version text;
begin
    select payload
      into target_payload
      from public.ai_model_catalog_versions
     where version = '2026-09-23.1'
       and channel = 'stable'
       and status = 'draft'
       and minimum_app_version = '0.5.2'
     for update;

    if target_payload is null then
        raise exception 'Validated Production draft 2026-09-23.1 was not found';
    end if;
    if jsonb_array_length(target_payload->'models') <> 39
       or target_payload->>'minimum_app_version' <> '0.5.2' then
        raise exception 'Production draft contract validation failed';
    end if;

    select public.get_ai_model_catalog('stable', '0.5.1')->>'version'
      into legacy_version;
    if legacy_version is null or legacy_version = '2026-09-23.1' then
        raise exception 'A compatible published legacy snapshot is required before v0.5.2 publish';
    end if;
end
$$;

update public.ai_model_catalog_versions
   set status = 'published',
       published_at = timezone('utc', now())
 where version = '2026-09-23.1'
   and channel = 'stable'
   and status = 'draft'
   and minimum_app_version = '0.5.2';

do $$
declare
    legacy_version text;
    current_version text;
begin
    select public.get_ai_model_catalog('stable', '0.5.1')->>'version'
      into legacy_version;
    select public.get_ai_model_catalog('stable', '0.5.2')->>'version'
      into current_version;

    if legacy_version is null or legacy_version = '2026-09-23.1' then
        raise exception 'v0.5.1 routing must remain on the legacy catalog';
    end if;
    if current_version is distinct from '2026-09-23.1' then
        raise exception 'v0.5.2 routing did not select 2026-09-23.1';
    end if;
end
$$;

commit;
