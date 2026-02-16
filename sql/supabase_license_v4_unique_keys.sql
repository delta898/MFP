-- ============================================================
-- BlogGenius License v4 (UNIQUE KEY ONLY)
-- 대상: Supabase SQL Editor
-- ============================================================
-- 목적:
-- 1) 공유 키(test/free) 경로 제거 (모든 플랜을 고유 license_key로 통일)
-- 2) check_license_status / check_and_use_license RPC를 v4 정책으로 교체
-- 3) test 1회성 정책은 license_device_states로 유지

begin;

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 0) 기본 테이블 보강
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

alter table public.licenses
    add column if not exists plan_code text,
    add column if not exists license_mode text,
    add column if not exists expires_at timestamptz;

update public.licenses
   set plan_code = case
        when lower(coalesce(tier, '')) in ('ultra', 'enterprise', 'business') then 'ultra'
        when lower(coalesce(tier, '')) in ('free') then 'free'
        when lower(coalesce(tier, '')) in ('test', 'tester') then 'test'
        else 'pro'
   end
 where plan_code is null
    or trim(plan_code) = '';

alter table public.licenses
    alter column plan_code set default 'pro';

update public.licenses
   set license_mode = case
        when lower(coalesce(plan_code, 'pro')) = 'ultra' then 'unlimited'
        else 'metered'
   end
 where license_mode is null
    or trim(license_mode) = '';

create index if not exists idx_licenses_plan_code
    on public.licenses (plan_code, status);

create index if not exists idx_licenses_email
    on public.licenses (email);

-- ------------------------------------------------------------
-- 1) 플랜 정책 업서트 (v4 기본)
-- ------------------------------------------------------------
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
            "cmd_pub": true,
            "enable_trends_date_override": true,
            "image_generation": true,
            "enable_related_posts_auto_link": true,
            "max_blog_posts_per_run": 999,
            "max_shopping_posts_per_run": 999
        }'::jsonb,
        '고유키 기반 테스트 플랜 (1회성)'
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
            "cmd_shopping": true,
            "cmd_trends": true,
            "cmd_pub": true,
            "enable_trends_date_override": false,
            "image_generation": true,
            "enable_related_posts_auto_link": true,
            "max_blog_posts_per_run": 3,
            "max_shopping_posts_per_run": 3
        }'::jsonb,
        '고유키 기반 무료 플랜'
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
            "cmd_pub": true,
            "enable_trends_date_override": true,
            "image_generation": true,
            "enable_related_posts_auto_link": true,
            "max_blog_posts_per_run": 9999,
            "max_shopping_posts_per_run": 9999
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
            "cmd_pub": true,
            "enable_trends_date_override": true,
            "image_generation": true,
            "enable_related_posts_auto_link": true,
            "max_blog_posts_per_run": 999999,
            "max_shopping_posts_per_run": 999999
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
-- 2) 공용키 테이블 비활성화 (호환성 목적, 실제 미사용)
-- ------------------------------------------------------------
do $$
begin
    if exists (
        select 1 from information_schema.tables
         where table_schema = 'public' and table_name = 'license_access_keys'
    ) then
        update public.license_access_keys
           set status = 'inactive',
               is_default = false,
               updated_at = timezone('utc', now());
    end if;
end $$;

-- ------------------------------------------------------------
-- 3) 리셋 주기 helper
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
-- 4) test 키 자동 발급 RPC (최초 실행용)
-- ------------------------------------------------------------
drop function if exists public.issue_test_license(text);

create or replace function public.issue_test_license(
    p_hwid text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_now timestamptz := timezone('utc', now());
    v_hwid text := trim(coalesce(p_hwid, ''));
    v_hwid_hash text;
    v_non_test_used boolean := false;
    v_test_exhausted_at timestamptz;
    v_test_limit integer := 20;
    v_license_key text;
    v_try integer := 0;
begin
    if v_hwid = '' then
        return jsonb_build_object('success', false, 'message', 'HWID가 비어 있습니다.');
    end if;

    v_hwid_hash := encode(digest(convert_to(v_hwid, 'UTF8'), 'sha256'), 'hex');

    select quota_limit
      into v_test_limit
      from public.license_plans
     where plan_code = 'test'
       and status = 'active'
     limit 1;
    v_test_limit := coalesce(v_test_limit, 20);

    select non_test_used, test_exhausted_at
      into v_non_test_used, v_test_exhausted_at
      from public.license_device_states
     where hwid_hash = v_hwid_hash
     for update;

    if found then
        if coalesce(v_non_test_used, false) then
            return jsonb_build_object(
                'success', false,
                'message', 'test 플랜은 1회성입니다. 다른 플랜 사용 후에는 재사용할 수 없습니다.'
            );
        end if;
        if v_test_exhausted_at is not null then
            return jsonb_build_object(
                'success', false,
                'message', 'test 플랜 1회 사용이 이미 종료되었습니다.'
            );
        end if;
    end if;

    -- 동일 HWID에 이미 발급된 active test 키가 있으면 재사용
    select l.license_key
      into v_license_key
      from public.licenses l
     where l.hwid = v_hwid
       and lower(coalesce(l.plan_code, '')) = 'test'
       and coalesce(l.status, 'active') = 'active'
       and (l.expires_at is null or l.expires_at > v_now)
     order by l.created_at desc nulls last
     limit 1;

    if v_license_key is null then
        -- 충돌 가능성이 매우 낮지만 안전하게 재시도
        while v_try < 5 and v_license_key is null loop
            v_try := v_try + 1;
            v_license_key :=
                'BG-' ||
                substr(upper(encode(gen_random_bytes(16), 'hex')), 1, 8) || '-' ||
                substr(upper(encode(gen_random_bytes(16), 'hex')), 1, 8) || '-' ||
                substr(upper(encode(gen_random_bytes(16), 'hex')), 1, 8) || '-' ||
                substr(upper(encode(gen_random_bytes(16), 'hex')), 1, 8);

            insert into public.licenses (
                license_key,
                plan_code,
                tier,
                status,
                hwid,
                usage_limit,
                usage_count,
                reset_date,
                license_mode,
                expires_at,
                note
            )
            values (
                v_license_key,
                'test',
                'test',
                'active',
                v_hwid,
                v_test_limit,
                0,
                null,
                'metered',
                null,
                'auto-issued test key'
            )
            on conflict (license_key) do nothing;

            if not found then
                v_license_key := null;
            end if;
        end loop;
    end if;

    if v_license_key is null then
        return jsonb_build_object('success', false, 'message', 'test 라이선스 키 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    end if;

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
        'test key auto issued'
    )
    on conflict (hwid_hash) do update
    set test_started_at = coalesce(public.license_device_states.test_started_at, excluded.test_started_at),
        last_seen_at = excluded.last_seen_at,
        updated_at = excluded.updated_at;

    return jsonb_build_object(
        'success', true,
        'message', 'test 라이선스 키 자동 발급 완료',
        'license_key', v_license_key,
        'plan_code', 'test'
    );
end;
$$;

grant execute on function public.issue_test_license(text) to anon, authenticated, service_role;
revoke all on function public.issue_test_license(text) from public;

-- ------------------------------------------------------------
-- 5) 사전 검증 RPC (무차감, 고유키 전용)
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
    v_key text := trim(coalesce(p_license_key, ''));
    v_hwid text := trim(coalesce(p_hwid, ''));
    v_hwid_hash text;

    v_license_id uuid;
    v_license_status text;
    v_license_hwid text;
    v_license_mode text;
    v_license_expires_at timestamptz;
    v_license_reset_date timestamptz;
    v_usage_limit integer := 0;
    v_usage_count integer := 0;
    v_plan_code text := 'pro';

    v_plan_display_name text;
    v_plan_status text;
    v_plan_mode text;
    v_plan_limit integer;
    v_plan_cycle text;
    v_plan_features jsonb := '{}'::jsonb;
    v_effective_count integer := 0;
    v_remaining integer := 0;
    v_period_start timestamptz;
    v_period_end timestamptz;

    v_non_test_used boolean := false;
    v_test_exhausted_at timestamptz;
    v_auto_downgraded_to_free boolean := false;
    v_free_plan_display_name text;
    v_free_plan_status text;
    v_free_plan_mode text;
    v_free_plan_limit integer;
    v_free_plan_cycle text;
    v_free_plan_features jsonb := '{}'::jsonb;
begin
    if v_hwid = '' then
        return jsonb_build_object('success', false, 'message', 'HWID가 비어 있습니다.');
    end if;

    if v_key = '' then
        return jsonb_build_object('success', false, 'message', 'LICENSE_KEY가 비어 있습니다.');
    end if;

    select id, status, hwid, coalesce(license_mode, ''), expires_at,
           coalesce(usage_limit, 0), coalesce(usage_count, 0), reset_date, coalesce(plan_code, 'pro')
      into v_license_id, v_license_status, v_license_hwid, v_license_mode, v_license_expires_at,
           v_usage_limit, v_usage_count, v_license_reset_date, v_plan_code
      from public.licenses
     where license_key = v_key
     limit 1;

    if v_license_id is null then
        return jsonb_build_object('success', false, 'message', '유효하지 않은 라이선스 키입니다.');
    end if;

    if coalesce(v_license_status, 'active') <> 'active' then
        return jsonb_build_object(
            'success', false,
            'message', '비활성화된 라이선스입니다.',
            'plan_code', v_plan_code
        );
    end if;

    if v_license_expires_at is not null and v_now >= v_license_expires_at then
        return jsonb_build_object(
            'success', false,
            'message', '만료된 라이선스입니다.',
            'plan_code', v_plan_code
        );
    end if;

    if v_license_hwid is not null and trim(v_license_hwid) <> '' and trim(v_license_hwid) <> v_hwid then
        return jsonb_build_object(
            'success', false,
            'message', '다른 기기에 바인딩된 라이선스입니다.',
            'plan_code', v_plan_code
        );
    end if;

    select display_name, status, quota_mode, quota_limit, quota_cycle, features
      into v_plan_display_name, v_plan_status, v_plan_mode, v_plan_limit, v_plan_cycle, v_plan_features
      from public.license_plans
     where plan_code = v_plan_code
     limit 1;

    if v_plan_status is distinct from 'active' then
        return jsonb_build_object(
            'success', false,
            'message', '비활성화된 플랜입니다.',
            'plan_code', v_plan_code,
            'plan_display_name', coalesce(v_plan_display_name, v_plan_code)
        );
    end if;

    v_plan_mode := lower(coalesce(nullif(trim(v_license_mode), ''), v_plan_mode, 'metered'));

    if lower(v_plan_code) = 'test' then
        v_hwid_hash := encode(digest(convert_to(v_hwid, 'UTF8'), 'sha256'), 'hex');
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
                'plan_display_name', coalesce(v_plan_display_name, 'test'),
                'remaining', 0
            );
        end if;

        if v_test_exhausted_at is not null then
            select display_name, status, quota_mode, quota_limit, quota_cycle, features
              into v_free_plan_display_name, v_free_plan_status, v_free_plan_mode, v_free_plan_limit, v_free_plan_cycle, v_free_plan_features
              from public.license_plans
             where plan_code = 'free'
             limit 1;

            if v_free_plan_status is distinct from 'active' then
                return jsonb_build_object(
                    'success', false,
                    'message', 'test 플랜 사용이 종료되었고 free 플랜 전환에 실패했습니다. 관리자에게 문의해 주세요.',
                    'plan_code', 'test',
                    'plan_display_name', coalesce(v_plan_display_name, 'test'),
                    'remaining', 0
                );
            end if;

            if coalesce(v_free_plan_cycle, 'none') <> 'none' then
                select period_start, period_end
                  into v_period_start, v_period_end
                  from public._license_calc_period_bounds(v_free_plan_cycle, v_now)
                 limit 1;
            else
                v_period_start := null;
                v_period_end := null;
            end if;

            update public.licenses
               set plan_code = 'free',
                   tier = 'free',
                   status = 'active',
                   license_mode = lower(coalesce(v_free_plan_mode, 'metered')),
                   usage_limit = coalesce(v_free_plan_limit, 15),
                   usage_count = 0,
                   reset_date = v_period_end,
                   expires_at = null,
                   updated_at = v_now,
                   note = case
                       when coalesce(trim(note), '') = '' then 'auto-downgraded test->free'
                       else trim(note) || ' | auto-downgraded test->free'
                   end
             where id = v_license_id;

            insert into public.license_device_states (
                hwid_hash, non_test_used, last_seen_at, updated_at, note
            ) values (
                v_hwid_hash, true, v_now, v_now, 'auto-downgraded test->free'
            )
            on conflict (hwid_hash) do update
            set non_test_used = true,
                last_seen_at = excluded.last_seen_at,
                updated_at = excluded.updated_at;

            v_plan_code := 'free';
            v_plan_display_name := coalesce(v_free_plan_display_name, 'free');
            v_plan_status := 'active';
            v_plan_mode := lower(coalesce(v_free_plan_mode, 'metered'));
            v_plan_limit := coalesce(v_free_plan_limit, 15);
            v_plan_cycle := coalesce(v_free_plan_cycle, 'monthly');
            v_plan_features := coalesce(v_free_plan_features, '{}'::jsonb);
            v_usage_limit := v_plan_limit;
            v_usage_count := 0;
            v_license_reset_date := v_period_end;
            v_auto_downgraded_to_free := true;
        end if;
    end if;

    if v_plan_mode = 'unlimited' then
        return jsonb_build_object(
            'success', true,
            'message', format('%s 플랜 사전 검증 통과', v_plan_code),
            'plan_code', v_plan_code,
            'plan_display_name', coalesce(v_plan_display_name, v_plan_code),
            'features', coalesce(v_plan_features, '{}'::jsonb),
            'remaining', -1
        );
    end if;

    if v_usage_limit <= 0 then
        v_usage_limit := coalesce(v_plan_limit, 0);
    end if;
    if v_usage_limit <= 0 then
        return jsonb_build_object(
            'success', false,
            'message', '사용 가능 횟수가 0으로 설정된 라이선스입니다.',
            'plan_code', v_plan_code,
            'plan_display_name', coalesce(v_plan_display_name, v_plan_code),
            'remaining', 0
        );
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
            'plan_display_name', coalesce(v_plan_display_name, v_plan_code),
            'features', coalesce(v_plan_features, '{}'::jsonb),
            'auto_downgraded_to_free', v_auto_downgraded_to_free,
            'remaining', 0
        );
    end if;

    return jsonb_build_object(
        'success', true,
        'message', format('%s 플랜 사전 검증 통과', v_plan_code),
        'plan_code', v_plan_code,
        'plan_display_name', coalesce(v_plan_display_name, v_plan_code),
        'features', coalesce(v_plan_features, '{}'::jsonb),
        'auto_downgraded_to_free', v_auto_downgraded_to_free,
        'remaining', v_remaining
    );
end;
$$;

grant execute on function public.check_license_status(text, text) to anon, authenticated, service_role;
revoke all on function public.check_license_status(text, text) from public;

-- ------------------------------------------------------------
-- 6) 차감 RPC (고유키 전용)
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
    v_key text := trim(coalesce(p_license_key, ''));
    v_hwid text := trim(coalesce(p_hwid, ''));
    v_hwid_hash text;

    v_license_id uuid;
    v_license_status text;
    v_license_hwid text;
    v_license_mode text;
    v_license_expires_at timestamptz;
    v_license_reset_date timestamptz;
    v_usage_limit integer := 0;
    v_usage_count integer := 0;
    v_plan_code text := 'pro';

    v_plan_display_name text;
    v_plan_status text;
    v_plan_mode text;
    v_plan_limit integer;
    v_plan_cycle text;
    v_plan_features jsonb := '{}'::jsonb;
    v_period_start timestamptz;
    v_period_end timestamptz;
    v_remaining integer := 0;

    v_non_test_used boolean := false;
    v_test_exhausted_at timestamptz;
    v_auto_downgraded_to_free boolean := false;
    v_free_plan_display_name text;
    v_free_plan_status text;
    v_free_plan_mode text;
    v_free_plan_limit integer;
    v_free_plan_cycle text;
    v_free_plan_features jsonb := '{}'::jsonb;
begin
    if v_hwid = '' then
        return jsonb_build_object('success', false, 'message', 'HWID가 비어 있습니다.');
    end if;

    if v_key = '' then
        return jsonb_build_object('success', false, 'message', 'LICENSE_KEY가 비어 있습니다.');
    end if;

    select id, status, hwid, coalesce(license_mode, ''), expires_at,
           coalesce(usage_limit, 0), coalesce(usage_count, 0), reset_date, coalesce(plan_code, 'pro')
      into v_license_id, v_license_status, v_license_hwid, v_license_mode, v_license_expires_at,
           v_usage_limit, v_usage_count, v_license_reset_date, v_plan_code
      from public.licenses
     where license_key = v_key
     for update;

    if v_license_id is null then
        return jsonb_build_object('success', false, 'message', '유효하지 않은 라이선스 키입니다.');
    end if;

    if coalesce(v_license_status, 'active') <> 'active' then
        return jsonb_build_object(
            'success', false,
            'message', '비활성화된 라이선스입니다.',
            'plan_code', v_plan_code
        );
    end if;

    if v_license_expires_at is not null and v_now >= v_license_expires_at then
        return jsonb_build_object(
            'success', false,
            'message', '만료된 라이선스입니다.',
            'plan_code', v_plan_code
        );
    end if;

    if v_license_hwid is null or trim(v_license_hwid) = '' then
        update public.licenses
           set hwid = v_hwid
         where id = v_license_id;
    elsif trim(v_license_hwid) <> v_hwid then
        return jsonb_build_object(
            'success', false,
            'message', '다른 기기에 바인딩된 라이선스입니다.',
            'plan_code', v_plan_code
        );
    end if;

    select display_name, status, quota_mode, quota_limit, quota_cycle, features
      into v_plan_display_name, v_plan_status, v_plan_mode, v_plan_limit, v_plan_cycle, v_plan_features
      from public.license_plans
     where plan_code = v_plan_code
     limit 1;

    if v_plan_status is distinct from 'active' then
        return jsonb_build_object(
            'success', false,
            'message', '비활성화된 플랜입니다.',
            'plan_code', v_plan_code,
            'plan_display_name', coalesce(v_plan_display_name, v_plan_code)
        );
    end if;

    v_plan_mode := lower(coalesce(nullif(trim(v_license_mode), ''), v_plan_mode, 'metered'));
    v_hwid_hash := encode(digest(convert_to(v_hwid, 'UTF8'), 'sha256'), 'hex');

    if lower(v_plan_code) = 'test' then
        select non_test_used, test_exhausted_at
          into v_non_test_used, v_test_exhausted_at
          from public.license_device_states
         where hwid_hash = v_hwid_hash
         for update;

        if not found then
            insert into public.license_device_states (
                hwid_hash, test_started_at, non_test_used, last_seen_at, updated_at, note
            ) values (
                v_hwid_hash, v_now, false, v_now, v_now, 'test first activation'
            );
            v_non_test_used := false;
            v_test_exhausted_at := null;
        end if;

        if coalesce(v_non_test_used, false) then
            return jsonb_build_object(
                'success', false,
                'message', 'test 플랜은 1회성입니다. 다른 플랜 사용 후에는 재사용할 수 없습니다.',
                'plan_code', 'test',
                'plan_display_name', coalesce(v_plan_display_name, 'test'),
                'remaining', 0
            );
        end if;

        if v_test_exhausted_at is not null then
            select display_name, status, quota_mode, quota_limit, quota_cycle, features
              into v_free_plan_display_name, v_free_plan_status, v_free_plan_mode, v_free_plan_limit, v_free_plan_cycle, v_free_plan_features
              from public.license_plans
             where plan_code = 'free'
             limit 1;

            if v_free_plan_status is distinct from 'active' then
                return jsonb_build_object(
                    'success', false,
                    'message', 'test 플랜 사용이 종료되었고 free 플랜 전환에 실패했습니다. 관리자에게 문의해 주세요.',
                    'plan_code', 'test',
                    'plan_display_name', coalesce(v_plan_display_name, 'test'),
                    'remaining', 0
                );
            end if;

            if coalesce(v_free_plan_cycle, 'none') <> 'none' then
                select period_start, period_end
                  into v_period_start, v_period_end
                  from public._license_calc_period_bounds(v_free_plan_cycle, v_now)
                 limit 1;
            else
                v_period_start := null;
                v_period_end := null;
            end if;

            update public.licenses
               set plan_code = 'free',
                   tier = 'free',
                   status = 'active',
                   license_mode = lower(coalesce(v_free_plan_mode, 'metered')),
                   usage_limit = coalesce(v_free_plan_limit, 15),
                   usage_count = 0,
                   reset_date = v_period_end,
                   expires_at = null,
                   updated_at = v_now,
                   note = case
                       when coalesce(trim(note), '') = '' then 'auto-downgraded test->free'
                       else trim(note) || ' | auto-downgraded test->free'
                   end
             where id = v_license_id
             returning usage_limit, usage_count, reset_date
                  into v_usage_limit, v_usage_count, v_license_reset_date;

            v_plan_code := 'free';
            v_plan_display_name := coalesce(v_free_plan_display_name, 'free');
            v_plan_status := 'active';
            v_plan_mode := lower(coalesce(v_free_plan_mode, 'metered'));
            v_plan_limit := coalesce(v_free_plan_limit, 15);
            v_plan_cycle := coalesce(v_free_plan_cycle, 'monthly');
            v_plan_features := coalesce(v_free_plan_features, '{}'::jsonb);
            v_auto_downgraded_to_free := true;
        end if;
    end if;

    if lower(v_plan_code) <> 'test' then
        insert into public.license_device_states (
            hwid_hash, non_test_used, last_seen_at, updated_at, note
        ) values (
            v_hwid_hash, true, v_now, v_now, format('non-test key used: %s', v_key)
        )
        on conflict (hwid_hash) do update
        set non_test_used = true,
            last_seen_at = excluded.last_seen_at,
            updated_at = excluded.updated_at;
    end if;

    if v_plan_mode = 'unlimited' then
        return jsonb_build_object(
            'success', true,
            'message', format('%s 플랜 승인', v_plan_code),
            'plan_code', v_plan_code,
            'plan_display_name', coalesce(v_plan_display_name, v_plan_code),
            'features', coalesce(v_plan_features, '{}'::jsonb),
            'auto_downgraded_to_free', v_auto_downgraded_to_free,
            'remaining', -1
        );
    end if;

    if v_usage_limit <= 0 then
        v_usage_limit := coalesce(v_plan_limit, 0);
    end if;
    if v_usage_limit <= 0 then
        return jsonb_build_object(
            'success', false,
            'message', '사용 가능 횟수가 0으로 설정된 라이선스입니다.',
            'plan_code', v_plan_code,
            'plan_display_name', coalesce(v_plan_display_name, v_plan_code),
            'remaining', 0
        );
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

    if v_usage_count >= v_usage_limit then
        return jsonb_build_object(
            'success', false,
            'message', '라이선스 사용 횟수를 모두 사용했습니다.',
            'plan_code', v_plan_code,
            'plan_display_name', coalesce(v_plan_display_name, v_plan_code),
            'features', coalesce(v_plan_features, '{}'::jsonb),
            'auto_downgraded_to_free', v_auto_downgraded_to_free,
            'remaining', 0
        );
    end if;

    update public.licenses
       set usage_count = usage_count + 1
     where id = v_license_id
     returning usage_limit - usage_count into v_remaining;

    if lower(v_plan_code) = 'test' and v_remaining <= 0 then
        update public.license_device_states
           set test_exhausted_at = coalesce(test_exhausted_at, v_now),
               last_seen_at = v_now,
               updated_at = v_now
         where hwid_hash = v_hwid_hash;
    elsif lower(v_plan_code) = 'test' then
        update public.license_device_states
           set last_seen_at = v_now,
               updated_at = v_now
         where hwid_hash = v_hwid_hash;
    end if;

    return jsonb_build_object(
        'success', true,
        'message', format('%s 플랜 승인', v_plan_code),
        'plan_code', v_plan_code,
        'plan_display_name', coalesce(v_plan_display_name, v_plan_code),
        'features', coalesce(v_plan_features, '{}'::jsonb),
        'auto_downgraded_to_free', v_auto_downgraded_to_free,
        'remaining', greatest(v_remaining, 0)
    );
end;
$$;

grant execute on function public.check_and_use_license(text, text) to anon, authenticated, service_role;
revoke all on function public.check_and_use_license(text, text) from public;

commit;
