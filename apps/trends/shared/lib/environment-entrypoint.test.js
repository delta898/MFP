const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const API_ENTRYPOINT = path.join(REPO_ROOT, 'apps/trends/trends-api/src/server.js');
const COLLECTOR_ENTRYPOINT = path.join(REPO_ROOT, 'apps/trends/trends-collector/bin/collect.js');

function envWithoutTrendsSelection() {
    const env = { ...process.env };
    delete env.TRENDS_ENV;
    delete env.TRENDS_ENV_FILE;
    return env;
}

test('trends API entrypoint fails closed before listening when environment is missing', () => {
    const result = spawnSync(process.execPath, [API_ENTRYPOINT], {
        cwd: REPO_ROOT,
        env: envWithoutTrendsSelection(),
        encoding: 'utf8',
        timeout: 5000
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /TRENDS_ENV is required/);
    assert.doesNotMatch(result.stdout, /listening on/);
});

test('trends collector entrypoint fails closed before collection when environment is missing', () => {
    const result = spawnSync(process.execPath, [COLLECTOR_ENTRYPOINT], {
        cwd: REPO_ROOT,
        env: envWithoutTrendsSelection(),
        encoding: 'utf8',
        timeout: 5000
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /TRENDS_ENV is required/);
    assert.doesNotMatch(result.stdout, /수집 payload/);
});

test('collector help remains available without selecting an environment', () => {
    const result = spawnSync(process.execPath, [COLLECTOR_ENTRYPOINT, '--help'], {
        cwd: REPO_ROOT,
        env: envWithoutTrendsSelection(),
        encoding: 'utf8',
        timeout: 5000
    });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /TRENDS_ENV=local\|development\|production is required/);
});
