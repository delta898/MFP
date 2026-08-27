-- Apply only after the corpus/operations SQL, Edge Function deployment and Vault secret setup.
-- Required Vault names:
--   serpapi_collection_project_url
--   serpapi_collection_collector_secret

begin;

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create or replace function public.invoke_serpapi_collection_slot(
    p_lane text,
    p_slot text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
    v_project_url text;
    v_collector_secret text;
    v_lane text := trim(coalesce(p_lane, ''));
    v_slot text := trim(coalesce(p_slot, ''));
    v_operation_id text;
    v_request_id bigint;
begin
    if v_lane not in (
        'headlines_kr', 'headlines_global', 'technology', 'business', 'science',
        'culture_lifestyle', 'travel_local'
    ) or v_slot !~ '^[a-z0-9_-]{1,40}$' then
        raise exception 'invalid serpapi collection cron slot';
    end if;
    select decrypted_secret into v_project_url
    from vault.decrypted_secrets where name = 'serpapi_collection_project_url';
    select decrypted_secret into v_collector_secret
    from vault.decrypted_secrets where name = 'serpapi_collection_collector_secret';
    if nullif(trim(v_project_url), '') is null or nullif(trim(v_collector_secret), '') is null then
        raise exception 'serpapi collection cron secrets are unavailable';
    end if;

    v_operation_id := 'kco_scheduled_' ||
        to_char(clock_timestamp() at time zone 'Asia/Seoul', 'YYYYMMDD') || '_' ||
        v_slot || '_' || v_lane;
    select net.http_post(
        url := rtrim(v_project_url, '/') || '/functions/v1/serpapi-news-collector',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-collector-secret', v_collector_secret,
            'x-collector-operation-id', v_operation_id
        ),
        body := jsonb_build_object(
            'schema_version', 1,
            'lane', v_lane,
            'trigger', 'scheduled'
        )
    ) into v_request_id;
    return v_request_id;
end;
$$;

revoke all on function public.invoke_serpapi_collection_slot(text, text)
    from public, anon, authenticated;

create or replace function public.invoke_serpapi_collection_focused_slot(p_slot text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
    v_day integer := (clock_timestamp() at time zone 'Asia/Seoul')::date - date '2026-01-01';
    v_lane text;
begin
    v_lane := case mod(v_day, 5)
        when 0 then 'technology'
        when 1 then 'business'
        when 2 then 'science'
        when 3 then 'culture_lifestyle'
        else 'travel_local'
    end;
    return public.invoke_serpapi_collection_slot(v_lane, p_slot);
end;
$$;

revoke all on function public.invoke_serpapi_collection_focused_slot(text)
    from public, anon, authenticated;

do $$
declare
    v_job record;
begin
    for v_job in
        select jobid from cron.job where jobname in (
            'bloggenius-serpapi-headlines-kr-0020-kst',
            'bloggenius-serpapi-headlines-global-0620-kst',
            'bloggenius-serpapi-headlines-kr-0920-kst',
            'bloggenius-serpapi-headlines-global-1520-kst',
            'bloggenius-serpapi-focused-2120-kst',
            'bloggenius-serpapi-cleanup-0340-kst'
        )
    loop
        perform cron.unschedule(v_job.jobid);
    end loop;
end;
$$;

select cron.schedule(
    'bloggenius-serpapi-headlines-kr-0020-kst', '20 15 * * *',
    $$select public.invoke_serpapi_collection_slot('headlines_kr', '0020-kst')$$
);
select cron.schedule(
    'bloggenius-serpapi-headlines-global-0620-kst', '20 21 * * *',
    $$select public.invoke_serpapi_collection_slot('headlines_global', '0620-kst')$$
);
select cron.schedule(
    'bloggenius-serpapi-headlines-kr-0920-kst', '20 0 * * *',
    $$select public.invoke_serpapi_collection_slot('headlines_kr', '0920-kst')$$
);
select cron.schedule(
    'bloggenius-serpapi-headlines-global-1520-kst', '20 6 * * *',
    $$select public.invoke_serpapi_collection_slot('headlines_global', '1520-kst')$$
);
select cron.schedule(
    'bloggenius-serpapi-focused-2120-kst', '20 12 * * *',
    $$select public.invoke_serpapi_collection_focused_slot('2120-kst')$$
);
select cron.schedule(
    'bloggenius-serpapi-cleanup-0340-kst', '40 18 * * *',
    $$select public.cleanup_knowledge_observation_corpus(); select public.cleanup_knowledge_collection_operations()$$
);

commit;

