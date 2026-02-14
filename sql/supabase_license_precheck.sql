-- ============================================================
-- BlogGenius License Precheck RPC (무차감 사전 검증)
-- 대상: Supabase SQL Editor
-- ============================================================
-- 목적:
-- - 실행 전 라이선스 유효성/잔여 횟수만 확인 (차감 없음)
-- - 실제 차감은 기존 check_and_use_license 호출 시점에만 발생

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

    -- free policy
    v_policy_quota integer;
    v_policy_cycle text;
    v_period_end timestamptz;
    v_free_limit integer;
    v_free_count integer;
    v_effective_limit integer;
    v_effective_count integer;
    v_remaining integer;

    -- paid license
    v_license_id uuid;
    v_license_status text;
    v_license_hwid text;
    v_usage_limit integer;
    v_usage_count integer;
    v_license_mode text;
    v_license_expires_at timestamptz;
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

        select usage_limit, usage_count, period_end
          into v_free_limit, v_free_count, v_period_end
          from public.free_license_usages
         where hwid_hash = v_hwid_hash
         limit 1;

        v_effective_limit := coalesce(v_free_limit, v_policy_quota);
        if v_effective_limit <> v_policy_quota then
            v_effective_limit := v_policy_quota;
        end if;

        v_effective_count := coalesce(v_free_count, 0);
        if v_policy_cycle <> 'none' and (v_period_end is null or v_now >= v_period_end) then
            v_effective_count := 0;
        end if;

        v_remaining := greatest(v_effective_limit - v_effective_count, 0);

        if v_remaining <= 0 then
            return jsonb_build_object(
                'success', false,
                'message', format('무료 사용 횟수를 모두 사용했습니다. (잔여: 0/%s)', v_effective_limit),
                'remaining', 0
            );
        end if;

        return jsonb_build_object(
            'success', true,
            'message', '무료 라이선스 사전 검증 통과',
            'remaining', v_remaining
        );
    end if;

    -- ========================================================
    -- B) 유료 라이선스 경로
    -- ========================================================
    select id, status, hwid, coalesce(usage_limit, 0), coalesce(usage_count, 0),
           coalesce(license_mode, 'metered'), expires_at
      into v_license_id, v_license_status, v_license_hwid, v_usage_limit, v_usage_count,
           v_license_mode, v_license_expires_at
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

    -- 이미 바인딩된 HWID가 있으면 사전 검증에서도 동일하게 체크
    if v_license_hwid is not null and trim(v_license_hwid) <> '' and trim(v_license_hwid) <> v_hwid then
        return jsonb_build_object('success', false, 'message', '다른 기기에 바인딩된 라이선스입니다.');
    end if;

    if lower(coalesce(v_license_mode, 'metered')) = 'unlimited' then
        return jsonb_build_object(
            'success', true,
            'message', '무한 라이선스 사전 검증 통과',
            'remaining', -1
        );
    end if;

    if v_usage_limit <= 0 then
        return jsonb_build_object('success', false, 'message', '사용 가능 횟수가 0으로 설정된 라이선스입니다.', 'remaining', 0);
    end if;

    v_remaining := greatest(v_usage_limit - v_usage_count, 0);
    if v_remaining <= 0 then
        return jsonb_build_object('success', false, 'message', '라이선스 사용 횟수를 모두 사용했습니다.', 'remaining', 0);
    end if;

    return jsonb_build_object(
        'success', true,
        'message', '라이선스 사전 검증 통과',
        'remaining', v_remaining
    );
end;
$$;

grant execute on function public.check_license_status(text, text) to anon, authenticated, service_role;
revoke all on function public.check_license_status(text, text) from public;

commit;
