-- ============================================================
-- BlogGenius: fix get_smart_usage_status capability scoping
-- Symptom: monthly used count was identical (global total) for all
-- three smart capabilities, e.g. 17/17/17 instead of 12/3/2.
--
-- Root cause: in the items subquery the unqualified `capability`
-- reference binds to the inner table `s.capability` (innermost scope
-- wins), turning `s.capability = capability` into a tautology.
-- The outer unnest column is renamed to `cap_name` and referenced
-- as `usage_rows.cap_name` so the per-capability filter applies.
--
-- reserve/commit/release are unaffected: they compare against
-- declared `v_capability` variables, which cannot collide.
-- Target: development first. Production needs a separate approval.
-- ============================================================

begin;

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
        'capability', cap_name,
        'limit', limit_value,
        'used', used_count,
        'remaining', greatest(limit_value - used_count, 0),
        'request_limit', request_limit
    ) order by cap_name), '[]'::jsonb)
      into v_items
      from (
        select cap_name,
               greatest(coalesce((v_limits ->> cap_name)::integer, 0), 0) as limit_value,
               greatest(coalesce((v_rules ->> (cap_name || '_requests_per_session'))::integer, 1), 1) as request_limit,
               (
                   select count(*)::integer
                     from public.license_capability_usage_sessions s
                    where s.license_id = v_license_id
                      and s.capability = capabilities.cap_name
                      and s.period_start = v_period_start
                      and s.request_count > 0
               ) as used_count
          from unnest(array['content_idea', 'keyword_discovery', 'title_recommendation']) as capabilities(cap_name)
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

commit;
