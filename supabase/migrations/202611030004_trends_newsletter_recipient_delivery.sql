create table if not exists mailing.trends_newsletter_deliveries (
    id uuid primary key default gen_random_uuid(),
    trend_date date not null references mailing.trends_newsletter_runs(trend_date) on delete restrict,
    subscriber_id uuid not null references mailing.trends_subscribers(id) on delete restrict,
    status text not null check (status in ('sending', 'sent', 'held', 'failed', 'skipped')),
    provider_message_id text,
    outcome_code text check (outcome_code is null or outcome_code in (
        'provider_rejected', 'provider_ambiguous', 'content_invalid', 'database_update_failed', 'email_policy_denied'
    )),
    claimed_at timestamptz not null default now(),
    completed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (trend_date, subscriber_id)
);

alter table mailing.trends_newsletter_deliveries enable row level security;
revoke all on mailing.trends_newsletter_deliveries from public, anon, authenticated;
grant all on mailing.trends_newsletter_deliveries to service_role;

-- Once a date has any delivery claim, freeze its common edition so one campaign
-- cannot send different shared copy to recipients in later batches.
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
    run_row mailing.trends_newsletter_runs%rowtype;
    can_replace_ready boolean;
begin
    if p_trend_date is null
        or p_greeting is null or length(btrim(p_greeting)) not between 1 and 100
        or p_introduction is null or length(btrim(p_introduction)) not between 1 and 360
        or p_featured_post is null or jsonb_typeof(p_featured_post) <> 'object'
        or p_download_url is null or p_download_banner_url is null
        or p_ai_provider <> 'cloudflare-ai-gateway'
        or p_ai_model is null or btrim(p_ai_model) = ''
        or p_prompt_version <> 'shared-edition-v1' then
        raise exception 'invalid shared newsletter edition';
    end if;

    select * into run_row from mailing.trends_newsletter_runs
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
        p_download_url, p_download_banner_url, p_ai_provider, btrim(p_ai_model), p_prompt_version,
        null, now(), now()
    ) on conflict (trend_date) do update set
        status = 'ready', greeting = excluded.greeting, introduction = excluded.introduction,
        featured_post = excluded.featured_post, download_url = excluded.download_url,
        download_banner_url = excluded.download_banner_url, ai_provider = excluded.ai_provider,
        ai_model = excluded.ai_model, prompt_version = excluded.prompt_version,
        reason_code = null, generated_at = now(), updated_at = now()
    where can_replace_ready or mailing.trends_newsletter_editions.status <> 'ready'
    returning to_jsonb(mailing.trends_newsletter_editions.*) into saved;

    if saved is null then
        select to_jsonb(edition) into saved from mailing.trends_newsletter_editions as edition
        where edition.trend_date = p_trend_date;
    end if;
    update mailing.trends_newsletter_runs
    set edition_status = 'draft_ready', updated_at = now()
    where trend_date = p_trend_date and edition_status in ('not_started', 'drafting', 'held');
    return saved;
end;
$$;

create index if not exists trends_newsletter_deliveries_date_status_idx
    on mailing.trends_newsletter_deliveries (trend_date, status);

create or replace function mailing.get_trends_newsletter_delivery_context(p_trend_date date)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare context jsonb;
begin
    if p_trend_date is null then
        raise exception 'invalid newsletter delivery date';
    end if;

    select jsonb_build_object('run', to_jsonb(run), 'edition', to_jsonb(edition)) into context
    from mailing.trends_newsletter_runs as run
    join mailing.trends_newsletter_editions as edition using (trend_date)
    where run.trend_date = p_trend_date;
    return context;
end;
$$;

create or replace function mailing.list_active_trends_subscribers(
    p_after_id uuid default null,
    p_limit integer default 10
) returns table(id uuid, email text, categories text[])
language plpgsql stable security definer set search_path = '' as $$
begin
    if p_limit is null or p_limit < 1 or p_limit > 10 then
        raise exception 'invalid newsletter subscriber page size';
    end if;

    return query
    select subscriber.id, subscriber.email, subscriber.categories
    from mailing.trends_subscribers as subscriber
    where subscriber.status = 'active'
      and (p_after_id is null or subscriber.id > p_after_id)
    order by subscriber.id
    limit p_limit;
end;
$$;

create or replace function mailing.record_trends_newsletter_delivery_skipped(
    p_trend_date date,
    p_subscriber_id uuid
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare inserted_id uuid;
begin
    if p_trend_date is null or p_subscriber_id is null then
        raise exception 'invalid skipped newsletter delivery';
    end if;
    if not exists (
        select 1 from mailing.trends_newsletter_runs as run
        join mailing.trends_newsletter_editions as edition using (trend_date)
        where run.trend_date = p_trend_date and run.collection_status = 'complete'
          and edition.status = 'ready' and run.delivery_status <> 'sent'
    ) then
        raise exception 'newsletter is not eligible for delivery';
    end if;
    if not exists (
        select 1 from mailing.trends_subscribers
        where id = p_subscriber_id and status = 'active'
    ) then
        return false;
    end if;

    insert into mailing.trends_newsletter_deliveries(
        trend_date, subscriber_id, status, outcome_code, completed_at
    ) values (p_trend_date, p_subscriber_id, 'skipped', 'email_policy_denied', now())
    on conflict (trend_date, subscriber_id) do nothing
    returning id into inserted_id;
    return inserted_id is not null;
end;
$$;

create or replace function mailing.claim_trends_newsletter_delivery(
    p_trend_date date,
    p_subscriber_id uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
    run_row mailing.trends_newsletter_runs%rowtype;
    subscriber_row mailing.trends_subscribers%rowtype;
    delivery_id uuid;
    existing_status text;
    existing_outcome text;
begin
    if p_trend_date is null or p_subscriber_id is null then
        raise exception 'invalid newsletter delivery claim';
    end if;

    select * into run_row
    from mailing.trends_newsletter_runs
    where trend_date = p_trend_date
    for update;
    if not found or run_row.collection_status <> 'complete' then
        raise exception 'newsletter collection is not complete';
    end if;
    if run_row.edition_status <> 'draft_ready'
       or not exists (
           select 1 from mailing.trends_newsletter_editions as edition
           where edition.trend_date = p_trend_date and edition.status = 'ready'
       ) then
        raise exception 'newsletter edition is not ready';
    end if;

    select * into subscriber_row
    from mailing.trends_subscribers
    where id = p_subscriber_id
    for update;
    if not found or subscriber_row.status <> 'active' then
        return jsonb_build_object('outcome', 'inactive');
    end if;

    if run_row.delivery_status = 'sent' then
        return jsonb_build_object('outcome', 'run_closed');
    end if;

    insert into mailing.trends_newsletter_deliveries(trend_date, subscriber_id, status)
    values (p_trend_date, p_subscriber_id, 'sending')
    on conflict (trend_date, subscriber_id) do nothing
    returning id into delivery_id;

    if delivery_id is null then
        select status, outcome_code into existing_status, existing_outcome
        from mailing.trends_newsletter_deliveries
        where trend_date = p_trend_date and subscriber_id = p_subscriber_id;
        if existing_status = 'skipped' and existing_outcome = 'email_policy_denied' then
            update mailing.trends_newsletter_deliveries
            set status = 'sending', outcome_code = null, completed_at = null,
                claimed_at = now(), updated_at = now()
            where trend_date = p_trend_date and subscriber_id = p_subscriber_id
            returning id into delivery_id;
        else
            return jsonb_build_object('outcome', 'already_claimed', 'status', existing_status);
        end if;
    end if;

    if delivery_id is null then
        return jsonb_build_object('outcome', 'already_claimed', 'status', existing_status);
    end if;

    update mailing.trends_newsletter_runs
    set delivery_status = 'sending',
        delivery_started_at = coalesce(delivery_started_at, now()),
        delivery_completed_at = null,
        updated_at = now()
    where trend_date = p_trend_date;

    return jsonb_build_object(
        'outcome', 'claimed',
        'delivery_id', delivery_id,
        'email', subscriber_row.email,
        'categories', to_jsonb(subscriber_row.categories)
    );
end;
$$;

create or replace function mailing.finish_trends_newsletter_delivery(
    p_delivery_id uuid,
    p_status text,
    p_outcome_code text default null,
    p_provider_message_id text default null
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare changed boolean;
begin
    if p_delivery_id is null
       or p_status not in ('sent', 'held', 'failed', 'skipped')
       or (p_outcome_code is not null and p_outcome_code not in (
           'provider_rejected', 'provider_ambiguous', 'content_invalid', 'database_update_failed', 'email_policy_denied'
       ))
       or (p_provider_message_id is not null and length(p_provider_message_id) > 200) then
        raise exception 'invalid newsletter delivery outcome';
    end if;

    update mailing.trends_newsletter_deliveries
    set status = p_status,
        outcome_code = p_outcome_code,
        provider_message_id = p_provider_message_id,
        completed_at = now(),
        updated_at = now()
    where id = p_delivery_id and status = 'sending';
    changed := found;
    return changed;
end;
$$;

create or replace function mailing.finalize_trends_newsletter_delivery(
    p_trend_date date,
    p_has_more boolean
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
    delivery_counts record;
    next_status text;
begin
    if p_trend_date is null or p_has_more is null then
        raise exception 'invalid newsletter delivery summary';
    end if;

    select
        count(*) filter (where status = 'sent')::integer as sent,
        count(*) filter (where status = 'held')::integer as held,
        count(*) filter (where status = 'failed')::integer as failed,
        count(*) filter (where status = 'skipped')::integer as skipped,
        count(*) filter (where status = 'sending')::integer as sending
    into delivery_counts
    from mailing.trends_newsletter_deliveries
    where trend_date = p_trend_date;

    if p_has_more or delivery_counts.sending > 0 then
        next_status := 'sending';
    elsif delivery_counts.held > 0 and delivery_counts.sent = 0 and delivery_counts.failed = 0
       and delivery_counts.skipped = 0 then
        next_status := 'held';
    elsif delivery_counts.failed > 0 and delivery_counts.sent = 0 and delivery_counts.held = 0 then
        next_status := 'failed';
    elsif delivery_counts.held > 0 or delivery_counts.failed > 0 or delivery_counts.skipped > 0 then
        next_status := 'partial';
    else
        next_status := 'sent';
    end if;

    update mailing.trends_newsletter_runs
    set delivery_status = next_status,
        delivery_started_at = coalesce(delivery_started_at, now()),
        delivery_completed_at = case when next_status = 'sending' then null else now() end,
        updated_at = now()
    where trend_date = p_trend_date;

    return jsonb_build_object(
        'status', next_status,
        'sent', delivery_counts.sent,
        'held', delivery_counts.held,
        'failed', delivery_counts.failed,
        'skipped', delivery_counts.skipped,
        'sending', delivery_counts.sending
    );
end;
$$;

create or replace function mailing.unsubscribe_trends_subscription_by_id(p_subscriber_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare matched_id uuid;
begin
    if p_subscriber_id is null then
        return 'invalid';
    end if;

    update mailing.trends_subscribers
    set status = 'unsubscribed', unsubscribed_at = now(), updated_at = now()
    where id = p_subscriber_id and status in ('pending', 'active')
    returning id into matched_id;
    return case when matched_id is null then 'invalid' else 'unsubscribed' end;
end;
$$;

revoke all on all functions in schema mailing from public, anon, authenticated;
revoke all on function public.save_trends_newsletter_edition(date, text, text, jsonb, text, text, text, text, text, boolean)
    from public, anon, authenticated;
grant execute on function public.save_trends_newsletter_edition(date, text, text, jsonb, text, text, text, text, text, boolean)
    to service_role;
grant execute on function mailing.list_active_trends_subscribers(uuid, integer) to service_role;
grant execute on function mailing.get_trends_newsletter_delivery_context(date) to service_role;
grant execute on function mailing.claim_trends_newsletter_delivery(date, uuid) to service_role;
grant execute on function mailing.record_trends_newsletter_delivery_skipped(date, uuid) to service_role;
grant execute on function mailing.finish_trends_newsletter_delivery(uuid, text, text, text) to service_role;
grant execute on function mailing.finalize_trends_newsletter_delivery(date, boolean) to service_role;
grant execute on function mailing.unsubscribe_trends_subscription_by_id(uuid) to service_role;
