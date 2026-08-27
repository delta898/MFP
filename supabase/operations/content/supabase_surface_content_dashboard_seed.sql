-- ============================================================
-- BlogGenius Dashboard Supporting Content Placements
-- 대상: Supabase SQL Editor
-- 전제:
-- 1) supabase_surface_content.sql 적용 완료
-- 2) developer blog / ebook / support seed 적용 완료
-- ============================================================
-- 운영 정책:
-- - 기존 콘텐츠와 campaign audience를 그대로 재사용
-- - dashboard.supporting / compact_card
-- - 앱은 eligible 후보 중 daily_rotate로 한 카드만 표시

begin;

insert into public.app_surface_campaign_placements (
    campaign_key,
    surface_key,
    region_key,
    presentation,
    sort_order,
    is_active
)
values
    ('developer-blog-sidebar-v1', 'dashboard', 'supporting', 'compact_card', 100, true),
    ('oracle-cloud-guide-sidebar-v1', 'dashboard', 'supporting', 'compact_card', 200, true),
    ('developer-support-sidebar-v1', 'dashboard', 'supporting', 'compact_card', 300, true)
on conflict (campaign_key, surface_key, region_key) do update
set presentation = excluded.presentation,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active;

update public.app_surface_campaigns
   set policy_revision = policy_revision + 1
 where campaign_key in (
       'developer-blog-sidebar-v1',
       'oracle-cloud-guide-sidebar-v1',
       'developer-support-sidebar-v1'
   );

commit;

select
    c.content_key,
    c.kind,
    c.title,
    campaign.audience_mode,
    campaign.plan_codes,
    campaign.status,
    placement.surface_key,
    placement.region_key,
    placement.presentation,
    placement.sort_order,
    placement.is_active
from public.app_surface_campaign_placements placement
join public.app_surface_campaigns campaign
  on campaign.campaign_key = placement.campaign_key
join public.app_surface_contents c
  on c.content_key = campaign.content_key
where placement.surface_key = 'dashboard'
  and placement.region_key = 'supporting'
order by placement.sort_order, c.content_key;
