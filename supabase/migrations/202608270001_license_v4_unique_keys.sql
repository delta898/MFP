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
    add column if not exists expires_at timestamptz,
    add column if not exists updated_at timestamptz;

update public.licenses
   set updated_at = timezone('utc', now())
 where updated_at is null;

alter table public.licenses
    alter column updated_at set default timezone('utc', now());

alter table public.license_plans
    add column if not exists updated_at timestamptz;

update public.license_plans
   set updated_at = timezone('utc', now())
 where updated_at is null;

alter table public.license_plans
    alter column updated_at set default timezone('utc', now());

alter table public.license_device_states
    add column if not exists last_seen_at timestamptz,
    add column if not exists updated_at timestamptz;

update public.license_device_states
   set last_seen_at = coalesce(last_seen_at, timezone('utc', now())),
       updated_at = coalesce(updated_at, timezone('utc', now()));

alter table public.license_device_states
    alter column last_seen_at set default timezone('utc', now()),
    alter column updated_at set default timezone('utc', now());

do $$
begin
    if exists (
        select 1
          from information_schema.columns
         where table_schema = 'public'
           and table_name = 'licenses'
           and column_name = 'tier'
    ) then
        execute $sql$
            update public.licenses
               set plan_code = case
                    when lower(coalesce(tier, '')) in ('ultra', 'enterprise', 'business') then 'ultra'
                    when lower(coalesce(tier, '')) in ('free') then 'free'
                    when lower(coalesce(tier, '')) in ('test', 'tester') then 'test'
                    else 'pro'
               end
             where plan_code is null
                or trim(plan_code) = ''
        $sql$;
    else
        update public.licenses
           set plan_code = 'pro'
         where plan_code is null
            or trim(plan_code) = '';
    end if;
end $$;

alter table public.licenses
    alter column plan_code set default 'pro';

update public.licenses
   set license_mode = case
        when lower(coalesce(plan_code, 'pro')) = 'ultra' then 'unlimited'
        else 'metered'
   end
 where license_mode is null
    or trim(license_mode) = '';

alter table public.licenses
    drop column if exists tier;

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
            "enable_related_posts_auto_link": true,
            "enable_sns_distribution": true
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
            "cmd_shopping": false,
            "cmd_trends": false,
            "enable_related_posts_auto_link": false,
            "enable_sns_distribution": false
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
            "enable_related_posts_auto_link": true,
            "enable_sns_distribution": true
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
            "enable_related_posts_auto_link": true,
            "enable_sns_distribution": true
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
-- 4-1) 라이선스 등록(이메일 코드 인증) 테이블/RPC
-- ------------------------------------------------------------
create table if not exists public.license_registration_codes (
    id bigserial primary key,
    email text not null,
    code_hash text not null,
    expires_at timestamptz not null,
    consumed_at timestamptz,
    attempt_count integer not null default 0,
    send_status text not null default 'created',
    send_attempted_at timestamptz,
    sent_at timestamptz,
    send_error text,
    send_provider_status text,
    updated_at timestamptz not null default timezone('utc', now()),
    created_at timestamptz not null default timezone('utc', now())
);

alter table public.license_registration_codes
    add column if not exists send_status text not null default 'created',
    add column if not exists send_attempted_at timestamptz,
    add column if not exists sent_at timestamptz,
    add column if not exists send_error text,
    add column if not exists send_provider_status text,
    add column if not exists updated_at timestamptz not null default timezone('utc', now());

do $$
begin
    if not exists (
        select 1
          from pg_constraint
         where conname = 'license_registration_codes_send_status_check'
           and conrelid = 'public.license_registration_codes'::regclass
    ) then
        alter table public.license_registration_codes
            add constraint license_registration_codes_send_status_check
            check (send_status in ('created', 'sent', 'failed'));
    end if;
end $$;

create index if not exists idx_license_registration_codes_email_created
    on public.license_registration_codes (email, created_at desc);

create index if not exists idx_license_registration_codes_expires
    on public.license_registration_codes (expires_at);

create index if not exists idx_license_registration_codes_send_status
    on public.license_registration_codes (send_status, created_at desc);

alter table public.license_registration_codes enable row level security;
revoke all on table public.license_registration_codes from anon, authenticated;
grant all on table public.license_registration_codes to service_role;

drop function if exists public.request_license_registration(text);

create or replace function public.request_license_registration(
    p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_now timestamptz := timezone('utc', now());
    v_email text := lower(trim(coalesce(p_email, '')));
    v_code text;
    v_code_hash text;
    v_ttl_raw text;
    v_ttl_seconds integer := 300;
    v_expires_at timestamptz;
begin
    if v_email = '' then
        return jsonb_build_object('success', false, 'message', '이메일이 비어 있습니다.');
    end if;

    if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        return jsonb_build_object('success', false, 'message', '유효한 이메일 주소를 입력해 주세요.');
    end if;

    -- 등록 코드 유효시간(초): app_runtime_configs 우선, 미설정 시 300초 기본값
    if to_regclass('public.app_runtime_configs') is not null then
        select trim(coalesce(config_value, ''))
          into v_ttl_raw
          from public.app_runtime_configs
         where config_key = 'license_registration_code_ttl_seconds'
           and is_active = true
         limit 1;

        if coalesce(v_ttl_raw, '') ~ '^[0-9]{1,5}$' then
            v_ttl_seconds := greatest(60, least(1800, v_ttl_raw::integer));
        end if;
    end if;
    v_expires_at := v_now + make_interval(secs => v_ttl_seconds);

    -- 최근 미사용 코드 무효화
    update public.license_registration_codes
       set consumed_at = v_now,
           updated_at = v_now
     where email = v_email
       and consumed_at is null;

    v_code := lpad((floor(random() * 1000000)::int)::text, 6, '0');
    v_code_hash := encode(digest(convert_to(v_code, 'UTF8'), 'sha256'), 'hex');

    insert into public.license_registration_codes (
        email, code_hash, expires_at, consumed_at, attempt_count,
        send_status, updated_at, created_at
    ) values (
        v_email, v_code_hash, v_expires_at, null, 0,
        'created', v_now, v_now
    );

    -- 인증 코드는 앱에서 Edge Function(send-license-code) 호출 시 메일 본문으로 사용합니다.
    return jsonb_build_object(
        'success', true,
        'message', '인증 코드가 전송되었습니다.',
        'ttl_seconds', v_ttl_seconds,
        'expires_at', v_expires_at,
        'verification_code', v_code
    );
end;
$$;

grant execute on function public.request_license_registration(text) to anon, authenticated, service_role;
revoke all on function public.request_license_registration(text) from public;

drop function if exists public.request_license_recovery(text);

create or replace function public.request_license_recovery(
    p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_now timestamptz := timezone('utc', now());
    v_email text := lower(trim(coalesce(p_email, '')));
    v_code text;
    v_code_hash text;
    v_ttl_raw text;
    v_ttl_seconds integer := 300;
    v_expires_at timestamptz;
    v_exists boolean := false;
begin
    if v_email = '' then
        return jsonb_build_object('success', false, 'message', '이메일이 비어 있습니다.');
    end if;

    if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        return jsonb_build_object('success', false, 'message', '유효한 이메일 주소를 입력해 주세요.');
    end if;

    select exists(
        select 1
          from public.licenses l
         where lower(coalesce(l.email, '')) = v_email
           and coalesce(l.status, 'active') = 'active'
           and (l.expires_at is null or l.expires_at > v_now)
    ) into v_exists;

    if not v_exists then
        return jsonb_build_object(
            'success', false,
            'message', '등록된 이메일이 없습니다. 먼저 기존 기기에서 license register로 이메일을 연결해 주세요.'
        );
    end if;

    -- 등록 코드 유효시간(초): app_runtime_configs 우선, 미설정 시 300초 기본값
    if to_regclass('public.app_runtime_configs') is not null then
        select trim(coalesce(config_value, ''))
          into v_ttl_raw
          from public.app_runtime_configs
         where config_key = 'license_registration_code_ttl_seconds'
           and is_active = true
         limit 1;

        if coalesce(v_ttl_raw, '') ~ '^[0-9]{1,5}$' then
            v_ttl_seconds := greatest(60, least(1800, v_ttl_raw::integer));
        end if;
    end if;
    v_expires_at := v_now + make_interval(secs => v_ttl_seconds);

    -- 최근 미사용 코드 무효화
    update public.license_registration_codes
       set consumed_at = v_now,
           updated_at = v_now
     where email = v_email
       and consumed_at is null;

    v_code := lpad((floor(random() * 1000000)::int)::text, 6, '0');
    v_code_hash := encode(digest(convert_to(v_code, 'UTF8'), 'sha256'), 'hex');

    insert into public.license_registration_codes (
        email, code_hash, expires_at, consumed_at, attempt_count,
        send_status, updated_at, created_at
    ) values (
        v_email, v_code_hash, v_expires_at, null, 0,
        'created', v_now, v_now
    );

    return jsonb_build_object(
        'success', true,
        'message', '인증 코드가 전송되었습니다.',
        'ttl_seconds', v_ttl_seconds,
        'expires_at', v_expires_at,
        'verification_code', v_code
    );
end;
$$;

grant execute on function public.request_license_recovery(text) to anon, authenticated, service_role;
revoke all on function public.request_license_recovery(text) from public;

drop function if exists public.mark_license_registration_code_send_status(text, text, text, text, text);

create or replace function public.mark_license_registration_code_send_status(
    p_email text,
    p_code text,
    p_send_status text,
    p_error text default null,
    p_provider_status text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_now timestamptz := timezone('utc', now());
    v_email text := lower(trim(coalesce(p_email, '')));
    v_code text := trim(coalesce(p_code, ''));
    v_status text := lower(trim(coalesce(p_send_status, '')));
    v_code_hash text;
    v_row_id bigint;
begin
    if v_email = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        return jsonb_build_object('success', false, 'message', '유효한 이메일 주소를 입력해 주세요.');
    end if;

    if v_code !~ '^[0-9]{6}$' then
        return jsonb_build_object('success', false, 'message', '유효한 인증 코드가 아닙니다.');
    end if;

    if v_status not in ('sent', 'failed') then
        return jsonb_build_object('success', false, 'message', '유효한 발송 상태가 아닙니다.');
    end if;

    v_code_hash := encode(digest(convert_to(v_code, 'UTF8'), 'sha256'), 'hex');

    select id
      into v_row_id
      from public.license_registration_codes
     where email = v_email
       and code_hash = v_code_hash
     order by created_at desc
     limit 1
     for update;

    if v_row_id is null then
        return jsonb_build_object('success', false, 'message', '발송 상태를 기록할 인증 코드가 없습니다.');
    end if;

    update public.license_registration_codes
       set send_status = v_status,
           send_attempted_at = v_now,
           sent_at = case when v_status = 'sent' then v_now else sent_at end,
           send_error = case
               when v_status = 'failed' then nullif(left(trim(coalesce(p_error, '')), 1000), '')
               else null
           end,
           send_provider_status = nullif(left(trim(coalesce(p_provider_status, '')), 120), ''),
           updated_at = v_now
     where id = v_row_id;

    return jsonb_build_object(
        'success', true,
        'id', v_row_id,
        'send_status', v_status
    );
end;
$$;

grant execute on function public.mark_license_registration_code_send_status(text, text, text, text, text) to anon, authenticated, service_role;
revoke all on function public.mark_license_registration_code_send_status(text, text, text, text, text) from public;

drop function if exists public.verify_license_registration(text, text, text);
drop function if exists public.verify_license_registration(text, text, text, text);

create or replace function public.verify_license_registration(
    p_email text,
    p_code text,
    p_hwid text,
    p_license_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_now timestamptz := timezone('utc', now());
    v_email text := lower(trim(coalesce(p_email, '')));
    v_code text := trim(coalesce(p_code, ''));
    v_hwid text := trim(coalesce(p_hwid, ''));
    v_key text := trim(coalesce(p_license_key, ''));
    v_code_hash text;
    v_row_id bigint;
    v_row_hash text;
    v_hwid_hash text;

    v_license_id uuid;
    v_license_status text;
    v_license_hwid text;
    v_license_key text;
    v_plan_code text := 'test';
    v_usage_limit integer := 0;
    v_usage_count integer := 0;
    v_reset_date timestamptz;

    v_plan_display_name text;
    v_plan_mode text;
    v_plan_limit integer;
    v_plan_cycle text;
    v_plan_features jsonb := '{}'::jsonb;
    v_effective_count integer := 0;
    v_effective_limit integer := 0;
    v_remaining integer := 0;
    v_period_start_at timestamptz;
    v_next_reset_at timestamptz;
begin
    if v_email = '' then
        return jsonb_build_object('success', false, 'message', '이메일이 비어 있습니다.');
    end if;
    if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        return jsonb_build_object('success', false, 'message', '유효한 이메일 주소를 입력해 주세요.');
    end if;
    if v_code = '' then
        return jsonb_build_object('success', false, 'message', '인증 코드가 비어 있습니다.');
    end if;
    if v_hwid = '' then
        return jsonb_build_object('success', false, 'message', 'HWID가 비어 있습니다.');
    end if;
    if v_key = '' then
        return jsonb_build_object('success', false, 'message', '현재 라이선스를 찾을 수 없습니다. 먼저 앱을 실행해 주세요.');
    end if;

    v_code_hash := encode(digest(convert_to(v_code, 'UTF8'), 'sha256'), 'hex');

    select id, code_hash
      into v_row_id, v_row_hash
      from public.license_registration_codes
     where email = v_email
       and consumed_at is null
       and expires_at > v_now
     order by created_at desc
     limit 1
     for update;

    if v_row_id is null then
        return jsonb_build_object('success', false, 'message', '유효한 인증 코드 요청이 없습니다. 다시 요청해 주세요.');
    end if;

    if v_row_hash is distinct from v_code_hash then
        update public.license_registration_codes
           set attempt_count = coalesce(attempt_count, 0) + 1,
               consumed_at = case when coalesce(attempt_count, 0) + 1 >= 5 then v_now else consumed_at end,
               updated_at = v_now
         where id = v_row_id;
        return jsonb_build_object('success', false, 'message', '인증 코드가 올바르지 않습니다.');
    end if;

    update public.license_registration_codes
       set consumed_at = v_now,
           updated_at = v_now
     where id = v_row_id;

    select id, status, hwid, license_key, coalesce(plan_code, 'test'),
           coalesce(usage_limit, 0), coalesce(usage_count, 0), reset_date
      into v_license_id, v_license_status, v_license_hwid, v_license_key, v_plan_code,
           v_usage_limit, v_usage_count, v_reset_date
      from public.licenses
     where license_key = v_key
     limit 1
     for update;

    if v_license_id is null then
        return jsonb_build_object('success', false, 'message', '현재 라이선스를 찾을 수 없습니다. license status로 상태를 확인해 주세요.');
    end if;

    if coalesce(v_license_status, 'active') <> 'active' then
        return jsonb_build_object('success', false, 'message', '비활성화된 라이선스입니다.');
    end if;

    if v_license_hwid is not null and trim(v_license_hwid) <> '' and trim(v_license_hwid) <> v_hwid then
        return jsonb_build_object('success', false, 'message', '현재 라이선스가 다른 기기에 등록되어 있습니다.');
    end if;

    update public.licenses
       set email = v_email,
           hwid = v_hwid,
           updated_at = v_now
     where id = v_license_id;

    select display_name, quota_mode, quota_limit, quota_cycle, features
      into v_plan_display_name, v_plan_mode, v_plan_limit, v_plan_cycle, v_plan_features
      from public.license_plans
     where plan_code = v_plan_code
     limit 1;

    v_effective_limit := case
        when coalesce(v_usage_limit, 0) > 0 then v_usage_limit
        else coalesce(v_plan_limit, 0)
    end;
    v_effective_count := coalesce(v_usage_count, 0);
    if coalesce(v_plan_cycle, 'none') <> 'none'
       and (v_reset_date is null or v_now >= v_reset_date) then
        v_effective_count := 0;
    end if;

    if lower(coalesce(v_plan_mode, 'metered')) = 'unlimited' then
        v_remaining := -1;
    else
        v_remaining := greatest(coalesce(v_effective_limit, 0) - coalesce(v_effective_count, 0), 0);
    end if;

    v_hwid_hash := encode(digest(convert_to(v_hwid, 'UTF8'), 'sha256'), 'hex');
    insert into public.license_device_states (
        hwid_hash, non_test_used, last_seen_at, updated_at, note
    ) values (
        v_hwid_hash, (lower(v_plan_code) <> 'test'), v_now, v_now, 'email linked by register'
    )
    on conflict (hwid_hash) do update
    set non_test_used = public.license_device_states.non_test_used or excluded.non_test_used,
        last_seen_at = excluded.last_seen_at,
        updated_at = excluded.updated_at;

    return jsonb_build_object(
        'success', true,
        'message', '라이선스 등록이 완료되었습니다.',
        'license_key', v_license_key,
        'plan_code', v_plan_code,
        'plan_display_name', coalesce(v_plan_display_name, v_plan_code),
        'features', coalesce(v_plan_features, '{}'::jsonb),
        'remaining', v_remaining
    );
end;
$$;

grant execute on function public.verify_license_registration(text, text, text, text) to anon, authenticated, service_role;
revoke all on function public.verify_license_registration(text, text, text, text) from public;

drop function if exists public.verify_license_recovery(text, text, text);

create or replace function public.verify_license_recovery(
    p_email text,
    p_code text,
    p_hwid text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_now timestamptz := timezone('utc', now());
    v_email text := lower(trim(coalesce(p_email, '')));
    v_code text := trim(coalesce(p_code, ''));
    v_hwid text := trim(coalesce(p_hwid, ''));
    v_code_hash text;
    v_row_id bigint;
    v_row_hash text;
    v_hwid_hash text;

    v_license_id uuid;
    v_license_key text;
    v_plan_code text := 'free';
    v_usage_limit integer := 0;
    v_usage_count integer := 0;
    v_reset_date timestamptz;

    v_plan_display_name text;
    v_plan_mode text;
    v_plan_limit integer;
    v_plan_cycle text;
    v_plan_features jsonb := '{}'::jsonb;
    v_effective_count integer := 0;
    v_effective_limit integer := 0;
    v_remaining integer := 0;
begin
    if v_email = '' then
        return jsonb_build_object('success', false, 'message', '이메일이 비어 있습니다.');
    end if;
    if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        return jsonb_build_object('success', false, 'message', '유효한 이메일 주소를 입력해 주세요.');
    end if;
    if v_code = '' then
        return jsonb_build_object('success', false, 'message', '인증 코드가 비어 있습니다.');
    end if;
    if v_hwid = '' then
        return jsonb_build_object('success', false, 'message', 'HWID가 비어 있습니다.');
    end if;

    v_code_hash := encode(digest(convert_to(v_code, 'UTF8'), 'sha256'), 'hex');

    select id, code_hash
      into v_row_id, v_row_hash
      from public.license_registration_codes
     where email = v_email
       and consumed_at is null
       and expires_at > v_now
     order by created_at desc
     limit 1
     for update;

    if v_row_id is null then
        return jsonb_build_object('success', false, 'message', '유효한 인증 코드 요청이 없습니다. 다시 요청해 주세요.');
    end if;

    if v_row_hash is distinct from v_code_hash then
        update public.license_registration_codes
           set attempt_count = coalesce(attempt_count, 0) + 1,
               consumed_at = case when coalesce(attempt_count, 0) + 1 >= 5 then v_now else consumed_at end,
               updated_at = v_now
         where id = v_row_id;
        return jsonb_build_object('success', false, 'message', '인증 코드가 올바르지 않습니다.');
    end if;

    update public.license_registration_codes
       set consumed_at = v_now,
           updated_at = v_now
     where id = v_row_id;

    select l.id, l.license_key, coalesce(l.plan_code, 'free'),
           coalesce(l.usage_limit, 0), coalesce(l.usage_count, 0), l.reset_date
      into v_license_id, v_license_key, v_plan_code, v_usage_limit, v_usage_count, v_reset_date
      from public.licenses l
     where lower(coalesce(l.email, '')) = v_email
       and coalesce(l.status, 'active') = 'active'
       and (l.expires_at is null or l.expires_at > v_now)
     order by
        case lower(coalesce(l.plan_code, 'free'))
            when 'ultra' then 1
            when 'pro' then 2
            when 'free' then 3
            when 'test' then 4
            else 5
        end,
        l.created_at desc nulls last
     limit 1
     for update;

    if v_license_id is null then
        return jsonb_build_object(
            'success', false,
            'message', '등록된 라이선스가 없습니다. 기존 기기에서는 정상 사용 중일 수 있습니다. 새 기기 복구를 원하시면 기존 기기에서 먼저 license register로 이메일을 연결해 주세요.'
        );
    end if;

    update public.licenses
       set hwid = v_hwid,
           updated_at = v_now
     where id = v_license_id;

    select display_name, quota_mode, quota_limit, quota_cycle, features
      into v_plan_display_name, v_plan_mode, v_plan_limit, v_plan_cycle, v_plan_features
      from public.license_plans
     where plan_code = v_plan_code
     limit 1;

    v_effective_limit := case
        when coalesce(v_usage_limit, 0) > 0 then v_usage_limit
        else coalesce(v_plan_limit, 0)
    end;
    v_effective_count := coalesce(v_usage_count, 0);
    if coalesce(v_plan_cycle, 'none') <> 'none'
       and (v_reset_date is null or v_now >= v_reset_date) then
        v_effective_count := 0;
    end if;

    if lower(coalesce(v_plan_mode, 'metered')) = 'unlimited' then
        v_remaining := -1;
    else
        v_remaining := greatest(coalesce(v_effective_limit, 0) - coalesce(v_effective_count, 0), 0);
    end if;

    v_hwid_hash := encode(digest(convert_to(v_hwid, 'UTF8'), 'sha256'), 'hex');
    insert into public.license_device_states (
        hwid_hash, non_test_used, last_seen_at, updated_at, note
    ) values (
        v_hwid_hash, (lower(v_plan_code) <> 'test'), v_now, v_now, 'license recovered'
    )
    on conflict (hwid_hash) do update
    set non_test_used = public.license_device_states.non_test_used or excluded.non_test_used,
        last_seen_at = excluded.last_seen_at,
        updated_at = excluded.updated_at;

    return jsonb_build_object(
        'success', true,
        'message', '라이선스 복구가 완료되었습니다.',
        'license_key', v_license_key,
        'plan_code', v_plan_code,
        'plan_display_name', coalesce(v_plan_display_name, v_plan_code),
        'features', coalesce(v_plan_features, '{}'::jsonb),
        'remaining', v_remaining
    );
end;
$$;

grant execute on function public.verify_license_recovery(text, text, text) to anon, authenticated, service_role;
revoke all on function public.verify_license_recovery(text, text, text) from public;

drop function if exists public.upgrade_license_plan(text, text, text, text);

create or replace function public.upgrade_license_plan(
    p_license_key text,
    p_hwid text,
    p_target_plan text,
    p_email text default null
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
    v_target text := lower(trim(coalesce(p_target_plan, '')));
    v_email text := lower(trim(coalesce(p_email, '')));
    v_hwid_hash text;

    v_license_id uuid;
    v_license_hwid text;
    v_license_status text;
    v_license_key text;
    v_current_plan_code text;
    v_current_email text;

    v_plan_display_name text;
    v_plan_status text;
    v_plan_mode text;
    v_plan_limit integer;
    v_plan_cycle text;
    v_plan_features jsonb := '{}'::jsonb;
    v_period_start timestamptz;
    v_period_end timestamptz;
    v_remaining integer := 0;
begin
    if v_key = '' then
        return jsonb_build_object('success', false, 'message', '현재 라이선스를 찾을 수 없습니다.');
    end if;
    if v_hwid = '' then
        return jsonb_build_object('success', false, 'message', 'HWID가 비어 있습니다.');
    end if;
    if v_target = '' then
        return jsonb_build_object('success', false, 'message', '업그레이드 대상 플랜이 비어 있습니다.');
    end if;

    if v_target <> 'free' then
        return jsonb_build_object(
            'success', false,
            'message', '현재는 free 플랜 업그레이드만 지원합니다. pro/ultra는 곧 지원 예정입니다.'
        );
    end if;

    select id, hwid, status, license_key, coalesce(plan_code, 'test'), lower(trim(coalesce(email, '')))
      into v_license_id, v_license_hwid, v_license_status, v_license_key, v_current_plan_code, v_current_email
      from public.licenses
     where license_key = v_key
     limit 1
     for update;

    if v_license_id is null then
        return jsonb_build_object('success', false, 'message', '유효하지 않은 라이선스 키입니다.');
    end if;
    if coalesce(v_license_status, 'active') <> 'active' then
        return jsonb_build_object('success', false, 'message', '비활성화된 라이선스입니다.');
    end if;
    if v_license_hwid is not null and trim(v_license_hwid) <> '' and trim(v_license_hwid) <> v_hwid then
        return jsonb_build_object('success', false, 'message', '다른 기기에 등록된 라이선스입니다.');
    end if;

    if v_email = '' then
        v_email := v_current_email;
    end if;

    if v_email = '' then
        return jsonb_build_object(
            'success', false,
            'message', '이메일 등록이 필요합니다. 먼저 license register를 실행해 주세요.'
        );
    end if;
    if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        return jsonb_build_object('success', false, 'message', '유효한 이메일 주소를 입력해 주세요.');
    end if;

    select display_name, status, quota_mode, quota_limit, quota_cycle, features
      into v_plan_display_name, v_plan_status, v_plan_mode, v_plan_limit, v_plan_cycle, v_plan_features
      from public.license_plans
     where plan_code = v_target
     limit 1;

    if v_plan_display_name is null then
        return jsonb_build_object('success', false, 'message', '대상 플랜 정보를 찾지 못했습니다.');
    end if;
    if v_plan_status is distinct from 'active' then
        return jsonb_build_object('success', false, 'message', '현재 대상 플랜이 비활성화되어 있습니다.');
    end if;

    if coalesce(v_plan_cycle, 'none') <> 'none' then
        select period_start, period_end
          into v_period_start, v_period_end
          from public._license_calc_period_bounds(v_plan_cycle, v_now)
         limit 1;
    else
        v_period_start := null;
        v_period_end := null;
    end if;

    update public.licenses
       set plan_code = v_target,
           hwid = v_hwid,
           email = v_email,
           usage_limit = coalesce(v_plan_limit, 0),
           usage_count = 0,
           reset_date = v_period_end,
           license_mode = lower(coalesce(v_plan_mode, 'metered')),
           expires_at = null,
           updated_at = v_now,
           note = 'upgraded via license upgrade'
     where id = v_license_id;

    if lower(coalesce(v_plan_mode, 'metered')) = 'unlimited' then
        v_remaining := -1;
    else
        v_remaining := greatest(coalesce(v_plan_limit, 0), 0);
    end if;

    v_hwid_hash := encode(digest(convert_to(v_hwid, 'UTF8'), 'sha256'), 'hex');
    insert into public.license_device_states (
        hwid_hash, non_test_used, last_seen_at, updated_at, note
    ) values (
        v_hwid_hash, true, v_now, v_now, 'plan upgraded'
    )
    on conflict (hwid_hash) do update
    set non_test_used = true,
        last_seen_at = excluded.last_seen_at,
        updated_at = excluded.updated_at;

    return jsonb_build_object(
        'success', true,
        'message', format('%s 플랜으로 업그레이드되었습니다.', v_target),
        'license_key', v_license_key,
        'plan_code', v_target,
        'plan_display_name', v_plan_display_name,
        'features', coalesce(v_plan_features, '{}'::jsonb),
        'remaining', v_remaining
    );
end;
$$;

grant execute on function public.upgrade_license_plan(text, text, text, text) to anon, authenticated, service_role;
revoke all on function public.upgrade_license_plan(text, text, text, text) from public;

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
    v_license_email text;
    v_license_mode text;
    v_license_created_at timestamptz;
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
    v_effective_limit integer := 0;
    v_remaining integer := 0;
    v_period_start_at timestamptz;
    v_next_reset_at timestamptz;

    v_non_test_used boolean := false;
    v_test_exhausted_at timestamptz;
begin
    if v_hwid = '' then
        return jsonb_build_object('success', false, 'message', 'HWID가 비어 있습니다.');
    end if;

    if v_key = '' then
        return jsonb_build_object('success', false, 'message', 'LICENSE_KEY가 비어 있습니다.');
    end if;

    select id, status, hwid, lower(trim(coalesce(email, ''))), coalesce(license_mode, ''), created_at, expires_at,
           coalesce(usage_limit, 0), coalesce(usage_count, 0), reset_date, coalesce(plan_code, 'pro')
      into v_license_id, v_license_status, v_license_hwid, v_license_email, v_license_mode, v_license_created_at, v_license_expires_at,
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
            'plan_code', v_plan_code,
            'email', nullif(v_license_email, '')
        );
    end if;

    if v_license_expires_at is not null and v_now >= v_license_expires_at then
        return jsonb_build_object(
            'success', false,
            'message', '만료된 라이선스입니다.',
            'plan_code', v_plan_code,
            'email', nullif(v_license_email, '')
        );
    end if;

    if v_license_hwid is not null and trim(v_license_hwid) <> '' and trim(v_license_hwid) <> v_hwid then
        return jsonb_build_object(
            'success', false,
            'message', '다른 기기에 등록된 라이선스입니다.',
            'plan_code', v_plan_code,
            'email', nullif(v_license_email, '')
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
            'plan_display_name', coalesce(v_plan_display_name, v_plan_code),
            'email', nullif(v_license_email, '')
        );
    end if;

    v_plan_mode := lower(coalesce(nullif(trim(v_license_mode), ''), v_plan_mode, 'metered'));
    if coalesce(v_plan_cycle, 'none') <> 'none' then
        if v_license_reset_date is not null and v_license_reset_date > v_now then
            v_next_reset_at := v_license_reset_date;
            v_period_start_at := case
                when v_plan_cycle = 'monthly' then v_license_reset_date - interval '1 month'
                when v_plan_cycle = 'weekly' then v_license_reset_date - interval '1 week'
                when v_plan_cycle = 'daily' then v_license_reset_date - interval '1 day'
                else null
            end;
        else
            v_period_start_at := v_now;
            v_next_reset_at := case
                when v_plan_cycle = 'monthly' then v_now + interval '1 month'
                when v_plan_cycle = 'weekly' then v_now + interval '1 week'
                when v_plan_cycle = 'daily' then v_now + interval '1 day'
                else null
            end;
        end if;
    end if;

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
                'features', coalesce(v_plan_features, '{}'::jsonb),
                'email', nullif(v_license_email, ''),
                'created_at', v_license_created_at,
                'quota_cycle', coalesce(v_plan_cycle, 'none'),
                'current_period_start_at', v_period_start_at,
                'next_reset_at', v_next_reset_at,
                'usage_limit', greatest(coalesce(nullif(v_usage_limit, 0), v_plan_limit, 0), 0),
                'usage_count', greatest(coalesce(v_usage_count, 0), 0),
                'remaining', 0
            );
        end if;

        if v_test_exhausted_at is not null then
            return jsonb_build_object(
                'success', false,
                'message', 'test 플랜 1회 사용이 종료되었습니다. 계속 이용하려면 license upgrade를 진행해 주세요.',
                'plan_code', 'test',
                'plan_display_name', coalesce(v_plan_display_name, 'test'),
                'features', coalesce(v_plan_features, '{}'::jsonb),
                'email', nullif(v_license_email, ''),
                'created_at', v_license_created_at,
                'quota_cycle', coalesce(v_plan_cycle, 'none'),
                'current_period_start_at', v_period_start_at,
                'next_reset_at', v_next_reset_at,
                'usage_limit', greatest(coalesce(nullif(v_usage_limit, 0), v_plan_limit, 0), 0),
                'usage_count', greatest(coalesce(v_usage_count, 0), 0),
                'remaining', 0
            );
        end if;
    end if;

    if v_plan_mode = 'unlimited' then
        return jsonb_build_object(
            'success', true,
            'message', format('%s 플랜 사전 검증 통과', v_plan_code),
            'plan_code', v_plan_code,
            'plan_display_name', coalesce(v_plan_display_name, v_plan_code),
            'features', coalesce(v_plan_features, '{}'::jsonb),
            'email', nullif(v_license_email, ''),
            'created_at', v_license_created_at,
            'quota_cycle', coalesce(v_plan_cycle, 'none'),
            'current_period_start_at', v_period_start_at,
            'next_reset_at', v_next_reset_at,
            'usage_limit', -1,
            'usage_count', coalesce(v_usage_count, 0),
            'remaining', -1
        );
    end if;

    if v_usage_limit <= 0 then
        v_usage_limit := coalesce(v_plan_limit, 0);
    end if;
    v_effective_limit := v_usage_limit;
    if v_usage_limit <= 0 then
        return jsonb_build_object(
            'success', false,
            'message', '사용 가능 횟수가 0으로 설정된 라이선스입니다.',
            'plan_code', v_plan_code,
            'plan_display_name', coalesce(v_plan_display_name, v_plan_code),
            'email', nullif(v_license_email, ''),
            'created_at', v_license_created_at,
            'quota_cycle', coalesce(v_plan_cycle, 'none'),
            'current_period_start_at', v_period_start_at,
            'next_reset_at', v_next_reset_at,
            'usage_limit', greatest(v_effective_limit, 0),
            'usage_count', greatest(v_effective_count, 0),
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
            'email', nullif(v_license_email, ''),
            'created_at', v_license_created_at,
            'quota_cycle', coalesce(v_plan_cycle, 'none'),
            'current_period_start_at', v_period_start_at,
            'next_reset_at', v_next_reset_at,
            'usage_limit', greatest(v_effective_limit, 0),
            'usage_count', greatest(v_effective_count, 0),
            'remaining', 0
        );
    end if;

    return jsonb_build_object(
        'success', true,
        'message', format('%s 플랜 사전 검증 통과', v_plan_code),
        'plan_code', v_plan_code,
        'plan_display_name', coalesce(v_plan_display_name, v_plan_code),
        'features', coalesce(v_plan_features, '{}'::jsonb),
        'email', nullif(v_license_email, ''),
        'created_at', v_license_created_at,
        'quota_cycle', coalesce(v_plan_cycle, 'none'),
        'current_period_start_at', v_period_start_at,
        'next_reset_at', v_next_reset_at,
        'usage_limit', greatest(v_effective_limit, 0),
        'usage_count', greatest(v_effective_count, 0),
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
            'message', '다른 기기에 등록된 라이선스입니다.',
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
                'features', coalesce(v_plan_features, '{}'::jsonb),
                'usage_limit', greatest(coalesce(nullif(v_usage_limit, 0), v_plan_limit, 0), 0),
                'usage_count', greatest(coalesce(v_usage_count, 0), 0),
                'remaining', 0
            );
        end if;

        if v_test_exhausted_at is not null then
            return jsonb_build_object(
                'success', false,
                'message', 'test 플랜 1회 사용이 종료되었습니다. 계속 이용하려면 license upgrade를 진행해 주세요.',
                'plan_code', 'test',
                'plan_display_name', coalesce(v_plan_display_name, 'test'),
                'features', coalesce(v_plan_features, '{}'::jsonb),
                'usage_limit', greatest(coalesce(nullif(v_usage_limit, 0), v_plan_limit, 0), 0),
                'usage_count', greatest(coalesce(v_usage_count, 0), 0),
                'remaining', 0
            );
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
        'remaining', greatest(v_remaining, 0)
    );
end;
$$;

grant execute on function public.check_and_use_license(text, text) to anon, authenticated, service_role;
revoke all on function public.check_and_use_license(text, text) from public;

commit;
