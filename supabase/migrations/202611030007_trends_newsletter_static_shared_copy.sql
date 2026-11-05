-- Shared copy is deterministic, so AI metadata is no longer required for a
-- ready edition. Keep the nullable columns for lineage of older Dev records.
alter table mailing.trends_newsletter_editions
    drop constraint trends_newsletter_edition_ready_fields_check;

alter table mailing.trends_newsletter_editions
    add constraint trends_newsletter_edition_ready_fields_check check (
        status <> 'ready' or (
            greeting is not null and length(greeting) between 1 and 100
            and introduction is not null and length(introduction) between 1 and 360
            and featured_post is not null and jsonb_typeof(featured_post) = 'object'
            and download_url is not null and download_banner_url is not null
            and prompt_version is not null
        )
    );

create or replace function public.save_trends_newsletter_edition(
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
declare
    saved jsonb;
    run_row mailing.trends_newsletter_daily_status%rowtype;
    can_replace_ready boolean;
begin
    if p_trend_date is null
        or p_greeting is null or length(btrim(p_greeting)) not between 1 and 100
        or p_introduction is null or length(btrim(p_introduction)) not between 1 and 360
        or p_featured_post is null or jsonb_typeof(p_featured_post) <> 'object'
        or p_download_url is null or p_download_banner_url is null
        or p_prompt_version <> 'shared-edition-v2-static' then
        raise exception 'invalid shared newsletter edition';
    end if;

    select * into run_row from mailing.trends_newsletter_daily_status
    where trend_date = p_trend_date for update;
    if not found or run_row.collection_status <> 'complete' then
        raise exception 'newsletter trend collection is not complete';
    end if;
    can_replace_ready := p_replace_ready
        and run_row.delivery_status = 'not_started'
        and not exists (
            select 1 from mailing.trends_newsletter_deliveries as delivery
            where delivery.trend_date = p_trend_date
        );

    insert into mailing.trends_newsletter_editions (
        trend_date, status, greeting, introduction, featured_post,
        download_url, download_banner_url, ai_provider, ai_model, prompt_version,
        reason_code, generated_at, updated_at
    ) values (
        p_trend_date, 'ready', btrim(p_greeting), btrim(p_introduction), p_featured_post,
        p_download_url, p_download_banner_url, null, null, p_prompt_version,
        null, now(), now()
    ) on conflict (trend_date) do update set
        status = 'ready', greeting = excluded.greeting, introduction = excluded.introduction,
        featured_post = excluded.featured_post, download_url = excluded.download_url,
        download_banner_url = excluded.download_banner_url, ai_provider = null,
        ai_model = null, prompt_version = excluded.prompt_version,
        reason_code = null, generated_at = now(), updated_at = now()
    where can_replace_ready or mailing.trends_newsletter_editions.status <> 'ready'
    returning to_jsonb(mailing.trends_newsletter_editions.*) into saved;

    if saved is null then
        select to_jsonb(edition) into saved from mailing.trends_newsletter_editions as edition
        where edition.trend_date = p_trend_date;
    end if;
    update mailing.trends_newsletter_daily_status
    set edition_status = 'draft_ready', updated_at = now()
    where trend_date = p_trend_date and edition_status in ('not_started', 'drafting', 'held');
    return saved;
end;
$$;
