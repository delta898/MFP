-- Replace application-side row scanning with one database-side metadata aggregate.
-- Run this after 001_create_naver_trends.sql on existing deployments.

create or replace function trends.get_items_meta(
    p_source text default null,
    p_trend_date date default null,
    p_date_from date default null,
    p_date_to date default null
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, trends
as $$
    with filtered as materialized (
        select source, trend_date, category
        from trends.items
        where (p_source is null or source = p_source)
          and (p_trend_date is null or trend_date = p_trend_date)
          and (p_date_from is null or trend_date >= p_date_from)
          and (p_date_to is null or trend_date <= p_date_to)
    ),
    category_values as (
        select coalesce(jsonb_agg(category order by category), '[]'::jsonb) as value
        from (select distinct category from filtered) categories
    ),
    source_values as (
        select coalesce(jsonb_agg(source order by source), '[]'::jsonb) as value
        from (select distinct source from filtered) sources
    ),
    date_values as (
        select coalesce(jsonb_agg(trend_date order by trend_date), '[]'::jsonb) as value
        from (select distinct trend_date from filtered) dates
    ),
    range_values as (
        select min(trend_date) as min_date, max(trend_date) as max_date, count(*) as total_rows
        from filtered
    )
    select jsonb_build_object(
        'categories', category_values.value,
        'sources', source_values.value,
        'availableDates', date_values.value,
        'dateRange', jsonb_build_object(
            'min', range_values.min_date,
            'max', range_values.max_date
        ),
        'totalRows', range_values.total_rows
    )
    from category_values, source_values, date_values, range_values;
$$;

revoke all on function trends.get_items_meta(text, date, date, date) from public, anon, authenticated;
grant execute on function trends.get_items_meta(text, date, date, date) to service_role;
