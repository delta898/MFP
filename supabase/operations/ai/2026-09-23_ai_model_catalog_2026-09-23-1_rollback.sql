-- Development-only rollback to the previous catalog snapshot.

begin;

update public.ai_model_catalog_versions
   set status = 'retired'
 where version = '2026-09-23.1'
   and channel = 'stable'
   and status = 'published';

update public.ai_model_catalog_versions
   set status = 'published',
       published_at = timezone('utc', now())
 where version = '2026-09-22.2'
   and channel = 'stable'
   and status = 'retired';

commit;
