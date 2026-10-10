'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
    DEFAULT_CLOUDFLARE_OAUTH_SCOPES,
    normalizeCloudflareOAuthScopes,
    resolveOAuthApplicationConfig
} = require('./oauth-config');

test('Cloudflare OAuth defaults to the validated Admin scope set', () => {
    assert.deepEqual(DEFAULT_CLOUDFLARE_OAUTH_SCOPES, [
        'memberships.read',
        'workers-scripts.admin',
        'workers-routes.write',
        'dns.read',
        'zone.read',
        'offline_access'
    ]);
    assert.ok(!DEFAULT_CLOUDFLARE_OAUTH_SCOPES.some((scope) => /workers-scripts\.(edit|read|write)/.test(scope)));
});

test('environment-tagged runtime OAuth values override the matching build values', () => {
    const config = resolveOAuthApplicationConfig({
        environment: 'development',
        runtimeEnv: {
            BLOGGENIUS_OAUTH_ENV: 'development',
            CLOUDFLARE_OAUTH_CLIENT_ID: 'dev-client',
            CLOUDFLARE_OAUTH_SCOPES: 'workers-scripts.admin workers-scripts.admin memberships.read'
        },
        buildConfig: {
            BLOGGENIUS_ENV: 'development',
            CLOUDFLARE_OAUTH_CLIENT_ID: 'build-dev-client'
        }
    });
    assert.equal(config.CLOUDFLARE_OAUTH_CLIENT_ID, 'dev-client');
    assert.equal(config.CLOUDFLARE_OAUTH_SCOPES, 'workers-scripts.admin memberships.read');
});

test('mismatched or untagged OAuth runtime values cannot leak into Production', () => {
    const config = resolveOAuthApplicationConfig({
        environment: 'production',
        runtimeEnv: {
            CLOUDFLARE_OAUTH_CLIENT_ID: 'dev-client',
            GOOGLE_OAUTH_CLIENT_ID: 'dev-google'
        },
        buildConfig: {
            BLOGGENIUS_ENV: 'production',
            CLOUDFLARE_OAUTH_CLIENT_ID: 'prod-client',
            GOOGLE_OAUTH_CLIENT_ID: 'prod-google'
        }
    });
    assert.equal(config.CLOUDFLARE_OAUTH_CLIENT_ID, 'prod-client');
    assert.equal(config.GOOGLE_OAUTH_CLIENT_ID, 'prod-google');
    assert.equal(config.CLOUDFLARE_OAUTH_SCOPES, DEFAULT_CLOUDFLARE_OAUTH_SCOPES.join(' '));
});

test('scope values are validated and environment names must be supported', () => {
    assert.deepEqual(normalizeCloudflareOAuthScopes('dns.read dns.read'), ['dns.read']);
    assert.throws(() => normalizeCloudflareOAuthScopes('dns.read&prompt=consent'));
    assert.throws(() => resolveOAuthApplicationConfig({ environment: 'staging' }));
});
