const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveCollectorConfig } = require('./collect');

test('resolveCollectorConfig normalizes env-driven paths and booleans', () => {
    const config = resolveCollectorConfig({
        TRENDS_NAVER_ID: 'amadejjs',
        TRENDS_AUTH_FILE_PATH: './state/naver-auth.json',
        TRENDS_TARGET_DATE: '2026-04-02',
        TRENDS_HEADLESS: 'false',
        TRENDS_API_HOST: '0.0.0.0',
        TRENDS_API_PORT: '9999',
        TRENDS_API_BASE_URL: 'http://127.0.0.1:9999',
        TRENDS_API_TOKEN: 'secret-token',
        TRENDS_SOURCE: 'naver_trends',
        TRENDS_DRY_RUN: '1'
    });

    assert.match(config.rootDir, /Project\/NaverAutoBlog$/);
    assert.equal(config.naverId, 'amadejjs');
    assert.match(config.authPath, /Project\/NaverAutoBlog\/state\/naver-auth\.json$/);
    assert.equal(config.date, '2026-04-02');
    assert.equal(config.headless, false);
    assert.equal(config.apiHost, '0.0.0.0');
    assert.equal(config.apiPort, 9999);
    assert.equal(config.apiBaseUrl, 'http://127.0.0.1:9999');
    assert.equal(config.apiToken, 'secret-token');
    assert.equal(config.source, 'naver_trends');
    assert.equal(config.dryRun, true);
});

test('resolveCollectorConfig falls back to repo cwd defaults', () => {
    const config = resolveCollectorConfig({});

    assert.match(config.rootDir, /Project\/NaverAutoBlog$/);
    assert.match(config.authPath, /Project\/NaverAutoBlog\/config\/naver_auth\.json$/);
    assert.equal(config.naverId, '');
    assert.equal(config.date, '');
    assert.equal(config.headless, true);
    assert.equal(config.apiHost, '127.0.0.1');
    assert.equal(config.apiPort, 4581);
    assert.equal(config.apiBaseUrl, 'http://127.0.0.1:4581');
    assert.equal(config.source, 'naver_creator_advisor');
});

test('resolveCollectorConfig derives api base url from host and port when base url is omitted', () => {
    const config = resolveCollectorConfig({
        TRENDS_API_HOST: '192.168.0.10',
        TRENDS_API_PORT: '7777'
    });

    assert.equal(config.apiBaseUrl, 'http://192.168.0.10:7777');
});

test('resolveCollectorConfig keeps absolute auth path unchanged', () => {
    const config = resolveCollectorConfig({
        TRENDS_AUTH_FILE_PATH: '/tmp/naver-auth.json'
    });

    assert.equal(config.authPath, '/tmp/naver-auth.json');
});
