'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    STATUS,
    resolveRuntimeEnvironmentProfile,
    resolveSupabasePublicConnection,
    resolveTrendsApiPublicConnection,
    toSafeRuntimeEnvironmentDiagnostic,
    validatePublicUrl
} = require('./runtime-profile');

const DEV_URL = 'https://development-project.supabase.co';
const PROD_URL = 'https://production-project.supabase.co';

test('missing environment fails closed without using legacy production build values', () => {
    const profile = resolveRuntimeEnvironmentProfile({
        env: {},
        buildConfig: {
            LICENSE_CHK_URL: PROD_URL,
            LICENSE_CHK_KEY: 'legacy-production-key'
        }
    });

    assert.equal(profile.status, STATUS.ENVIRONMENT_NOT_SELECTED);
    assert.equal(profile.configured, false);
    assert.equal(profile.effects.livePublish, false);
    assert.equal(profile.supabase.url, '');
});

test('unknown environment is not silently normalized to production', () => {
    const profile = resolveRuntimeEnvironmentProfile({ env: { BLOGGENIUS_ENV: 'dev' } });
    assert.equal(profile.status, STATUS.ENVIRONMENT_INVALID);
    assert.equal(profile.configured, false);
});

test('local profile requires a local endpoint', () => {
    const valid = resolveRuntimeEnvironmentProfile({
        env: {
            BLOGGENIUS_ENV: 'local',
            BLOGGENIUS_LOCAL_SUPABASE_URL: 'http://127.0.0.1:54321',
            BLOGGENIUS_LOCAL_SUPABASE_PUBLISHABLE_KEY: 'local-key'
        }
    });
    const invalid = resolveRuntimeEnvironmentProfile({
        env: {
            BLOGGENIUS_ENV: 'local',
            BLOGGENIUS_LOCAL_SUPABASE_URL: PROD_URL,
            BLOGGENIUS_LOCAL_SUPABASE_PUBLISHABLE_KEY: 'wrong-key'
        }
    });

    assert.equal(valid.status, STATUS.READY);
    assert.equal(valid.effects.livePublish, false);
    assert.equal(valid.supabase.endpointHost, '127.0.0.1:54321');
    assert.equal(invalid.status, STATUS.PUBLIC_CONFIG_INVALID);
});

test('hosted profiles require a remote HTTPS endpoint', () => {
    assert.equal(validatePublicUrl('development', DEV_URL).valid, true);
    assert.equal(validatePublicUrl('production', 'http://localhost:54321').valid, false);
    assert.equal(validatePublicUrl('production', 'http://production.example.com').valid, false);
});

test('explicit process environment wins over a matching build profile', () => {
    const profile = resolveRuntimeEnvironmentProfile({
        env: {
            BLOGGENIUS_ENV: 'development',
            BLOGGENIUS_DEVELOPMENT_SUPABASE_URL: DEV_URL,
            BLOGGENIUS_DEVELOPMENT_SUPABASE_PUBLISHABLE_KEY: 'development-key'
        },
        buildConfig: {
            BLOGGENIUS_ENV: 'production',
            SUPABASE_URL: PROD_URL,
            SUPABASE_PUBLISHABLE_KEY: 'production-key'
        }
    });

    assert.equal(profile.environment, 'development');
    assert.equal(profile.effects.livePublish, false);
    assert.equal(profile.supabase.url, DEV_URL);
    assert.equal(profile.supabase.publishableKey, 'development-key');
    assert.match(profile.supabase.urlSource, /^process_environment:/);
});

test('production profile explicitly enables live effects', () => {
    const profile = resolveRuntimeEnvironmentProfile({
        env: {
            BLOGGENIUS_ENV: 'production',
            BLOGGENIUS_PRODUCTION_SUPABASE_URL: PROD_URL,
            BLOGGENIUS_PRODUCTION_SUPABASE_PUBLISHABLE_KEY: 'production-key'
        }
    });

    assert.deepEqual(profile.effects, {
        livePublish: true,
        livePayment: true,
        liveNotifications: true
    });
});

test('build public values are accepted only when the build environment matches', () => {
    const ready = resolveRuntimeEnvironmentProfile({
        env: {},
        buildConfig: {
            BLOGGENIUS_ENV: 'production',
            SUPABASE_URL: PROD_URL,
            SUPABASE_PUBLISHABLE_KEY: 'production-key'
        }
    });
    const mismatched = resolveRuntimeEnvironmentProfile({
        env: { BLOGGENIUS_ENV: 'development' },
        buildConfig: {
            BLOGGENIUS_ENV: 'production',
            SUPABASE_URL: PROD_URL,
            SUPABASE_PUBLISHABLE_KEY: 'production-key'
        }
    });

    assert.equal(ready.status, STATUS.READY);
    assert.equal(mismatched.status, STATUS.PUBLIC_CONFIG_MISSING);
});

test('safe diagnostics never include public keys or full URLs', () => {
    const profile = resolveRuntimeEnvironmentProfile({
        env: {
            BLOGGENIUS_ENV: 'development',
            BLOGGENIUS_DEVELOPMENT_SUPABASE_URL: DEV_URL,
            BLOGGENIUS_DEVELOPMENT_SUPABASE_PUBLISHABLE_KEY: 'sensitive-key-material'
        }
    });
    const diagnostic = toSafeRuntimeEnvironmentDiagnostic(profile);
    const serialized = JSON.stringify(diagnostic);

    assert.equal(diagnostic.endpointHost, 'development-project.supabase.co');
    assert.equal(serialized.includes('sensitive-key-material'), false);
    assert.equal(serialized.includes('https://'), false);
});

test('connection helper prefers the resolved runtime profile', () => {
    const connection = resolveSupabasePublicConnection({
        RUNTIME_ENVIRONMENT_PROFILE: {
            configured: true,
            environment: 'development',
            supabase: {
                url: DEV_URL,
                publishableKey: 'development-key',
                endpointHost: 'development-project.supabase.co'
            }
        },
        LICENSE_CHK_URL: PROD_URL,
        LICENSE_CHK_KEY: 'legacy-key'
    });

    assert.equal(connection.environment, 'development');
    assert.equal(connection.url, DEV_URL);
    assert.equal(connection.publishableKey, 'development-key');
});

test('Trends API connection follows the selected environment without Production fallback', () => {
    const local = resolveRuntimeEnvironmentProfile({
        env: {
            BLOGGENIUS_ENV: 'local',
            BLOGGENIUS_LOCAL_SUPABASE_URL: 'http://127.0.0.1:54321',
            BLOGGENIUS_LOCAL_SUPABASE_PUBLISHABLE_KEY: 'local-key',
            BLOGGENIUS_LOCAL_TRENDS_API_URL: 'http://127.0.0.1:4581',
            BLOGGENIUS_PRODUCTION_TRENDS_API_URL: 'https://trendapi.example.com'
        }
    });
    const missingDevelopment = resolveRuntimeEnvironmentProfile({
        env: {
            BLOGGENIUS_ENV: 'development',
            BLOGGENIUS_DEVELOPMENT_SUPABASE_URL: DEV_URL,
            BLOGGENIUS_DEVELOPMENT_SUPABASE_PUBLISHABLE_KEY: 'development-key',
            BLOGGENIUS_PRODUCTION_TRENDS_API_URL: 'https://trendapi.example.com'
        }
    });

    assert.deepEqual(resolveTrendsApiPublicConnection({ RUNTIME_ENVIRONMENT_PROFILE: local }), {
        environment: 'local',
        configured: true,
        url: 'http://127.0.0.1:4581',
        endpointHost: '127.0.0.1:4581',
        reason: ''
    });
    assert.equal(missingDevelopment.status, STATUS.READY);
    assert.equal(missingDevelopment.trendsApi.configured, false);
    assert.equal(missingDevelopment.trendsApi.url, '');
    assert.equal(missingDevelopment.trendsApi.reason, 'trends_api_url_missing');
});

test('Development Trends API refuses the Production endpoint and insecure URLs', () => {
    const base = {
        BLOGGENIUS_ENV: 'development',
        BLOGGENIUS_DEVELOPMENT_SUPABASE_URL: DEV_URL,
        BLOGGENIUS_DEVELOPMENT_SUPABASE_PUBLISHABLE_KEY: 'development-key',
        BLOGGENIUS_PRODUCTION_TRENDS_API_URL: 'https://trendapi.example.com'
    };
    const productionCollision = resolveRuntimeEnvironmentProfile({
        env: {
            ...base,
            BLOGGENIUS_DEVELOPMENT_TRENDS_API_URL: 'https://trendapi.example.com'
        }
    });
    const insecure = resolveRuntimeEnvironmentProfile({
        env: {
            ...base,
            BLOGGENIUS_DEVELOPMENT_TRENDS_API_URL: 'http://trendapi-dev.example.com'
        }
    });

    assert.equal(productionCollision.trendsApi.configured, false);
    assert.equal(productionCollision.trendsApi.reason, 'production_target_collision');
    assert.equal(insecure.trendsApi.configured, false);
    assert.equal(insecure.trendsApi.reason, 'hosted_requires_remote_https');
});

test('Development Trends API requires the Production URL as a collision fence', () => {
    const profile = resolveRuntimeEnvironmentProfile({
        env: {
            BLOGGENIUS_ENV: 'development',
            BLOGGENIUS_DEVELOPMENT_SUPABASE_URL: DEV_URL,
            BLOGGENIUS_DEVELOPMENT_SUPABASE_PUBLISHABLE_KEY: 'development-key',
            BLOGGENIUS_DEVELOPMENT_TRENDS_API_URL: 'https://trendapi-dev.example.com'
        }
    });

    assert.equal(profile.trendsApi.configured, false);
    assert.equal(profile.trendsApi.reason, 'production_target_unknown');
});
