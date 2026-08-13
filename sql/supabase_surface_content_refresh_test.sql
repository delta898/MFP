-- Sidebar 자동 갱신 UI 검증용 임시 변경
-- 실행 후 앱을 재시작하지 말고, 1분이 지난 뒤 앱 창으로 돌아옵니다.

begin;

update public.app_surface_contents
   set title = '커피 한 잔 응원'
 where content_key = 'developer-support';

update public.app_surface_campaign_placements
   set sort_order = 350
 where campaign_key = 'developer-support-sidebar-v1'
   and surface_key = 'sidebar'
   and region_key = 'utility';

update public.app_surface_campaigns
   set policy_revision = policy_revision + 1
 where campaign_key = 'developer-support-sidebar-v1';

commit;

select
    c.title,
    p.sort_order,
    campaign.policy_revision
from public.app_surface_contents c
join public.app_surface_campaigns campaign
  on campaign.content_key = c.content_key
join public.app_surface_campaign_placements p
  on p.campaign_key = campaign.campaign_key
where c.content_key = 'developer-support';
