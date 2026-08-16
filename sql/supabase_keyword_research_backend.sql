begin;

create table if not exists public.keyword_research_cache (
    cache_kind text not null,
    cache_key text not null,
    payload jsonb not null,
    expires_at timestamptz not null,
    updated_at timestamptz not null default now(),
    primary key (cache_kind, cache_key),
    constraint keyword_research_cache_kind_check
        check (cache_kind in ('search_ad', 'blog_total')),
    constraint keyword_research_cache_key_check
        check (length(cache_key) between 1 and 300)
);

create index if not exists keyword_research_cache_expires_at_idx
    on public.keyword_research_cache (expires_at);

alter table public.keyword_research_cache enable row level security;
revoke all on table public.keyword_research_cache from public, anon, authenticated;
grant all on table public.keyword_research_cache to service_role;

create table if not exists public.keyword_research_rate_limits (
    subject_hash text not null,
    window_start timestamptz not null,
    request_count integer not null default 0,
    updated_at timestamptz not null default now(),
    primary key (subject_hash, window_start),
    constraint keyword_research_rate_subject_check
        check (length(subject_hash) between 16 and 128),
    constraint keyword_research_rate_count_check
        check (request_count >= 0)
);

create index if not exists keyword_research_rate_limits_updated_at_idx
    on public.keyword_research_rate_limits (updated_at);

alter table public.keyword_research_rate_limits enable row level security;
revoke all on table public.keyword_research_rate_limits from public, anon, authenticated;
grant all on table public.keyword_research_rate_limits to service_role;

create or replace function public.consume_keyword_research_rate_limit(
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
        raise exception 'invalid keyword research rate-limit subject';
    end if;

    v_window_start := to_timestamp(
        floor(extract(epoch from v_now) / v_window_seconds) * v_window_seconds
    );

    insert into public.keyword_research_rate_limits (
        subject_hash,
        window_start,
        request_count,
        updated_at
    ) values (
        trim(p_subject_hash),
        v_window_start,
        1,
        v_now
    )
    on conflict (subject_hash, window_start)
    do update set
        request_count = public.keyword_research_rate_limits.request_count + 1,
        updated_at = excluded.updated_at
    returning request_count into v_count;

    return jsonb_build_object(
        'allowed', v_count <= v_limit,
        'count', v_count,
        'limit', v_limit,
        'retry_after_seconds', greatest(
            1,
            ceil(extract(epoch from (v_window_start + make_interval(secs => v_window_seconds) - v_now)))::integer
        )
    );
end;
$$;

revoke all on function public.consume_keyword_research_rate_limit(text, integer, integer)
    from public, anon, authenticated;
grant execute on function public.consume_keyword_research_rate_limit(text, integer, integer)
    to service_role;

commit;

-- Optional maintenance, suitable for a daily scheduled SQL job:
-- delete from public.keyword_research_cache where expires_at < now() - interval '1 day';
-- delete from public.keyword_research_rate_limits where updated_at < now() - interval '1 day';
