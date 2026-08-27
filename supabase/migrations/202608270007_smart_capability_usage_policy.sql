-- ============================================================
-- BlogGenius: smart capability usage policy (운영용, 재실행 가능)
-- 대상: Supabase SQL Editor
-- 전제: supabase_smart_capability_usage_v1.sql 적용 완료
--
-- 이 파일은 테이블/RPC를 만들지 않고 license_plans의 runtime 정책만 갱신한다.
-- 앱 재배포 없이 월 제공량과 세션 규칙을 변경할 때 이 파일을 수정·실행한다.
-- ============================================================

begin;

do $$
declare
    v_missing_plans text[];
begin
    select array_agg(expected.plan_code order by expected.plan_code)
      into v_missing_plans
      from unnest(array['test', 'free', 'pro', 'ultra']) as expected(plan_code)
     where not exists (
         select 1
           from public.license_plans lp
          where lower(trim(lp.plan_code)) = expected.plan_code
     );

    if coalesce(array_length(v_missing_plans, 1), 0) > 0 then
        raise exception 'Missing required license plan rows: %', array_to_string(v_missing_plans, ', ');
    end if;
end;
$$;

update public.license_plans
   set smart_usage_limits = jsonb_build_object(
           'content_idea', case lower(trim(plan_code)) when 'test' then 40 when 'free' then 20 when 'pro' then 80 when 'ultra' then 300 end,
           'keyword_discovery', case lower(trim(plan_code)) when 'test' then 40 when 'free' then 20 when 'pro' then 80 when 'ultra' then 300 end,
           'title_recommendation', case lower(trim(plan_code)) when 'test' then 40 when 'free' then 20 when 'pro' then 80 when 'ultra' then 300 end
       ),
       smart_usage_rules = jsonb_build_object(
           'session_ttl_seconds', 900,
           'content_idea_requests_per_session', 2,
           'keyword_discovery_requests_per_session', 5,
           'title_recommendation_requests_per_session', 2
       ),
       updated_at = timezone('utc', now())
 where lower(trim(plan_code)) in ('test', 'free', 'pro', 'ultra');

commit;

-- 적용 결과 확인. 세 capability의 월 제공량은 플랜 안에서 동일해야 한다.
select
    plan_code,
    smart_usage_limits,
    smart_usage_rules,
    updated_at
from public.license_plans
where lower(trim(plan_code)) in ('test', 'free', 'pro', 'ultra')
order by case lower(trim(plan_code))
    when 'test' then 1
    when 'free' then 2
    when 'pro' then 3
    when 'ultra' then 4
    else 5
end;
