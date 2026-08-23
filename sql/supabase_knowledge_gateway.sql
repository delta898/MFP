begin;

create table if not exists public.knowledge_gateway_cache (
    provider_id text not null,
    cache_key text not null,
    kind text not null,
    payload jsonb not null,
    expires_at timestamptz not null,
    stale_until timestamptz not null,
    updated_at timestamptz not null default now(),
    primary key (provider_id, cache_key),
    constraint knowledge_gateway_cache_provider_check
        check (length(provider_id) between 1 and 120),
    constraint knowledge_gateway_cache_key_check
        check (length(cache_key) between 16 and 128),
    constraint knowledge_gateway_cache_kind_check
        check (kind in ('trends', 'news')),
    constraint knowledge_gateway_cache_expiry_check
        check (stale_until >= expires_at),
    constraint knowledge_gateway_cache_payload_check
        check (jsonb_typeof(payload) = 'object')
);

create index if not exists knowledge_gateway_cache_stale_until_idx
    on public.knowledge_gateway_cache (stale_until);

alter table public.knowledge_gateway_cache enable row level security;
revoke all on table public.knowledge_gateway_cache from public, anon, authenticated;
grant all on table public.knowledge_gateway_cache to service_role;

create table if not exists public.knowledge_gateway_rate_limits (
    subject_hash text not null,
    window_start timestamptz not null,
    request_count integer not null default 0,
    updated_at timestamptz not null default now(),
    primary key (subject_hash, window_start),
    constraint knowledge_gateway_rate_subject_check
        check (length(subject_hash) between 16 and 128),
    constraint knowledge_gateway_rate_count_check
        check (request_count >= 0)
);

create index if not exists knowledge_gateway_rate_updated_at_idx
    on public.knowledge_gateway_rate_limits (updated_at);

alter table public.knowledge_gateway_rate_limits enable row level security;
revoke all on table public.knowledge_gateway_rate_limits from public, anon, authenticated;
grant all on table public.knowledge_gateway_rate_limits to service_role;

create table if not exists public.knowledge_gateway_provider_usage (
    provider_id text not null,
    operation text not null,
    window_start timestamptz not null,
    request_count integer not null default 0,
    updated_at timestamptz not null default now(),
    primary key (provider_id, operation, window_start),
    constraint knowledge_gateway_usage_provider_check
        check (length(provider_id) between 1 and 120),
    constraint knowledge_gateway_usage_operation_check
        check (length(operation) between 1 and 120),
    constraint knowledge_gateway_usage_count_check
        check (request_count >= 0)
);

create index if not exists knowledge_gateway_usage_updated_at_idx
    on public.knowledge_gateway_provider_usage (updated_at);

alter table public.knowledge_gateway_provider_usage enable row level security;
revoke all on table public.knowledge_gateway_provider_usage from public, anon, authenticated;
grant all on table public.knowledge_gateway_provider_usage to service_role;

create table if not exists public.knowledge_gateway_provider_state (
    provider_id text primary key,
    consecutive_failures integer not null default 0,
    backoff_until timestamptz,
    last_error_code text,
    updated_at timestamptz not null default now(),
    constraint knowledge_gateway_state_provider_check
        check (length(provider_id) between 1 and 120),
    constraint knowledge_gateway_state_failure_check
        check (consecutive_failures >= 0),
    constraint knowledge_gateway_state_error_check
        check (last_error_code is null or length(last_error_code) <= 80)
);

alter table public.knowledge_gateway_provider_state enable row level security;
revoke all on table public.knowledge_gateway_provider_state from public, anon, authenticated;
grant all on table public.knowledge_gateway_provider_state to service_role;

create or replace function public.consume_knowledge_gateway_rate_limit(
    p_subject_hash text,
    p_limit integer default 20,
    p_window_seconds integer default 60
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_now timestamptz := clock_timestamp();
    v_window_seconds integer := greatest(10, least(coalesce(p_window_seconds, 60), 3600));
    v_limit integer := greatest(1, least(coalesce(p_limit, 20), 10000));
    v_window_start timestamptz;
    v_count integer;
begin
    if p_subject_hash is null or length(trim(p_subject_hash)) < 16 then
        raise exception 'invalid knowledge gateway rate-limit subject';
    end if;

    v_window_start := to_timestamp(
        floor(extract(epoch from v_now) / v_window_seconds) * v_window_seconds
    );

    insert into public.knowledge_gateway_rate_limits (
        subject_hash, window_start, request_count, updated_at
    ) values (
        trim(p_subject_hash), v_window_start, 1, v_now
    )
    on conflict (subject_hash, window_start)
    do update set
        request_count = public.knowledge_gateway_rate_limits.request_count + 1,
        updated_at = excluded.updated_at
    returning request_count into v_count;

    return jsonb_build_object(
        'allowed', v_count <= v_limit,
        'count', v_count,
        'limit', v_limit,
        'retry_after_seconds', greatest(
            1,
            ceil(extract(epoch from (
                v_window_start + make_interval(secs => v_window_seconds) - v_now
            )))::integer
        )
    );
end;
$$;

revoke all on function public.consume_knowledge_gateway_rate_limit(text, integer, integer)
    from public, anon, authenticated;
grant execute on function public.consume_knowledge_gateway_rate_limit(text, integer, integer)
    to service_role;

create or replace function public.consume_knowledge_provider_quota(
    p_provider_id text,
    p_operation text,
    p_limit integer,
    p_window_seconds integer default 86400
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_now timestamptz := clock_timestamp();
    v_window_seconds integer := greatest(60, least(coalesce(p_window_seconds, 86400), 2678400));
    v_limit integer := greatest(1, least(coalesce(p_limit, 1), 10000000));
    v_window_start timestamptz;
    v_count integer;
begin
    if p_provider_id is null or length(trim(p_provider_id)) < 1
       or p_operation is null or length(trim(p_operation)) < 1 then
        raise exception 'invalid knowledge provider quota identity';
    end if;

    v_window_start := to_timestamp(
        floor(extract(epoch from v_now) / v_window_seconds) * v_window_seconds
    );

    insert into public.knowledge_gateway_provider_usage (
        provider_id, operation, window_start, request_count, updated_at
    ) values (
        left(trim(p_provider_id), 120), left(trim(p_operation), 120), v_window_start, 1, v_now
    )
    on conflict (provider_id, operation, window_start)
    do update set
        request_count = public.knowledge_gateway_provider_usage.request_count + 1,
        updated_at = excluded.updated_at
    returning request_count into v_count;

    return jsonb_build_object(
        'allowed', v_count <= v_limit,
        'count', v_count,
        'limit', v_limit,
        'retry_after_seconds', greatest(
            1,
            ceil(extract(epoch from (
                v_window_start + make_interval(secs => v_window_seconds) - v_now
            )))::integer
        )
    );
end;
$$;

revoke all on function public.consume_knowledge_provider_quota(text, text, integer, integer)
    from public, anon, authenticated;
grant execute on function public.consume_knowledge_provider_quota(text, text, integer, integer)
    to service_role;

create or replace function public.record_knowledge_provider_success(p_provider_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if p_provider_id is null or length(trim(p_provider_id)) < 1 then
        raise exception 'invalid knowledge provider identity';
    end if;
    insert into public.knowledge_gateway_provider_state (
        provider_id, consecutive_failures, backoff_until, last_error_code, updated_at
    ) values (
        left(trim(p_provider_id), 120), 0, null, null, clock_timestamp()
    )
    on conflict (provider_id)
    do update set
        consecutive_failures = 0,
        backoff_until = null,
        last_error_code = null,
        updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.record_knowledge_provider_success(text)
    from public, anon, authenticated;
grant execute on function public.record_knowledge_provider_success(text) to service_role;

create or replace function public.record_knowledge_provider_failure(
    p_provider_id text,
    p_error_code text,
    p_backoff_seconds integer default 60
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_now timestamptz := clock_timestamp();
    v_backoff_seconds integer := greatest(5, least(coalesce(p_backoff_seconds, 60), 3600));
    v_failures integer;
    v_backoff_until timestamptz;
begin
    if p_provider_id is null or length(trim(p_provider_id)) < 1 then
        raise exception 'invalid knowledge provider identity';
    end if;

    insert into public.knowledge_gateway_provider_state (
        provider_id, consecutive_failures, backoff_until, last_error_code, updated_at
    ) values (
        left(trim(p_provider_id), 120),
        1,
        v_now + make_interval(secs => v_backoff_seconds),
        left(coalesce(nullif(trim(p_error_code), ''), 'UPSTREAM_FAILED'), 80),
        v_now
    )
    on conflict (provider_id)
    do update set
        consecutive_failures = public.knowledge_gateway_provider_state.consecutive_failures + 1,
        backoff_until = v_now + make_interval(secs => v_backoff_seconds),
        last_error_code = excluded.last_error_code,
        updated_at = excluded.updated_at
    returning consecutive_failures, backoff_until into v_failures, v_backoff_until;

    return jsonb_build_object(
        'consecutive_failures', v_failures,
        'backoff_until', v_backoff_until
    );
end;
$$;

revoke all on function public.record_knowledge_provider_failure(text, text, integer)
    from public, anon, authenticated;
grant execute on function public.record_knowledge_provider_failure(text, text, integer)
    to service_role;

commit;

-- Suggested daily maintenance:
-- delete from public.knowledge_gateway_cache where stale_until < now() - interval '1 day';
-- delete from public.knowledge_gateway_rate_limits where updated_at < now() - interval '1 day';
-- delete from public.knowledge_gateway_provider_usage where updated_at < now() - interval '35 days';
