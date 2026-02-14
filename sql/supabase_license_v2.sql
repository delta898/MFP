-- ============================================================
-- BlogGenius License v2 (free 기본키 + HWID 자동 등록)
-- 대상: Supabase SQL Editor
-- ============================================================
-- 목적:
-- 1) free 기본키 사용 시 HWID 단위로 무료 사용량 자동 생성/차감
-- 2) 유료 키는 기존 public.licenses 테이블을 그대로 사용
-- 3) 사용량 정책(무료 quota/리셋주기)은 DB 테이블에서 관리
--
-- 참고:
-- - 앱은 RPC(check_and_use_license)만 호출합니다.
-- - 무료 정책 숫자/주기는 public.license_policies 값만 바꿔도 즉시 반영됩니다.

begin;

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1) 무료 정책 테이블
-- ------------------------------------------------------------
create table if not exists public.license_policies (
    policy_key text primary key,
    quota integer not null check (quota >= 0),
    reset_cycle text not null default 'monthly' check (reset_cycle in ('none', 'daily', 'weekly', 'monthly')),
    is_active boolean not null default true,
    note text,
    updated_at timestamptz not null default timezone('utc', now())
);

insert into public.license_policies (policy_key, quota, reset_cycle, is_active, note)
values ('free_default', 15, 'monthly', true, '기본 무료 정책 (월 15회)')
on conflict (policy_key) do update
set quota = excluded.quota,
    reset_cycle = excluded.reset_cycle,
    is_active = excluded.is_active,
    note = excluded.note,
    updated_at = timezone('utc', now());

-- ------------------------------------------------------------
-- 2) 무료 사용자 사용량 테이블 (HWID hash 기준)
-- ------------------------------------------------------------
create table if not exists public.free_license_usages (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    hwid_hash text not null unique,
    usage_limit integer not null default 0 check (usage_limit >= 0),
    usage_count integer not null default 0 check (usage_count >= 0),
    period_start timestamptz,
    period_end timestamptz,
    status text not null default 'active',
    note text
);

create index if not exists idx_free_license_usages_status on public.free_license_usages (status);
create index if not exists idx_licenses_license_key on public.licenses (license_key);

-- ------------------------------------------------------------
-- 2-0) 기존 유료 라이선스 테이블 확장 (무한/기간 만료 지원)
-- ------------------------------------------------------------
alter table public.licenses
    add column if not exists license_mode text default 'metered',
    add column if not exists expires_at timestamptz;

update public.licenses
   set license_mode = coalesce(nullif(trim(license_mode), ''), 'metered')
 where license_mode is null
    or trim(license_mode) = '';

-- ------------------------------------------------------------
-- 2-1) 보안 설정 (테이블 직접 접근 차단)
-- ------------------------------------------------------------
alter table public.license_policies enable row level security;
alter table public.free_license_usages enable row level security;

revoke all on table public.license_policies from anon, authenticated;
revoke all on table public.free_license_usages from anon, authenticated;

grant all on table public.license_policies to service_role;
grant all on table public.free_license_usages to service_role;

-- ------------------------------------------------------------
-- 3) 정책 리셋 주기 계산 helper
-- ------------------------------------------------------------
create or replace function public._license_calc_period_bounds(p_cycle text, p_now timestamptz default timezone('utc', now()))
returns table(period_start timestamptz, period_end timestamptz)
language plpgsql
as $$
begin
    if p_cycle = 'daily' then
        period_start := date_trunc('day', p_now);
        period_end := period_start + interval '1 day';
    elsif p_cycle = 'weekly' then
        period_start := date_trunc('week', p_now);
        period_end := period_start + interval '1 week';
    elsif p_cycle = 'monthly' then
        period_start := date_trunc('month', p_now);
        period_end := period_start + interval '1 month';
    else
        period_start := null;
        period_end := null;
    end if;
    return next;
end;
$$;

-- ------------------------------------------------------------
-- 4) 핵심 RPC: check_and_use_license
-- ------------------------------------------------------------
drop function if exists public.check_and_use_license(text, text);

create or replace function public.check_and_use_license(
    p_license_key text,
    p_hwid text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_now timestamptz := timezone('utc', now());
    v_key text := lower(trim(coalesce(p_license_key, '')));
    v_hwid text := trim(coalesce(p_hwid, ''));
    v_hwid_hash text;

    -- free policy
    v_policy_quota integer;
    v_policy_cycle text;
    v_period_start timestamptz;
    v_period_end timestamptz;

    -- free usage row
    v_free_id uuid;
    v_free_limit integer;
    v_free_count integer;
    v_free_period_end timestamptz;

    -- paid license row
    v_license_id uuid;
    v_license_status text;
    v_license_hwid text;
    v_usage_limit integer;
    v_usage_count integer;
    v_reset_date timestamptz;
    v_license_mode text;
    v_license_expires_at timestamptz;

    v_remaining integer;
begin
    if v_hwid = '' then
        return jsonb_build_object('success', false, 'message', 'HWID가 비어 있습니다.');
    end if;

    -- ========================================================
    -- A) FREE 경로 (빈 키 포함)
    -- ========================================================
    if v_key = '' or v_key = 'free' then
        select quota, reset_cycle
          into v_policy_quota, v_policy_cycle
          from public.license_policies
         where policy_key = 'free_default'
           and is_active = true
         limit 1;

        if v_policy_quota is null then
            return jsonb_build_object('success', false, 'message', '무료 정책이 비활성화되어 있습니다.');
        end if;

        v_hwid_hash := encode(digest(convert_to(v_hwid, 'UTF8'), 'sha256'), 'hex');

        select period_start, period_end
          into v_period_start, v_period_end
          from public._license_calc_period_bounds(v_policy_cycle, v_now)
         limit 1;

        select id, usage_limit, usage_count, period_end
          into v_free_id, v_free_limit, v_free_count, v_free_period_end
          from public.free_license_usages
         where hwid_hash = v_hwid_hash
         for update;

        if v_free_id is null then
            insert into public.free_license_usages (
                hwid_hash, usage_limit, usage_count, period_start, period_end, status
            )
            values (
                v_hwid_hash, v_policy_quota, 0, v_period_start, v_period_end, 'active'
            )
            returning id, usage_limit, usage_count, period_end
                 into v_free_id, v_free_limit, v_free_count, v_free_period_end;
        else
            -- 정책이 바뀌면 다음 호출부터 즉시 동기화
            if v_free_limit <> v_policy_quota then
                update public.free_license_usages
                   set usage_limit = v_policy_quota,
                       updated_at = v_now
                 where id = v_free_id;
                v_free_limit := v_policy_quota;
            end if;

            -- 리셋 주기 도달 시 카운트 초기화
            if v_policy_cycle <> 'none'
               and (v_free_period_end is null or v_now >= v_free_period_end) then
                update public.free_license_usages
                   set usage_count = 0,
                       period_start = v_period_start,
                       period_end = v_period_end,
                       updated_at = v_now
                 where id = v_free_id;
                v_free_count := 0;
            end if;
        end if;

        if v_free_count >= v_free_limit then
            return jsonb_build_object(
                'success', false,
                'message', format('무료 사용 횟수를 모두 사용했습니다. (잔여: 0/%s)', v_free_limit),
                'remaining', 0
            );
        end if;

        update public.free_license_usages
           set usage_count = usage_count + 1,
               updated_at = v_now
         where id = v_free_id
         returning usage_limit - usage_count into v_remaining;

        return jsonb_build_object(
            'success', true,
            'message', '무료 라이선스 승인',
            'remaining', greatest(v_remaining, 0)
        );
    end if;

    -- ========================================================
    -- B) 유료 라이선스 경로 (기존 licenses 테이블)
    -- ========================================================
    select id, status, hwid, coalesce(usage_limit, 0), coalesce(usage_count, 0), reset_date,
           coalesce(license_mode, 'metered'), expires_at
      into v_license_id, v_license_status, v_license_hwid, v_usage_limit, v_usage_count, v_reset_date,
           v_license_mode, v_license_expires_at
      from public.licenses
     where license_key = trim(p_license_key)
     for update;

    if v_license_id is null then
        return jsonb_build_object('success', false, 'message', '유효하지 않은 라이선스 키입니다.');
    end if;

    if coalesce(v_license_status, 'active') <> 'active' then
        return jsonb_build_object('success', false, 'message', '비활성화된 라이선스입니다.');
    end if;

    -- 구독형/기간형 라이선스 만료 체크
    if v_license_expires_at is not null and v_now >= v_license_expires_at then
        return jsonb_build_object('success', false, 'message', '만료된 라이선스입니다.');
    end if;

    -- 최초 1회 HWID 바인딩, 이후 불일치 시 차단
    if v_license_hwid is null or trim(v_license_hwid) = '' then
        update public.licenses
           set hwid = v_hwid
         where id = v_license_id;
        v_license_hwid := v_hwid;
    elsif trim(v_license_hwid) <> v_hwid then
        return jsonb_build_object('success', false, 'message', '다른 기기에 바인딩된 라이선스입니다.');
    end if;

    -- 무한 라이선스: 카운트 차감 없이 승인
    if lower(coalesce(v_license_mode, 'metered')) = 'unlimited' then
        return jsonb_build_object(
            'success', true,
            'message', '무한 라이선스 승인',
            'remaining', -1
        );
    end if;

    -- 기존 스키마의 reset_date를 유지: 만료 시 usage_count 초기화 후 +1개월
    if v_reset_date is not null and v_now >= v_reset_date then
        update public.licenses
           set usage_count = 0,
               reset_date = v_now + interval '1 month'
         where id = v_license_id
         returning usage_count, reset_date into v_usage_count, v_reset_date;
    end if;

    if v_usage_limit <= 0 then
        return jsonb_build_object('success', false, 'message', '사용 가능 횟수가 0으로 설정된 라이선스입니다.');
    end if;

    if v_usage_count >= v_usage_limit then
        return jsonb_build_object('success', false, 'message', '라이선스 사용 횟수를 모두 사용했습니다.', 'remaining', 0);
    end if;

    update public.licenses
       set usage_count = usage_count + 1
     where id = v_license_id
     returning usage_limit - usage_count into v_remaining;

    return jsonb_build_object(
        'success', true,
        'message', '라이선스 승인',
        'remaining', greatest(v_remaining, 0)
    );
end;
$$;

grant execute on function public.check_and_use_license(text, text) to anon, authenticated, service_role;
revoke all on function public.check_and_use_license(text, text) from public;

commit;
