begin;

select plan(1);

select lives_ok($test$
do $body$
declare
    v_license_id uuid;
    v_result jsonb;
    v_usage_count integer;
begin
    insert into public.licenses (
        license_key,
        plan_code,
        status,
        hwid,
        usage_limit,
        usage_count,
        reset_date,
        license_mode,
        note
    ) values (
        'LOCAL-ULTRA-USAGE-CONTRACT',
        'ultra',
        'active',
        'local-ultra-hwid',
        0,
        0,
        timezone('utc', now()) + interval '1 month',
        'unlimited',
        'local unlimited usage contract test'
    )
    returning id into v_license_id;

    v_result := public.reserve_publish_quota(
        'LOCAL-ULTRA-USAGE-CONTRACT',
        'local-ultra-hwid',
        'local-ultra-operation-1',
        '{}'::jsonb
    );
    if coalesce((v_result ->> 'success')::boolean, false) is not true
       or (v_result ->> 'remaining')::integer <> -1 then
        raise exception 'unlimited reservation contract failed: %', v_result;
    end if;

    v_result := public.commit_publish_quota(
        'LOCAL-ULTRA-USAGE-CONTRACT',
        'local-ultra-hwid',
        'local-ultra-operation-1',
        '{}'::jsonb
    );
    select usage_count into v_usage_count from public.licenses where id = v_license_id;
    if coalesce((v_result ->> 'success')::boolean, false) is not true
       or (v_result ->> 'remaining')::integer <> -1
       or v_usage_count <> 1 then
        raise exception 'unlimited commit did not count activity: result=%, count=%', v_result, v_usage_count;
    end if;

    perform public.commit_publish_quota(
        'LOCAL-ULTRA-USAGE-CONTRACT',
        'local-ultra-hwid',
        'local-ultra-operation-1',
        '{}'::jsonb
    );
    select usage_count into v_usage_count from public.licenses where id = v_license_id;
    if v_usage_count <> 1 then
        raise exception 'idempotent unlimited commit counted twice: %', v_usage_count;
    end if;

    update public.licenses
       set usage_count = 9,
           reset_date = timezone('utc', now()) - interval '1 second'
     where id = v_license_id;
    v_result := public.check_license_status('LOCAL-ULTRA-USAGE-CONTRACT', 'local-ultra-hwid');
    if (v_result ->> 'usage_count')::integer <> 0
       or (v_result ->> 'remaining')::integer <> -1 then
        raise exception 'expired unlimited cycle was not reported as reset: %', v_result;
    end if;
end;
$body$;
$test$, 'Ultra counts successful activity without enforcing a quota');

select * from finish();

rollback;
