'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    createBuildEnvironmentConfig,
    serializeBuildEnvironmentConfig,
    validateBuildEnvironmentConfig
} = require('./build-environment-config');

test('production build config requires an explicit remote HTTPS endpoint', () => {
    const config = createBuildEnvironmentConfig({
        environment: 'production',
        supabaseUrl: 'https://production-project.supabase.co',
        publishableKey: 'publishable-key',
        trendsApiUrl: 'https://trendapi.example.com',
        googleOauthClientId: 'google-client-id',
        googleOauthClientSecret: 'google-client-secret'
    });

    assert.equal(config.BLOGGENIUS_ENV, 'production');
    assert.equal(config.SUPABASE_PUBLISHABLE_KEY, 'publishable-key');
    assert.throws(() => createBuildEnvironmentConfig({
        environment: 'production',
        supabaseUrl: 'http://127.0.0.1:54321',
        publishableKey: 'local-key',
        trendsApiUrl: 'https://trendapi.example.com',
        googleOauthClientId: 'google-client-id',
        googleOauthClientSecret: 'google-client-secret'
    }), /hosted_requires_remote_https/);
});

test('build config requires a complete Google OAuth client pair', () => {
    assert.throws(() => createBuildEnvironmentConfig({
        environment: 'production',
        supabaseUrl: 'https://production-project.supabase.co',
        publishableKey: 'publishable-key',
        trendsApiUrl: 'https://trendapi.example.com',
        googleOauthClientId: 'google-client-id'
    }), /Missing production Google OAuth client configuration/);
});

test('build validation refuses a target mismatch', () => {
    assert.throws(() => validateBuildEnvironmentConfig({
        BLOGGENIUS_ENV: 'development',
        SUPABASE_URL: 'https://development-project.supabase.co',
        SUPABASE_PUBLISHABLE_KEY: 'development-key',
        TRENDS_API_URL: 'https://trendapi-dev.example.com',
        GOOGLE_OAUTH_CLIENT_ID: 'google-client-id',
        GOOGLE_OAUTH_CLIENT_SECRET: 'google-client-secret'
    }, 'production'), /Build environment mismatch/);
});

test('serialized build config contains the selected environment and no legacy names', () => {
    const serialized = serializeBuildEnvironmentConfig(createBuildEnvironmentConfig({
        environment: 'development',
        supabaseUrl: 'https://development-project.supabase.co',
        publishableKey: 'development-key',
        trendsApiUrl: 'https://trendapi-dev.example.com',
        googleOauthClientId: 'google-client-id',
        googleOauthClientSecret: 'google-client-secret'
    }));

    assert.match(serialized, /BLOGGENIUS_ENV/);
    assert.match(serialized, /SUPABASE_PUBLISHABLE_KEY/);
    assert.match(serialized, /TRENDS_API_URL/);
    assert.match(serialized, /GOOGLE_OAUTH_CLIENT_ID/);
    assert.match(serialized, /GOOGLE_OAUTH_CLIENT_SECRET/);
    assert.doesNotMatch(serialized, /LICENSE_CHK_/);
});

test('build config requires an environment-compatible Trends API URL', () => {
    assert.throws(() => createBuildEnvironmentConfig({
        environment: 'production',
        supabaseUrl: 'https://production-project.supabase.co',
        publishableKey: 'publishable-key',
        trendsApiUrl: 'http://127.0.0.1:4581',
        googleOauthClientId: 'google-client-id',
        googleOauthClientSecret: 'google-client-secret'
    }), /Invalid production Trends API URL/);
});
