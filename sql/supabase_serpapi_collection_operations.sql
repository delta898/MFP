begin;

create table if not exists public.knowledge_collection_budget_reservations (
    provider_id text not null,
    operation_id text not null,
    lane text not null,
    trigger text not null,
    reserved_at timestamptz not null default clock_timestamp(),
    primary key (provider_id, operation_id),
    constraint knowledge_collection_budget_provider_check
        check (length(provider_id) between 1 and 120),
    constraint knowledge_collection_budget_operation_check
        check (operation_id ~ '^kco_[A-Za-z0-9:_-]{1,176}$'),
    constraint knowledge_collection_budget_lane_check
        check (lane in (
            'headlines_kr', 'headlines_global', 'technology', 'business', 'science',
            'culture_lifestyle', 'travel_local'
        )),
    constraint knowledge_collection_budget_trigger_check
        check (trigger in ('scheduled', 'manual'))
);

create index if not exists knowledge_collection_budget_window_idx
    on public.knowledge_collection_budget_reservations (provider_id, reserved_at desc);

alter table public.knowledge_collection_budget_reservations enable row level security;
revoke all on table public.knowledge_collection_budget_reservations from public, anon, authenticated;
grant all on table public.knowledge_collection_budget_reservations to service_role;

create table if not exists public.knowledge_collection_provider_state (
    provider_id text primary key,
    lease_token text,
    lease_expires_at timestamptz,
    consecutive_failures integer not null default 0,
    backoff_until timestamptz,
    last_error_code text,
    account_checked_at timestamptz,
    account_searches_limit integer,
    account_searches_used integer,
    account_searches_remaining integer,
    account_renewal_date date,
    updated_at timestamptz not null default clock_timestamp(),
    constraint knowledge_collection_state_provider_check
        check (length(provider_id) between 1 and 120),
    constraint knowledge_collection_state_lease_check
        check (
            (lease_token is null and lease_expires_at is null)
            or (
                lease_token ~ '^kcl_[A-Za-z0-9_-]{1,176}$'
                and lease_expires_at is not null
            )
        ),
    constraint knowledge_collection_state_failure_check
        check (consecutive_failures >= 0),
    constraint knowledge_collection_state_error_check
        check (last_error_code is null or last_error_code ~ '^[A-Z][A-Z0-9_]{0,79}$'),
    constraint knowledge_collection_state_account_check
        check (
            (account_checked_at is null
                and account_searches_limit is null
                and account_searches_used is null
                and account_searches_remaining is null
                and account_renewal_date is null)
            or (
                account_checked_at is not null
                and account_searches_limit >= 0
                and account_searches_used >= 0
                and account_searches_remaining >= 0
            )
        )
);

alter table public.knowledge_collection_provider_state enable row level security;
revoke all on table public.knowledge_collection_provider_state from public, anon, authenticated;
grant all on table public.knowledge_collection_provider_state to service_role;

create or replace function public.acquire_knowledge_collection_lease(
    p_provider_id text,
    p_lease_token text,
    p_lease_seconds integer default 180
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_now timestamptz := clock_timestamp();
    v_provider_id text := trim(coalesce(p_provider_id, ''));
    v_lease_token text := trim(coalesce(p_lease_token, ''));
    v_lease_seconds integer := greatest(30, least(coalesce(p_lease_seconds, 180), 600));
    v_state public.knowledge_collection_provider_state%rowtype;
begin
    if length(v_provider_id) < 1 or length(v_provider_id) > 120
       or v_lease_token !~ '^kcl_[A-Za-z0-9_-]{1,176}$' then
        raise exception 'invalid collection lease identity';
    end if;

    perform pg_advisory_xact_lock(hashtextextended('collection-lease:' || v_provider_id, 0));
    insert into public.knowledge_collection_provider_state (provider_id)
    values (v_provider_id)
    on conflict (provider_id) do nothing;

    select * into v_state
    from public.knowledge_collection_provider_state
    where provider_id = v_provider_id
    for update;

    if v_state.backoff_until is not null and v_state.backoff_until > v_now then
        return jsonb_build_object(
            'acquired', false,
            'reason', 'backoff',
            'retry_after_seconds', greatest(1, ceil(extract(epoch from v_state.backoff_until - v_now))::integer)
        );
    end if;
    if v_state.lease_token is not null and v_state.lease_expires_at > v_now then
        return jsonb_build_object(
            'acquired', false,
            'reason', 'already_running',
            'retry_after_seconds', greatest(1, ceil(extract(epoch from v_state.lease_expires_at - v_now))::integer)
        );
    end if;

    update public.knowledge_collection_provider_state
       set lease_token = v_lease_token,
           lease_expires_at = v_now + make_interval(secs => v_lease_seconds),
           updated_at = v_now
     where provider_id = v_provider_id;
    return jsonb_build_object('acquired', true, 'reason', '', 'retry_after_seconds', 0);
end;
$$;

revoke all on function public.acquire_knowledge_collection_lease(text, text, integer)
    from public, anon, authenticated;
grant execute on function public.acquire_knowledge_collection_lease(text, text, integer)
    to service_role;

create or replace function public.release_knowledge_collection_lease(
    p_provider_id text,
    p_lease_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_released integer := 0;
begin
    update public.knowledge_collection_provider_state
       set lease_token = null,
           lease_expires_at = null,
           updated_at = clock_timestamp()
     where provider_id = trim(coalesce(p_provider_id, ''))
       and lease_token = trim(coalesce(p_lease_token, ''));
    get diagnostics v_released = row_count;
    return jsonb_build_object('released', v_released = 1);
end;
$$;

revoke all on function public.release_knowledge_collection_lease(text, text)
    from public, anon, authenticated;
grant execute on function public.release_knowledge_collection_lease(text, text)
    to service_role;

create or replace function public.record_knowledge_collection_account_status(
    p_provider_id text,
    p_status jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_provider_id text := trim(coalesce(p_provider_id, ''));
    v_unknown boolean;
    v_checked_at timestamptz;
    v_limit integer;
    v_used integer;
    v_remaining integer;
    v_renewal date;
begin
    if length(v_provider_id) < 1 or length(v_provider_id) > 120
       or p_status is null or jsonb_typeof(p_status) <> 'object' then
        raise exception 'invalid collection account status';
    end if;
    select exists (
        select 1 from jsonb_object_keys(p_status) as item_key(key)
        where item_key.key not in (
            'checked_at', 'searches_limit', 'searches_used', 'searches_remaining', 'renewal_date'
        )
    ) into v_unknown;
    if v_unknown then raise exception 'collection account status contains unsupported field'; end if;

    begin
        v_checked_at := (p_status->>'checked_at')::timestamptz;
        v_limit := (p_status->>'searches_limit')::integer;
        v_used := (p_status->>'searches_used')::integer;
        v_remaining := (p_status->>'searches_remaining')::integer;
        v_renewal := nullif(p_status->>'renewal_date', '')::date;
    exception when others then
        raise exception 'collection account status is malformed';
    end;
    if v_checked_at < clock_timestamp() - interval '10 minutes'
       or v_checked_at > clock_timestamp() + interval '2 minutes'
       or v_limit < 0 or v_used < 0 or v_remaining < 0 then
        raise exception 'collection account status is out of bounds';
    end if;

    insert into public.knowledge_collection_provider_state (
        provider_id, account_checked_at, account_searches_limit, account_searches_used,
        account_searches_remaining, account_renewal_date, updated_at
    ) values (
        v_provider_id, v_checked_at, v_limit, v_used, v_remaining, v_renewal, clock_timestamp()
    )
    on conflict (provider_id)
    do update set
        account_checked_at = excluded.account_checked_at,
        account_searches_limit = excluded.account_searches_limit,
        account_searches_used = excluded.account_searches_used,
        account_searches_remaining = excluded.account_searches_remaining,
        account_renewal_date = excluded.account_renewal_date,
        updated_at = excluded.updated_at;
    return jsonb_build_object('recorded', true);
end;
$$;

revoke all on function public.record_knowledge_collection_account_status(text, jsonb)
    from public, anon, authenticated;
grant execute on function public.record_knowledge_collection_account_status(text, jsonb)
    to service_role;

create or replace function public.reserve_knowledge_collection_budget(
    p_provider_id text,
    p_operation_id text,
    p_lane text,
    p_trigger text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_now timestamptz := clock_timestamp();
    v_provider_id text := trim(coalesce(p_provider_id, ''));
    v_operation_id text := trim(coalesce(p_operation_id, ''));
    v_count integer := 0;
    v_limit constant integer := 200;
begin
    if length(v_provider_id) < 1 or length(v_provider_id) > 120
       or v_operation_id !~ '^kco_[A-Za-z0-9:_-]{1,176}$'
       or p_lane not in (
           'headlines_kr', 'headlines_global', 'technology', 'business', 'science',
           'culture_lifestyle', 'travel_local'
       ) or p_trigger not in ('scheduled', 'manual') then
        raise exception 'invalid collection budget reservation';
    end if;

    perform pg_advisory_xact_lock(hashtextextended('collection-budget:' || v_provider_id, 0));
    if exists (
        select 1 from public.knowledge_collection_budget_reservations
        where provider_id = v_provider_id and operation_id = v_operation_id
    ) then
        select count(*) into v_count
        from public.knowledge_collection_budget_reservations
        where provider_id = v_provider_id and reserved_at > v_now - interval '31 days';
        return jsonb_build_object(
            'reserved', false, 'duplicate', true, 'count', v_count,
            'limit', v_limit, 'reason', 'duplicate'
        );
    end if;

    select count(*) into v_count
    from public.knowledge_collection_budget_reservations
    where provider_id = v_provider_id and reserved_at > v_now - interval '31 days';
    if v_count >= v_limit then
        return jsonb_build_object(
            'reserved', false, 'duplicate', false, 'count', v_count,
            'limit', v_limit, 'reason', 'exhausted'
        );
    end if;

    insert into public.knowledge_collection_budget_reservations (
        provider_id, operation_id, lane, trigger, reserved_at
    ) values (v_provider_id, v_operation_id, p_lane, p_trigger, v_now);
    return jsonb_build_object(
        'reserved', true, 'duplicate', false, 'count', v_count + 1,
        'limit', v_limit, 'reason', ''
    );
end;
$$;

revoke all on function public.reserve_knowledge_collection_budget(text, text, text, text)
    from public, anon, authenticated;
grant execute on function public.reserve_knowledge_collection_budget(text, text, text, text)
    to service_role;

create or replace function public.record_knowledge_collection_provider_success(p_provider_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if p_provider_id is null or length(trim(p_provider_id)) < 1
       or length(trim(p_provider_id)) > 120 then
        raise exception 'invalid collection provider success';
    end if;
    insert into public.knowledge_collection_provider_state (provider_id)
    values (trim(coalesce(p_provider_id, '')))
    on conflict (provider_id)
    do update set
        consecutive_failures = 0,
        backoff_until = null,
        last_error_code = null,
        updated_at = clock_timestamp();
end;
$$;

revoke all on function public.record_knowledge_collection_provider_success(text)
    from public, anon, authenticated;
grant execute on function public.record_knowledge_collection_provider_success(text)
    to service_role;

create or replace function public.record_knowledge_collection_provider_failure(
    p_provider_id text,
    p_error_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_now timestamptz := clock_timestamp();
    v_provider_id text := trim(coalesce(p_provider_id, ''));
    v_error_code text := trim(coalesce(p_error_code, ''));
    v_failures integer;
    v_backoff_seconds integer;
    v_backoff_until timestamptz;
begin
    if length(v_provider_id) < 1 or length(v_provider_id) > 120
       or v_error_code !~ '^[A-Z][A-Z0-9_]{0,79}$' then
        raise exception 'invalid collection provider failure';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('collection-state:' || v_provider_id, 0));
    insert into public.knowledge_collection_provider_state (provider_id)
    values (v_provider_id)
    on conflict (provider_id) do nothing;
    select consecutive_failures + 1 into v_failures
    from public.knowledge_collection_provider_state
    where provider_id = v_provider_id
    for update;

    if v_error_code in (
        'SERPAPI_NOT_CONFIGURED', 'SERPAPI_AUTH_FAILED', 'SERPAPI_ACCOUNT_INACTIVE',
        'SERPAPI_ACCOUNT_RATE_LIMITED', 'SERPAPI_RATE_LIMITED',
        'SERPAPI_REQUEST_REJECTED', 'SERPAPI_LANE_NOT_CONFIGURED'
    ) then
        v_backoff_seconds := 86400;
    else
        v_backoff_seconds := least(43200, (3600 * power(2, least(v_failures - 1, 4)))::integer);
    end if;
    v_backoff_until := v_now + make_interval(secs => v_backoff_seconds);

    update public.knowledge_collection_provider_state
       set consecutive_failures = v_failures,
           backoff_until = v_backoff_until,
           last_error_code = v_error_code,
           updated_at = v_now
     where provider_id = v_provider_id;
    return jsonb_build_object(
        'consecutive_failures', v_failures,
        'backoff_until', v_backoff_until,
        'backoff_seconds', v_backoff_seconds
    );
end;
$$;

revoke all on function public.record_knowledge_collection_provider_failure(text, text)
    from public, anon, authenticated;
grant execute on function public.record_knowledge_collection_provider_failure(text, text)
    to service_role;

create or replace function public.read_knowledge_collection_operations(p_provider_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_provider_id text := trim(coalesce(p_provider_id, ''));
    v_count integer := 0;
    v_state public.knowledge_collection_provider_state%rowtype;
begin
    if length(v_provider_id) < 1 or length(v_provider_id) > 120 then
        raise exception 'invalid collection operations provider';
    end if;
    select count(*) into v_count
    from public.knowledge_collection_budget_reservations
    where provider_id = v_provider_id and reserved_at > clock_timestamp() - interval '31 days';
    select * into v_state
    from public.knowledge_collection_provider_state
    where provider_id = v_provider_id;
    return jsonb_build_object(
        'provider_id', v_provider_id,
        'budget_count', v_count,
        'budget_limit', 200,
        'budget_remaining', greatest(0, 200 - v_count),
        'consecutive_failures', coalesce(v_state.consecutive_failures, 0),
        'backoff_until', v_state.backoff_until,
        'last_error_code', v_state.last_error_code,
        'account_checked_at', v_state.account_checked_at,
        'account_searches_limit', v_state.account_searches_limit,
        'account_searches_used', v_state.account_searches_used,
        'account_searches_remaining', v_state.account_searches_remaining,
        'account_renewal_date', v_state.account_renewal_date
    );
end;
$$;

revoke all on function public.read_knowledge_collection_operations(text)
    from public, anon, authenticated;
grant execute on function public.read_knowledge_collection_operations(text)
    to service_role;

create or replace function public.cleanup_knowledge_collection_operations()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_deleted integer := 0;
begin
    delete from public.knowledge_collection_budget_reservations
    where reserved_at < clock_timestamp() - interval '62 days';
    get diagnostics v_deleted = row_count;
    update public.knowledge_collection_provider_state
       set lease_token = null,
           lease_expires_at = null,
           updated_at = clock_timestamp()
     where lease_expires_at < clock_timestamp();
    return jsonb_build_object('reservations_deleted', v_deleted);
end;
$$;

revoke all on function public.cleanup_knowledge_collection_operations()
    from public, anon, authenticated;
grant execute on function public.cleanup_knowledge_collection_operations()
    to service_role;

commit;
