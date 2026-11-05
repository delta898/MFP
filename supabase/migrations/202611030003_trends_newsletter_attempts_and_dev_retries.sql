create table if not exists mailing.trends_newsletter_attempts (
    signal_id uuid primary key,
    workflow_id text not null unique,
    trend_date date not null references mailing.trends_newsletter_runs(trend_date) on delete restrict,
    status text not null check (status in ('running', 'completed', 'held', 'failed')),
    collection_status text not null check (collection_status in ('pending', 'complete', 'incomplete', 'read_error')),
    edition_status text not null check (edition_status in ('not_started', 'drafting', 'draft_ready', 'held')),
    collection_report jsonb not null default '{}'::jsonb,
    edition_snapshot jsonb,
    error_code text,
    started_at timestamptz not null default now(),
    completed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint trends_newsletter_attempt_error_code_check check (
        error_code is null or error_code in ('collection_read_failed', 'generation_failed', 'attempt_failed')
    )
);

create index if not exists trends_newsletter_attempts_date_created_idx
    on mailing.trends_newsletter_attempts (trend_date, created_at desc);

alter table mailing.trends_newsletter_attempts enable row level security;
revoke all on mailing.trends_newsletter_attempts from public, anon, authenticated;
grant all on mailing.trends_newsletter_attempts to service_role;

create or replace function public.save_trends_newsletter_attempt(
    p_signal_id uuid,
    p_trend_date date,
    p_workflow_id text,
    p_status text,
    p_collection_status text,
    p_edition_status text,
    p_collection_report jsonb,
    p_edition_snapshot jsonb default null,
    p_error_code text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare saved jsonb;
begin
    if p_signal_id is null
        or p_trend_date is null
        or p_workflow_id is null or btrim(p_workflow_id) = ''
        or p_status is null or p_status not in ('running', 'completed', 'held', 'failed')
        or p_collection_status is null or p_collection_status not in ('pending', 'complete', 'incomplete', 'read_error')
        or p_edition_status is null or p_edition_status not in ('not_started', 'drafting', 'draft_ready', 'held')
        or p_collection_report is null or jsonb_typeof(p_collection_report) <> 'object'
        or (p_edition_snapshot is not null and jsonb_typeof(p_edition_snapshot) <> 'object')
        or (p_error_code is not null and p_error_code not in ('collection_read_failed', 'generation_failed', 'attempt_failed'))
        then
        raise exception 'invalid newsletter attempt';
    end if;

    if not exists (
        select 1 from mailing.trends_newsletter_runs as run
        where run.trend_date = p_trend_date
    ) then
        raise exception 'newsletter run does not exist';
    end if;

    insert into mailing.trends_newsletter_attempts (
        signal_id, workflow_id, trend_date, status, collection_status,
        edition_status, collection_report, edition_snapshot, error_code,
        completed_at, updated_at
    ) values (
        p_signal_id, p_workflow_id, p_trend_date, p_status, p_collection_status,
        p_edition_status, p_collection_report, p_edition_snapshot, p_error_code,
        case when p_status = 'running' then null else now() end, now()
    )
    on conflict (signal_id) do update set
        status = excluded.status,
        collection_status = excluded.collection_status,
        edition_status = excluded.edition_status,
        collection_report = excluded.collection_report,
        edition_snapshot = coalesce(excluded.edition_snapshot, mailing.trends_newsletter_attempts.edition_snapshot),
        error_code = excluded.error_code,
        completed_at = case when excluded.status = 'running' then null else now() end,
        updated_at = now()
    where mailing.trends_newsletter_attempts.workflow_id = excluded.workflow_id
        and mailing.trends_newsletter_attempts.trend_date = excluded.trend_date
    returning to_jsonb(mailing.trends_newsletter_attempts.*) into saved;

    if saved is null then
        raise exception 'signal ID conflicts with another newsletter attempt';
    end if;
    return saved;
end;
$$;

revoke all on function public.save_trends_newsletter_attempt(uuid, date, text, text, text, text, jsonb, jsonb, text)
    from public, anon, authenticated;
grant execute on function public.save_trends_newsletter_attempt(uuid, date, text, text, text, text, jsonb, jsonb, text)
    to service_role;

drop function public.save_trends_newsletter_edition(date, text, text, jsonb, text, text, text, text, text);

create function public.save_trends_newsletter_edition(
    p_trend_date date,
    p_greeting text,
    p_introduction text,
    p_featured_post jsonb,
    p_download_url text,
    p_download_banner_url text,
    p_ai_provider text,
    p_ai_model text,
    p_prompt_version text,
    p_replace_ready boolean default false
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare saved jsonb;
begin
    if p_trend_date is null
        or p_greeting is null or length(btrim(p_greeting)) not between 1 and 100
        or p_introduction is null or length(btrim(p_introduction)) not between 1 and 360
        or p_featured_post is null or jsonb_typeof(p_featured_post) <> 'object'
        or p_download_url is null or p_download_banner_url is null
        or p_ai_provider <> 'cloudflare-ai-gateway'
        or p_ai_model is null or btrim(p_ai_model) = ''
        or p_prompt_version <> 'shared-edition-v1'
        then
        raise exception 'invalid shared newsletter edition';
    end if;

    if not exists (
        select 1 from mailing.trends_newsletter_runs as run
        where run.trend_date = p_trend_date and run.collection_status = 'complete'
    ) then
        raise exception 'newsletter trend collection is not complete';
    end if;

    insert into mailing.trends_newsletter_editions (
        trend_date, status, greeting, introduction, featured_post,
        download_url, download_banner_url, ai_provider, ai_model, prompt_version,
        reason_code, generated_at, updated_at
    ) values (
        p_trend_date, 'ready', btrim(p_greeting), btrim(p_introduction), p_featured_post,
        p_download_url, p_download_banner_url, p_ai_provider, btrim(p_ai_model), p_prompt_version,
        null, now(), now()
    ) on conflict (trend_date) do update set
        status = 'ready', greeting = excluded.greeting, introduction = excluded.introduction,
        featured_post = excluded.featured_post, download_url = excluded.download_url,
        download_banner_url = excluded.download_banner_url, ai_provider = excluded.ai_provider,
        ai_model = excluded.ai_model, prompt_version = excluded.prompt_version,
        reason_code = null, generated_at = now(), updated_at = now()
    where p_replace_ready or mailing.trends_newsletter_editions.status <> 'ready'
    returning to_jsonb(mailing.trends_newsletter_editions.*) into saved;

    if saved is null then
        select to_jsonb(edition) into saved
        from mailing.trends_newsletter_editions as edition
        where edition.trend_date = p_trend_date;
    end if;

    update mailing.trends_newsletter_runs
    set edition_status = 'draft_ready', updated_at = now()
    where trend_date = p_trend_date and edition_status in ('not_started', 'drafting', 'held');
    return saved;
end;
$$;

revoke all on function public.save_trends_newsletter_edition(date, text, text, jsonb, text, text, text, text, text, boolean)
    from public, anon, authenticated;
grant execute on function public.save_trends_newsletter_edition(date, text, text, jsonb, text, text, text, text, text, boolean)
    to service_role;
