-- ============================================================
-- BlogGenius License v3 (plan-driven: test/free/pro/ultra)
-- 대상: Supabase SQL Editor
-- ============================================================
-- 목적:
-- 1) 기본 키를 free -> test 로 전환
-- 2) 플랜/기능 정책을 DB에서 관리 (하드코딩 최소화)
-- 3) 공용 키(test/free) + 개별 유료 키(pro/ultra)를 같은 RPC에서 처리

begin;

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1) 플랜 테이블 (정책/기능 플래그)
-- ------------------------------------------------------------
create table if not exists public.license_plans (
    plan_code text primary key,
    display_name text not null,
    status text not null default 'active' check (status in ('active', 'inactive')),
    quota_mode text not null default 'metered' check (quota_mode in ('metered', 'unlimited')),
    quota_limit integer check (quota_limit is null or quota_limit >= 0),
    quota_cycle text not null default 'monthly' check (quota_cycle in ('none', 'daily', 'weekly', 'monthly')),
    features jsonb not null default '{}'::jsonb,
    note text,
    updated_at timestamptz not null default timezone('utc', now())
);

insert into public.license_plans (plan_code, display_name, status, quota_mode, quota_limit, quota_cycle, features, note)
values
    (
        'test',
        'Tester Plan',
        'active',
        'metered',
        20,
        'none',
        '{
            "cmd_batch": true,
            "cmd_shopping": true,
            "cmd_trends": true,
            "enable_related_posts_auto_link": true
        }'::jsonb,
        '테스트용 1회성 플랜'
    ),
    (
        'free',
        'Free Plan',
        'active',
        'metered',
        15,
        'monthly',
        '{
            "cmd_batch": true,
            "cmd_shopping": false,
            "cmd_trends": false,
            "enable_related_posts_auto_link": false
        }'::jsonb,
        '정식 무료 플랜'
    ),
    (
        'pro',
        'Pro Plan',
        'active',
        'metered',
        100,
        'monthly',
        '{
            "cmd_batch": true,
            "cmd_shopping": true,
            "cmd_trends": true,
            "enable_related_posts_auto_link": true
        }'::jsonb,
        '월 100회 기준'
    ),
    (
        'ultra',
        'Ultra Plan',
        'active',
        'unlimited',
        null,
        'monthly',
        '{
            "cmd_batch": true,
            "cmd_shopping": true,
            "cmd_trends": true,
            "enable_related_posts_auto_link": true
        }'::jsonb,
        '무제한 플랜'
    )
on conflict (plan_code) do update
set display_name = excluded.display_name,
    status = excluded.status,
    quota_mode = excluded.quota_mode,
    quota_limit = excluded.quota_limit,
    quota_cycle = excluded.quota_cycle,
    features = excluded.features,
    note = excluded.note,
    updated_at = timezone('utc', now());

-- ------------------------------------------------------------
-- 2) 공용 액세스 키(test/free 등) -> 플랜 매핑
-- ------------------------------------------------------------
create table if not exists public.license_access_keys (
    access_key text primary key,
    plan_code text not null references public.license_plans(plan_code),
    status text not null default 'active' check (status in ('active', 'inactive')),
    is_default boolean not null default false,
    note text,
    updated_at timestamptz not null default timezone('utc', now())
);

insert into public.license_access_keys (access_key, plan_code, status, is_default, note)
values
    ('test', 'test', 'active', true, '앱 기본 테스트 키'),
    ('free', 'free', 'active', false, '정식 무료 플랜 키')
on conflict (access_key) do update
set plan_code = excluded.plan_code,
    status = excluded.status,
    is_default = excluded.is_default,
    note = excluded.note,
    updated_at = timezone('utc', now());

-- 기본 키는 하나만 유지
update public.license_access_keys
   set is_default = false,
       updated_at = timezone('utc', now())
 where access_key <> 'test'
   and is_default = true;

-- ------------------------------------------------------------
-- 2-1) 기기 상태 테이블 (test 1회성/재진입 차단)
-- ------------------------------------------------------------
create table if not exists public.license_device_states (
    hwid_hash text primary key,
    test_started_at timestamptz,
    test_exhausted_at timestamptz,
    non_test_used boolean not null default false,
    last_seen_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    note text
);

create index if not exists idx_license_device_states_non_test
    on public.license_device_states (non_test_used, test_exhausted_at);

-- ------------------------------------------------------------
-- 3) 기존 테이블 확장
-- ------------------------------------------------------------
alter table public.licenses
    add column if not exists plan_code text;

update public.licenses
   set plan_code = 'pro'
 where plan_code is null
    or trim(plan_code) = '';

alter table public.licenses
    alter column plan_code set default 'pro';

-- v2의 free_license_usages 재사용 (공용키별 카운트 분리)
alter table public.free_license_usages
    add column if not exists access_key text;

update public.free_license_usages
   set access_key = 'free'
 where access_key is null
    or trim(access_key) = '';

alter table public.free_license_usages
    alter column access_key set not null;

alter table public.free_license_usages
    drop constraint if exists free_license_usages_hwid_hash_key;

create unique index if not exists uq_free_license_usages_hwid_access
    on public.free_license_usages (hwid_hash, access_key);

create index if not exists idx_free_license_usages_access_status
    on public.free_license_usages (access_key, status);

create index if not exists idx_license_access_keys_plan
    on public.license_access_keys (plan_code, status);

create index if not exists idx_licenses_plan_code
    on public.licenses (plan_code, status);

-- 기존 데이터 기반 기기 상태 백필
insert into public.license_device_states (hwid_hash, non_test_used, last_seen_at, updated_at, note)
select distinct
    fu.hwid_hash,
    true,
    timezone('utc', now()),
    timezone('utc', now()),
    'backfilled from non-test public usage'
from public.free_license_usages fu
where fu.access_key <> 'test'
on conflict (hwid_hash) do update
set non_test_used = true,
    last_seen_at = timezone('utc', now()),
    updated_at = timezone('utc', now());

insert into public.license_device_states (hwid_hash, non_test_used, last_seen_at, updated_at, note)
select distinct
    encode(digest(convert_to(trim(l.hwid), 'UTF8'), 'sha256'), 'hex'),
    true,
    timezone('utc', now()),
    timezone('utc', now()),
    'backfilled from paid license hwid'
from public.licenses l
where l.hwid is not null
  and trim(l.hwid) <> ''
on conflict (hwid_hash) do update
set non_test_used = true,
    last_seen_at = timezone('utc', now()),
    updated_at = timezone('utc', now());

insert into public.license_device_states (hwid_hash, test_started_at, test_exhausted_at, last_seen_at, updated_at, note)
select
    fu.hwid_hash,
    coalesce(fu.created_at, timezone('utc', now())),
    case when coalesce(fu.usage_count, 0) >= coalesce(fu.usage_limit, 0) then timezone('utc', now()) else null end,
    timezone('utc', now()),
    timezone('utc', now()),
    'backfilled from test usage'
from public.free_license_usages fu
where fu.access_key = 'test'
on conflict (hwid_hash) do update
set test_started_at = coalesce(public.license_device_states.test_started_at, excluded.test_started_at),
    test_exhausted_at = coalesce(public.license_device_states.test_exhausted_at, excluded.test_exhausted_at),
    last_seen_at = timezone('utc', now()),
    updated_at = timezone('utc', now());

-- ------------------------------------------------------------
-- 4) 보안 설정
-- ------------------------------------------------------------
alter table public.license_plans enable row level security;
alter table public.license_access_keys enable row level security;
alter table public.free_license_usages enable row level security;
alter table public.license_device_states enable row level security;

revoke all on table public.license_plans from anon, authenticated;
revoke all on table public.license_access_keys from anon, authenticated;
revoke all on table public.free_license_usages from anon, authenticated;
revoke all on table public.license_device_states from anon, authenticated;

grant all on table public.license_plans to service_role;
grant all on table public.license_access_keys to service_role;
grant all on table public.free_license_usages to service_role;
grant all on table public.license_device_states to service_role;

-- ------------------------------------------------------------
-- 5) 리셋 주기 helper
-- ------------------------------------------------------------
create or replace function public._license_calc_period_bounds(
    p_cycle text,
    p_now timestamptz default timezone('utc', now())
)
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
-- 6) 사전 검증 RPC (무차감)
-- ------------------------------------------------------------
drop function if exists public.check_license_status(text, text);

create or replace function public.check_license_status(
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

    v_access_key text;
    v_plan_code text;
    v_plan_status text;
    v_plan_mode text;
    v_plan_limit integer;
    v_plan_cycle text;
    v_plan_features jsonb := '{}'::jsonb;

    v_usage_limit integer := 0;
    v_usage_count integer := 0;
    v_period_end timestamptz;
    v_effective_count integer := 0;
    v_remaining integer := 0;
    v_non_test_used boolean := false;
    v_test_exhausted_at timestamptz;

    v_license_id uuid;
    v_license_status text;
    v_license_hwid text;
    v_license_mode text;
    v_license_expires_at timestamptz;
    v_license_reset_date timestamptz;
begin
    if v_hwid = '' then
        return jsonb_build_object('success', false, 'message', 'HWID가 비어 있습니다.');
    end if;

    if v_key = '' then
        v_key := 'test';
    end if;

    -- A) 공용 키(test/free) 경로
    select ak.access_key, ak.plan_code
      into v_access_key, v_plan_code
      from public.license_access_keys ak
     where lower(ak.access_key) = v_key
       and ak.status = 'active'
     limit 1;

    if v_access_key is not null then
        select status, quota_mode, quota_limit, quota_cycle, features
          into v_plan_status, v_plan_mode, v_plan_limit, v_plan_cycle, v_plan_features
          from public.license_plans
         where plan_code = v_plan_code
         limit 1;

        if v_plan_status is distinct from 'active' then
            return jsonb_build_object('success', false, 'message', '비활성화된 플랜입니다.');
        end if;

        if lower(coalesce(v_plan_mode, 'metered')) = 'unlimited' then
            return jsonb_build_object(
                'success', true,
                'message', format('%s 플랜 사전 검증 통과', v_plan_code),
                'plan_code', v_plan_code,
                'features', coalesce(v_plan_features, '{}'::jsonb),
                'remaining', -1
            );
        end if;

        v_hwid_hash := encode(digest(convert_to(v_hwid, 'UTF8'), 'sha256'), 'hex');

        if v_access_key = 'test' then
            select non_test_used, test_exhausted_at
              into v_non_test_used, v_test_exhausted_at
              from public.license_device_states
             where hwid_hash = v_hwid_hash
             limit 1;

            if coalesce(v_non_test_used, false) then
                return jsonb_build_object(
                    'success', false,
                    'message', 'test 플랜은 1회성입니다. 다른 플랜 사용 후에는 재사용할 수 없습니다.',
                    'plan_code', 'test',
                    'remaining', 0
                );
            end if;

            if v_test_exhausted_at is not null then
                return jsonb_build_object(
                    'success', false,
                    'message', 'test 플랜 1회 사용이 이미 종료되었습니다.',
                    'plan_code', 'test',
                    'remaining', 0
                );
            end if;
        end if;

        select usage_limit, usage_count, period_end
          into v_usage_limit, v_usage_count, v_period_end
          from public.free_license_usages
         where hwid_hash = v_hwid_hash
           and access_key = v_access_key
         limit 1;

        v_usage_limit := coalesce(v_usage_limit, coalesce(v_plan_limit, 0));
        if v_usage_limit <> coalesce(v_plan_limit, 0) then
            v_usage_limit := coalesce(v_plan_limit, 0);
        end if;

        v_effective_count := coalesce(v_usage_count, 0);
        if coalesce(v_plan_cycle, 'none') <> 'none'
           and (v_period_end is null or v_now >= v_period_end) then
            v_effective_count := 0;
        end if;

        v_remaining := greatest(v_usage_limit - v_effective_count, 0);
        if v_remaining <= 0 then
            return jsonb_build_object(
                'success', false,
                'message', format('%s 플랜 사용 횟수를 모두 사용했습니다. (잔여: 0/%s)', v_plan_code, v_usage_limit),
                'plan_code', v_plan_code,
                'features', coalesce(v_plan_features, '{}'::jsonb),
                'remaining', 0
            );
        end if;

        return jsonb_build_object(
            'success', true,
            'message', format('%s 플랜 사전 검증 통과', v_plan_code),
            'plan_code', v_plan_code,
            'features', coalesce(v_plan_features, '{}'::jsonb),
            'remaining', v_remaining
        );
    end if;

    -- B) 개별 라이선스(pro/ultra 등) 경로
    select id, status, hwid, coalesce(license_mode, ''), expires_at,
           coalesce(usage_limit, 0), coalesce(usage_count, 0), reset_date, coalesce(plan_code, 'pro')
      into v_license_id, v_license_status, v_license_hwid, v_license_mode, v_license_expires_at,
           v_usage_limit, v_usage_count, v_license_reset_date, v_plan_code
      from public.licenses
     where license_key = trim(p_license_key)
     limit 1;

    if v_license_id is null then
        return jsonb_build_object('success', false, 'message', '유효하지 않은 라이선스 키입니다.');
    end if;

    if coalesce(v_license_status, 'active') <> 'active' then
        return jsonb_build_object('success', false, 'message', '비활성화된 라이선스입니다.');
    end if;

    if v_license_expires_at is not null and v_now >= v_license_expires_at then
        return jsonb_build_object('success', false, 'message', '만료된 라이선스입니다.');
    end if;

    if v_license_hwid is not null and trim(v_license_hwid) <> '' and trim(v_license_hwid) <> v_hwid then
        return jsonb_build_object('success', false, 'message', '다른 기기에 바인딩된 라이선스입니다.');
    end if;

    select status, quota_mode, quota_limit, quota_cycle, features
      into v_plan_status, v_plan_mode, v_plan_limit, v_plan_cycle, v_plan_features
      from public.license_plans
     where plan_code = v_plan_code
     limit 1;

    if v_plan_status is distinct from 'active' then
        return jsonb_build_object('success', false, 'message', '비활성화된 플랜입니다.');
    end if;

    v_plan_mode := lower(coalesce(nullif(trim(v_license_mode), ''), v_plan_mode, 'metered'));
    if v_plan_mode = 'unlimited' then
        return jsonb_build_object(
            'success', true,
            'message', format('%s 플랜 사전 검증 통과', v_plan_code),
            'plan_code', v_plan_code,
            'features', coalesce(v_plan_features, '{}'::jsonb),
            'remaining', -1
        );
    end if;

    if v_usage_limit <= 0 then
        v_usage_limit := coalesce(v_plan_limit, 0);
    end if;

    if v_usage_limit <= 0 then
        return jsonb_build_object('success', false, 'message', '사용 가능 횟수가 0으로 설정된 라이선스입니다.', 'remaining', 0);
    end if;

    v_effective_count := v_usage_count;
    if coalesce(v_plan_cycle, 'none') <> 'none'
       and (v_license_reset_date is null or v_now >= v_license_reset_date) then
        v_effective_count := 0;
    end if;

    v_remaining := greatest(v_usage_limit - v_effective_count, 0);
    if v_remaining <= 0 then
        return jsonb_build_object(
            'success', false,
            'message', '라이선스 사용 횟수를 모두 사용했습니다.',
            'plan_code', v_plan_code,
            'features', coalesce(v_plan_features, '{}'::jsonb),
            'remaining', 0
        );
    end if;

    return jsonb_build_object(
        'success', true,
        'message', format('%s 플랜 사전 검증 통과', v_plan_code),
        'plan_code', v_plan_code,
        'features', coalesce(v_plan_features, '{}'::jsonb),
        'remaining', v_remaining
    );
end;
$$;

grant execute on function public.check_license_status(text, text) to anon, authenticated, service_role;
revoke all on function public.check_license_status(text, text) from public;

-- ------------------------------------------------------------
-- 7) 차감 RPC
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

    v_access_key text;
    v_plan_code text;
    v_plan_status text;
    v_plan_mode text;
    v_plan_limit integer;
    v_plan_cycle text;
    v_plan_features jsonb := '{}'::jsonb;
    v_period_start timestamptz;
    v_period_end timestamptz;

    v_counter_id uuid;
    v_counter_limit integer := 0;
    v_counter_count integer := 0;
    v_counter_period_end timestamptz;
    v_remaining integer := 0;
    v_non_test_used boolean := false;
    v_test_exhausted_at timestamptz;

    v_license_id uuid;
    v_license_status text;
    v_license_hwid text;
    v_license_mode text;
    v_license_expires_at timestamptz;
    v_license_reset_date timestamptz;
    v_usage_limit integer := 0;
    v_usage_count integer := 0;
begin
    if v_hwid = '' then
        return jsonb_build_object('success', false, 'message', 'HWID가 비어 있습니다.');
    end if;

    if v_key = '' then
        v_key := 'test';
    end if;

    -- A) 공용 키(test/free) 경로
    select ak.access_key, ak.plan_code
      into v_access_key, v_plan_code
      from public.license_access_keys ak
     where lower(ak.access_key) = v_key
       and ak.status = 'active'
     limit 1;

    if v_access_key is not null then
        select status, quota_mode, quota_limit, quota_cycle, features
          into v_plan_status, v_plan_mode, v_plan_limit, v_plan_cycle, v_plan_features
          from public.license_plans
         where plan_code = v_plan_code
         limit 1;

        if v_plan_status is distinct from 'active' then
            return jsonb_build_object('success', false, 'message', '비활성화된 플랜입니다.');
        end if;

        if lower(coalesce(v_plan_mode, 'metered')) = 'unlimited' then
            return jsonb_build_object(
                'success', true,
                'message', format('%s 플랜 승인', v_plan_code),
                'plan_code', v_plan_code,
                'features', coalesce(v_plan_features, '{}'::jsonb),
                'remaining', -1
            );
        end if;

        v_hwid_hash := encode(digest(convert_to(v_hwid, 'UTF8'), 'sha256'), 'hex');

        if v_access_key = 'test' then
            select non_test_used, test_exhausted_at
              into v_non_test_used, v_test_exhausted_at
              from public.license_device_states
             where hwid_hash = v_hwid_hash
             for update;

            if not found then
                insert into public.license_device_states (
                    hwid_hash,
                    test_started_at,
                    non_test_used,
                    last_seen_at,
                    updated_at,
                    note
                )
                values (
                    v_hwid_hash,
                    v_now,
                    false,
                    v_now,
                    v_now,
                    'test first activation'
                );
                v_non_test_used := false;
                v_test_exhausted_at := null;
            end if;

            if coalesce(v_non_test_used, false) then
                return jsonb_build_object(
                    'success', false,
                    'message', 'test 플랜은 1회성입니다. 다른 플랜 사용 후에는 재사용할 수 없습니다.',
                    'plan_code', 'test',
                    'remaining', 0
                );
            end if;

            if v_test_exhausted_at is not null then
                return jsonb_build_object(
                    'success', false,
                    'message', 'test 플랜 1회 사용이 이미 종료되었습니다.',
                    'plan_code', 'test',
                    'remaining', 0
                );
            end if;
        else
            insert into public.license_device_states (
                hwid_hash,
                non_test_used,
                last_seen_at,
                updated_at,
                note
            )
            values (
                v_hwid_hash,
                true,
                v_now,
                v_now,
                format('non-test key used: %s', v_access_key)
            )
            on conflict (hwid_hash) do update
            set non_test_used = true,
                last_seen_at = excluded.last_seen_at,
                updated_at = excluded.updated_at;
        end if;

        select period_start, period_end
          into v_period_start, v_period_end
          from public._license_calc_period_bounds(v_plan_cycle, v_now)
         limit 1;

        select id, usage_limit, usage_count, period_end
          into v_counter_id, v_counter_limit, v_counter_count, v_counter_period_end
          from public.free_license_usages
         where hwid_hash = v_hwid_hash
           and access_key = v_access_key
         for update;

        if v_counter_id is null then
            insert into public.free_license_usages (
                hwid_hash, access_key, usage_limit, usage_count, period_start, period_end, status
            )
            values (
                v_hwid_hash, v_access_key, coalesce(v_plan_limit, 0), 0, v_period_start, v_period_end, 'active'
            )
            returning id, usage_limit, usage_count, period_end
                 into v_counter_id, v_counter_limit, v_counter_count, v_counter_period_end;
        else
            if v_counter_limit <> coalesce(v_plan_limit, 0) then
                update public.free_license_usages
                   set usage_limit = coalesce(v_plan_limit, 0),
                       updated_at = v_now
                 where id = v_counter_id;
                v_counter_limit := coalesce(v_plan_limit, 0);
            end if;

            if coalesce(v_plan_cycle, 'none') <> 'none'
               and (v_counter_period_end is null or v_now >= v_counter_period_end) then
                update public.free_license_usages
                   set usage_count = 0,
                       period_start = v_period_start,
                       period_end = v_period_end,
                       updated_at = v_now
                 where id = v_counter_id;
                v_counter_count := 0;
            end if;
        end if;

        if v_counter_limit <= 0 then
            return jsonb_build_object('success', false, 'message', '사용 가능 횟수가 0으로 설정된 플랜입니다.', 'remaining', 0);
        end if;

        if v_counter_count >= v_counter_limit then
            return jsonb_build_object(
                'success', false,
                'message', format('%s 플랜 사용 횟수를 모두 사용했습니다. (잔여: 0/%s)', v_plan_code, v_counter_limit),
                'plan_code', v_plan_code,
                'features', coalesce(v_plan_features, '{}'::jsonb),
                'remaining', 0
            );
        end if;

        update public.free_license_usages
           set usage_count = usage_count + 1,
               updated_at = v_now
         where id = v_counter_id
         returning usage_limit - usage_count into v_remaining;

        if v_access_key = 'test' and v_remaining <= 0 then
            update public.license_device_states
               set test_exhausted_at = coalesce(test_exhausted_at, v_now),
                   last_seen_at = v_now,
                   updated_at = v_now
             where hwid_hash = v_hwid_hash;
        elsif v_access_key = 'test' then
            update public.license_device_states
               set last_seen_at = v_now,
                   updated_at = v_now
             where hwid_hash = v_hwid_hash;
        end if;

        return jsonb_build_object(
            'success', true,
            'message', format('%s 플랜 승인', v_plan_code),
            'plan_code', v_plan_code,
            'features', coalesce(v_plan_features, '{}'::jsonb),
            'remaining', greatest(v_remaining, 0)
        );
    end if;

    -- B) 개별 라이선스(pro/ultra 등) 경로
    select id, status, hwid, coalesce(license_mode, ''), expires_at,
           coalesce(usage_limit, 0), coalesce(usage_count, 0), reset_date, coalesce(plan_code, 'pro')
      into v_license_id, v_license_status, v_license_hwid, v_license_mode, v_license_expires_at,
           v_usage_limit, v_usage_count, v_license_reset_date, v_plan_code
      from public.licenses
     where license_key = trim(p_license_key)
     for update;

    if v_license_id is null then
        return jsonb_build_object('success', false, 'message', '유효하지 않은 라이선스 키입니다.');
    end if;

    if coalesce(v_license_status, 'active') <> 'active' then
        return jsonb_build_object('success', false, 'message', '비활성화된 라이선스입니다.');
    end if;

    if v_license_expires_at is not null and v_now >= v_license_expires_at then
        return jsonb_build_object('success', false, 'message', '만료된 라이선스입니다.');
    end if;

    if v_license_hwid is null or trim(v_license_hwid) = '' then
        update public.licenses
           set hwid = v_hwid
         where id = v_license_id;
        v_license_hwid := v_hwid;
    elsif trim(v_license_hwid) <> v_hwid then
        return jsonb_build_object('success', false, 'message', '다른 기기에 바인딩된 라이선스입니다.');
    end if;

    v_hwid_hash := encode(digest(convert_to(v_hwid, 'UTF8'), 'sha256'), 'hex');
    insert into public.license_device_states (
        hwid_hash,
        non_test_used,
        last_seen_at,
        updated_at,
        note
    )
    values (
        v_hwid_hash,
        true,
        v_now,
        v_now,
        format('paid key used: %s', trim(p_license_key))
    )
    on conflict (hwid_hash) do update
    set non_test_used = true,
        last_seen_at = excluded.last_seen_at,
        updated_at = excluded.updated_at;

    select status, quota_mode, quota_limit, quota_cycle, features
      into v_plan_status, v_plan_mode, v_plan_limit, v_plan_cycle, v_plan_features
      from public.license_plans
     where plan_code = v_plan_code
     limit 1;

    if v_plan_status is distinct from 'active' then
        return jsonb_build_object('success', false, 'message', '비활성화된 플랜입니다.');
    end if;

    v_plan_mode := lower(coalesce(nullif(trim(v_license_mode), ''), v_plan_mode, 'metered'));
    if v_plan_mode = 'unlimited' then
        return jsonb_build_object(
            'success', true,
            'message', format('%s 플랜 승인', v_plan_code),
            'plan_code', v_plan_code,
            'features', coalesce(v_plan_features, '{}'::jsonb),
            'remaining', -1
        );
    end if;

    if v_usage_limit <= 0 then
        v_usage_limit := coalesce(v_plan_limit, 0);
    end if;

    if coalesce(v_plan_cycle, 'none') <> 'none' then
        select period_start, period_end
          into v_period_start, v_period_end
          from public._license_calc_period_bounds(v_plan_cycle, v_now)
         limit 1;

        if v_license_reset_date is null or v_now >= v_license_reset_date then
            update public.licenses
               set usage_count = 0,
                   reset_date = v_period_end
             where id = v_license_id
             returning usage_count, reset_date into v_usage_count, v_license_reset_date;
        end if;
    end if;

    if v_usage_limit <= 0 then
        return jsonb_build_object('success', false, 'message', '사용 가능 횟수가 0으로 설정된 라이선스입니다.');
    end if;

    if v_usage_count >= v_usage_limit then
        return jsonb_build_object(
            'success', false,
            'message', '라이선스 사용 횟수를 모두 사용했습니다.',
            'plan_code', v_plan_code,
            'features', coalesce(v_plan_features, '{}'::jsonb),
            'remaining', 0
        );
    end if;

    update public.licenses
       set usage_count = usage_count + 1
     where id = v_license_id
     returning usage_limit - usage_count into v_remaining;

    return jsonb_build_object(
        'success', true,
        'message', format('%s 플랜 승인', v_plan_code),
        'plan_code', v_plan_code,
        'features', coalesce(v_plan_features, '{}'::jsonb),
        'remaining', greatest(v_remaining, 0)
    );
end;
$$;

grant execute on function public.check_and_use_license(text, text) to anon, authenticated, service_role;
revoke all on function public.check_and_use_license(text, text) from public;

commit;
