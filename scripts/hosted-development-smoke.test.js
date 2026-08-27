'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    resolveSmokeConfig,
    runHostedDevelopmentSmoke
} = require('./hosted-development-smoke');

const ENV = Object.freeze({
    BLOGGENIUS_ENV: 'development',
    BLOGGENIUS_DEVELOPMENT_SUPABASE_URL: 'https://development.example.invalid',
    BLOGGENIUS_DEVELOPMENT_SUPABASE_PUBLISHABLE_KEY: 'development-public-key',
    BLOGGENIUS_PRODUCTION_SUPABASE_URL: 'https://production.example.invalid'
});

test('safe smoke refuses production, missing key, non-HTTPS, and production targets', () => {
    assert.throws(() => resolveSmokeConfig({}), /must be development/);
    assert.throws(() => resolveSmokeConfig({
        ...ENV,
        BLOGGENIUS_DEVELOPMENT_SUPABASE_PUBLISHABLE_KEY: ''
    }), /public Supabase key is required/);
    assert.throws(() => resolveSmokeConfig({
        ...ENV,
        BLOGGENIUS_DEVELOPMENT_SUPABASE_URL: 'http://development.example.invalid'
    }), /must use HTTPS/);
    assert.throws(() => resolveSmokeConfig({
        ...ENV,
        BLOGGENIUS_DEVELOPMENT_SUPABASE_URL: ENV.BLOGGENIUS_PRODUCTION_SUPABASE_URL
    }), /matches production/);
});

test('safe smoke uses only public Supabase HTTP endpoints without mutations or provider calls', async () => {
    const calls = [];
    const result = await runHostedDevelopmentSmoke({
        env: ENV,
        fetch: async (url, init = {}) => {
            calls.push({ url, init });
            return {
                status: url.endsWith('/rest/v1/') ? 200 : 405,
                text: async () => ''
            };
        }
    });

    assert.equal(result.passed, true);
    assert.equal(result.connection, 'supabase_http');
    assert.equal(result.paidProviderCalls, false);
    assert.equal(result.mutations, false);
    assert.equal(calls.length, 6);
    assert.ok(calls.slice(1).every((call) => call.init.method === 'GET'));
    assert.ok(calls.every((call) => call.init.headers.apikey === 'development-public-key'));
    assert.ok(calls.every((call) => !call.url.includes('production.example.invalid')));
    assert.doesNotMatch(JSON.stringify(calls), /SSH|Docker|Compose|functions\.env/i);
});

test('safe smoke accepts only the explicit REST root restriction of a new publishable key', async () => {
    const result = await runHostedDevelopmentSmoke({
        env: {
            ...ENV,
            BLOGGENIUS_DEVELOPMENT_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test'
        },
        fetch: async (url) => ({
            status: url.endsWith('/rest/v1/') ? 401 : 401,
            text: async () => url.endsWith('/rest/v1/')
                ? JSON.stringify({ message: 'Secret API key required' })
                : ''
        })
    });

    assert.equal(result.passed, true);
    assert.deepEqual(result.checks[0], { name: 'rest_gateway', ok: true, status: 401 });
});

test('safe smoke rejects an undifferentiated REST authentication failure', async () => {
    const result = await runHostedDevelopmentSmoke({
        env: ENV,
        fetch: async (url) => ({
            status: url.endsWith('/rest/v1/') ? 401 : 405,
            text: async () => JSON.stringify({ message: 'Invalid API key' })
        })
    });

    assert.equal(result.passed, false);
    assert.equal(result.checks[0].ok, false);
});
