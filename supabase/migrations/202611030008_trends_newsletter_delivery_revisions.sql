-- Preserve every recipient outcome and isolate intentional resend campaigns by
-- revision. Rows from the original single-campaign ledger become revision 1.
alter table mailing.trends_newsletter_deliveries
    add column delivery_revision integer not null default 1;

alter table mailing.trends_newsletter_deliveries
    drop constraint trends_newsletter_deliveries_trend_date_subscriber_id_key;

alter table mailing.trends_newsletter_deliveries
    add constraint trends_newsletter_deliveries_revision_positive_check
        check (delivery_revision > 0),
    add constraint trends_newsletter_deliveries_date_revision_subscriber_key
        unique (trend_date, delivery_revision, subscriber_id);

alter table mailing.trends_newsletter_collection_logs
    add column force_resend boolean not null default false,
    add column delivery_revision integer,
    add constraint trends_newsletter_collection_logs_delivery_revision_check
        check (delivery_revision is null or delivery_revision > 0);

create index trends_newsletter_deliveries_date_revision_status_idx
    on mailing.trends_newsletter_deliveries (trend_date, delivery_revision, status);

create or replace function mailing.begin_trends_newsletter_delivery(
    p_trend_date date,
    p_signal_id uuid,
    p_force_resend boolean default false
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
    run_row mailing.trends_newsletter_daily_status%rowtype;
    log_row mailing.trends_newsletter_collection_logs%rowtype;
    latest_revision integer;
    chosen_revision integer;
begin
    if p_trend_date is null or p_signal_id is null or p_force_resend is null then
        raise exception 'invalid newsletter delivery campaign request';
    end if;

    select * into run_row
    from mailing.trends_newsletter_daily_status
    where trend_date = p_trend_date
    for update;
    if not found or run_row.collection_status <> 'complete'
       or run_row.edition_status <> 'draft_ready'
       or not exists (
           select 1 from mailing.trends_newsletter_editions as edition
           where edition.trend_date = p_trend_date and edition.status = 'ready'
       ) then
        raise exception 'newsletter is not ready for delivery';
    end if;

    select * into log_row
    from mailing.trends_newsletter_collection_logs
    where signal_id = p_signal_id and trend_date = p_trend_date
    for update;
    if not found or log_row.status <> 'running' then
        raise exception 'newsletter collection signal is not running';
    end if;

    -- Workflow retries must resume the same campaign revision, never allocate
    -- another revision for the same signal.
    if log_row.delivery_revision is not null then
        return jsonb_build_object(
            'shouldDeliver', true,
            'deliveryRevision', log_row.delivery_revision,
            'forceResend', log_row.force_resend,
            'resumed', true
        );
    end if;

    if exists (
        select 1 from mailing.trends_newsletter_collection_logs as other_log
        where other_log.trend_date = p_trend_date and other_log.status = 'running'
          and other_log.signal_id <> p_signal_id
    ) then
        raise exception 'another newsletter workflow is running for this date';
    end if;

    -- Collection logs are the campaign ledger even when the recipient list is
    -- empty, so they remain the source of truth for the latest revision.
    select greatest(
        coalesce((
            select max(delivery.delivery_revision)
            from mailing.trends_newsletter_deliveries as delivery
            where delivery.trend_date = p_trend_date
        ), 0),
        coalesce((
            select max(log.delivery_revision)
            from mailing.trends_newsletter_collection_logs as log
            where log.trend_date = p_trend_date
        ), 0)
    ) into latest_revision;

    if coalesce(latest_revision, 0) = 0 then
        chosen_revision := 1;
    elsif not p_force_resend then
        update mailing.trends_newsletter_collection_logs
        set force_resend = false, delivery_revision = latest_revision, updated_at = now()
        where signal_id = p_signal_id;
        return jsonb_build_object(
            'shouldDeliver', false,
            'alreadyProcessed', true,
            'deliveryRevision', latest_revision,
            'forceResend', false
        );
    else
        if exists (
            select 1 from mailing.trends_newsletter_deliveries as delivery
            where delivery.trend_date = p_trend_date
              and delivery.delivery_revision = latest_revision
              and delivery.status in ('sending', 'held')
        ) then
            raise exception 'latest newsletter campaign has an in-progress or ambiguous outcome';
        end if;
        chosen_revision := latest_revision + 1;
    end if;

    update mailing.trends_newsletter_collection_logs
    set force_resend = p_force_resend,
        delivery_revision = chosen_revision,
        updated_at = now()
    where signal_id = p_signal_id;

    update mailing.trends_newsletter_daily_status
    set delivery_status = 'queued', delivery_started_at = now(),
        delivery_completed_at = null, updated_at = now()
    where trend_date = p_trend_date;

    return jsonb_build_object(
        'shouldDeliver', true,
        'deliveryRevision', chosen_revision,
        'forceResend', p_force_resend,
        'resumed', false
    );
end;
$$;

create or replace function mailing.record_trends_newsletter_delivery_skipped(
    p_trend_date date,
    p_delivery_revision integer,
    p_subscriber_id uuid
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare inserted_id uuid;
begin
    if p_trend_date is null or p_delivery_revision is null
       or p_delivery_revision < 1 or p_subscriber_id is null then
        raise exception 'invalid skipped newsletter delivery';
    end if;
    if not exists (
        select 1 from mailing.trends_newsletter_daily_status as run
        join mailing.trends_newsletter_editions as edition using (trend_date)
        where run.trend_date = p_trend_date and run.collection_status = 'complete'
          and edition.status = 'ready'
    ) then
        raise exception 'newsletter is not eligible for delivery';
    end if;
    if not exists (
        select 1
        from mailing.trends_newsletter_collection_logs as log
        where log.trend_date = p_trend_date
          and log.delivery_revision = p_delivery_revision
          and log.status = 'running'
          and p_delivery_revision = (
              select max(current_log.delivery_revision)
              from mailing.trends_newsletter_collection_logs as current_log
              where current_log.trend_date = p_trend_date
          )
    ) then
        raise exception 'newsletter delivery revision is not current';
    end if;
    if not exists (
        select 1 from mailing.trends_newsletter_subscribers
        where id = p_subscriber_id and status = 'active'
    ) then
        return false;
    end if;

    insert into mailing.trends_newsletter_deliveries(
        trend_date, delivery_revision, subscriber_id, status, outcome_code, completed_at
    ) values (p_trend_date, p_delivery_revision, p_subscriber_id, 'skipped', 'email_policy_denied', now())
    on conflict (trend_date, delivery_revision, subscriber_id) do nothing
    returning id into inserted_id;
    return inserted_id is not null;
end;
$$;

create or replace function mailing.claim_trends_newsletter_delivery(
    p_trend_date date,
    p_delivery_revision integer,
    p_subscriber_id uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
    run_row mailing.trends_newsletter_daily_status%rowtype;
    subscriber_row mailing.trends_newsletter_subscribers%rowtype;
    delivery_id uuid;
    existing_status text;
    existing_outcome text;
begin
    if p_trend_date is null or p_delivery_revision is null
       or p_delivery_revision < 1 or p_subscriber_id is null then
        raise exception 'invalid newsletter delivery claim';
    end if;

    select * into run_row
    from mailing.trends_newsletter_daily_status
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
    if not exists (
        select 1 from mailing.trends_newsletter_collection_logs as log
        where log.trend_date = p_trend_date and log.delivery_revision = p_delivery_revision
          and log.status = 'running'
    ) then
        raise exception 'newsletter delivery revision is not registered';
    end if;
    if p_delivery_revision <> (
        select max(log.delivery_revision)
        from mailing.trends_newsletter_collection_logs as log
        where log.trend_date = p_trend_date
    ) then
        raise exception 'newsletter delivery revision is not current';
    end if;

    select * into subscriber_row
    from mailing.trends_newsletter_subscribers
    where id = p_subscriber_id
    for update;
    if not found or subscriber_row.status <> 'active' then
        return jsonb_build_object('outcome', 'inactive');
    end if;

    insert into mailing.trends_newsletter_deliveries(trend_date, delivery_revision, subscriber_id, status)
    values (p_trend_date, p_delivery_revision, p_subscriber_id, 'sending')
    on conflict (trend_date, delivery_revision, subscriber_id) do nothing
    returning id into delivery_id;

    if delivery_id is null then
        select status, outcome_code into existing_status, existing_outcome
        from mailing.trends_newsletter_deliveries
        where trend_date = p_trend_date and delivery_revision = p_delivery_revision
          and subscriber_id = p_subscriber_id;
        if existing_status = 'skipped' and existing_outcome = 'email_policy_denied' then
            update mailing.trends_newsletter_deliveries
            set status = 'sending', outcome_code = null, completed_at = null,
                claimed_at = now(), updated_at = now()
            where trend_date = p_trend_date and delivery_revision = p_delivery_revision
              and subscriber_id = p_subscriber_id
            returning id into delivery_id;
        else
            return jsonb_build_object('outcome', 'already_claimed', 'status', existing_status);
        end if;
    end if;

    if delivery_id is null then
        return jsonb_build_object('outcome', 'already_claimed', 'status', existing_status);
    end if;

    update mailing.trends_newsletter_daily_status
    set delivery_status = 'sending', delivery_started_at = coalesce(delivery_started_at, now()),
        delivery_completed_at = null, updated_at = now()
    where trend_date = p_trend_date;

    return jsonb_build_object(
        'outcome', 'claimed', 'delivery_id', delivery_id,
        'email', subscriber_row.email, 'categories', to_jsonb(subscriber_row.categories)
    );
end;
$$;

create or replace function mailing.finalize_trends_newsletter_delivery(
    p_trend_date date,
    p_delivery_revision integer,
    p_has_more boolean
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
    delivery_counts record;
    next_status text;
    latest_revision integer;
begin
    if p_trend_date is null or p_delivery_revision is null
       or p_delivery_revision < 1 or p_has_more is null then
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
    where trend_date = p_trend_date and delivery_revision = p_delivery_revision;

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

    select max(delivery_revision) into latest_revision
    from mailing.trends_newsletter_collection_logs where trend_date = p_trend_date;
    if latest_revision = p_delivery_revision then
        update mailing.trends_newsletter_daily_status
        set delivery_status = next_status,
            delivery_started_at = coalesce(delivery_started_at, now()),
            delivery_completed_at = case when next_status = 'sending' then null else now() end,
            updated_at = now()
        where trend_date = p_trend_date;
    end if;

    return jsonb_build_object(
        'status', next_status, 'deliveryRevision', p_delivery_revision,
        'sent', delivery_counts.sent, 'held', delivery_counts.held,
        'failed', delivery_counts.failed, 'skipped', delivery_counts.skipped,
        'sending', delivery_counts.sending
    );
end;
$$;

revoke all on function mailing.begin_trends_newsletter_delivery(date, uuid, boolean)
    from public, anon, authenticated;
grant execute on function mailing.begin_trends_newsletter_delivery(date, uuid, boolean) to service_role;
grant execute on function mailing.claim_trends_newsletter_delivery(date, integer, uuid) to service_role;
grant execute on function mailing.record_trends_newsletter_delivery_skipped(date, integer, uuid) to service_role;
grant execute on function mailing.finalize_trends_newsletter_delivery(date, integer, boolean) to service_role;

-- Remove pre-revision RPC entry points so callers cannot bypass campaign scoping.
drop function if exists mailing.record_trends_newsletter_delivery_skipped(date, uuid);
drop function if exists mailing.claim_trends_newsletter_delivery(date, uuid);
drop function if exists mailing.finalize_trends_newsletter_delivery(date, boolean);
