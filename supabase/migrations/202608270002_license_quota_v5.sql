-- ============================================================
-- BlogGenius License v5: idempotent publish quota lifecycle
-- Prerequisite: supabase_license_v4_unique_keys.sql
-- ============================================================

begin;

create table if not exists public.license_usage_operations (
    id uuid primary key default gen_random_uuid(),
    license_id uuid not null references public.licenses(id) on delete cascade,
    operation_id text not null,
    state text not null check (state in ('reserved', 'committed', 'released')),
    quota_units integer not null default 1 check (quota_units in (0, 1)),
    quota_period_end timestamptz,
    reservation_expires_at timestamptz,
    metadata jsonb not null default '{}'::jsonb,
    reserved_at timestamptz not null default timezone('utc', now()),
    committed_at timestamptz,
    released_at timestamptz,
    updated_at timestamptz not null default timezone('utc', now()),
    unique (license_id, operation_id)
);

create index if not exists idx_license_usage_operations_active
    on public.license_usage_operations (license_id, state, reservation_expires_at);

alter table public.license_usage_operations enable row level security;
revoke all on table public.license_usage_operations from anon, authenticated;
grant all on table public.license_usage_operations to service_role;

drop function if exists public.reserve_publish_quota(text, text, text, jsonb);

create or replace function public.reserve_publish_quota(
    p_license_key text,
    p_hwid text,
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
    v_key text := trim(coalesce(p_license_key, ''));
    v_hwid text := trim(coalesce(p_hwid, ''));
    v_operation_id text := trim(coalesce(p_operation_id, ''));
    v_status jsonb;
    v_license_id uuid;
    v_license_hwid text;
    v_plan_code text;
    v_plan_mode text;
    v_usage_limit integer := 0;
    v_usage_count integer := 0;
    v_plan_cycle text := 'none';
    v_period_start timestamptz;
    v_period_end timestamptz;
    v_reset_date timestamptz;
    v_active_reservations integer := 0;
    v_quota_units integer := 1;
    v_existing_state text;
    v_existing_expires_at timestamptz;
    v_existing_metadata jsonb := '{}'::jsonb;
    v_remaining integer := 0;
begin
    if v_key = '' or v_hwid = '' then
        return jsonb_build_object('success', false, 'message', '라이선스 키 또는 HWID가 비어 있습니다.');
    end if;
    if v_operation_id = '' or length(v_operation_id) > 160 then
        return jsonb_build_object('success', false, 'code', 'INVALID_OPERATION_ID', 'message', '발행 작업 ID가 올바르지 않습니다.');
    end if;

    v_status := public.check_license_status(v_key, v_hwid);
    if coalesce((v_status ->> 'success')::boolean, false) is not true then
        -- An already reserved/committed operation remains retryable after the
        -- plan reaches zero remaining quota. This is the idempotency path.
        select l.id, l.hwid, coalesce(l.plan_code, 'pro'),
               lower(coalesce(nullif(trim(l.license_mode), ''), lp.quota_mode, 'metered')),
               coalesce(nullif(l.usage_limit, 0), lp.quota_limit, 0),
               coalesce(l.usage_count, 0), coalesce(lp.quota_cycle, 'none'), l.reset_date
          into v_license_id, v_license_hwid, v_plan_code, v_plan_mode,
               v_usage_limit, v_usage_count, v_plan_cycle, v_reset_date
          from public.licenses l
          join public.license_plans lp on lp.plan_code = coalesce(l.plan_code, 'pro')
         where l.license_key = v_key;

        if v_license_id is not null and trim(coalesce(v_license_hwid, '')) = v_hwid then
            select state, reservation_expires_at, metadata
              into v_existing_state, v_existing_expires_at, v_existing_metadata
              from public.license_usage_operations
             where license_id = v_license_id
               and operation_id = v_operation_id;

            if v_existing_state = 'committed'
               or (v_existing_state = 'reserved' and (v_existing_expires_at is null or v_existing_expires_at > v_now)) then
                return jsonb_build_object(
                    'success', true,
                    'message', '기존 발행 작업을 재개합니다.',
                    'operation_id', v_operation_id,
                    'state', v_existing_state,
                    'idempotent', true,
                    'plan_code', v_plan_code,
                    'features', coalesce(v_status -> 'features', '{}'::jsonb),
                    'metadata', coalesce(v_existing_metadata, '{}'::jsonb),
                    'remaining', case when v_plan_mode = 'unlimited' then -1 else greatest(v_usage_limit - v_usage_count, 0) end
                );
            end if;
        end if;
        return v_status;
    end if;

    select l.id, l.hwid, coalesce(l.plan_code, 'pro'),
           lower(coalesce(nullif(trim(l.license_mode), ''), lp.quota_mode, 'metered')),
           coalesce(nullif(l.usage_limit, 0), lp.quota_limit, 0),
           coalesce(l.usage_count, 0), coalesce(lp.quota_cycle, 'none'), l.reset_date
      into v_license_id, v_license_hwid, v_plan_code, v_plan_mode,
           v_usage_limit, v_usage_count, v_plan_cycle, v_reset_date
      from public.licenses l
      join public.license_plans lp on lp.plan_code = coalesce(l.plan_code, 'pro')
     where l.license_key = v_key
     for update of l;

    if v_license_id is null or trim(coalesce(v_license_hwid, '')) <> v_hwid then
        return jsonb_build_object('success', false, 'message', '현재 기기에 연결된 라이선스를 찾을 수 없습니다.');
    end if;

    if v_plan_mode = 'unlimited' then
        v_quota_units := 0;
    end if;

    if v_quota_units = 1
       and v_plan_cycle <> 'none'
       and (v_reset_date is null or v_now >= v_reset_date) then
        select period_start, period_end
          into v_period_start, v_period_end
          from public._license_calc_period_bounds(v_plan_cycle, v_now)
         limit 1;

        update public.licenses
           set usage_count = 0,
               reset_date = v_period_end,
               updated_at = v_now
         where id = v_license_id;
        v_usage_count := 0;
        v_reset_date := v_period_end;
    end if;

    update public.license_usage_operations
       set state = 'released',
           released_at = coalesce(released_at, v_now),
           updated_at = v_now
     where license_id = v_license_id
       and state = 'reserved'
       and reservation_expires_at is not null
       and reservation_expires_at <= v_now;

    select state, reservation_expires_at, metadata
      into v_existing_state, v_existing_expires_at, v_existing_metadata
      from public.license_usage_operations
     where license_id = v_license_id
       and operation_id = v_operation_id
     for update;

    if v_existing_state = 'committed' then
        return jsonb_build_object(
            'success', true,
            'message', '이미 확정된 발행 작업입니다.',
            'operation_id', v_operation_id,
            'state', 'committed',
            'idempotent', true,
            'plan_code', v_plan_code,
            'features', coalesce(v_status -> 'features', '{}'::jsonb),
            'metadata', coalesce(v_existing_metadata, '{}'::jsonb),
            'remaining', case when v_quota_units = 0 then -1 else greatest(v_usage_limit - v_usage_count, 0) end
        );
    end if;

    if v_existing_state = 'reserved' and (v_existing_expires_at is null or v_existing_expires_at > v_now) then
        return jsonb_build_object(
            'success', true,
            'message', '이미 예약된 발행 작업입니다.',
            'operation_id', v_operation_id,
            'state', 'reserved',
            'idempotent', true,
            'plan_code', v_plan_code,
            'features', coalesce(v_status -> 'features', '{}'::jsonb),
            'metadata', coalesce(v_existing_metadata, '{}'::jsonb),
            'remaining', case when v_quota_units = 0 then -1 else greatest(v_usage_limit - v_usage_count - 1, 0) end
        );
    end if;

    if v_quota_units = 1 then
        select count(*)::integer
          into v_active_reservations
          from public.license_usage_operations
         where license_id = v_license_id
           and state = 'reserved'
           and (reservation_expires_at is null or reservation_expires_at > v_now);

        if v_usage_count + v_active_reservations >= v_usage_limit then
            return jsonb_build_object(
                'success', false,
                'code', 'QUOTA_EXHAUSTED',
                'message', '라이선스 사용 횟수를 모두 사용했거나 다른 발행 작업이 잔여량을 예약 중입니다.',
                'plan_code', v_plan_code,
                'features', coalesce(v_status -> 'features', '{}'::jsonb),
                'remaining', greatest(v_usage_limit - v_usage_count - v_active_reservations, 0)
            );
        end if;
    end if;

    insert into public.license_usage_operations (
        license_id, operation_id, state, quota_units, quota_period_end,
        reservation_expires_at, metadata, reserved_at, committed_at, released_at, updated_at
    ) values (
        v_license_id, v_operation_id, 'reserved', v_quota_units, v_reset_date,
        v_now + interval '30 minutes', coalesce(p_metadata, '{}'::jsonb),
        v_now, null, null, v_now
    )
    on conflict (license_id, operation_id) do update
       set state = 'reserved',
           quota_units = excluded.quota_units,
           quota_period_end = excluded.quota_period_end,
           reservation_expires_at = excluded.reservation_expires_at,
           metadata = public.license_usage_operations.metadata || excluded.metadata,
           reserved_at = excluded.reserved_at,
           committed_at = null,
           released_at = null,
           updated_at = excluded.updated_at;

    v_remaining := case
        when v_quota_units = 0 then -1
        else greatest(v_usage_limit - v_usage_count - v_active_reservations - 1, 0)
    end;

    return jsonb_build_object(
        'success', true,
        'message', '발행 사용량을 예약했습니다.',
        'operation_id', v_operation_id,
        'state', 'reserved',
        'plan_code', v_plan_code,
        'features', coalesce(v_status -> 'features', '{}'::jsonb),
        'remaining', v_remaining
    );
end;
$$;

drop function if exists public.commit_publish_quota(text, text, text, jsonb);

create or replace function public.commit_publish_quota(
    p_license_key text,
    p_hwid text,
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
    v_key text := trim(coalesce(p_license_key, ''));
    v_hwid text := trim(coalesce(p_hwid, ''));
    v_operation_id text := trim(coalesce(p_operation_id, ''));
    v_license_id uuid;
    v_license_hwid text;
    v_plan_code text;
    v_usage_limit integer := 0;
    v_usage_count integer := 0;
    v_state text;
    v_quota_units integer := 1;
    v_period_end timestamptz;
begin
    select l.id, l.hwid, coalesce(l.plan_code, 'pro'),
           coalesce(nullif(l.usage_limit, 0), lp.quota_limit, 0), coalesce(l.usage_count, 0)
      into v_license_id, v_license_hwid, v_plan_code, v_usage_limit, v_usage_count
      from public.licenses l
      join public.license_plans lp on lp.plan_code = coalesce(l.plan_code, 'pro')
     where l.license_key = v_key
     for update of l;

    if v_license_id is null or trim(coalesce(v_license_hwid, '')) <> v_hwid then
        return jsonb_build_object('success', false, 'message', '현재 기기에 연결된 라이선스를 찾을 수 없습니다.');
    end if;

    select state, quota_units, quota_period_end
      into v_state, v_quota_units, v_period_end
      from public.license_usage_operations
     where license_id = v_license_id and operation_id = v_operation_id
     for update;

    if v_state is null then
        return jsonb_build_object('success', false, 'code', 'QUOTA_RESERVATION_NOT_FOUND', 'message', '발행 사용량 예약을 찾을 수 없습니다.');
    end if;
    if v_state = 'committed' then
        return jsonb_build_object('success', true, 'message', '이미 확정된 발행 작업입니다.', 'operation_id', v_operation_id, 'state', 'committed', 'idempotent', true, 'remaining', case when v_quota_units = 0 then -1 else greatest(v_usage_limit - v_usage_count, 0) end);
    end if;
    if v_state <> 'reserved' then
        return jsonb_build_object('success', false, 'code', 'QUOTA_RESERVATION_RELEASED', 'message', '이미 반환된 발행 사용량 예약입니다.');
    end if;
    if v_period_end is not null and v_now >= v_period_end then
        update public.license_usage_operations set state = 'released', released_at = v_now, updated_at = v_now where license_id = v_license_id and operation_id = v_operation_id;
        return jsonb_build_object('success', false, 'code', 'QUOTA_RESERVATION_EXPIRED', 'message', '사용량 집계 기간이 변경되어 예약이 만료되었습니다. 다시 실행해 주세요.');
    end if;

    if v_quota_units = 1 then
        update public.licenses
           set usage_count = usage_count + 1,
               updated_at = v_now
         where id = v_license_id
         returning usage_count into v_usage_count;
    end if;

    update public.license_usage_operations
       set state = 'committed', committed_at = v_now,
           reservation_expires_at = null,
           metadata = metadata || coalesce(p_metadata, '{}'::jsonb), updated_at = v_now
     where license_id = v_license_id and operation_id = v_operation_id;

    if lower(v_plan_code) = 'test' and v_quota_units = 1 and v_usage_count >= v_usage_limit then
        update public.license_device_states
           set test_exhausted_at = coalesce(test_exhausted_at, v_now), last_seen_at = v_now, updated_at = v_now
         where hwid_hash = encode(digest(convert_to(v_hwid, 'UTF8'), 'sha256'), 'hex');
    end if;

    return jsonb_build_object('success', true, 'message', '발행 사용량을 확정했습니다.', 'operation_id', v_operation_id, 'state', 'committed', 'remaining', case when v_quota_units = 0 then -1 else greatest(v_usage_limit - v_usage_count, 0) end);
end;
$$;

drop function if exists public.release_publish_quota(text, text, text, jsonb);

create or replace function public.release_publish_quota(
    p_license_key text,
    p_hwid text,
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
    v_license_id uuid;
    v_license_hwid text;
    v_state text;
begin
    select id, hwid into v_license_id, v_license_hwid
      from public.licenses
     where license_key = trim(coalesce(p_license_key, ''))
     for update;

    if v_license_id is null or trim(coalesce(v_license_hwid, '')) <> trim(coalesce(p_hwid, '')) then
        return jsonb_build_object('success', false, 'message', '현재 기기에 연결된 라이선스를 찾을 수 없습니다.');
    end if;

    select state into v_state
      from public.license_usage_operations
     where license_id = v_license_id and operation_id = trim(coalesce(p_operation_id, ''))
     for update;

    if v_state is null then
        return jsonb_build_object('success', true, 'message', '반환할 예약이 없습니다.', 'operation_id', trim(coalesce(p_operation_id, '')), 'state', 'released', 'idempotent', true);
    end if;
    if v_state = 'committed' then
        return jsonb_build_object('success', true, 'message', '이미 확정된 발행 작업은 반환하지 않습니다.', 'operation_id', trim(coalesce(p_operation_id, '')), 'state', 'committed', 'idempotent', true);
    end if;

    update public.license_usage_operations
       set state = 'released', released_at = coalesce(released_at, v_now), reservation_expires_at = null,
           metadata = metadata || coalesce(p_metadata, '{}'::jsonb), updated_at = v_now
     where license_id = v_license_id and operation_id = trim(coalesce(p_operation_id, ''));

    return jsonb_build_object('success', true, 'message', '발행 사용량 예약을 반환했습니다.', 'operation_id', trim(coalesce(p_operation_id, '')), 'state', 'released');
end;
$$;

grant execute on function public.reserve_publish_quota(text, text, text, jsonb) to anon, authenticated, service_role;
grant execute on function public.commit_publish_quota(text, text, text, jsonb) to anon, authenticated, service_role;
grant execute on function public.release_publish_quota(text, text, text, jsonb) to anon, authenticated, service_role;
revoke all on function public.reserve_publish_quota(text, text, text, jsonb) from public;
revoke all on function public.commit_publish_quota(text, text, text, jsonb) from public;
revoke all on function public.release_publish_quota(text, text, text, jsonb) from public;

commit;
