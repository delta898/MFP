-- Production-only rollback: retire only the new v0.5.5 snapshot.

begin;

update public.ai_model_catalog_versions
   set status = 'retired'
 where version = '2026-10-01.1' and channel = 'stable'
   and status = 'published' and minimum_app_version = '0.5.5-dev1';

do $$
begin
    if (select public.get_ai_model_catalog('stable', '0.5.5')->>'version') = '2026-10-01.1'
       or (select public.get_ai_model_catalog('stable', '0.5.5')->>'version') is null then
        raise exception 'Production rollback did not restore a published fallback';
    end if;
    if (select public.get_ai_model_catalog('stable', '0.5.4')->>'version') is distinct from '2026-09-27.1' then
        raise exception 'Production rollback changed 0.5.4 catalog routing';
    end if;
end
$$;

commit;
