-- ============================================================
-- BlogGenius Sidebar Resource: 개발자 블로그
-- 대상: Supabase SQL Editor
-- 전제: supabase_surface_content.sql 적용 완료
-- ============================================================
-- 운영용 텍스트 링크를 재실행 가능한 upsert로 등록합니다.
-- - Tester / Free 대상
-- - sidebar.utility
-- - Help(sort 500) 위쪽 sort 400
-- - 이미지 없음: 앱 내장 sparkles icon 사용

begin;

insert into public.app_surface_contents (
    content_key,
    kind,
    title,
    target_url,
    icon_key,
    cta_label,
    disclosure_text,
    primary_asset_key,
    status
)
values (
    'developer-blog',
    'resource',
    '개발자 블로그',
    'https://blog.naver.com/amadejjs',
    'sparkles',
    '블로그 보기',
    null,
    null,
    'active'
)
on conflict (content_key) do update
set kind = excluded.kind,
    title = excluded.title,
    target_url = excluded.target_url,
    icon_key = excluded.icon_key,
    cta_label = excluded.cta_label,
    disclosure_text = excluded.disclosure_text,
    primary_asset_key = excluded.primary_asset_key,
    status = excluded.status;

insert into public.app_surface_campaigns (
    campaign_key,
    content_key,
    audience_mode,
    plan_codes,
    starts_at,
    ends_at,
    minimum_app_version,
    maximum_app_version,
    status,
    policy_revision,
    published_at
)
values (
    'developer-blog-sidebar-v1',
    'developer-blog',
    'include',
    array['test', 'free'],
    null,
    null,
    '0.1.18',
    null,
    'published',
    1,
    timezone('utc', now())
)
on conflict (campaign_key) do update
set content_key = excluded.content_key,
    audience_mode = excluded.audience_mode,
    plan_codes = excluded.plan_codes,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    minimum_app_version = excluded.minimum_app_version,
    maximum_app_version = excluded.maximum_app_version,
    status = excluded.status,
    policy_revision = public.app_surface_campaigns.policy_revision + 1,
    published_at = timezone('utc', now());

insert into public.app_surface_campaign_placements (
    campaign_key,
    surface_key,
    region_key,
    presentation,
    sort_order,
    is_active
)
values (
    'developer-blog-sidebar-v1',
    'sidebar',
    'utility',
    'nav_item',
    400,
    true
)
on conflict (campaign_key, surface_key, region_key) do update
set presentation = excluded.presentation,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active;

commit;

-- 저장 구조 확인입니다. 실제 resolved payload는 앱의 실제 license key/HWID로 검증합니다.
select
    c.content_key,
    c.title,
    campaign.audience_mode,
    campaign.plan_codes,
    campaign.status as campaign_status,
    placement.surface_key,
    placement.region_key,
    placement.sort_order
from public.app_surface_contents c
join public.app_surface_campaigns campaign
  on campaign.content_key = c.content_key
join public.app_surface_campaign_placements placement
  on placement.campaign_key = campaign.campaign_key
where c.content_key = 'developer-blog';
