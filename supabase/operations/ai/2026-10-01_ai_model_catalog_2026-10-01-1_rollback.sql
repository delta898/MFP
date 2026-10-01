-- Development-only rollback: retire only the new catalog snapshot.
-- Execute only against BlogGenius Development.

begin;

update public.ai_model_catalog_versions
   set status = 'retired'
 where version = '2026-10-01.1' and channel = 'stable' and status = 'published';

do $$
begin
    if (select public.get_ai_model_catalog('stable', '0.5.5')->>'version') = '2026-10-01.1'
       or (select public.get_ai_model_catalog('stable', '0.5.5')->>'version') is null then
        raise exception 'Development rollback did not restore a published fallback';
    end if;
end
$$;

commit;
