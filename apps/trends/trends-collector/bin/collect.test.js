const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const axios = require('axios');

const {
    formatApiResultSummary,
    formatCollectorHelp,
    parseCollectorCliArgs,
    pushPayloadToApi,
    resolveCollectorConfig,
    resolveCollectorExecutionMode,
    runCollector,
    verifyCollectorApiEnvironment
} = require('./collect');

const EXPECTED_REPO_ROOT = path.resolve(__dirname, '../../../..');

test('parseCollectorCliArgs supports help and explicit date options', () => {
    assert.deepEqual(parseCollectorCliArgs(['--help']), {
        help: true,
        date: '',
        dryRun: false,
        confirmProduction: false
    });
    assert.deepEqual(parseCollectorCliArgs(['--date', '2026-04-02']), {
        help: false,
        date: '2026-04-02',
        dryRun: false,
        confirmProduction: false
    });
    assert.deepEqual(parseCollectorCliArgs(['--date=20260402']), {
        help: false,
        date: '20260402',
        dryRun: false,
        confirmProduction: false
    });
    assert.deepEqual(parseCollectorCliArgs(['-d', '2026-04-03']), {
        help: false,
        date: '2026-04-03',
        dryRun: false,
        confirmProduction: false
    });
    assert.deepEqual(parseCollectorCliArgs(['--dry-run']), {
        help: false,
        date: '',
        dryRun: true,
        confirmProduction: false
    });
    assert.deepEqual(parseCollectorCliArgs(['--confirm-production']), {
        help: false,
        date: '',
        dryRun: false,
        confirmProduction: true
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
    assert.match(output, /--dry-run/);
    assert.match(output, /--confirm-production/);
});

test('Production execution requires one explicit safe mode outside a TTY', () => {
    assert.equal(
        resolveCollectorExecutionMode('production', { dryRun: true }, { isTTY: false }),
        'dry-run'
    );
    assert.equal(
        resolveCollectorExecutionMode('production', { confirmProduction: true }, { isTTY: false }),
        'confirmed'
    );
    assert.equal(
        resolveCollectorExecutionMode('production', {}, { isTTY: true }),
        'interactive'
    );
    assert.throws(
        () => resolveCollectorExecutionMode('production', {}, { isTTY: false }),
        /TTY가 필요합니다/
    );
    assert.throws(
        () => resolveCollectorExecutionMode(
            'production',
            { dryRun: true, confirmProduction: true },
            { isTTY: false }
        ),
        /함께 사용할 수 없습니다/
    );
    assert.throws(
        () => resolveCollectorExecutionMode(
            'development',
            { confirmProduction: true },
            { isTTY: false }
        ),
        /Production 환경에서만/
    );
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
        TRENDS_ENV: 'development',
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
    assert.equal(config.environment, 'development');
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
    assert.equal(config.environment, '');
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

test('verifyCollectorApiEnvironment accepts only the selected API environment', async (t) => {
    const originalGet = axios.get;
    t.after(() => {
        axios.get = originalGet;
    });
    axios.get = async () => ({ data: { success: true, environment: 'development' } });

    await assert.doesNotReject(() => verifyCollectorApiEnvironment({
        environment: 'development',
        apiBaseUrl: 'https://trendapi-dev.example.com',
        dryRun: false
    }, { info: () => {} }));
    await assert.rejects(
        () => verifyCollectorApiEnvironment({
            environment: 'production',
            apiBaseUrl: 'https://trendapi-dev.example.com',
            dryRun: false
        }, { info: () => {} }),
        /expected=production, actual=development/
    );
});

test('pushPayloadToApi sends the selected environment with ingest requests', async (t) => {
    const originalPost = axios.post;
    t.after(() => {
        axios.post = originalPost;
    });
    let capturedHeaders;
    axios.post = async (_url, _payload, options) => {
        capturedHeaders = options.headers;
        return { data: { success: true } };
    };

    await pushPayloadToApi({ itemCount: 0 }, {
        environment: 'development',
        apiBaseUrl: 'https://trendapi-dev.example.com',
        apiToken: 'development-token',
        dryRun: false
    }, { info: () => {} });

    assert.equal(capturedHeaders['X-Trends-Environment'], 'development');
    assert.equal(capturedHeaders.Authorization, 'Bearer development-token');
});

test('interactive Production collection confirms and writes the same payload without recollecting', async (t) => {
    const originalGet = axios.get;
    const originalPost = axios.post;
    t.after(() => {
        axios.get = originalGet;
        axios.post = originalPost;
    });
    axios.get = async () => ({ data: { success: true, environment: 'production' } });

    let postedPayload;
    axios.post = async (_url, payload) => {
        postedPayload = payload;
        return { data: { success: true, accepted: payload.itemCount } };
    };
    let collectionCount = 0;
    let confirmedPayload;
    const collector = {
        fetchTrends: async () => {
            collectionCount += 1;
            return {
                date: '2026-08-29',
                keywords: [{ category: '생활', keyword: '테스트', changeRaw: 'new' }]
            };
        }
    };

    const result = await runCollector({
        environment: 'production',
        naverId: 'operator',
        apiBaseUrl: 'https://trendapi.hangadac.com',
        apiToken: 'legacy-token-123',
        collector,
        cliOptions: {},
        isTTY: true,
        confirmProduction: async (payload) => {
            confirmedPayload = payload;
            return true;
        },
        logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }
    });

    assert.equal(collectionCount, 1);
    assert.strictEqual(confirmedPayload, result.payload);
    assert.strictEqual(postedPayload, result.payload);
    assert.equal(result.executionMode, 'interactive');
    assert.equal(result.apiResult.accepted, 1);
});

test('interactive Production cancellation never checks or writes the API', async (t) => {
    const originalGet = axios.get;
    const originalPost = axios.post;
    t.after(() => {
        axios.get = originalGet;
        axios.post = originalPost;
    });
    axios.get = async () => { throw new Error('unexpected API check'); };
    axios.post = async () => { throw new Error('unexpected API write'); };

    const result = await runCollector({
        environment: 'production',
        naverId: 'operator',
        apiBaseUrl: 'https://trendapi.hangadac.com',
        apiToken: 'legacy-token-123',
        collector: {
            fetchTrends: async () => ({ date: '2026-08-29', keywords: [] })
        },
        cliOptions: {},
        isTTY: true,
        confirmProduction: async () => false,
        logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }
    });

    assert.equal(result.executionMode, 'interactive');
    assert.equal(result.apiResult.cancelled, true);
});
