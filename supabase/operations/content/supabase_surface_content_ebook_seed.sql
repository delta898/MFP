-- ============================================================
-- BlogGenius Sidebar Resource: 무료 오라클 가이드
-- 대상: Supabase SQL Editor
-- 전제:
-- 1) supabase_surface_content.sql 적용 완료
-- 2) 아래 Storage object upload 완료
--    bucket: app-public-content
--    path: surface-content/ebooks/oracle-cloud-guide/sidebar-v1.webp
-- ============================================================

begin;

do $$
begin
    if not exists (
        select 1
          from storage.objects
         where bucket_id = 'app-public-content'
           and name = 'surface-content/ebooks/oracle-cloud-guide/sidebar-v1.webp'
    ) then
        raise exception using
            message = '전자책 thumbnail이 Storage에 없습니다.',
            hint = 'app-public-content/surface-content/ebooks/oracle-cloud-guide/sidebar-v1.webp 경로를 확인하세요.';
    end if;
end;
$$;

insert into public.app_surface_assets (
    asset_key,
    kind,
    transport,
    bucket_name,
    object_path,
    mime_type,
    width,
    height,
    byte_size,
    alt_text,
    revision,
    status
)
values (
    'oracle-cloud-guide-sidebar-v1',
    'image',
    'supabase_storage',
    'app-public-content',
    'surface-content/ebooks/oracle-cloud-guide/sidebar-v1.webp',
    'image/webp',
    256,
    256,
    20178,
    '평생 무료 오라클 클라우드 호스팅 전자책 표지',
    1,
    'active'
)
on conflict (asset_key) do update
set kind = excluded.kind,
    transport = excluded.transport,
    bucket_name = excluded.bucket_name,
    object_path = excluded.object_path,
    mime_type = excluded.mime_type,
    width = excluded.width,
    height = excluded.height,
    byte_size = excluded.byte_size,
    alt_text = excluded.alt_text,
    revision = excluded.revision,
    status = excluded.status;

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
    'oracle-cloud-guide',
    'resource',
    '무료 오라클 가이드',
    'https://www.latpeed.com/products/wfZro',
    'book',
    '전자책 보기',
    null,
    'oracle-cloud-guide-sidebar-v1',
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
    'oracle-cloud-guide-sidebar-v1',
    'oracle-cloud-guide',
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
    'oracle-cloud-guide-sidebar-v1',
    'sidebar',
    'utility',
    'nav_item',
    450,
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
    c.target_url,
    a.bucket_name,
    a.object_path,
    campaign.audience_mode,
    campaign.plan_codes,
    campaign.status as campaign_status,
    placement.surface_key,
    placement.region_key,
    placement.sort_order
from public.app_surface_contents c
join public.app_surface_assets a
  on a.asset_key = c.primary_asset_key
join public.app_surface_campaigns campaign
  on campaign.content_key = c.content_key
join public.app_surface_campaign_placements placement
  on placement.campaign_key = campaign.campaign_key
where c.content_key = 'oracle-cloud-guide';
