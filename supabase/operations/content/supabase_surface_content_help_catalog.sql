-- ============================================================
-- BlogGenius Help: 공식 가이드와 보조 자료 카탈로그
-- 대상: Development 검증 후 Production SQL Editor
-- 전제:
-- 1) supabase/migrations/202608270012_surface_content.sql
-- 2) supabase_surface_content_bloggenius_guides_seed.sql
-- 3) developer_blog / ebook / support seed SQL
-- ============================================================
-- 기존 content를 재사용하고 Help 전용 campaign과 placement만 추가합니다.
-- table/schema migration은 필요하지 않습니다.

begin;

do $$
declare
    required_keys constant text[] := array[
        'guide-bloggenius-installation',
        'guide-naver-login',
        'guide-wordpress-connection',
        'guide-google-sheets-connection',
        'guide-ai-api-key',
        'guide-automatic-update',
        'guide-buffer-sns-publishing',
        'guide-quick-writing',
        'guide-bloggenius-seo-benefits',
        'developer-blog',
        'oracle-cloud-guide',
        'developer-support'
    ];
    missing_keys text[];
begin
    select array_agg(required_key order by required_key)
      into missing_keys
      from unnest(required_keys) required_key
     where not exists (
        select 1
          from public.app_surface_contents content
         where content.content_key = required_key
           and content.status = 'active'
     );

    if coalesce(array_length(missing_keys, 1), 0) > 0 then
        raise exception using
            message = 'Help 카탈로그에 필요한 active content가 없습니다: ' || array_to_string(missing_keys, ', '),
            hint = '공식 가이드와 developer_blog / ebook / support seed를 먼저 적용하세요.';
    end if;
end;
$$;

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
    '0.4.2',
    null,
    'published',
    1,
    timezone('utc', now())
from (values
    ('guide-bloggenius-installation-help-v1', 'guide-bloggenius-installation'),
    ('guide-naver-login-help-v1', 'guide-naver-login'),
    ('guide-wordpress-connection-help-v1', 'guide-wordpress-connection'),
    ('guide-google-sheets-connection-help-v1', 'guide-google-sheets-connection'),
    ('guide-ai-api-key-help-v1', 'guide-ai-api-key'),
    ('guide-quick-writing-help-v1', 'guide-quick-writing'),
    ('guide-bloggenius-seo-benefits-help-v1', 'guide-bloggenius-seo-benefits'),
    ('guide-automatic-update-help-v1', 'guide-automatic-update'),
    ('guide-buffer-sns-publishing-help-v1', 'guide-buffer-sns-publishing'),
    ('developer-blog-help-v1', 'developer-blog'),
    ('oracle-cloud-guide-help-v1', 'oracle-cloud-guide'),
    ('developer-support-help-v1', 'developer-support')
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
    'help',
    source.region_key,
    'compact_card',
    source.sort_order,
    true
from (values
    ('guide-bloggenius-installation-help-v1', 'getting_started', 100),
    ('guide-naver-login-help-v1', 'getting_started', 200),
    ('guide-wordpress-connection-help-v1', 'getting_started', 300),
    ('guide-google-sheets-connection-help-v1', 'getting_started', 400),
    ('guide-ai-api-key-help-v1', 'getting_started', 500),
    ('guide-quick-writing-help-v1', 'writing', 100),
    ('guide-bloggenius-seo-benefits-help-v1', 'writing', 200),
    ('guide-automatic-update-help-v1', 'automation', 100),
    ('guide-buffer-sns-publishing-help-v1', 'automation', 200),
    ('developer-blog-help-v1', 'supporting', 100),
    ('oracle-cloud-guide-help-v1', 'supporting', 200),
    ('developer-support-help-v1', 'supporting', 300)
) as source(campaign_key, region_key, sort_order)
on conflict (campaign_key, surface_key, region_key) do update
set presentation = excluded.presentation,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active;

commit;

select
    placement.region_key,
    placement.sort_order,
    content.content_key,
    content.kind,
    content.title,
    campaign.audience_mode,
    campaign.status as campaign_status,
    placement.is_active
from public.app_surface_campaign_placements placement
join public.app_surface_campaigns campaign
  on campaign.campaign_key = placement.campaign_key
join public.app_surface_contents content
  on content.content_key = campaign.content_key
where placement.surface_key = 'help'
order by placement.region_key, placement.sort_order, campaign.campaign_key;
