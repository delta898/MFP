'use strict';

module.exports = Object.freeze({
    schema_version: 1,
    environment_variable: 'BLOGGENIUS_ENV',
    profiles: Object.freeze({
        local: Object.freeze({
            supabase_url_source: 'BLOGGENIUS_LOCAL_SUPABASE_URL',
            supabase_publishable_key_source: 'BLOGGENIUS_LOCAL_SUPABASE_PUBLISHABLE_KEY'
        }),
        development: Object.freeze({
            supabase_url_source: 'BLOGGENIUS_DEVELOPMENT_SUPABASE_URL',
            supabase_publishable_key_source: 'BLOGGENIUS_DEVELOPMENT_SUPABASE_PUBLISHABLE_KEY'
        }),
        production: Object.freeze({
            supabase_url_source: 'BLOGGENIUS_PRODUCTION_SUPABASE_URL',
            supabase_publishable_key_source: 'BLOGGENIUS_PRODUCTION_SUPABASE_PUBLISHABLE_KEY'
        })
    })
});
