-- Production-only rollback: retire only the new v0.5.2 snapshot.

begin;

update public.ai_model_catalog_versions
   set status = 'retired'
 where version = '2026-09-27.1'
   and channel = 'stable'
   and status = 'published'
   and minimum_app_version = '0.5.2';

do $$
declare
    fallback_version text;
begin
    select public.get_ai_model_catalog('stable', '0.5.2')->>'version'
      into fallback_version;
    if fallback_version is null or fallback_version = '2026-09-27.1' then
        raise exception 'A published fallback catalog was not restored';
    end if;
end
$$;

commit;
