const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const API_ENTRYPOINT = path.join(REPO_ROOT, 'apps/trends/trends-api/docker/src/server.js');
const COLLECTOR_ENTRYPOINT = path.join(REPO_ROOT, 'apps/trends/trends-collector/bin/collect.js');

function envWithoutTrendsSelection() {
    const env = { ...process.env };
    delete env.TRENDS_ENV;
    delete env.TRENDS_ENV_FILE;
    return env;
}

function runEntrypoint(entrypoint, args, env) {
    const result = spawnSync(process.execPath, [entrypoint, ...args], {
        cwd: REPO_ROOT,
        env,
        encoding: 'utf8',
        timeout: 15000
    });
    if (result.error) throw result.error;
    return result;
}

test('trends API entrypoint fails closed before listening when environment is missing', () => {
    const result = runEntrypoint(API_ENTRYPOINT, [], envWithoutTrendsSelection());

    assert.equal(result.status, 1);
    assert.match(result.stderr, /TRENDS_ENV is required/);
    assert.doesNotMatch(result.stdout, /listening on/);
});

test('trends collector entrypoint fails closed before collection when environment is missing', () => {
    const result = runEntrypoint(COLLECTOR_ENTRYPOINT, [], envWithoutTrendsSelection());

    assert.equal(result.status, 1);
    assert.match(result.stderr, /TRENDS_ENV is required/);
    assert.doesNotMatch(result.stdout, /수집 payload/);
});

test('collector help remains available without selecting an environment', () => {
    const result = runEntrypoint(COLLECTOR_ENTRYPOINT, ['--help'], envWithoutTrendsSelection());

    assert.equal(result.status, 0);
    assert.match(result.stdout, /TRENDS_ENV=local\|development\|production is required/);
});

test('trends API entrypoint rejects a mixed Supabase target before listening', () => {
    const result = runEntrypoint(API_ENTRYPOINT, [], {
        ...process.env,
        TRENDS_ENV: 'local',
        TRENDS_SUPABASE_TARGET_ENV: 'production',
        SUPABASE_URL: 'http://127.0.0.1:54321',
        SUPABASE_SECRET_KEY: 'test-secret',
        TRENDS_API_BASE_URL: 'http://127.0.0.1:4581',
        TRENDS_API_TOKEN: 'test-token',
        TRENDS_READ_TOKEN_SECRET: 'test-read-secret'
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /TRENDS_SUPABASE_TARGET_ENV mismatch/);
    assert.doesNotMatch(result.stdout, /listening on/);
});

test('trends collector entrypoint rejects a mixed API target before collection', () => {
    const result = runEntrypoint(COLLECTOR_ENTRYPOINT, [], {
        ...process.env,
        TRENDS_ENV: 'local',
        TRENDS_API_TARGET_ENV: 'production',
        TRENDS_API_BASE_URL: 'http://127.0.0.1:4581',
        TRENDS_API_TOKEN: 'test-token'
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /TRENDS_API_TARGET_ENV mismatch/);
    assert.doesNotMatch(result.stdout, /수집 payload/);
});
