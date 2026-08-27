-- ============================================================
-- BlogGenius License Precheck RPC (v3 호환)
-- 대상: Supabase SQL Editor
-- ============================================================
-- 참고:
-- - 최신 권장 스크립트는 sql/supabase_license_v3.sql 입니다.
-- - 이 파일은 check_license_status 함수만 재배포할 때 사용합니다.

begin;

create extension if not exists pgcrypto;

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

commit;
