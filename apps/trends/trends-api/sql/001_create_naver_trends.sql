create schema if not exists trends;
create extension if not exists pgcrypto;

grant usage on schema trends to anon, authenticated, service_role;
grant all on all tables in schema trends to anon, authenticated, service_role;
grant all on all routines in schema trends to anon, authenticated, service_role;
grant all on all sequences in schema trends to anon, authenticated, service_role;
alter default privileges for role postgres in schema trends grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema trends grant all on routines to anon, authenticated, service_role;
alter default privileges for role postgres in schema trends grant all on sequences to anon, authenticated, service_role;

create table if not exists trends.items (
    id uuid primary key default gen_random_uuid(),
    source text not null,
    trend_date date not null,
    collected_at timestamptz not null,
    category text not null,
    keyword text not null,
    change_raw text not null,
    change_type text not null,
    change_amount integer null,
    display_order integer not null,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint trends_items_change_type_check
        check (change_type in ('up', 'down', 'new', 'steady')),
    constraint trends_items_change_amount_check
        check (
            (change_type in ('new', 'steady') and change_amount is null)
            or
            (change_type in ('up', 'down') and change_amount is not null and change_amount >= 0)
        ),
    constraint trends_items_display_order_check
        check (display_order > 0)
);

create unique index if not exists trends_items_source_date_category_keyword_idx
    on trends.items (source, trend_date, category, keyword);

create index if not exists trends_items_trend_date_idx
    on trends.items (trend_date desc);

create index if not exists trends_items_category_trend_date_idx
    on trends.items (category, trend_date desc);

create index if not exists trends_items_source_trend_date_idx
    on trends.items (source, trend_date desc);

create index if not exists trends_items_keyword_idx
    on trends.items (keyword);

create or replace function public.set_current_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists set_trends_items_updated_at on trends.items;

create trigger set_trends_items_updated_at
before update on trends.items
for each row
execute function public.set_current_timestamp_updated_at();
