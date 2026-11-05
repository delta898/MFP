-- Keep existing rows and foreign keys while making the newsletter tables
-- describe the state or records they own.
alter table mailing.trends_newsletter_runs
    rename to trends_newsletter_daily_status;

alter table mailing.trends_newsletter_attempts
    rename to trends_newsletter_collection_logs;

alter table mailing.trends_subscribers
    rename to trends_newsletter_subscribers;

alter table mailing.trends_newsletter_daily_status
    rename constraint trends_newsletter_runs_pkey
    to trends_newsletter_daily_status_pkey;
alter table mailing.trends_newsletter_daily_status
    rename constraint trends_newsletter_runs_trend_date_key
    to trends_newsletter_daily_status_trend_date_key;
alter table mailing.trends_newsletter_collection_logs
    rename constraint trends_newsletter_attempts_pkey
    to trends_newsletter_collection_logs_pkey;
alter table mailing.trends_newsletter_collection_logs
    rename constraint trends_newsletter_attempts_workflow_id_key
    to trends_newsletter_collection_logs_workflow_id_key;
alter table mailing.trends_newsletter_collection_logs
    rename constraint trends_newsletter_attempts_trend_date_fkey
    to trends_newsletter_collection_logs_trend_date_fkey;
alter table mailing.trends_newsletter_subscribers
    rename constraint trends_subscribers_pkey
    to trends_newsletter_subscribers_pkey;
alter table mailing.trends_newsletter_subscribers
    rename constraint trends_subscribers_email_key
    to trends_newsletter_subscribers_email_key;

alter index mailing.trends_newsletter_attempts_date_created_idx
    rename to trends_newsletter_collection_logs_date_created_idx;
alter index mailing.trends_subscribers_status_idx
    rename to trends_newsletter_subscribers_status_idx;
alter index mailing.trends_subscribers_confirmation_expiry_idx
    rename to trends_newsletter_subscribers_confirmation_expiry_idx;

alter table mailing.trends_newsletter_collection_logs
    rename constraint trends_newsletter_attempt_error_code_check
    to trends_newsletter_collection_log_error_code_check;
alter table mailing.trends_newsletter_subscribers
    rename constraint trends_subscribers_status_check
    to trends_newsletter_subscribers_status_check;
alter table mailing.trends_newsletter_subscribers
    rename constraint trends_subscribers_categories_check
    to trends_newsletter_subscribers_categories_check;

-- PostgreSQL tracks table dependencies for SQL objects, but table names inside
-- PL/pgSQL source are resolved at execution time. Recreate affected functions
-- from their current definitions with only the qualified relation names changed.
do $$
declare
    function_row record;
    function_definition text;
    updated_definition text;
begin
    for function_row in
        select p.oid
        from pg_proc as p
        join pg_namespace as n on n.oid = p.pronamespace
        where n.nspname in ('mailing', 'public')
          and p.prokind = 'f'
          and (
              p.prosrc like '%mailing.trends_newsletter_runs%'
              or p.prosrc like '%mailing.trends_newsletter_attempts%'
              or p.prosrc like '%mailing.trends_subscribers%'
          )
    loop
        function_definition := pg_get_functiondef(function_row.oid);
        updated_definition := replace(
            function_definition,
            'mailing.trends_newsletter_runs',
            'mailing.trends_newsletter_daily_status'
        );
        updated_definition := replace(
            updated_definition,
            'mailing.trends_newsletter_attempts',
            'mailing.trends_newsletter_collection_logs'
        );
        updated_definition := replace(
            updated_definition,
            'mailing.trends_subscribers',
            'mailing.trends_newsletter_subscribers'
        );

        if updated_definition is distinct from function_definition then
            execute updated_definition;
        end if;
    end loop;
end;
$$;
