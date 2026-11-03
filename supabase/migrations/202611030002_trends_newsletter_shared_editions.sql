create table if not exists mailing.trends_newsletter_editions (
    trend_date date primary key references mailing.trends_newsletter_runs(trend_date) on delete restrict,
    status text not null default 'held' check (status in ('ready', 'held')),
    greeting text,
    introduction text,
    featured_post jsonb,
    download_url text,
    download_banner_url text,
    ai_provider text,
    ai_model text,
    prompt_version text,
    reason_code text,
    generated_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint trends_newsletter_edition_ready_fields_check check (
        status <> 'ready' or (
            greeting is not null and length(greeting) between 1 and 100
            and introduction is not null and length(introduction) between 1 and 360
            and featured_post is not null and jsonb_typeof(featured_post) = 'object'
            and download_url is not null and download_banner_url is not null
            and ai_provider is not null and ai_model is not null and prompt_version is not null
        )
    )
);

alter table mailing.trends_newsletter_editions enable row level security;
revoke all on mailing.trends_newsletter_editions from public, anon, authenticated;
grant all on mailing.trends_newsletter_editions to service_role;

create or replace function public.get_trends_newsletter_edition(p_trend_date date)
returns jsonb
language sql stable security definer set search_path = '' as $$
    select to_jsonb(edition)
    from mailing.trends_newsletter_editions as edition
    where edition.trend_date = p_trend_date;
$$;

create or replace function public.save_trends_newsletter_edition(
    p_trend_date date,
    p_greeting text,
    p_introduction text,
    p_featured_post jsonb,
    p_download_url text,
    p_download_banner_url text,
    p_ai_provider text,
    p_ai_model text,
    p_prompt_version text
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
    where mailing.trends_newsletter_editions.status <> 'ready'
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

create or replace function public.mark_trends_newsletter_edition_held(
    p_trend_date date,
    p_reason_code text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare saved jsonb;
begin
    if p_trend_date is null or p_reason_code not in ('generation_failed') then
        raise exception 'invalid newsletter edition hold';
    end if;

    insert into mailing.trends_newsletter_editions (trend_date, status, reason_code, updated_at)
    values (p_trend_date, 'held', p_reason_code, now())
    on conflict (trend_date) do update set
        status = case when mailing.trends_newsletter_editions.status = 'ready' then 'ready' else 'held' end,
        reason_code = case when mailing.trends_newsletter_editions.status = 'ready' then null else excluded.reason_code end,
        updated_at = now()
    returning to_jsonb(mailing.trends_newsletter_editions.*) into saved;

    update mailing.trends_newsletter_runs
    set edition_status = case when edition_status = 'draft_ready' then edition_status else 'held' end,
        updated_at = now()
    where trend_date = p_trend_date;
    return saved;
end;
$$;

revoke all on function public.get_trends_newsletter_edition(date) from public, anon, authenticated;
revoke all on function public.save_trends_newsletter_edition(date, text, text, jsonb, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.mark_trends_newsletter_edition_held(date, text) from public, anon, authenticated;
grant execute on function public.get_trends_newsletter_edition(date) to service_role;
grant execute on function public.save_trends_newsletter_edition(date, text, text, jsonb, text, text, text, text, text) to service_role;
grant execute on function public.mark_trends_newsletter_edition_held(date, text) to service_role;
