-- ============================================================
-- BlogGenius Surface Content: 비노출 Resource 카탈로그
-- 대상: Supabase SQL Editor
-- 전제: supabase_surface_content.sql 적용 완료
--
-- 이 SQL은 콘텐츠 원본만 draft 상태로 등록한다.
-- campaign과 placement를 만들지 않으므로 어떤 surface에도 노출되지 않는다.
-- 기존 레코드를 다시 실행할 때에는 운영자가 변경한 status와 asset 연결을 보존한다.
-- ============================================================

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
        'ebook-30-day-blog-monetization',
        'resource',
        '첫걸음이 두려운 당신께 안겨드립니다 30일 블로그 수익화 N잡 부업 체험단 비법 전자책',
        'https://www.latpeed.com/products/WRM7c',
        'book',
        '전자책 보기',
        null,
        null,
        'draft'
    ),
    (
        'ebook-early-riser',
        'resource',
        '새벽형 인간으로 새로 태어나기 - 새로운 인생 치트키! 애플의 CEO는 왜 새벽에 일어날까?',
        'https://www.latpeed.com/products/xib5Q',
        'book',
        '전자책 보기',
        null,
        null,
        'draft'
    ),
    (
        'blog-buffer-sns-burnout',
        'resource',
        'Buffer - 다수개 SNS 관리하다 번아웃 이후 찾은 해결책',
        'https://blog.naver.com/amadejjs/223940980574',
        'sparkles',
        '블로그 글 보기',
        null,
        null,
        'draft'
    ),
    (
        'blog-opendock-wordpress',
        'resource',
        '홈서버 워드프레스 설치 - OpenDock으로 한방에 끝내기',
        'https://blog.naver.com/amadejjs/224325976965',
        'sparkles',
        '블로그 글 보기',
        null,
        null,
        'draft'
    ),
    (
        'blog-laptop-home-server',
        'resource',
        '방치된 노트북으로 클라우드 대신 공짜 무한 서버 만들기',
        'https://blog.naver.com/amadejjs/224318135984',
        'sparkles',
        '블로그 글 보기',
        null,
        null,
        'draft'
    )
on conflict (content_key) do update
set kind = excluded.kind,
    title = excluded.title,
    target_url = excluded.target_url,
    icon_key = excluded.icon_key,
    cta_label = excluded.cta_label,
    disclosure_text = excluded.disclosure_text;

commit;

-- 검증: 최초 실행 시 다섯 콘텐츠가 draft이고 campaign_count가 0이면 비노출 등록 완료다.
select
    content.content_key,
    content.kind,
    content.title,
    content.target_url,
    content.status,
    count(campaign.campaign_key) as campaign_count
from public.app_surface_contents content
left join public.app_surface_campaigns campaign
       on campaign.content_key = content.content_key
where content.content_key in (
    'ebook-30-day-blog-monetization',
    'ebook-early-riser',
    'blog-buffer-sns-burnout',
    'blog-opendock-wordpress',
    'blog-laptop-home-server'
)
group by
    content.content_key,
    content.kind,
    content.title,
    content.target_url,
    content.status
order by content.content_key;
