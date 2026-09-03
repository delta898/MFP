-- ============================================================
-- BlogGenius Dashboard: 공식 활용 팁 후보 풀 정리
-- 대상: Development 검증 후 Production SQL Editor
-- 전제: supabase_surface_content_bloggenius_guides_seed.sql 적용 완료
-- ============================================================
-- 운영 정책:
-- - dashboard.recommendations에는 공식 BlogGenius 가이드 8건만 유지
-- - 기존 제작자 추천 자료 5건은 삭제하지 않고 campaign만 pause
-- - 앱은 공식 가이드를 30분마다 한 건씩 순환 표시

begin;

do $$
begin
    if (
        select count(*)
          from public.app_surface_campaigns campaign
          join public.app_surface_campaign_placements placement
            on placement.campaign_key = campaign.campaign_key
         where campaign.campaign_key in (
             'guide-bloggenius-installation-dashboard-v1',
             'guide-naver-login-dashboard-v1',
             'guide-wordpress-connection-dashboard-v1',
             'guide-google-sheets-connection-dashboard-v1',
             'guide-ai-api-key-dashboard-v1',
             'guide-automatic-update-dashboard-v1',
             'guide-quick-writing-dashboard-v1',
             'guide-bloggenius-seo-benefits-dashboard-v1'
         )
           and campaign.status = 'published'
           and campaign.audience_mode = 'all'
           and placement.surface_key = 'dashboard'
           and placement.region_key = 'recommendations'
           and placement.is_active is true
    ) <> 8 then
        raise exception using
            message = '공식 BlogGenius 가이드 campaign 8건이 준비되지 않았습니다.',
            hint = 'supabase_surface_content_bloggenius_guides_seed.sql을 먼저 실행하세요.';
    end if;
end;
$$;

update public.app_surface_campaigns
   set status = 'paused',
       policy_revision = policy_revision + 1,
       updated_at = timezone('utc', now())
 where campaign_key in (
       'ebook-30-day-blog-monetization-dashboard-v1',
       'ebook-early-riser-dashboard-v1',
       'blog-buffer-sns-burnout-dashboard-v1',
       'blog-opendock-wordpress-dashboard-v1',
       'blog-laptop-home-server-dashboard-v1'
   )
   and status <> 'paused';

update public.app_surface_campaign_placements
   set is_active = false,
       updated_at = timezone('utc', now())
 where surface_key = 'dashboard'
   and region_key = 'recommendations'
   and campaign_key in (
       'ebook-30-day-blog-monetization-dashboard-v1',
       'ebook-early-riser-dashboard-v1',
       'blog-buffer-sns-burnout-dashboard-v1',
       'blog-opendock-wordpress-dashboard-v1',
       'blog-laptop-home-server-dashboard-v1'
   )
   and is_active is true;

commit;

select
    campaign.campaign_key,
    content.title,
    campaign.audience_mode,
    campaign.plan_codes,
    campaign.status as campaign_status,
    placement.is_active,
    placement.sort_order
from public.app_surface_campaign_placements placement
join public.app_surface_campaigns campaign
  on campaign.campaign_key = placement.campaign_key
join public.app_surface_contents content
  on content.content_key = campaign.content_key
where placement.surface_key = 'dashboard'
  and placement.region_key = 'recommendations'
order by placement.is_active desc, placement.sort_order, campaign.campaign_key;
