-- ============================================================
-- BlogGenius Dashboard Daily Resource Recommendations
-- 대상: Supabase SQL Editor
-- 전제:
-- 1) supabase_surface_content.sql 적용 완료
-- 2) supabase_surface_content_draft_resource_catalog_seed.sql 적용 완료
-- ============================================================
-- 운영 정책:
-- - 등록된 draft resource 5개를 active로 전환
-- - Tester / Free 대상 campaign 게시
-- - dashboard.recommendations / compact_card
-- - 앱은 정렬된 후보를 하루에 한 칸씩 순환하여 모두 노출되기 전에는 반복하지 않음

begin;

do $$
begin
    if (
        select count(*)
          from public.app_surface_contents
         where content_key in (
             'ebook-30-day-blog-monetization',
             'ebook-early-riser',
             'blog-buffer-sns-burnout',
             'blog-opendock-wordpress',
             'blog-laptop-home-server'
         )
    ) <> 5 then
        raise exception using
            message = '추천 자료 카탈로그 5개가 모두 등록되어 있지 않습니다.',
            hint = 'supabase_surface_content_draft_resource_catalog_seed.sql을 먼저 실행하세요.';
    end if;
end;
$$;

update public.app_surface_contents
   set status = 'active'
 where content_key in (
       'ebook-30-day-blog-monetization',
       'ebook-early-riser',
       'blog-buffer-sns-burnout',
       'blog-opendock-wordpress',
       'blog-laptop-home-server'
   );

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
select
    source.campaign_key,
    source.content_key,
    'include',
    array['test', 'free'],
    null,
    null,
    '0.1.18',
    null,
    'published',
    1,
    timezone('utc', now())
from (values
    ('ebook-30-day-blog-monetization-dashboard-v1', 'ebook-30-day-blog-monetization'),
    ('ebook-early-riser-dashboard-v1', 'ebook-early-riser'),
    ('blog-buffer-sns-burnout-dashboard-v1', 'blog-buffer-sns-burnout'),
    ('blog-opendock-wordpress-dashboard-v1', 'blog-opendock-wordpress'),
    ('blog-laptop-home-server-dashboard-v1', 'blog-laptop-home-server')
) as source(campaign_key, content_key)
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
select
    source.campaign_key,
    'dashboard',
    'recommendations',
    'compact_card',
    source.sort_order,
    true
from (values
    ('ebook-30-day-blog-monetization-dashboard-v1', 100),
    ('ebook-early-riser-dashboard-v1', 200),
    ('blog-buffer-sns-burnout-dashboard-v1', 300),
    ('blog-opendock-wordpress-dashboard-v1', 400),
    ('blog-laptop-home-server-dashboard-v1', 500)
) as source(campaign_key, sort_order)
on conflict (campaign_key, surface_key, region_key) do update
set presentation = excluded.presentation,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active;

commit;

select
    content.content_key,
    content.title,
    content.status as content_status,
    campaign.audience_mode,
    campaign.plan_codes,
    campaign.status as campaign_status,
    placement.region_key,
    placement.sort_order,
    placement.is_active
from public.app_surface_campaign_placements placement
join public.app_surface_campaigns campaign
  on campaign.campaign_key = placement.campaign_key
join public.app_surface_contents content
  on content.content_key = campaign.content_key
where placement.surface_key = 'dashboard'
  and placement.region_key = 'recommendations'
order by placement.sort_order, content.content_key;
