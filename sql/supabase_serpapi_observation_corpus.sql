begin;

create table if not exists public.knowledge_observations (
    provider_id text not null,
    observation_id text not null,
    kind text not null,
    source text not null,
    lane text not null,
    locale text not null,
    country text not null,
    title text not null,
    summary text not null default '',
    canonical_url text not null,
    publisher text not null,
    published_at timestamptz not null,
    first_observed_at timestamptz not null,
    last_observed_at timestamptz not null,
    expires_at timestamptz not null,
    observation_count integer not null default 1,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (provider_id, observation_id),
    unique (provider_id, canonical_url),
    constraint knowledge_observations_provider_check
        check (length(provider_id) between 1 and 120),
    constraint knowledge_observations_id_check
        check (observation_id ~ '^ko_[A-Za-z0-9_-]{16,176}$'),
    constraint knowledge_observations_kind_check
        check (kind = 'news'),
    constraint knowledge_observations_source_check
        check (length(source) between 1 and 120),
    constraint knowledge_observations_lane_check
        check (lane in (
            'headlines_kr', 'headlines_global', 'technology', 'business', 'science',
            'culture_lifestyle', 'travel_local'
        )),
    constraint knowledge_observations_locale_check
        check (locale in ('ko-KR', 'en-US')),
    constraint knowledge_observations_country_check
        check (country in ('KR', 'US')),
    constraint knowledge_observations_content_check
        check (
            length(title) between 1 and 300
            and length(summary) <= 1000
            and length(publisher) between 1 and 160
        ),
    constraint knowledge_observations_url_check
        check (
            length(canonical_url) between 10 and 2048
            and canonical_url ~ '^https://[^[:space:]]+$'
            and position('@' in split_part(canonical_url, '/', 3)) = 0
        ),
    constraint knowledge_observations_time_check
        check (
            first_observed_at <= last_observed_at
            and published_at <= last_observed_at + interval '10 minutes'
            and published_at >= last_observed_at - interval '14 days'
            and expires_at > last_observed_at
            and expires_at <= last_observed_at + interval '14 days'
        ),
    constraint knowledge_observations_count_check
        check (observation_count >= 1)
);

create index if not exists knowledge_observations_eligibility_idx
    on public.knowledge_observations (kind, expires_at, last_observed_at desc);

create index if not exists knowledge_observations_lane_idx
    on public.knowledge_observations (
        provider_id, lane, locale, country, expires_at, last_observed_at desc
    );

create index if not exists knowledge_observations_publisher_idx
    on public.knowledge_observations (provider_id, publisher, last_observed_at desc);

alter table public.knowledge_observations enable row level security;
revoke all on table public.knowledge_observations from public, anon, authenticated;
grant all on table public.knowledge_observations to service_role;

create table if not exists public.knowledge_collection_runs (
    run_id text primary key,
    provider_id text not null,
    lane text not null,
    trigger text not null,
    status text not null,
    attempted_upstream boolean not null,
    fetched_count integer not null default 0,
    accepted_count integer not null default 0,
    inserted_count integer not null default 0,
    refreshed_count integer not null default 0,
    rejected_count integer not null default 0,
    error_code text,
    started_at timestamptz not null,
    completed_at timestamptz not null,
    created_at timestamptz not null default now(),
    constraint knowledge_collection_runs_id_check
        check (run_id ~ '^kcr_[A-Za-z0-9_-]{1,176}$'),
    constraint knowledge_collection_runs_provider_check
        check (length(provider_id) between 1 and 120),
    constraint knowledge_collection_runs_lane_check
        check (lane in (
            'headlines_kr', 'headlines_global', 'technology', 'business', 'science',
            'culture_lifestyle', 'travel_local'
        )),
    constraint knowledge_collection_runs_trigger_check
        check (trigger in ('scheduled', 'manual')),
    constraint knowledge_collection_runs_status_check
        check (status in ('succeeded', 'failed', 'skipped')),
    constraint knowledge_collection_runs_counts_check
        check (
            fetched_count >= 0 and accepted_count >= 0 and inserted_count >= 0
            and refreshed_count >= 0 and rejected_count >= 0
            and accepted_count + rejected_count <= fetched_count
            and inserted_count + refreshed_count <= accepted_count
            and (
                attempted_upstream
                or fetched_count + accepted_count + inserted_count + refreshed_count + rejected_count = 0
            )
        ),
    constraint knowledge_collection_runs_error_check
        check (
            (error_code is null or error_code ~ '^[A-Z][A-Z0-9_]{0,79}$')
            and (status <> 'succeeded' or error_code is null)
            and (status <> 'failed' or error_code is not null)
        ),
    constraint knowledge_collection_runs_time_check
        check (completed_at >= started_at)
);

create index if not exists knowledge_collection_runs_provider_started_idx
    on public.knowledge_collection_runs (provider_id, started_at desc);

create index if not exists knowledge_collection_runs_status_started_idx
    on public.knowledge_collection_runs (status, started_at desc);

alter table public.knowledge_collection_runs enable row level security;
revoke all on table public.knowledge_collection_runs from public, anon, authenticated;
grant all on table public.knowledge_collection_runs to service_role;

create or replace function public.upsert_knowledge_observations(
    p_provider_id text,
    p_observations jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_provider_id text := trim(coalesce(p_provider_id, ''));
    v_input_count integer;
    v_distinct_ids integer;
    v_distinct_urls integer;
    v_inserted integer := 0;
    v_refreshed integer := 0;
begin
    if length(v_provider_id) < 1 or length(v_provider_id) > 120 then
        raise exception 'invalid observation provider';
    end if;
    if p_observations is null or jsonb_typeof(p_observations) <> 'array' then
        raise exception 'observations must be an array';
    end if;

    v_input_count := jsonb_array_length(p_observations);
    if v_input_count < 1 or v_input_count > 50 then
        raise exception 'observations must contain between 1 and 50 items';
    end if;
    if exists (
        select 1
        from jsonb_array_elements(p_observations) as entry(value)
        where jsonb_typeof(entry.value) <> 'object'
    ) then
        raise exception 'observation item must be an object';
    end if;
    if exists (
        select 1
        from jsonb_array_elements(p_observations) as entry(value)
        cross join lateral jsonb_object_keys(entry.value) as item_key(key)
        where item_key.key not in (
            'schema_version', 'observation_id', 'kind', 'provider_id', 'source', 'lane',
            'locale', 'country', 'title', 'summary', 'url', 'publisher', 'published_at',
            'observed_at', 'expires_at'
        )
    ) then
        raise exception 'observation contains an unsupported field';
    end if;
    if exists (
        select 1
        from jsonb_array_elements(p_observations) as entry(value)
        where entry.value->>'provider_id' is distinct from v_provider_id
           or coalesce((entry.value->>'schema_version')::integer, 0) <> 1
    ) then
        raise exception 'observation provider or schema does not match';
    end if;

    select
        count(*),
        count(distinct entry.value->>'observation_id'),
        count(distinct entry.value->>'url')
    into v_input_count, v_distinct_ids, v_distinct_urls
    from jsonb_array_elements(p_observations) as entry(value);
    if v_distinct_ids <> v_input_count or v_distinct_urls <> v_input_count then
        raise exception 'observation batch contains duplicate identity';
    end if;

    with input as materialized (
        select
            schema_version,
            observation_id,
            kind,
            provider_id,
            source,
            lane,
            locale,
            upper(country) as country,
            title,
            coalesce(summary, '') as summary,
            url as canonical_url,
            publisher,
            published_at,
            observed_at,
            expires_at
        from jsonb_to_recordset(p_observations) as item(
            schema_version integer,
            observation_id text,
            kind text,
            provider_id text,
            source text,
            lane text,
            locale text,
            country text,
            title text,
            summary text,
            url text,
            publisher text,
            published_at timestamptz,
            observed_at timestamptz,
            expires_at timestamptz
        )
    ),
    inserted as (
        insert into public.knowledge_observations (
            provider_id, observation_id, kind, source, lane, locale, country, title, summary,
            canonical_url, publisher, published_at, first_observed_at, last_observed_at,
            expires_at, observation_count, created_at, updated_at
        )
        select
            provider_id, observation_id, kind, source, lane, locale, country, title, summary,
            canonical_url, publisher, published_at, observed_at, observed_at,
            expires_at, 1, clock_timestamp(), clock_timestamp()
        from input
        on conflict (provider_id, observation_id) do nothing
        returning provider_id, observation_id
    ),
    refreshed as (
        update public.knowledge_observations as existing
        set
            source = case when input.observed_at >= existing.last_observed_at then input.source else existing.source end,
            lane = case when input.observed_at >= existing.last_observed_at then input.lane else existing.lane end,
            locale = case when input.observed_at >= existing.last_observed_at then input.locale else existing.locale end,
            country = case when input.observed_at >= existing.last_observed_at then input.country else existing.country end,
            title = case when input.observed_at >= existing.last_observed_at then input.title else existing.title end,
            summary = case when input.observed_at >= existing.last_observed_at then input.summary else existing.summary end,
            publisher = case when input.observed_at >= existing.last_observed_at then input.publisher else existing.publisher end,
            published_at = case when input.observed_at >= existing.last_observed_at then input.published_at else existing.published_at end,
            first_observed_at = least(existing.first_observed_at, input.observed_at),
            last_observed_at = greatest(existing.last_observed_at, input.observed_at),
            expires_at = greatest(existing.expires_at, input.expires_at),
            observation_count = existing.observation_count + 1,
            updated_at = clock_timestamp()
        from input
        where existing.provider_id = input.provider_id
          and existing.observation_id = input.observation_id
          and not exists (
              select 1 from inserted
              where inserted.provider_id = input.provider_id
                and inserted.observation_id = input.observation_id
          )
        returning existing.provider_id, existing.observation_id
    )
    select
        (select count(*) from inserted),
        (select count(*) from refreshed)
    into v_inserted, v_refreshed;

    return jsonb_build_object(
        'accepted_count', v_input_count,
        'inserted_count', v_inserted,
        'refreshed_count', v_refreshed
    );
end;
$$;

revoke all on function public.upsert_knowledge_observations(text, jsonb)
    from public, anon, authenticated;
grant execute on function public.upsert_knowledge_observations(text, jsonb)
    to service_role;

create or replace function public.record_knowledge_collection_run(p_run jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_unknown_field boolean;
    v_error_code text := nullif(trim(p_run->>'error_code'), '');
begin
    if p_run is null or jsonb_typeof(p_run) <> 'object' then
        raise exception 'collection run must be an object';
    end if;
    select exists (
        select 1
        from jsonb_object_keys(p_run) as item_key(key)
        where item_key.key not in (
            'schema_version', 'run_id', 'provider_id', 'lane', 'trigger', 'status',
            'attempted_upstream', 'fetched_count', 'accepted_count', 'inserted_count',
            'refreshed_count', 'rejected_count', 'error_code', 'started_at', 'completed_at'
        )
    ) into v_unknown_field;
    if v_unknown_field then
        raise exception 'collection run contains an unsupported field';
    end if;
    if coalesce((p_run->>'schema_version')::integer, 0) <> 1 then
        raise exception 'collection run schema does not match';
    end if;

    insert into public.knowledge_collection_runs (
        run_id, provider_id, lane, trigger, status, attempted_upstream,
        fetched_count, accepted_count, inserted_count, refreshed_count, rejected_count,
        error_code, started_at, completed_at
    ) values (
        p_run->>'run_id',
        p_run->>'provider_id',
        p_run->>'lane',
        p_run->>'trigger',
        p_run->>'status',
        (p_run->>'attempted_upstream')::boolean,
        (p_run->>'fetched_count')::integer,
        (p_run->>'accepted_count')::integer,
        (p_run->>'inserted_count')::integer,
        (p_run->>'refreshed_count')::integer,
        (p_run->>'rejected_count')::integer,
        v_error_code,
        (p_run->>'started_at')::timestamptz,
        (p_run->>'completed_at')::timestamptz
    );

    return jsonb_build_object('recorded', true, 'run_id', p_run->>'run_id');
end;
$$;

revoke all on function public.record_knowledge_collection_run(jsonb)
    from public, anon, authenticated;
grant execute on function public.record_knowledge_collection_run(jsonb)
    to service_role;

create or replace function public.read_knowledge_observations(
    p_provider_id text,
    p_kind text default 'news',
    p_lanes text[] default null,
    p_locales text[] default null,
    p_countries text[] default null,
    p_exclude_ids text[] default '{}',
    p_limit integer default 20
)
returns table (
    observation_id text,
    kind text,
    provider_id text,
    source text,
    lane text,
    locale text,
    country text,
    title text,
    summary text,
    url text,
    publisher text,
    published_at timestamptz,
    observed_at timestamptz,
    expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_limit integer := greatest(1, least(coalesce(p_limit, 20), 50));
begin
    if p_provider_id is null or length(trim(p_provider_id)) < 1 or length(trim(p_provider_id)) > 120 then
        raise exception 'invalid observation provider';
    end if;
    if p_kind <> 'news' then
        raise exception 'invalid observation kind';
    end if;
    if cardinality(coalesce(p_lanes, '{}')) > 7
       or cardinality(coalesce(p_locales, '{}')) > 2
       or cardinality(coalesce(p_countries, '{}')) > 2
       or cardinality(coalesce(p_exclude_ids, '{}')) > 100 then
        raise exception 'observation read bounds exceeded';
    end if;
    if exists (
        select 1 from unnest(coalesce(p_lanes, '{}')) as lane_value(value)
        where lane_value.value not in (
            'headlines_kr', 'headlines_global', 'technology', 'business', 'science',
            'culture_lifestyle', 'travel_local'
        )
    ) or exists (
        select 1 from unnest(coalesce(p_locales, '{}')) as locale_value(value)
        where locale_value.value not in ('ko-KR', 'en-US')
    ) or exists (
        select 1 from unnest(coalesce(p_countries, '{}')) as country_value(value)
        where country_value.value not in ('KR', 'US')
    ) or exists (
        select 1 from unnest(coalesce(p_exclude_ids, '{}')) as exclude_value(value)
        where length(exclude_value.value) < 1 or length(exclude_value.value) > 180
    ) then
        raise exception 'observation read filter invalid';
    end if;

    return query
    select
        item.observation_id,
        item.kind,
        item.provider_id,
        item.source,
        item.lane,
        item.locale,
        item.country,
        item.title,
        item.summary,
        item.canonical_url as url,
        item.publisher,
        item.published_at,
        item.last_observed_at as observed_at,
        item.expires_at
    from public.knowledge_observations as item
    where item.provider_id = trim(p_provider_id)
      and item.kind = p_kind
      and item.expires_at > clock_timestamp()
      and (cardinality(coalesce(p_lanes, '{}')) = 0 or item.lane = any(p_lanes))
      and (cardinality(coalesce(p_locales, '{}')) = 0 or item.locale = any(p_locales))
      and (cardinality(coalesce(p_countries, '{}')) = 0 or item.country = any(p_countries))
      and not (item.observation_id = any(coalesce(p_exclude_ids, '{}')))
    order by item.last_observed_at desc, item.observation_id
    limit v_limit;
end;
$$;

revoke all on function public.read_knowledge_observations(
    text, text, text[], text[], text[], text[], integer
) from public, anon, authenticated;
grant execute on function public.read_knowledge_observations(
    text, text, text[], text[], text[], text[], integer
) to service_role;

create or replace function public.cleanup_knowledge_observation_corpus(
    p_observation_grace_hours integer default 48,
    p_run_retention_days integer default 35
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_now timestamptz := clock_timestamp();
    v_grace_hours integer := greatest(0, least(coalesce(p_observation_grace_hours, 48), 168));
    v_run_days integer := greatest(7, least(coalesce(p_run_retention_days, 35), 365));
    v_observations_deleted integer := 0;
    v_runs_deleted integer := 0;
begin
    delete from public.knowledge_observations
    where expires_at < v_now - make_interval(hours => v_grace_hours);
    get diagnostics v_observations_deleted = row_count;

    delete from public.knowledge_collection_runs
    where completed_at < v_now - make_interval(days => v_run_days);
    get diagnostics v_runs_deleted = row_count;

    return jsonb_build_object(
        'observations_deleted', v_observations_deleted,
        'runs_deleted', v_runs_deleted
    );
end;
$$;

revoke all on function public.cleanup_knowledge_observation_corpus(integer, integer)
    from public, anon, authenticated;
grant execute on function public.cleanup_knowledge_observation_corpus(integer, integer)
    to service_role;

commit;

-- Stage 4 will schedule cleanup_knowledge_observation_corpus through Supabase Cron.
