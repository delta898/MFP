const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
    formatApiResultSummary,
    formatCollectorHelp,
    parseCollectorCliArgs,
    resolveCollectorConfig
} = require('./collect');

const EXPECTED_REPO_ROOT = path.resolve(__dirname, '../../../..');

test('parseCollectorCliArgs supports help and explicit date options', () => {
    assert.deepEqual(parseCollectorCliArgs(['--help']), {
        help: true,
        date: ''
    });
    assert.deepEqual(parseCollectorCliArgs(['--date', '2026-04-02']), {
        help: false,
        date: '2026-04-02'
    });
    assert.deepEqual(parseCollectorCliArgs(['--date=20260402']), {
        help: false,
        date: '20260402'
    });
    assert.deepEqual(parseCollectorCliArgs(['-d', '2026-04-03']), {
        help: false,
        date: '2026-04-03'
    });
});

test('parseCollectorCliArgs rejects unknown options and missing date values', () => {
    assert.throws(() => parseCollectorCliArgs(['--unknown']), /알 수 없는 collector 옵션/);
    assert.throws(() => parseCollectorCliArgs(['--date']), /날짜 값이 필요합니다/);
});

test('formatCollectorHelp mentions help and date flags', () => {
    const output = formatCollectorHelp();

    assert.match(output, /--help/);
    assert.match(output, /--date <value>/);
    assert.match(output, /TRENDS_TARGET_DATE/);
    assert.match(output, /-1d/);
    assert.match(output, /yesterday/);
});

test('formatApiResultSummary prefers insert and update counts over raw json', () => {
    const summary = formatApiResultSummary({
        accepted: 640,
        uniqueRows: 640,
        inserted: 0,
        updated: 640,
        duplicatesCollapsed: 0,
        trendDate: '2026-04-01'
    });

    assert.match(summary, /accepted=640/);
    assert.match(summary, /uniqueRows=640/);
    assert.match(summary, /inserted=0/);
    assert.match(summary, /updated=640/);
    assert.match(summary, /trendDate=2026-04-01/);
});

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

    assert.equal(config.rootDir, EXPECTED_REPO_ROOT);
    assert.equal(config.naverId, 'amadejjs');
    assert.equal(config.authPath, path.join(EXPECTED_REPO_ROOT, 'state/naver-auth.json'));
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

    assert.equal(config.rootDir, EXPECTED_REPO_ROOT);
    assert.equal(config.authPath, path.join(EXPECTED_REPO_ROOT, 'config/naver_auth.json'));
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

test('resolveCollectorConfig prefers cli date over env date', () => {
    const config = resolveCollectorConfig({
        TRENDS_TARGET_DATE: '2026-04-01'
    }, {
        date: '2026-04-02'
    });

    assert.equal(config.date, '2026-04-02');
});
