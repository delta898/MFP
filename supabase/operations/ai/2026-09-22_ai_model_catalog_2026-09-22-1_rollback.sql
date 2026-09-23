-- Development-only rollback to the previously published catalog.

begin;

update public.ai_model_catalog_versions
   set status = 'retired'
 where version = '2026-09-22.1'
   and channel = 'stable'
   and status = 'published';

update public.ai_model_catalog_versions
   set status = 'published',
       published_at = timezone('utc', now())
 where version = '2026-08-21.1'
   and channel = 'stable'
   and status = 'retired';

commit;
