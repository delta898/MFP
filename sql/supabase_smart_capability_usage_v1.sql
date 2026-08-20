-- ============================================================
-- BlogGenius: capability-scoped smart usage sessions (initial install)
-- Prerequisite: supabase_license_v4_unique_keys.sql
-- Runtime policy source of truth: public.license_plans
-- Later policy changes: supabase_smart_capability_usage_policy.sql
--
-- This intentionally does not reuse license_usage_operations. That table
-- belongs to post-publication quota backed by licenses.usage_count.
-- ============================================================

begin;

alter table public.license_plans
    add column if not exists smart_usage_limits jsonb not null default '{}'::jsonb,
    add column if not exists smart_usage_rules jsonb not null default '{}'::jsonb;

update public.license_plans
   set smart_usage_limits = jsonb_build_object(
           'content_idea', case plan_code when 'test' then 40 when 'free' then 20 when 'pro' then 80 when 'ultra' then 300 else 0 end,
           'keyword_discovery', case plan_code when 'test' then 40 when 'free' then 20 when 'pro' then 80 when 'ultra' then 300 else 0 end,
           'title_recommendation', case plan_code when 'test' then 40 when 'free' then 20 when 'pro' then 80 when 'ultra' then 300 else 0 end
       ),
       smart_usage_rules = jsonb_build_object(
           'session_ttl_seconds', 900,
           'content_idea_requests_per_session', 2,
           'keyword_discovery_requests_per_session', 5,
           'title_recommendation_requests_per_session', 2
       ),
       updated_at = timezone('utc', now())
 where plan_code in ('test', 'free', 'pro', 'ultra');

create table if not exists public.license_capability_usage_sessions (
    id uuid primary key default gen_random_uuid(),
    license_id uuid not null references public.licenses(id) on delete cascade,
    capability text not null check (capability in ('content_idea', 'keyword_discovery', 'title_recommendation')),
    period_start timestamptz not null,
    period_end timestamptz not null,
    session_id text not null,
    state text not null default 'active' check (state in ('active', 'expired')),
    request_limit integer not null check (request_limit > 0),
    request_count integer not null default 0 check (request_count >= 0),
    expires_at timestamptz not null,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    unique (license_id, capability, period_start, session_id)
);

create index if not exists idx_license_capability_usage_sessions_period
    on public.license_capability_usage_sessions (license_id, capability, period_start, state);

create table if not exists public.license_capability_usage_operations (
    id uuid primary key default gen_random_uuid(),
    usage_session_id uuid not null references public.license_capability_usage_sessions(id) on delete cascade,
    license_id uuid not null references public.licenses(id) on delete cascade,
    capability text not null check (capability in ('content_idea', 'keyword_discovery', 'title_recommendation')),
    operation_id text not null,
    state text not null check (state in ('reserved', 'committed', 'released')),
    reservation_expires_at timestamptz,
    metadata jsonb not null default '{}'::jsonb,
    reserved_at timestamptz not null default timezone('utc', now()),
    committed_at timestamptz,
    released_at timestamptz,
    updated_at timestamptz not null default timezone('utc', now()),
    unique (license_id, capability, operation_id)
);

create index if not exists idx_license_capability_usage_operations_active
    on public.license_capability_usage_operations (usage_session_id, state, reservation_expires_at);

alter table public.license_capability_usage_sessions enable row level security;
alter table public.license_capability_usage_operations enable row level security;
revoke all on table public.license_capability_usage_sessions from anon, authenticated;
revoke all on table public.license_capability_usage_operations from anon, authenticated;
grant all on table public.license_capability_usage_sessions to service_role;
grant all on table public.license_capability_usage_operations to service_role;

create or replace function public._smart_usage_kst_period_bounds(p_at timestamptz default timezone('utc', now()))
returns table(period_start timestamptz, period_end timestamptz)
language sql
stable
as $$
    select
        date_trunc('month', p_at at time zone 'Asia/Seoul') at time zone 'Asia/Seoul',
        (date_trunc('month', p_at at time zone 'Asia/Seoul') + interval '1 month') at time zone 'Asia/Seoul';
$$;

create or replace function public._smart_usage_authorize(
    p_license_key text,
    p_hwid text
)
returns table(license_id uuid, plan_code text, plan_display_name text, smart_usage_limits jsonb, smart_usage_rules jsonb)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_now timestamptz := timezone('utc', now());
    v_license_id uuid;
    v_license_status text;
    v_license_hwid text;
    v_expires_at timestamptz;
    v_plan_code text;
    v_plan_name text;
    v_plan_status text;
    v_limits jsonb;
    v_rules jsonb;
    v_hwid_hash text;
    v_test_disallowed boolean := false;
begin
    if trim(coalesce(p_license_key, '')) = '' or trim(coalesce(p_hwid, '')) = '' then
        return;
    end if;

    select l.id, coalesce(l.status, 'active'), l.hwid, l.expires_at,
           coalesce(l.plan_code, 'pro'), lp.display_name, coalesce(lp.status, 'inactive'),
           coalesce(lp.smart_usage_limits, '{}'::jsonb), coalesce(lp.smart_usage_rules, '{}'::jsonb)
      into v_license_id, v_license_status, v_license_hwid, v_expires_at,
           v_plan_code, v_plan_name, v_plan_status, v_limits, v_rules
      from public.licenses l
      join public.license_plans lp on lp.plan_code = coalesce(l.plan_code, 'pro')
     where l.license_key = trim(coalesce(p_license_key, ''))
       and trim(coalesce(l.hwid, '')) = trim(coalesce(p_hwid, ''))
     limit 1;
    if v_license_id is null
       or v_license_status <> 'active'
       or v_plan_status <> 'active'
       or (v_expires_at is not null and v_now >= v_expires_at) then
        return;
    end if;

    if v_plan_code = 'test' then
        v_hwid_hash := encode(digest(convert_to(trim(coalesce(p_hwid, '')), 'UTF8'), 'sha256'), 'hex');
        select coalesce(non_test_used, false) or test_exhausted_at is not null
          into v_test_disallowed
          from public.license_device_states
         where hwid_hash = v_hwid_hash;
        if coalesce(v_test_disallowed, false) then
            return;
        end if;
    end if;

    license_id := v_license_id;
    plan_code := v_plan_code;
    plan_display_name := v_plan_name;
    smart_usage_limits := v_limits;
    smart_usage_rules := v_rules;
    return next;
end;
$$;

create or replace function public.get_smart_usage_status(
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
    v_license_id uuid;
    v_plan_code text;
    v_plan_name text;
    v_limits jsonb;
    v_rules jsonb;
    v_period_start timestamptz;
    v_period_end timestamptz;
    v_items jsonb;
begin
    select * into v_license_id, v_plan_code, v_plan_name, v_limits, v_rules
      from public._smart_usage_authorize(p_license_key, p_hwid);
    if v_license_id is null then
        return jsonb_build_object('success', false, 'message', '스마트 기능 사용량을 확인할 라이선스를 찾지 못했습니다.');
    end if;

    select period_start, period_end into v_period_start, v_period_end
      from public._smart_usage_kst_period_bounds(v_now);

    update public.license_capability_usage_sessions
       set state = 'expired', updated_at = v_now
     where license_id = v_license_id
       and state = 'active'
       and expires_at <= v_now;

    select coalesce(jsonb_agg(jsonb_build_object(
        'capability', capability,
        'limit', limit_value,
        'used', used_count,
        'remaining', greatest(limit_value - used_count, 0),
        'request_limit', request_limit
    ) order by capability), '[]'::jsonb)
      into v_items
      from (
        select capability,
               greatest(coalesce((v_limits ->> capability)::integer, 0), 0) as limit_value,
               greatest(coalesce((v_rules ->> (capability || '_requests_per_session'))::integer, 1), 1) as request_limit,
               (
                   select count(*)::integer
                     from public.license_capability_usage_sessions s
                    where s.license_id = v_license_id
                      and s.capability = capability
                      and s.period_start = v_period_start
                      and s.request_count > 0
               ) as used_count
          from unnest(array['content_idea', 'keyword_discovery', 'title_recommendation']) as capabilities(capability)
      ) usage_rows;

    return jsonb_build_object(
        'success', true,
        'plan_code', v_plan_code,
        'plan_display_name', v_plan_name,
        'cycle', 'monthly',
        'current_period_start_at', v_period_start,
        'next_reset_at', v_period_end,
        'items', v_items
    );
end;
$$;

create or replace function public.reserve_smart_usage(
    p_license_key text,
    p_hwid text,
    p_capability text,
    p_session_id text,
    p_operation_id text,
    p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_now timestamptz := timezone('utc', now());
    v_capability text := trim(lower(coalesce(p_capability, '')));
    v_public_session_id text := trim(coalesce(p_session_id, ''));
    v_operation_id text := trim(coalesce(p_operation_id, ''));
    v_license_id uuid;
    v_plan_code text;
    v_plan_name text;
    v_limits jsonb;
    v_rules jsonb;
    v_period_start timestamptz;
    v_period_end timestamptz;
    v_limit integer;
    v_request_limit integer;
    v_session_ttl_seconds integer;
    v_session_row_id uuid;
    v_session_state text;
    v_session_expires_at timestamptz;
    v_request_count integer;
    v_active_reservations integer;
    v_used_count integer;
    v_existing_state text;
    v_existing_expires_at timestamptz;
begin
    if v_capability not in ('content_idea', 'keyword_discovery', 'title_recommendation') then
        return jsonb_build_object('success', false, 'code', 'INVALID_CAPABILITY', 'message', '지원하지 않는 스마트 기능입니다.');
    end if;
    if v_public_session_id = '' or length(v_public_session_id) > 160 then
        return jsonb_build_object('success', false, 'code', 'INVALID_SESSION_ID', 'message', '스마트 기능 세션 정보가 올바르지 않습니다.');
    end if;
    if v_operation_id = '' or length(v_operation_id) > 160 then
        return jsonb_build_object('success', false, 'code', 'INVALID_OPERATION_ID', 'message', '스마트 기능 작업 정보가 올바르지 않습니다.');
    end if;

    select * into v_license_id, v_plan_code, v_plan_name, v_limits, v_rules
      from public._smart_usage_authorize(p_license_key, p_hwid);
    if v_license_id is null then
        return jsonb_build_object('success', false, 'code', 'LICENSE_UNAVAILABLE', 'message', '스마트 기능을 사용할 수 있는 라이선스를 확인하지 못했습니다.');
    end if;

    perform 1 from public.licenses where id = v_license_id for update;
    select period_start, period_end into v_period_start, v_period_end
      from public._smart_usage_kst_period_bounds(v_now);
    v_limit := greatest(coalesce((v_limits ->> v_capability)::integer, 0), 0);
    v_request_limit := greatest(coalesce((v_rules ->> (v_capability || '_requests_per_session'))::integer, 1), 1);
    v_session_ttl_seconds := greatest(coalesce((v_rules ->> 'session_ttl_seconds')::integer, 900), 60);

    update public.license_capability_usage_operations
       set state = 'released', released_at = coalesce(released_at, v_now), updated_at = v_now
     where license_id = v_license_id
       and capability = v_capability
       and state = 'reserved'
       and reservation_expires_at <= v_now;

    update public.license_capability_usage_sessions
       set state = 'expired', updated_at = v_now
     where license_id = v_license_id
       and capability = v_capability
       and period_start = v_period_start
       and state = 'active'
       and expires_at <= v_now;

    select state, reservation_expires_at into v_existing_state, v_existing_expires_at
      from public.license_capability_usage_operations
     where license_id = v_license_id and capability = v_capability and operation_id = v_operation_id
     for update;
    if v_existing_state = 'committed' or (v_existing_state = 'reserved' and v_existing_expires_at > v_now) then
        return jsonb_build_object(
            'success', true,
            'idempotent', true,
            'session_id', v_public_session_id,
            'operation_id', v_operation_id
        );
    end if;

    select id, state, expires_at, request_count
      into v_session_row_id, v_session_state, v_session_expires_at, v_request_count
      from public.license_capability_usage_sessions
     where license_id = v_license_id
       and capability = v_capability
       and period_start = v_period_start
       and session_id = v_public_session_id
     for update;

    if v_session_row_id is null or v_session_state <> 'active' or v_session_expires_at <= v_now then
        select count(*)::integer into v_used_count
          from public.license_capability_usage_sessions s
         where s.license_id = v_license_id
           and s.capability = v_capability
           and s.period_start = v_period_start
           and (s.request_count > 0 or s.state = 'active');
        if v_used_count >= v_limit then
            return jsonb_build_object(
                'success', false,
                'code', 'SMART_USAGE_EXHAUSTED',
                'message', '이번 달 사용 가능 횟수를 모두 사용했습니다.',
                'usage', jsonb_build_object('capability', v_capability, 'limit', v_limit, 'used', v_used_count, 'remaining', 0)
            );
        end if;
        insert into public.license_capability_usage_sessions (
            license_id, capability, period_start, period_end, session_id,
            request_limit, expires_at, metadata, created_at, updated_at
        ) values (
            v_license_id, v_capability, v_period_start, v_period_end, v_public_session_id,
            v_request_limit, v_now + (v_session_ttl_seconds || ' seconds')::interval, coalesce(p_metadata, '{}'::jsonb), v_now, v_now
        ) returning id, request_count into v_session_row_id, v_request_count;
    end if;

    select count(*)::integer into v_active_reservations
      from public.license_capability_usage_operations
     where usage_session_id = v_session_row_id
       and state = 'reserved'
       and reservation_expires_at > v_now;
    if v_request_count + v_active_reservations >= v_request_limit then
        return jsonb_build_object(
            'success', false,
            'code', 'SMART_SESSION_REQUEST_LIMIT',
            'message', '이번 추천 세션의 재시도 가능 횟수를 모두 사용했습니다.',
            'usage', jsonb_build_object('capability', v_capability, 'request_limit', v_request_limit, 'requests_remaining', 0)
        );
    end if;

    insert into public.license_capability_usage_operations (
        usage_session_id, license_id, capability, operation_id, state,
        reservation_expires_at, metadata, reserved_at, updated_at
    ) values (
        v_session_row_id, v_license_id, v_capability, v_operation_id, 'reserved',
        v_now + interval '5 minutes', coalesce(p_metadata, '{}'::jsonb), v_now, v_now
    )
    on conflict (license_id, capability, operation_id) do update
       set usage_session_id = excluded.usage_session_id,
           state = 'reserved',
           reservation_expires_at = excluded.reservation_expires_at,
           metadata = public.license_capability_usage_operations.metadata || excluded.metadata,
           reserved_at = excluded.reserved_at,
           committed_at = null,
           released_at = null,
           updated_at = excluded.updated_at;

    select count(*)::integer into v_used_count
      from public.license_capability_usage_sessions s
     where s.license_id = v_license_id
       and s.capability = v_capability
       and s.period_start = v_period_start
       and (s.request_count > 0 or s.state = 'active');

    return jsonb_build_object(
        'success', true,
        'session_id', v_public_session_id,
        'operation_id', v_operation_id,
        'usage', jsonb_build_object(
            'capability', v_capability,
            'limit', v_limit,
            'used', v_used_count,
            'remaining', greatest(v_limit - v_used_count, 0),
            'request_limit', v_request_limit,
            'requests_remaining', greatest(v_request_limit - v_request_count - v_active_reservations - 1, 0)
        )
    );
end;
$$;

create or replace function public.commit_smart_usage(
    p_license_key text,
    p_hwid text,
    p_capability text,
    p_session_id text,
    p_operation_id text,
    p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_now timestamptz := timezone('utc', now());
    v_capability text := trim(lower(coalesce(p_capability, '')));
    v_public_session_id text := trim(coalesce(p_session_id, ''));
    v_operation_id text := trim(coalesce(p_operation_id, ''));
    v_license_id uuid;
    v_plan_code text;
    v_plan_name text;
    v_limits jsonb;
    v_rules jsonb;
    v_session_row_id uuid;
    v_state text;
    v_period_start timestamptz;
    v_period_end timestamptz;
    v_limit integer;
    v_used integer;
    v_request_limit integer;
    v_request_count integer;
begin
    select * into v_license_id, v_plan_code, v_plan_name, v_limits, v_rules
      from public._smart_usage_authorize(p_license_key, p_hwid);
    if v_license_id is null then
        return jsonb_build_object('success', false, 'code', 'LICENSE_UNAVAILABLE', 'message', '스마트 기능을 사용할 수 있는 라이선스를 확인하지 못했습니다.');
    end if;

    select o.usage_session_id, o.state, s.period_start, s.period_end, s.request_limit, s.request_count
      into v_session_row_id, v_state, v_period_start, v_period_end, v_request_limit, v_request_count
      from public.license_capability_usage_operations o
      join public.license_capability_usage_sessions s on s.id = o.usage_session_id
     where o.license_id = v_license_id
       and o.capability = v_capability
       and o.operation_id = v_operation_id
       and s.session_id = v_public_session_id
     for update of o, s;
    if v_session_row_id is null then
        return jsonb_build_object('success', false, 'code', 'SMART_USAGE_RESERVATION_NOT_FOUND', 'message', '사용량 예약을 찾지 못했습니다. 다시 시도해 주세요.');
    end if;
    if v_state = 'committed' then
        return jsonb_build_object('success', true, 'idempotent', true, 'session_id', v_public_session_id, 'operation_id', v_operation_id);
    end if;
    if v_state <> 'reserved' then
        return jsonb_build_object('success', false, 'code', 'SMART_USAGE_RESERVATION_RELEASED', 'message', '사용량 예약이 만료되었습니다. 다시 시도해 주세요.');
    end if;

    update public.license_capability_usage_operations
       set state = 'committed', committed_at = v_now, reservation_expires_at = null,
           metadata = metadata || coalesce(p_metadata, '{}'::jsonb), updated_at = v_now
     where license_id = v_license_id and capability = v_capability and operation_id = v_operation_id;
    update public.license_capability_usage_sessions
       set request_count = request_count + 1, metadata = metadata || coalesce(p_metadata, '{}'::jsonb), updated_at = v_now
     where id = v_session_row_id
     returning request_count into v_request_count;

    v_limit := greatest(coalesce((v_limits ->> v_capability)::integer, 0), 0);
    select count(*)::integer into v_used
      from public.license_capability_usage_sessions
     where license_id = v_license_id and capability = v_capability and period_start = v_period_start and request_count > 0;
    return jsonb_build_object(
        'success', true,
        'session_id', v_public_session_id,
        'operation_id', v_operation_id,
        'usage', jsonb_build_object(
            'capability', v_capability,
            'limit', v_limit,
            'used', v_used,
            'remaining', greatest(v_limit - v_used, 0),
            'request_limit', v_request_limit,
            'requests_remaining', greatest(v_request_limit - v_request_count, 0),
            'period_end', v_period_end
        )
    );
end;
$$;

create or replace function public.release_smart_usage(
    p_license_key text,
    p_hwid text,
    p_capability text,
    p_session_id text,
    p_operation_id text,
    p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_now timestamptz := timezone('utc', now());
    v_capability text := trim(lower(coalesce(p_capability, '')));
    v_public_session_id text := trim(coalesce(p_session_id, ''));
    v_operation_id text := trim(coalesce(p_operation_id, ''));
    v_license_id uuid;
    v_plan_code text;
    v_plan_name text;
    v_limits jsonb;
    v_rules jsonb;
    v_session_row_id uuid;
    v_state text;
begin
    select * into v_license_id, v_plan_code, v_plan_name, v_limits, v_rules
      from public._smart_usage_authorize(p_license_key, p_hwid);
    if v_license_id is null then
        return jsonb_build_object('success', false, 'code', 'LICENSE_UNAVAILABLE', 'message', '스마트 기능을 사용할 수 있는 라이선스를 확인하지 못했습니다.');
    end if;

    select o.usage_session_id, o.state into v_session_row_id, v_state
      from public.license_capability_usage_operations o
      join public.license_capability_usage_sessions s on s.id = o.usage_session_id
     where o.license_id = v_license_id
       and o.capability = v_capability
       and o.operation_id = v_operation_id
       and s.session_id = v_public_session_id
     for update of o, s;
    if v_session_row_id is null then
        return jsonb_build_object('success', true, 'idempotent', true, 'session_id', v_public_session_id, 'operation_id', v_operation_id);
    end if;
    if v_state = 'committed' then
        return jsonb_build_object('success', true, 'idempotent', true, 'session_id', v_public_session_id, 'operation_id', v_operation_id);
    end if;

    update public.license_capability_usage_operations
       set state = 'released', released_at = coalesce(released_at, v_now), reservation_expires_at = null,
           metadata = metadata || coalesce(p_metadata, '{}'::jsonb), updated_at = v_now
     where license_id = v_license_id and capability = v_capability and operation_id = v_operation_id;

    delete from public.license_capability_usage_sessions s
     where s.id = v_session_row_id
       and s.request_count = 0
       and not exists (
           select 1 from public.license_capability_usage_operations o
            where o.usage_session_id = s.id and o.state in ('reserved', 'committed')
       );

    return jsonb_build_object('success', true, 'session_id', v_public_session_id, 'operation_id', v_operation_id);
end;
$$;

grant execute on function public.get_smart_usage_status(text, text) to anon, authenticated, service_role;
grant execute on function public.reserve_smart_usage(text, text, text, text, text, jsonb) to anon, authenticated, service_role;
grant execute on function public.commit_smart_usage(text, text, text, text, text, jsonb) to anon, authenticated, service_role;
grant execute on function public.release_smart_usage(text, text, text, text, text, jsonb) to anon, authenticated, service_role;
revoke all on function public.get_smart_usage_status(text, text) from public;
revoke all on function public.reserve_smart_usage(text, text, text, text, text, jsonb) from public;
revoke all on function public.commit_smart_usage(text, text, text, text, text, jsonb) from public;
revoke all on function public.release_smart_usage(text, text, text, text, text, jsonb) from public;
revoke all on function public._smart_usage_kst_period_bounds(timestamptz) from public;
revoke all on function public._smart_usage_authorize(text, text) from public;

commit;
