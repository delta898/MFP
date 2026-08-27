-- Sidebar 긴급 pause 검증
-- 개발자 응원하기 캠페인 하나만 중지합니다.
-- 실행 후 앱을 재시작하지 말고 1분 뒤 앱 창으로 돌아옵니다.

update public.app_surface_campaigns
   set status = 'paused',
       policy_revision = policy_revision + 1
 where campaign_key = 'developer-support-sidebar-v1';

select
    campaign_key,
    status,
    audience_mode,
    plan_codes,
    policy_revision
from public.app_surface_campaigns
where campaign_key = 'developer-support-sidebar-v1';
