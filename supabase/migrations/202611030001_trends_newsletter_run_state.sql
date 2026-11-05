create table if not exists mailing.trends_newsletter_runs (
    id uuid primary key default gen_random_uuid(),
    trend_date date not null unique,
    source text not null default 'naver_creator_advisor',

    collection_status text not null default 'pending',
    collection_expected_categories integer,
    collection_items_per_category integer,
    collection_expected_total integer,
    collection_actual_total integer,
    collection_report jsonb not null default '{}'::jsonb,
    collection_evaluation_count integer not null default 0,
    collection_first_checked_at timestamptz,
    collection_last_checked_at timestamptz,
    collection_completed_at timestamptz,

    edition_status text not null default 'not_started',
    delivery_status text not null default 'not_started',
    delivery_started_at timestamptz,
    delivery_completed_at timestamptz,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint trends_newsletter_collection_status_check
        check (collection_status in ('pending', 'complete', 'incomplete', 'read_error')),
    constraint trends_newsletter_edition_status_check
        check (edition_status in ('not_started', 'drafting', 'draft_ready', 'awaiting_approval', 'approved', 'published', 'held')),
    constraint trends_newsletter_delivery_status_check
        check (delivery_status in ('not_started', 'queued', 'sending', 'sent', 'partial', 'failed', 'held')),
    constraint trends_newsletter_evaluation_count_check check (collection_evaluation_count >= 0)
);

alter table mailing.trends_newsletter_runs enable row level security;
revoke all on mailing.trends_newsletter_runs from public, anon, authenticated;
grant all on mailing.trends_newsletter_runs to service_role;

create or replace function public.record_trends_newsletter_collection(
    p_trend_date date,
    p_collection_status text,
    p_source text,
    p_expected_categories integer,
    p_items_per_category integer,
    p_expected_total integer,
    p_actual_total integer,
    p_report jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare recorded_id uuid;
begin
    if p_trend_date is null
        or p_collection_status is null
        or p_collection_status not in ('complete', 'incomplete', 'read_error')
        or p_source is null
        or p_source <> 'naver_creator_advisor'
        or p_expected_categories is null
        or p_expected_categories < 1
        or p_items_per_category is null
        or p_items_per_category < 1
        or p_expected_total is null
        or p_expected_total <> p_expected_categories * p_items_per_category
        or p_actual_total is null
        or p_actual_total < 0
        then
        raise exception 'invalid newsletter collection result';
    end if;

    insert into mailing.trends_newsletter_runs (
        trend_date, source, collection_status, collection_expected_categories,
        collection_items_per_category, collection_expected_total,
        collection_actual_total, collection_report, collection_evaluation_count,
        collection_first_checked_at, collection_last_checked_at,
        collection_completed_at
    ) values (
        p_trend_date, p_source, p_collection_status, p_expected_categories,
        p_items_per_category, p_expected_total, p_actual_total,
        coalesce(p_report, '{}'::jsonb), 1, now(), now(),
        case when p_collection_status = 'complete' then now() else null end
    )
    on conflict (trend_date) do update set
        source = excluded.source,
        collection_status = excluded.collection_status,
        collection_expected_categories = excluded.collection_expected_categories,
        collection_items_per_category = excluded.collection_items_per_category,
        collection_expected_total = excluded.collection_expected_total,
        collection_actual_total = excluded.collection_actual_total,
        collection_report = excluded.collection_report,
        collection_evaluation_count = mailing.trends_newsletter_runs.collection_evaluation_count + 1,
        collection_first_checked_at = coalesce(mailing.trends_newsletter_runs.collection_first_checked_at, now()),
        collection_last_checked_at = now(),
        collection_completed_at = case
            when excluded.collection_status = 'complete' then now()
            else mailing.trends_newsletter_runs.collection_completed_at
        end,
        updated_at = now()
    returning id into recorded_id;

    return recorded_id;
end;
$$;

revoke all on function public.record_trends_newsletter_collection(date, text, text, integer, integer, integer, integer, jsonb)
    from public, anon, authenticated;
grant execute on function public.record_trends_newsletter_collection(date, text, text, integer, integer, integer, integer, jsonb)
    to service_role;
