'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { resolveSupabasePublicConnection } = require('./public-connection');

test('Supabase adapter prefers the selected runtime profile over transitional aliases', () => {
    const connection = resolveSupabasePublicConnection({
        RUNTIME_ENVIRONMENT_PROFILE: {
            configured: true,
            environment: 'development',
            supabase: {
                url: 'https://development-project.supabase.co',
                publishableKey: 'development-key',
                endpointHost: 'development-project.supabase.co'
            }
        },
        LICENSE_CHK_URL: 'https://production-project.supabase.co',
        LICENSE_CHK_KEY: 'legacy-key'
    });

    assert.equal(connection.environment, 'development');
    assert.equal(connection.url, 'https://development-project.supabase.co');
    assert.equal(connection.publishableKey, 'development-key');
});

test('Supabase adapter accepts public runtime config and fails closed when incomplete', () => {
    assert.equal(resolveSupabasePublicConnection({
        SUPABASE_PUBLIC_CONFIG: {
            environment: 'local',
            url: 'http://127.0.0.1:54321',
            publishableKey: 'local-key',
            endpointHost: '127.0.0.1:54321'
        }
    }).configured, true);
    assert.equal(resolveSupabasePublicConnection({
        SUPABASE_PUBLIC_CONFIG: { url: 'https://example.supabase.co', publishableKey: '' }
    }).configured, false);
    assert.equal(resolveSupabasePublicConnection({}).configured, false);
});
