-- ============================================================
-- Track successful publish activity for unlimited plans
-- ============================================================
-- usage_count means successful content operations in the current quota cycle.
-- quota_units and quota_mode remain responsible for enforcement. Ultra therefore
-- increments usage_count but continues to return remaining=-1 and is never blocked.

begin;

create or replace function public.track_unlimited_license_usage_count()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
    if new.state = 'committed'
       and new.quota_units = 0
       and old.state is distinct from 'committed' then
        update public.licenses
           set usage_count = coalesce(usage_count, 0) + 1,
               updated_at = timezone('utc', now())
         where id = new.license_id;
    end if;
    return new;
end;
$$;

revoke all on function public.track_unlimited_license_usage_count() from public, anon, authenticated;

drop trigger if exists trg_track_unlimited_license_usage_count
    on public.license_usage_operations;

create trigger trg_track_unlimited_license_usage_count
after update of state on public.license_usage_operations
for each row
execute function public.track_unlimited_license_usage_count();

create or replace function public.effective_license_usage_count(
    p_usage_count integer,
    p_quota_cycle text,
    p_reset_date timestamptz,
    p_now timestamptz
)
returns integer
language sql
immutable
set search_path = public, extensions
as $$
    select case
        when coalesce(p_quota_cycle, 'none') <> 'none'
         and (p_reset_date is null or p_now >= p_reset_date)
            then 0
        else greatest(coalesce(p_usage_count, 0), 0)
    end;
$$;

revoke all on function public.effective_license_usage_count(integer, text, timestamptz, timestamptz)
    from public, anon, authenticated;

-- Keep the existing public contract and correct the unlimited early-return path.
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
        return jsonb_build_object('success', false, 'message', '비활성화된 라이선스입니다.', 'plan_code', v_plan_code, 'email', nullif(v_license_email, ''));
    end if;
    if v_license_expires_at is not null and v_now >= v_license_expires_at then
        return jsonb_build_object('success', false, 'message', '만료된 라이선스입니다.', 'plan_code', v_plan_code, 'email', nullif(v_license_email, ''));
    end if;
    if v_license_hwid is not null and trim(v_license_hwid) <> '' and trim(v_license_hwid) <> v_hwid then
        return jsonb_build_object('success', false, 'message', '다른 기기에 등록된 라이선스입니다.', 'plan_code', v_plan_code, 'email', nullif(v_license_email, ''));
    end if;

    select display_name, status, quota_mode, quota_limit, quota_cycle, features
      into v_plan_display_name, v_plan_status, v_plan_mode, v_plan_limit, v_plan_cycle, v_plan_features
      from public.license_plans
     where plan_code = v_plan_code
     limit 1;

    if v_plan_status is distinct from 'active' then
        return jsonb_build_object('success', false, 'message', '비활성화된 플랜입니다.', 'plan_code', v_plan_code,
            'plan_display_name', coalesce(v_plan_display_name, v_plan_code), 'email', nullif(v_license_email, ''));
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

    v_effective_count := public.effective_license_usage_count(
        v_usage_count,
        v_plan_cycle,
        v_license_reset_date,
        v_now
    );

    if lower(v_plan_code) = 'test' then
        v_hwid_hash := encode(digest(convert_to(v_hwid, 'UTF8'), 'sha256'), 'hex');
        select non_test_used, test_exhausted_at
          into v_non_test_used, v_test_exhausted_at
          from public.license_device_states
         where hwid_hash = v_hwid_hash
         limit 1;

        if coalesce(v_non_test_used, false) or v_test_exhausted_at is not null then
            return jsonb_build_object(
                'success', false,
                'message', case when coalesce(v_non_test_used, false)
                    then 'test 플랜은 1회성입니다. 다른 플랜 사용 후에는 재사용할 수 없습니다.'
                    else 'test 플랜 1회 사용이 종료되었습니다. 계속 이용하려면 license upgrade를 진행해 주세요.' end,
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
            'usage_count', v_effective_count,
            'remaining', -1
        );
    end if;

    if v_usage_limit <= 0 then
        v_usage_limit := coalesce(v_plan_limit, 0);
    end if;
    v_effective_limit := v_usage_limit;
    if v_usage_limit <= 0 then
        return jsonb_build_object(
            'success', false, 'message', '사용 가능 횟수가 0으로 설정된 라이선스입니다.',
            'plan_code', v_plan_code, 'plan_display_name', coalesce(v_plan_display_name, v_plan_code),
            'email', nullif(v_license_email, ''), 'created_at', v_license_created_at,
            'quota_cycle', coalesce(v_plan_cycle, 'none'), 'current_period_start_at', v_period_start_at,
            'next_reset_at', v_next_reset_at, 'usage_limit', greatest(v_effective_limit, 0),
            'usage_count', greatest(v_effective_count, 0), 'remaining', 0
        );
    end if;

    v_remaining := greatest(v_usage_limit - v_effective_count, 0);
    if v_remaining <= 0 then
        return jsonb_build_object(
            'success', false, 'message', '라이선스 사용 횟수를 모두 사용했습니다.',
            'plan_code', v_plan_code, 'plan_display_name', coalesce(v_plan_display_name, v_plan_code),
            'features', coalesce(v_plan_features, '{}'::jsonb), 'email', nullif(v_license_email, ''),
            'created_at', v_license_created_at, 'quota_cycle', coalesce(v_plan_cycle, 'none'),
            'current_period_start_at', v_period_start_at, 'next_reset_at', v_next_reset_at,
            'usage_limit', greatest(v_effective_limit, 0), 'usage_count', greatest(v_effective_count, 0),
            'remaining', 0
        );
    end if;

    return jsonb_build_object(
        'success', true, 'message', format('%s 플랜 사전 검증 통과', v_plan_code),
        'plan_code', v_plan_code, 'plan_display_name', coalesce(v_plan_display_name, v_plan_code),
        'features', coalesce(v_plan_features, '{}'::jsonb), 'email', nullif(v_license_email, ''),
        'created_at', v_license_created_at, 'quota_cycle', coalesce(v_plan_cycle, 'none'),
        'current_period_start_at', v_period_start_at, 'next_reset_at', v_next_reset_at,
        'usage_limit', greatest(v_effective_limit, 0), 'usage_count', greatest(v_effective_count, 0),
        'remaining', v_remaining
    );
end;
$$;

grant execute on function public.check_license_status(text, text) to anon, authenticated, service_role;
revoke all on function public.check_license_status(text, text) from public;

commit;
