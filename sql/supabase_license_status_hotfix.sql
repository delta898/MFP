-- ============================================================
-- BlogGenius License status hotfix
-- 대상: Supabase SQL Editor
-- ============================================================
-- 목적:
-- - 운영 데이터와 license_plans row는 건드리지 않는다.
-- - check_license_status 실패 응답에도 UI read model에 필요한
--   usage_limit, usage_count, features, created_at, email을 포함한다.
-- - 특히 test 플랜의 test_exhausted_at 분기에서 0/0회로 표시되는
--   문제를 막는다.

begin;

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
        'usage_limit', greatest(v_effective_limit, 0),
        'usage_count', greatest(v_effective_count, 0),
        'remaining', v_remaining
    );
end;
$$;

grant execute on function public.check_license_status(text, text) to anon, authenticated, service_role;
revoke all on function public.check_license_status(text, text) from public;

commit;
