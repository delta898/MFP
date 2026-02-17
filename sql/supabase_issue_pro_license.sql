-- ============================================================
-- BlogGenius 운영 템플릿: Pro 라이선스 1건 발급 (랜덤 키 자동 생성)
-- 대상: Supabase SQL Editor
-- ============================================================
-- 사용법:
-- 1) params CTE의 email / usage_limit / note 값을 수정
-- 2) 전체 실행
-- 3) returning으로 나온 license_key를 사용자에게 전달
--
-- 참고:
-- - plan_code='pro', license_mode='metered' (월 차감형)
-- - hwid는 null로 두고 첫 실행 시 자동 바인딩

with params as (
    select
        'user@example.com'::text as p_email,
        100::int as p_usage_limit, -- 월 허용 횟수
        'issued by operator (pro metered)'::text as p_note
),
seed as (
    select upper(encode(gen_random_bytes(16), 'hex')) as r
),
issued as (
    select
        'BG-' ||
        substr(r, 1, 8)  || '-' ||
        substr(r, 9, 8)  || '-' ||
        substr(r, 17, 8) || '-' ||
        substr(r, 25, 8) as license_key
    from seed
)
insert into public.licenses (
    license_key,
    plan_code,
    status,
    email,
    hwid,
    usage_limit,
    usage_count,
    reset_date,
    license_mode,
    expires_at,
    note
)
select
    i.license_key,
    'pro',
    'active',
    p.p_email,
    null,
    p.p_usage_limit,
    0,
    timezone('utc', now()) + interval '1 month',
    'metered',
    null,
    p.p_note
from issued i
cross join params p
on conflict (license_key) do nothing
returning
    license_key,
    email,
    plan_code,
    license_mode,
    usage_limit,
    usage_count,
    reset_date,
    status,
    created_at;
