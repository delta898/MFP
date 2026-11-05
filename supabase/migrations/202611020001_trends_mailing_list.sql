create schema if not exists mailing;
revoke all on schema mailing from public, anon, authenticated;
grant usage on schema mailing to service_role;

create table if not exists mailing.trends_subscribers (
    id uuid primary key default gen_random_uuid(),
    email text not null unique,
    categories text[] not null,
    status text not null default 'pending',
    consent_at timestamptz not null,
    consent_version text not null default '2026-11-02',
    consent_source text not null default 'www.bloggenius.kr',
    confirmation_token_hash text,
    confirmation_expires_at timestamptz,
    verified_at timestamptz,
    unsubscribe_token_hash text not null,
    unsubscribed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint trends_subscribers_status_check check (status in ('pending', 'active', 'unsubscribed')),
    constraint trends_subscribers_categories_check check (cardinality(categories) between 1 and 5)
);

alter table mailing.trends_subscribers enable row level security;
revoke all on mailing.trends_subscribers from public, anon, authenticated;
grant all on mailing.trends_subscribers to service_role;

create index if not exists trends_subscribers_status_idx on mailing.trends_subscribers(status);
create index if not exists trends_subscribers_confirmation_expiry_idx on mailing.trends_subscribers(confirmation_expires_at) where status = 'pending';

create or replace function mailing.request_trends_subscription(
    p_email text, p_categories text[], p_consent_at timestamptz,
    p_confirmation_hash text, p_confirmation_expires_at timestamptz,
    p_unsubscribe_hash text, p_consent_version text
) returns text
language plpgsql security definer set search_path = '' as $$
declare current_status text;
begin
    perform pg_advisory_xact_lock(hashtextextended(lower(trim(p_email)), 0));
    select status into current_status from mailing.trends_subscribers where email = lower(trim(p_email)) for update;
    if current_status is null then
        insert into mailing.trends_subscribers(email, categories, status, consent_at, consent_version, confirmation_token_hash, confirmation_expires_at, unsubscribe_token_hash)
        values (lower(trim(p_email)), p_categories, 'pending', p_consent_at, p_consent_version, p_confirmation_hash, p_confirmation_expires_at, p_unsubscribe_hash);
        return 'pending';
    end if;
    if current_status = 'active' then
        return 'active';
    end if;
    update mailing.trends_subscribers set categories = p_categories, status = 'pending', consent_at = p_consent_at, consent_version = p_consent_version,
        confirmation_token_hash = p_confirmation_hash, confirmation_expires_at = p_confirmation_expires_at,
        unsubscribe_token_hash = p_unsubscribe_hash, unsubscribed_at = null, updated_at = now()
    where email = lower(trim(p_email));
    return 'pending';
end;
$$;

create or replace function mailing.confirm_trends_subscription(p_token_hash text)
returns text language plpgsql security definer set search_path = '' as $$
declare matched_id uuid;
begin
    update mailing.trends_subscribers set status = 'active', verified_at = now(), confirmation_token_hash = null,
        confirmation_expires_at = null, updated_at = now()
    where confirmation_token_hash = p_token_hash and status = 'pending' and confirmation_expires_at > now()
    returning id into matched_id;
    return case when matched_id is null then 'invalid' else 'confirmed' end;
end;
$$;

create or replace function mailing.unsubscribe_trends_subscription(p_token_hash text)
returns text language plpgsql security definer set search_path = '' as $$
declare matched_id uuid;
begin
    update mailing.trends_subscribers set status = 'unsubscribed', unsubscribed_at = now(), updated_at = now()
    where unsubscribe_token_hash = p_token_hash and status in ('pending', 'active')
    returning id into matched_id;
    return case when matched_id is null then 'invalid' else 'unsubscribed' end;
end;
$$;

revoke all on all functions in schema mailing from public, anon, authenticated;
grant execute on function mailing.request_trends_subscription(text, text[], timestamptz, text, timestamptz, text, text) to service_role;
grant execute on function mailing.confirm_trends_subscription(text) to service_role;
grant execute on function mailing.unsubscribe_trends_subscription(text) to service_role;
