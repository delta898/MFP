-- ============================================================
-- BlogGenius License Operations (운영용)
-- 대상: Supabase SQL Editor
-- ============================================================
-- 목적:
-- - 무료 사용자 -> 유료 전환
-- - 유료 라이선스 발급/갱신/중지/재바인딩 운영
--
-- 전제:
-- - sql/supabase_license_v3.sql 적용 완료

-- ------------------------------------------------------------
-- 0) 운영 조회 성능용 인덱스 (이메일)
-- ------------------------------------------------------------
create index if not exists idx_licenses_email on public.licenses (email);

-- ------------------------------------------------------------
-- 0-1) 16바이트 랜덤 키 자동 발급 (권장)
--    - 실행 결과의 license_key를 사용자에게 전달
--    - 충돌로 0행 반환 시 1회 재실행
-- ------------------------------------------------------------
with seed as (
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
    tier,
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
    'pro',
    'active',
    'user@example.com',
    null,
    300,
    0,
    timezone('utc', now()) + interval '1 month',
    'metered',
    null,
    'issued automatically (16-byte random key)'
from issued i
on conflict (license_key) do nothing
returning license_key, email, usage_limit, reset_date, created_at;

-- ------------------------------------------------------------
-- A) 무료 사용자에게 "차감형 유료 키(metered)" 발급/갱신
--    - usage_limit: 월 허용 횟수
--    - reset_date: 다음 리셋 시각
-- ------------------------------------------------------------
insert into public.licenses (
    license_key,
    plan_code,
    tier,
    status,
    email,
    hwid,
    usage_limit,
    usage_count,
    reset_date,
    license_mode,
    expires_at,
    note
) values (
    'PAID-KEY-REPLACE-ME',
    'pro',
    'pro',
    'active',
    'user@example.com',
    null,                          -- 첫 실행 시 자동 HWID 바인딩
    300,                           -- 월 300회 예시
    0,
    timezone('utc', now()) + interval '1 month',
    'metered',
    null,                          -- 만료 없음 (필요 시 지정)
    'issued manually'
)
on conflict (license_key) do update
set plan_code = excluded.plan_code,
    tier = excluded.tier,
    status = excluded.status,
    email = excluded.email,
    usage_limit = excluded.usage_limit,
    usage_count = excluded.usage_count,
    reset_date = excluded.reset_date,
    license_mode = excluded.license_mode,
    expires_at = excluded.expires_at,
    note = excluded.note;

-- ------------------------------------------------------------
-- B) 무료 사용자에게 "무한 유료 키(unlimited)" 발급/갱신
-- ------------------------------------------------------------
insert into public.licenses (
    license_key,
    plan_code,
    tier,
    status,
    email,
    hwid,
    usage_limit,
    usage_count,
    reset_date,
    license_mode,
    expires_at,
    note
) values (
    'UNLIMITED-KEY-REPLACE-ME',
    'ultra',
    'business',
    'active',
    'user@example.com',
    null,
    0,
    0,
    null,
    'unlimited',
    null,                          -- 만료 없는 무한
    'unlimited lifetime'
)
on conflict (license_key) do update
set plan_code = excluded.plan_code,
    tier = excluded.tier,
    status = excluded.status,
    email = excluded.email,
    license_mode = excluded.license_mode,
    expires_at = excluded.expires_at,
    note = excluded.note;

-- ------------------------------------------------------------
-- C) 기간형 무한(구독형)으로 전환/갱신
--    - 예: 오늘부터 30일
-- ------------------------------------------------------------
update public.licenses
set status = 'active',
    plan_code = 'ultra',
    license_mode = 'unlimited',
    expires_at = timezone('utc', now()) + interval '30 days',
    note = 'subscription: 30 days',
    reset_date = null
where license_key = 'SUBSCRIPTION-KEY-REPLACE-ME';

-- ------------------------------------------------------------
-- D) 유료 키 비활성화(정지/환불/해지)
-- ------------------------------------------------------------
update public.licenses
set status = 'inactive',
    note = 'deactivated by operator'
where license_key = 'PAID-KEY-REPLACE-ME';

-- ------------------------------------------------------------
-- E) HWID 재바인딩 허용 (기기 변경 대응)
--    - 다음 실행 시 새로운 HWID로 자동 바인딩
-- ------------------------------------------------------------
update public.licenses
set hwid = null,
    note = 'hwid reset by operator'
where license_key = 'PAID-KEY-REPLACE-ME';

-- ------------------------------------------------------------
-- F) 차감형 사용량 즉시 리셋
-- ------------------------------------------------------------
update public.licenses
set usage_count = 0,
    reset_date = timezone('utc', now()) + interval '1 month',
    note = 'usage reset by operator'
where license_key = 'PAID-KEY-REPLACE-ME'
  and coalesce(license_mode, 'metered') = 'metered';

-- ------------------------------------------------------------
-- G) 라이선스 상태 조회 (점검용)
-- ------------------------------------------------------------
select
    license_key,
    email,
    plan_code,
    tier,
    status,
    license_mode,
    usage_limit,
    usage_count,
    reset_date,
    expires_at,
    hwid,
    note,
    created_at
from public.licenses
where license_key in (
    'PAID-KEY-REPLACE-ME',
    'UNLIMITED-KEY-REPLACE-ME',
    'SUBSCRIPTION-KEY-REPLACE-ME'
);
