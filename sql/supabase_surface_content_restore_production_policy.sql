-- Configurable Surface Content: 운영 audience 정책 복원
-- 홍보 resource는 Tester / Free, 후원은 모든 플랜에 노출합니다.

begin;

update public.app_surface_campaigns
   set audience_mode = 'include',
       plan_codes = array['test', 'free'],
       policy_revision = policy_revision + 1
 where campaign_key in (
       'developer-blog-sidebar-v1',
       'oracle-cloud-guide-sidebar-v1',
       'ebook-30-day-blog-monetization-dashboard-v1',
       'ebook-early-riser-dashboard-v1',
       'blog-buffer-sns-burnout-dashboard-v1',
       'blog-opendock-wordpress-dashboard-v1',
       'blog-laptop-home-server-dashboard-v1'
   );

update public.app_surface_campaigns
   set audience_mode = 'all',
       plan_codes = '{}'::text[],
       policy_revision = policy_revision + 1
 where campaign_key = 'developer-support-sidebar-v1';

commit;

select
    campaign_key,
    audience_mode,
    plan_codes,
    status,
    policy_revision
  from public.app_surface_campaigns
 where campaign_key in (
       'developer-blog-sidebar-v1',
       'oracle-cloud-guide-sidebar-v1',
       'ebook-30-day-blog-monetization-dashboard-v1',
       'ebook-early-riser-dashboard-v1',
       'blog-buffer-sns-burnout-dashboard-v1',
       'blog-opendock-wordpress-dashboard-v1',
       'blog-laptop-home-server-dashboard-v1',
       'developer-support-sidebar-v1'
   )
 order by campaign_key;
