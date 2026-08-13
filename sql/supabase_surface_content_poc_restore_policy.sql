-- Configurable Sidebar Content PoC: 운영 정책 복구
-- 홍보 resource는 Tester / Free에만 노출합니다.

update public.app_surface_campaigns
   set plan_codes = array['test', 'free'],
       policy_revision = policy_revision + 1
 where campaign_key in (
       'developer-blog-sidebar-v1',
       'oracle-cloud-guide-sidebar-v1'
   )
   and audience_mode = 'include';

select
    campaign_key,
    audience_mode,
    plan_codes,
    status,
    policy_revision
  from public.app_surface_campaigns
 where campaign_key in (
       'developer-blog-sidebar-v1',
       'oracle-cloud-guide-sidebar-v1'
   )
 order by campaign_key;
