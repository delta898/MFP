const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const axios = require('axios');

const {
    formatApiResultSummary,
    formatCollectorHelp,
    parseCollectorCliArgs,
    pushPayloadToApi,
    signalCollectionComplete,
    resolveCollectorConfig,
    resolveCollectorExecutionMode,
    runCollector,
    verifyCollectorApiEnvironment
} = require('./collect');

const EXPECTED_REPO_ROOT = path.resolve(__dirname, '../../../..');
const defaultCliOptions = {
    forceNewsletterResend: false,
    headless: null,
    swipeDelayMs: null,
    maxRetries: null,
    expectedCategories: null,
    keywordsPerCategory: null
};

test('parseCollectorCliArgs supports help and explicit date options', () => {
    assert.deepEqual(parseCollectorCliArgs(['--help']), {
        help: true,
        date: '',
        dryRun: false,
        confirmProduction: false,
        ...defaultCliOptions
    });
    assert.deepEqual(parseCollectorCliArgs(['--date', '2026-04-02']), {
        help: false,
        date: '2026-04-02',
        dryRun: false,
        confirmProduction: false,
        ...defaultCliOptions
    });
    assert.deepEqual(parseCollectorCliArgs(['--date=20260402']), {
        help: false,
        date: '20260402',
        dryRun: false,
        confirmProduction: false,
        ...defaultCliOptions
    });
    assert.deepEqual(parseCollectorCliArgs(['-d', '2026-04-03']), {
        help: false,
        date: '2026-04-03',
        dryRun: false,
        confirmProduction: false,
        ...defaultCliOptions
    });
    assert.deepEqual(parseCollectorCliArgs(['--dry-run']), {
        help: false,
        date: '',
        dryRun: true,
        confirmProduction: false,
        ...defaultCliOptions
    });
    assert.deepEqual(parseCollectorCliArgs(['--confirm-production']), {
        help: false,
        date: '',
        dryRun: false,
        confirmProduction: true,
        ...defaultCliOptions
    });
    assert.deepEqual(parseCollectorCliArgs(['--force-newsletter-resend']), {
        help: false,
        date: '',
        dryRun: false,
        confirmProduction: false,
        ...defaultCliOptions,
        forceNewsletterResend: true
    });
    assert.deepEqual(parseCollectorCliArgs([
        '--headed', '--swipe-delay-ms=900', '--max-retries', '2',
        '--expected-categories', '2', '--keywords-per-category=3'
    ]), {
        help: false,
        date: '',
        dryRun: false,
        confirmProduction: false,
        forceNewsletterResend: false,
        headless: false,
        swipeDelayMs: 900,
        maxRetries: 2,
        expectedCategories: 2,
        keywordsPerCategory: 3
    });
    assert.throws(() => parseCollectorCliArgs(['--headed', '--headless']), /함께 사용할 수 없습니다/);
    assert.throws(() => parseCollectorCliArgs(['--swipe-delay-ms', '60001']), /범위의 정수/);
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
    assert.match(output, /--force-newsletter-resend/);
    assert.match(output, /Development only/);
    assert.match(output, /NEWSLETTER_RESEND_ENABLED=true/);
    assert.match(output, /--headed/);
    assert.match(output, /--swipe-delay-ms/);
    assert.match(output, /--max-retries/);
    assert.match(output, /--expected-categories/);
    assert.match(output, /--keywords-per-category/);
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
    assert.equal(config.swipeDelayMs, 400);
    assert.equal(config.maxRetries, 3);
    assert.equal(config.expectedCategories, 32);
    assert.equal(config.keywordsPerCategory, 20);
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
    assert.equal(config.swipeDelayMs, 400);
    assert.equal(config.maxRetries, 3);
    assert.equal(config.expectedCategories, 32);
    assert.equal(config.keywordsPerCategory, 20);
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

test('resolveCollectorConfig accepts CLI tuning overrides over environment defaults', () => {
    const config = resolveCollectorConfig({
        TRENDS_SWIPE_DELAY_MS: '1200',
        TRENDS_MAX_RETRIES: '5',
        TRENDS_EXPECTED_CATEGORIES: '31',
        TRENDS_KEYWORDS_PER_CATEGORY: '18'
    }, {
        headless: false,
        swipeDelayMs: 800,
        maxRetries: 2,
        expectedCategories: 32,
        keywordsPerCategory: 20
    });
    assert.equal(config.headless, false);
    assert.equal(config.swipeDelayMs, 800);
    assert.equal(config.maxRetries, 2);
    assert.equal(config.expectedCategories, 32);
    assert.equal(config.keywordsPerCategory, 20);
    assert.throws(() => resolveCollectorConfig({ TRENDS_MAX_RETRIES: 'invalid' }), /TRENDS_MAX_RETRIES/);
});

test('analyzeCollectionCompleteness requires the configured category and keyword counts', () => {
    const { analyzeCollectionCompleteness } = require('./collect');
    const complete = Array.from({ length: 6 }, (_, index) => ({ category: 'A', keyword: `a${index}` }))
        .concat(Array.from({ length: 6 }, (_, index) => ({ category: 'B', keyword: `b${index}` })));
    assert.equal(analyzeCollectionCompleteness(complete, { expectedCategories: 2, keywordsPerCategory: 6 }).complete, true);
    assert.equal(analyzeCollectionCompleteness(complete.slice(0, 11), { expectedCategories: 2, keywordsPerCategory: 6 }).complete, false);
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

test('signalCollectionComplete sends only a validated completion marker to the environment-matched API', async (t) => {
    const originalPost = axios.post;
    t.after(() => { axios.post = originalPost; });
    let request;
    axios.post = async (url, body, options) => {
        request = { url, body, options };
        return { data: { success: true, workflowId: 'collection-2026-08-29-test-signal', duplicate: false } };
    };
    const payload = { trendDate: '2026-08-29', itemCount: 4 };
    const completeness = { complete: true, expectedCategories: 2, keywordsPerCategory: 2, actualTotal: 4 };
    const result = await signalCollectionComplete(payload, completeness, {
        environment: 'development', source: 'naver_creator_advisor',
        apiBaseUrl: 'https://trendapi-dev.example.com/', apiToken: 'dev-token', dryRun: false
    }, { info: () => {} });

    assert.equal(request.url, 'https://trendapi-dev.example.com/internal/newsletter/collection-complete');
    const { signalId, ...signalBody } = request.body;
    assert.deepEqual(signalBody, {
        environment: 'development', trendDate: '2026-08-29', source: 'naver_creator_advisor',
        expectedCategories: 2, itemsPerCategory: 2, itemCount: 4
    });
    assert.equal(request.options.headers.Authorization, 'Bearer dev-token');
    assert.match(request.body.signalId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.equal(result.workflowId, 'collection-2026-08-29-test-signal');
    await assert.rejects(() => signalCollectionComplete(payload, { ...completeness, complete: false }, {
        environment: 'development', source: 'naver_creator_advisor', apiBaseUrl: 'https://trendapi-dev.example.com', apiToken: 'dev-token'
    }), /불완전한 수집 결과/);
});

test('signalCollectionComplete supports Production and leaves resend disabled by default', async (t) => {
    const originalPost = axios.post;
    t.after(() => { axios.post = originalPost; });
    let request;
    axios.post = async (url, body, options) => {
        request = { url, body, options };
        return { data: { success: true } };
    };
    const result = await signalCollectionComplete({ trendDate: '2026-08-29' }, { complete: true }, {
        environment: 'production', source: 'naver_creator_advisor',
        apiBaseUrl: 'https://trendapi.example.com', apiToken: 'prod-token', dryRun: false
    });
    assert.equal(result.success, true);
    assert.equal(request.body.environment, 'production');
    assert.equal(Object.hasOwn(request.body, 'forceResend'), false);
});

test('signalCollectionComplete does not promote collector options into resend intent', async (t) => {
    const originalPost = axios.post;
    t.after(() => { axios.post = originalPost; });
    let request;
    axios.post = async (_url, body) => {
        request = body;
        return { data: { success: true } };
    };
    await signalCollectionComplete({ trendDate: '2026-08-29' }, { complete: true }, {
        environment: 'development', source: 'naver_creator_advisor',
        apiBaseUrl: 'https://trendapi-dev.example.com', apiToken: 'dev-token', dryRun: false
    });
    assert.equal(Object.hasOwn(request, 'forceResend'), false);
});

test('signalCollectionComplete sends resend intent only for an explicit Development collection flag', async (t) => {
    const originalPost = axios.post;
    t.after(() => { axios.post = originalPost; });
    let request;
    axios.post = async (_url, body) => { request = body; return { data: { success: true } }; };
    await signalCollectionComplete({ trendDate: '2026-08-29' }, { complete: true }, {
        environment: 'development', source: 'naver_creator_advisor',
        apiBaseUrl: 'https://trendapi-dev.example.com', apiToken: 'dev-token',
        dryRun: false, forceNewsletterResend: true
    });
    assert.equal(request.forceResend, true);
    await assert.rejects(() => signalCollectionComplete({ trendDate: '2026-08-29' }, { complete: true }, {
        environment: 'production', source: 'naver_creator_advisor',
        apiBaseUrl: 'https://trendapi.example.com', apiToken: 'prod-token',
        dryRun: false, forceNewsletterResend: true
    }), /Development 수집에서만/);
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
    let newsletterPayload;
    axios.post = async (url, payload) => {
        if (url.endsWith('/internal/ingest/naver-trends')) postedPayload = payload;
        if (url.endsWith('/internal/newsletter/collection-complete')) newsletterPayload = payload;
        return { data: { success: true, accepted: payload.itemCount, workflowId: 'collection-2026-08-29' } };
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
        expectedCategories: 1,
        keywordsPerCategory: 1,
        maxRetries: 0,
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
    assert.equal(newsletterPayload.environment, 'production');
    assert.equal(Object.hasOwn(newsletterPayload, 'forceResend'), false);
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
            fetchTrends: async () => ({ date: '2026-08-29', keywords: [{ category: '생활', keyword: '테스트' }] })
        },
        expectedCategories: 1,
        keywordsPerCategory: 1,
        maxRetries: 0,
        cliOptions: {},
        isTTY: true,
        confirmProduction: async () => false,
        logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }
    });

    assert.equal(result.executionMode, 'interactive');
    assert.equal(result.apiResult.cancelled, true);
});

test('runCollector retries full scans and uses the complete scan in original order', async () => {
    const complete = [
        { category: 'A', keyword: 'a1' }, { category: 'A', keyword: 'a2' },
        { category: 'B', keyword: 'b1' }, { category: 'B', keyword: 'b2' }
    ];
    let attempts = 0;
    let capturedFetchOptions;
    const result = await runCollector({
        environment: 'local',
        naverId: 'operator',
        expectedCategories: 2,
        keywordsPerCategory: 2,
        maxRetries: 2,
        printDryRunPayload: false,
        collector: {
            fetchTrends: async (fetchOptions) => {
                attempts += 1;
                capturedFetchOptions = fetchOptions;
                return { date: '2026-08-29', keywords: attempts === 1 ? complete.slice(0, 1) : complete };
            }
        },
        cliOptions: {
            dryRun: true,
            headless: false,
            swipeDelayMs: 900,
            maxRetries: 2,
            expectedCategories: 2,
            keywordsPerCategory: 2
        },
        logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }
    });
    assert.equal(attempts, 2);
    assert.equal(capturedFetchOptions.headless, false);
    assert.equal(capturedFetchOptions.swipeDelayMs, 900);
    assert.equal(result.completeness.complete, true);
    assert.deepEqual(result.payload.items.map(({ category, keyword }) => [category, keyword]), complete.map(({ category, keyword }) => [category, keyword]));
});

test('runCollector refuses to write incomplete collection after retries', async (t) => {
    const originalGet = axios.get;
    const originalPost = axios.post;
    t.after(() => {
        axios.get = originalGet;
        axios.post = originalPost;
    });
    axios.get = async () => ({ data: { success: true, environment: 'development' } });
    axios.post = async () => { throw new Error('incomplete data must never be posted'); };
    let attempts = 0;
    await assert.rejects(() => runCollector({
        environment: 'development',
        naverId: 'operator',
        apiBaseUrl: 'https://trendapi-dev.example.com',
        expectedCategories: 2,
        keywordsPerCategory: 2,
        maxRetries: 2,
        collector: {
            fetchTrends: async () => {
                attempts += 1;
                return { date: '2026-08-29', keywords: [{ category: 'A', keyword: `attempt-${attempts}` }] };
            }
        },
        cliOptions: {},
        isTTY: false,
        logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }
    }), /결과가 불완전하여 API 반영을 중단합니다/);
    assert.equal(attempts, 3);
});

test('runCollector keeps a successful trend write when the newsletter signal fails', async (t) => {
    const originalGet = axios.get;
    const originalPost = axios.post;
    t.after(() => {
        axios.get = originalGet;
        axios.post = originalPost;
    });
    axios.get = async () => ({ data: { success: true, environment: 'development' } });
    const postedUrls = [];
    axios.post = async (url) => {
        postedUrls.push(url);
        if (url.endsWith('/internal/newsletter/collection-complete')) {
            const error = new Error('Request failed with status code 404');
            error.response = { status: 404, data: { message: 'Not found' } };
            throw error;
        }
        return { data: { success: true, accepted: 1, trendDate: '2026-08-29' } };
    };
    const warnings = [];
    const result = await runCollector({
        environment: 'development',
        naverId: 'operator',
        apiBaseUrl: 'https://trendapi-dev.example.com',
        apiToken: 'development-token',
        expectedCategories: 1,
        keywordsPerCategory: 1,
        maxRetries: 0,
        collector: {
            fetchTrends: async () => ({ date: '2026-08-29', keywords: [{ category: 'A', keyword: 'a1' }] })
        },
        cliOptions: {},
        isTTY: false,
        logger: { info: () => {}, warn: (message) => warnings.push(message), error: () => {}, debug: () => {} }
    });

    assert.equal(result.apiResult.success, true);
    assert.deepEqual(result.newsletterSignal, { sent: false, error: 'Newsletter signal API 404: Not found' });
    assert.equal(postedUrls.length, 2);
    assert.match(warnings[0], /trendDate=2026-08-29/);
    assert.match(warnings[0], /다음 날짜 수집을 계속합니다/);
});
