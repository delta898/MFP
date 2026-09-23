-- Development catalog version coexistence for legacy and v0.5.2 clients.
-- Run only against BlogGenius Development.

begin;

update public.ai_model_catalog_versions
   set minimum_app_version = '0.5.2',
       payload = jsonb_set(payload, '{minimum_app_version}', '"0.5.2"'::jsonb, true),
       published_at = timezone('utc', now())
 where version = '2026-09-23.1'
   and channel = 'stable'
   and status = 'published';

update public.ai_model_catalog_versions
   set status = 'published'
 where version = '2026-09-22.2'
   and channel = 'stable'
   and status = 'retired';

do $$
declare
    legacy_version text;
    current_version text;
begin
    select public.get_ai_model_catalog('stable', '0.5.1')->>'version'
      into legacy_version;
    select public.get_ai_model_catalog('stable', '0.5.2')->>'version'
      into current_version;

    if legacy_version is distinct from '2026-09-22.2' then
        raise exception 'Expected 0.5.1 catalog 2026-09-22.2, found %', coalesce(legacy_version, 'null');
    end if;
    if current_version is distinct from '2026-09-23.1' then
        raise exception 'Expected 0.5.2 catalog 2026-09-23.1, found %', coalesce(current_version, 'null');
    end if;
end
$$;

commit;
