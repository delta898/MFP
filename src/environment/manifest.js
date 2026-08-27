'use strict';

module.exports = Object.freeze({
    schema_version: 1,
    environment_variable: 'BLOGGENIUS_ENV',
    profiles: Object.freeze({
        local: Object.freeze({
            project_name: 'BlogGenius Local',
            project_ref: 'local',
            supabase_url_source: 'BLOGGENIUS_LOCAL_SUPABASE_URL',
            supabase_publishable_key_source: 'BLOGGENIUS_LOCAL_SUPABASE_PUBLISHABLE_KEY',
            allows_destructive_database_operations: true,
            allows_live_publish: false,
            allows_live_payment: false,
            allows_live_notifications: false
        }),
        development: Object.freeze({
            project_name_source: 'BLOGGENIUS_DEVELOPMENT_SUPABASE_PROJECT_NAME',
            project_ref_source: 'BLOGGENIUS_DEVELOPMENT_SUPABASE_PROJECT_REF',
            supabase_url_source: 'BLOGGENIUS_DEVELOPMENT_SUPABASE_URL',
            supabase_publishable_key_source: 'BLOGGENIUS_DEVELOPMENT_SUPABASE_PUBLISHABLE_KEY',
            allows_destructive_database_operations: false,
            allows_live_publish: false,
            allows_live_payment: false,
            allows_live_notifications: false
        }),
        production: Object.freeze({
            project_name_source: 'BLOGGENIUS_PRODUCTION_SUPABASE_PROJECT_NAME',
            project_ref_source: 'BLOGGENIUS_PRODUCTION_SUPABASE_PROJECT_REF',
            supabase_url_source: 'BLOGGENIUS_PRODUCTION_SUPABASE_URL',
            supabase_publishable_key_source: 'BLOGGENIUS_PRODUCTION_SUPABASE_PUBLISHABLE_KEY',
            allows_destructive_database_operations: false,
            allows_live_publish: true,
            allows_live_payment: true,
            allows_live_notifications: true
        })
    })
});
