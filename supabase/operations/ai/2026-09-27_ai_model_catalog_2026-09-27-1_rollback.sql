-- Development-only rollback: retire only the new snapshot.
-- The previously published compatible snapshot remains available as fallback.
-- Execute only against BlogGenius Development (bvtlwjbmjnfphxlrkzhm).

begin;

update public.ai_model_catalog_versions
   set status = 'retired'
 where version = '2026-09-27.1'
   and channel = 'stable'
   and status = 'published';

do $$
begin
    if (select public.get_ai_model_catalog('stable', '0.5.2')->>'version') <> '2026-09-23.1' then
        raise exception 'Rollback routing did not return to 2026-09-23.1 for app 0.5.2';
    end if;
end
$$;

commit;
