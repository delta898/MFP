create table if not exists mailing.trends_subscription_change_requests (
    id uuid primary key default gen_random_uuid(),
    subscriber_id uuid not null references mailing.trends_newsletter_subscribers(id) on delete cascade,
    requested_categories text[] not null,
    confirmation_token_hash text not null unique,
    confirmation_expires_at timestamptz not null,
    status text not null default 'pending',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint trends_subscription_change_categories_check check (cardinality(requested_categories) between 1 and 10),
    constraint trends_subscription_change_status_check check (status in ('pending', 'confirmed', 'replaced', 'cancelled'))
);

alter table mailing.trends_subscription_change_requests enable row level security;
revoke all on mailing.trends_subscription_change_requests from public, anon, authenticated;
grant all on mailing.trends_subscription_change_requests to service_role;
create unique index if not exists trends_subscription_one_pending_change_idx
    on mailing.trends_subscription_change_requests(subscriber_id) where status = 'pending';

create or replace function mailing.request_trends_subscription(
    p_email text, p_categories text[], p_consent_at timestamptz,
    p_confirmation_hash text, p_confirmation_expires_at timestamptz,
    p_unsubscribe_hash text, p_consent_version text
) returns text
language plpgsql security definer set search_path = '' as $$
declare subscriber mailing.trends_newsletter_subscribers%rowtype;
begin
    perform pg_advisory_xact_lock(hashtextextended(lower(trim(p_email)), 0));
    select * into subscriber from mailing.trends_newsletter_subscribers where email = lower(trim(p_email)) for update;
    if not found then
        insert into mailing.trends_newsletter_subscribers(email, categories, status, consent_at, consent_version, confirmation_token_hash, confirmation_expires_at, unsubscribe_token_hash)
        values (lower(trim(p_email)), p_categories, 'pending', p_consent_at, p_consent_version, p_confirmation_hash, p_confirmation_expires_at, p_unsubscribe_hash);
        return 'pending';
    end if;
    if subscriber.status = 'active' then
        if (select array_agg(category order by category) from unnest(subscriber.categories) as category)
            = (select array_agg(category order by category) from unnest(p_categories) as category) then
            update mailing.trends_subscription_change_requests set status = 'cancelled', updated_at = now()
            where subscriber_id = subscriber.id and status = 'pending';
            return 'already_active';
        end if;
        update mailing.trends_subscription_change_requests set status = 'replaced', updated_at = now()
        where subscriber_id = subscriber.id and status = 'pending';
        insert into mailing.trends_subscription_change_requests(subscriber_id, requested_categories, confirmation_token_hash, confirmation_expires_at)
        values (subscriber.id, p_categories, p_confirmation_hash, p_confirmation_expires_at);
        return 'change_requested';
    end if;
    update mailing.trends_subscription_change_requests set status = 'cancelled', updated_at = now()
    where subscriber_id = subscriber.id and status = 'pending';
    update mailing.trends_newsletter_subscribers set categories = p_categories, status = 'pending', consent_at = p_consent_at, consent_version = p_consent_version,
        confirmation_token_hash = p_confirmation_hash, confirmation_expires_at = p_confirmation_expires_at,
        unsubscribe_token_hash = p_unsubscribe_hash, unsubscribed_at = null, updated_at = now()
    where id = subscriber.id;
    return 'pending';
end;
$$;

create or replace function mailing.preview_trends_subscription_confirmation(p_token_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare requested text[]; valid boolean := false;
begin
    select requested_categories into requested from mailing.trends_subscription_change_requests
    where confirmation_token_hash = p_token_hash and status = 'pending' and confirmation_expires_at > now();
    if found then return jsonb_build_object('valid', true, 'categories', requested); end if;
    select categories into requested from mailing.trends_newsletter_subscribers
    where confirmation_token_hash = p_token_hash and status = 'pending' and confirmation_expires_at > now();
    if found then return jsonb_build_object('valid', true, 'categories', requested); end if;
    return jsonb_build_object('valid', false, 'categories', '[]'::jsonb);
end;
$$;

create or replace function mailing.confirm_trends_subscription_with_categories(p_token_hash text, p_categories text[], p_consent_version text)
returns text language plpgsql security definer set search_path = '' as $$
declare change_request mailing.trends_subscription_change_requests%rowtype; matched_id uuid; change_subscriber_id uuid;
begin
    select subscriber_id into change_subscriber_id from mailing.trends_subscription_change_requests
    where confirmation_token_hash = p_token_hash and status = 'pending' and confirmation_expires_at > now();
    if found then
        perform 1 from mailing.trends_newsletter_subscribers where id = change_subscriber_id for update;
    end if;
    select * into change_request from mailing.trends_subscription_change_requests
    where confirmation_token_hash = p_token_hash and status = 'pending' and confirmation_expires_at > now() for update;
    if found then
        update mailing.trends_newsletter_subscribers set categories = p_categories, consent_at = now(), consent_version = p_consent_version, updated_at = now()
        where id = change_request.subscriber_id and status = 'active' returning id into matched_id;
        if matched_id is null then return 'invalid'; end if;
        update mailing.trends_subscription_change_requests set status = 'confirmed', requested_categories = p_categories, updated_at = now() where id = change_request.id;
        return 'confirmed';
    end if;
    update mailing.trends_newsletter_subscribers set categories = p_categories, status = 'active', verified_at = now(), consent_at = now(), consent_version = p_consent_version,
        confirmation_token_hash = null, confirmation_expires_at = null, updated_at = now()
    where confirmation_token_hash = p_token_hash and status = 'pending' and confirmation_expires_at > now() returning id into matched_id;
    return case when matched_id is null then 'invalid' else 'confirmed' end;
end;
$$;

create or replace function mailing.confirm_trends_subscription(p_token_hash text)
returns text language plpgsql security definer set search_path = '' as $$
declare requested text[];
begin
    select requested_categories into requested from mailing.trends_subscription_change_requests
    where confirmation_token_hash = p_token_hash and status = 'pending' and confirmation_expires_at > now();
    if found then
        return mailing.confirm_trends_subscription_with_categories(p_token_hash, requested, '2026-11-02');
    end if;
    update mailing.trends_newsletter_subscribers set status = 'active', verified_at = now(), confirmation_token_hash = null,
        confirmation_expires_at = null, updated_at = now()
    where confirmation_token_hash = p_token_hash and status = 'pending' and confirmation_expires_at > now();
    return case when found then 'confirmed' else 'invalid' end;
end;
$$;

create or replace function mailing.unsubscribe_trends_subscription(p_token_hash text)
returns text language plpgsql security definer set search_path = '' as $$
declare matched_id uuid;
begin
    update mailing.trends_newsletter_subscribers set status = 'unsubscribed', unsubscribed_at = now(), updated_at = now()
    where unsubscribe_token_hash = p_token_hash and status in ('pending', 'active') returning id into matched_id;
    if matched_id is not null then
        update mailing.trends_subscription_change_requests set status = 'cancelled', updated_at = now()
        where subscriber_id = matched_id and status = 'pending';
    end if;
    return case when matched_id is null then 'invalid' else 'unsubscribed' end;
end;
$$;

create or replace function mailing.unsubscribe_trends_subscription_by_id(p_subscriber_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare matched_id uuid;
begin
    if p_subscriber_id is null then return 'invalid'; end if;
    update mailing.trends_newsletter_subscribers set status = 'unsubscribed', unsubscribed_at = now(), updated_at = now()
    where id = p_subscriber_id and status in ('pending', 'active') returning id into matched_id;
    if matched_id is not null then
        update mailing.trends_subscription_change_requests set status = 'cancelled', updated_at = now()
        where subscriber_id = matched_id and status = 'pending';
    end if;
    return case when matched_id is null then 'invalid' else 'unsubscribed' end;
end;
$$;

revoke all on all functions in schema mailing from public, anon, authenticated;
grant execute on function mailing.request_trends_subscription(text, text[], timestamptz, text, timestamptz, text, text) to service_role;
grant execute on function mailing.confirm_trends_subscription(text) to service_role;
grant execute on function mailing.preview_trends_subscription_confirmation(text) to service_role;
grant execute on function mailing.confirm_trends_subscription_with_categories(text, text[], text) to service_role;
grant execute on function mailing.unsubscribe_trends_subscription(text) to service_role;
grant execute on function mailing.unsubscribe_trends_subscription_by_id(uuid) to service_role;
