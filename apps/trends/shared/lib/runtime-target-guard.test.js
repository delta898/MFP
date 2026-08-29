const test = require('node:test');
const assert = require('node:assert/strict');

const {
    formatRuntimeTargetDiagnostic,
    resolveApiRuntimeGuard,
    resolveCollectorRuntimeGuard
} = require('./runtime-target-guard');

const LOCAL_API_ENV = Object.freeze({
    TRENDS_ENV: 'local',
    TRENDS_SUPABASE_TARGET_ENV: 'local',
    SUPABASE_URL: 'http://127.0.0.1:54321',
    SUPABASE_SECRET_KEY: 'local-secret',
    TRENDS_API_BASE_URL: 'http://127.0.0.1:4581',
    TRENDS_API_TOKEN: 'local-ingest-token',
    TRENDS_READ_TOKEN_SECRET: 'local-read-secret'
});

test('API runtime guard accepts a complete local target profile', () => {
    const profile = resolveApiRuntimeGuard({ env: { ...LOCAL_API_ENV } });

    assert.equal(profile.environment, 'local');
    assert.equal(profile.supabaseEndpointHost, '127.0.0.1:54321');
    assert.equal(profile.apiEndpointHost, '127.0.0.1:4581');
});

test('API runtime guard rejects environment-mixed Supabase targets', () => {
    assert.throws(
        () => resolveApiRuntimeGuard({
            env: { ...LOCAL_API_ENV, TRENDS_SUPABASE_TARGET_ENV: 'production' }
        }),
        /TRENDS_SUPABASE_TARGET_ENV mismatch/
    );
});

test('API runtime guard rejects remote targets in local and insecure targets in development', () => {
    assert.throws(
        () => resolveApiRuntimeGuard({
            env: { ...LOCAL_API_ENV, SUPABASE_URL: 'https://project.supabase.co' }
        }),
        /must use a local host/
    );
    assert.throws(
        () => resolveApiRuntimeGuard({
            env: {
                ...LOCAL_API_ENV,
                TRENDS_ENV: 'development',
                TRENDS_SUPABASE_TARGET_ENV: 'development',
                SUPABASE_URL: 'https://development.supabase.co',
                TRENDS_API_BASE_URL: 'http://trendapi-dev.example.com'
            }
        }),
        /remote HTTPS/
    );
});

test('non-Production API runtime rejects known Production targets', () => {
    assert.throws(
        () => resolveApiRuntimeGuard({
            env: {
                ...LOCAL_API_ENV,
                TRENDS_ENV: 'development',
                TRENDS_SUPABASE_TARGET_ENV: 'development',
                SUPABASE_URL: 'https://production.supabase.co',
                TRENDS_PRODUCTION_SUPABASE_URL: 'https://production.supabase.co',
                TRENDS_API_BASE_URL: 'https://trendapi-dev.example.com'
            }
        }),
        /must not use the known Production target/
    );
});

test('collector guard requires matching API environment and an ingest token', () => {
    const base = {
        TRENDS_ENV: 'development',
        TRENDS_API_TARGET_ENV: 'development',
        TRENDS_API_BASE_URL: 'https://trendapi-dev.example.com',
        TRENDS_API_TOKEN: 'development-token'
    };
    assert.equal(resolveCollectorRuntimeGuard({ env: base }).apiTargetEnvironment, 'development');
    assert.throws(
        () => resolveCollectorRuntimeGuard({
            env: { ...base, TRENDS_API_TARGET_ENV: 'production' }
        }),
        /TRENDS_API_TARGET_ENV mismatch/
    );
    assert.throws(
        () => resolveCollectorRuntimeGuard({ env: { ...base, TRENDS_API_TOKEN: '' } }),
        /TRENDS_API_TOKEN is required/
    );
});

test('Production collector requires an explicit write approval', () => {
    const env = {
        TRENDS_ENV: 'production',
        TRENDS_API_TARGET_ENV: 'production',
        TRENDS_API_BASE_URL: 'https://trendapi.example.com',
        TRENDS_API_TOKEN: 'production-token'
    };

    assert.throws(
        () => resolveCollectorRuntimeGuard({ env }),
        /TRENDS_ALLOW_PRODUCTION_WRITE=true/
    );
    assert.equal(
        resolveCollectorRuntimeGuard({
            env: { ...env, TRENDS_ALLOW_PRODUCTION_WRITE: 'true' }
        }).environment,
        'production'
    );
});

test('runtime target diagnostics do not expose credentials', () => {
    const diagnostic = formatRuntimeTargetDiagnostic(resolveApiRuntimeGuard({
        env: { ...LOCAL_API_ENV }
    }));

    assert.match(diagnostic, /environment=local/);
    assert.match(diagnostic, /supabase=127\.0\.0\.1:54321/);
    assert.doesNotMatch(diagnostic, /local-secret|local-ingest-token|local-read-secret/);
});
