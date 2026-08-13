-- Configurable Sidebar Content PoC: Pro 미리보기 임시 허용
-- UI 검증이 끝나면 supabase_surface_content_poc_restore_policy.sql을 실행합니다.

update public.app_surface_campaigns
   set plan_codes = array['test', 'free', 'pro'],
       policy_revision = policy_revision + 1
 where campaign_key = 'developer-blog-sidebar-v1'
   and audience_mode = 'include';

select
    campaign_key,
    audience_mode,
    plan_codes,
    status,
    policy_revision
  from public.app_surface_campaigns
 where campaign_key = 'developer-blog-sidebar-v1';
