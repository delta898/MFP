-- ============================================================
-- BlogGenius 운영 템플릿: Test/Free 라이선스 1건 발급 (랜덤 키 자동 생성)
-- 대상: Supabase SQL Editor
-- ============================================================
-- 사용법:
-- 1) params CTE의 p_plan_code / p_email / p_note 수정
--    - p_plan_code: 'test' 또는 'free'
-- 2) 필요하면 p_usage_limit_override를 지정 (null이면 기본값 사용)
--    - test 기본 20회 / free 기본 15회
-- 3) 전체 실행
-- 4) returning으로 나온 license_key를 사용자에게 전달
--
-- 참고:
-- - test: quota_cycle=none -> reset_date = null
-- - free: quota_cycle=monthly -> reset_date = now + 1 month
-- - hwid는 null로 두고 첫 실행 시 자동 바인딩

with params as (
    select
        'free'::text as p_plan_code,                  -- 'test' | 'free'
        'user@example.com'::text as p_email,
        null::int as p_usage_limit_override,          -- null이면 플랜 기본값 적용
        'issued by operator (test/free unique key)'::text as p_note
),
normalized as (
    select
        lower(trim(p.p_plan_code)) as plan_code,
        p.p_email as email,
        p.p_usage_limit_override as usage_limit_override,
        p.p_note as note
    from params p
),
validated as (
    select
        n.plan_code,
        n.email,
        n.usage_limit_override,
        n.note,
        case when n.plan_code = 'test' then 20 else 15 end as default_limit,
        case when n.plan_code = 'test' then null::timestamptz else timezone('utc', now()) + interval '1 month' end as default_reset_date
    from normalized n
    where n.plan_code in ('test', 'free')
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
    v.plan_code,
    'active',
    v.email,
    null,
    coalesce(v.usage_limit_override, v.default_limit),
    0,
    v.default_reset_date,
    'metered',
    null,
    v.note
from issued i
cross join validated v
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
