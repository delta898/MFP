-- ============================================================
-- BlogGenius Dashboard: 공식 사용 가이드와 Buffer 안내
-- 대상: Supabase SQL Editor
-- 전제: supabase/migrations/202608270012_surface_content.sql 적용 완료
-- ============================================================
-- 운영 정책:
-- - BlogGenius 설치·연동·사용 가이드를 active resource로 등록
-- - 모든 유효 플랜 대상 campaign 게시
-- - dashboard.recommendations / compact_card
-- - 앱은 후보 중 30분마다 한 건을 순환 표시

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
values
    (
        'guide-bloggenius-installation',
        'resource',
        'BlogGenius 설치 방법',
        'https://m.blog.naver.com/amadejjs/224363721129',
        'book',
        '설치 방법 보기',
        null,
        null,
        'active'
    ),
    (
        'guide-naver-login',
        'resource',
        '네이버 로그인 방법',
        'https://m.blog.naver.com/amadejjs/224364560786',
        'sparkles',
        '로그인 방법 보기',
        null,
        null,
        'active'
    ),
    (
        'guide-wordpress-connection',
        'resource',
        'WordPress 연동 방법',
        'https://m.blog.naver.com/amadejjs/224364876173',
        'link',
        '연동 방법 보기',
        null,
        null,
        'active'
    ),
    (
        'guide-google-sheets-connection',
        'resource',
        'Google 스프레드시트 연결 방법',
        'https://m.blog.naver.com/amadejjs/224367369056',
        'link',
        '연결 방법 보기',
        null,
        null,
        'active'
    ),
    (
        'guide-ai-api-key',
        'resource',
        'AI 설정과 무료 AI API Key 발급 방법',
        'https://m.blog.naver.com/amadejjs/224368506082',
        'sparkles',
        'AI 설정 보기',
        null,
        null,
        'active'
    ),
    (
        'guide-automatic-update',
        'resource',
        'BlogGenius 자동 업데이트 활용 팁',
        'https://m.blog.naver.com/amadejjs/224369593466',
        'sparkles',
        '업데이트 팁 보기',
        null,
        null,
        'active'
    ),
    (
        'guide-buffer-sns-publishing',
        'resource',
        'Buffer로 SNS 발행 준비',
        'https://m.blog.naver.com/amadejjs/223940980574',
        'sparkles',
        'Buffer 도움말 보기',
        null,
        null,
        'active'
    ),
    (
        'guide-quick-writing',
        'resource',
        'BlogGenius 빠른 글 작성 방법',
        'https://blog.gongzza.com/blog/%eb%b8%94%eb%a1%9c%ea%b7%b8-%ec%9e%90%eb%8f%99%ed%99%94-%ed%9a%a8%ec%9c%a8-%ec%98%ac%eb%a6%ac%eb%8a%94-bloggenius-%eb%b9%a0%eb%a5%b8-%ea%b8%80-%ec%9e%91%ec%84%b1-%eb%b0%a9%eb%b2%95/',
        'book',
        '작성 방법 보기',
        null,
        null,
        'active'
    ),
    (
        'guide-bloggenius-seo-benefits',
        'resource',
        'BlogGenius SEO 특장점과 차별화 10가지',
        'https://blog.gongzza.com/blog/%eb%b8%94%eb%a1%9c%ea%b7%b8-seo-%ec%9e%90%eb%8f%99%ed%99%94-%eb%8f%84%ea%b5%ac-bloggenius-%ed%8a%b9%ec%9e%a5%ec%a0%90-%ec%b0%a8%eb%b3%84%ed%99%94-10%ea%b0%80%ec%a7%80/',
        'sparkles',
        '특장점 보기',
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
select
    source.campaign_key,
    source.content_key,
    'all',
    '{}'::text[],
    null,
    null,
    '0.4.0',
    null,
    'published',
    1,
    timezone('utc', now())
from (values
    ('guide-bloggenius-installation-dashboard-v1', 'guide-bloggenius-installation'),
    ('guide-naver-login-dashboard-v1', 'guide-naver-login'),
    ('guide-wordpress-connection-dashboard-v1', 'guide-wordpress-connection'),
    ('guide-google-sheets-connection-dashboard-v1', 'guide-google-sheets-connection'),
    ('guide-ai-api-key-dashboard-v1', 'guide-ai-api-key'),
    ('guide-automatic-update-dashboard-v1', 'guide-automatic-update'),
    ('guide-quick-writing-dashboard-v1', 'guide-quick-writing'),
    ('guide-bloggenius-seo-benefits-dashboard-v1', 'guide-bloggenius-seo-benefits')
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
    ('guide-bloggenius-installation-dashboard-v1', 100),
    ('guide-naver-login-dashboard-v1', 200),
    ('guide-wordpress-connection-dashboard-v1', 300),
    ('guide-google-sheets-connection-dashboard-v1', 400),
    ('guide-ai-api-key-dashboard-v1', 500),
    ('guide-automatic-update-dashboard-v1', 600),
    ('guide-quick-writing-dashboard-v1', 700),
    ('guide-bloggenius-seo-benefits-dashboard-v1', 800)
) as source(campaign_key, sort_order)
on conflict (campaign_key, surface_key, region_key) do update
set presentation = excluded.presentation,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active;

commit;

select
    content.content_key,
    content.title,
    content.target_url,
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
  and content.content_key like 'guide-%'
order by placement.sort_order, content.content_key;
