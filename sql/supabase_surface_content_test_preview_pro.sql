-- Configurable Surface Content: resource의 Pro 미리보기 임시 허용 (검증 전용)
-- campaign audience를 공유하는 Sidebar, Dashboard, Account에 함께 적용됩니다.
-- UI 검증이 끝나면 supabase_surface_content_restore_production_policy.sql을 실행합니다.

update public.app_surface_campaigns
   set plan_codes = array['test', 'free', 'pro'],
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
