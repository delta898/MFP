const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');

const {
    buildTrendConflictKey,
    buildTrendExportFileName,
    buildDownloadContentDisposition,
    countExistingTrendRows,
    createConcurrencyGate,
    createFixedWindowRateLimiter,
    createExpiringSingleFlightCache,
    createTrendReadToken,
    createServer,
    dedupeTrendRows,
    mapPayloadToTrendRows,
    normalizeIngestPayload,
    normalizeCategoryList,
    normalizeMetaPayload,
    readJsonBody,
    resolveTrendQueryParams,
    resolveApiConfig,
    toTrendCsv,
    verifyTrendReadToken
} = require('./server');

test('normalizeIngestPayload keeps only valid trend items', () => {
    const payload = normalizeIngestPayload({
        source: 'naver_trends',
        trendDate: '2026-04-02',
        collectedAt: '2026-04-02T10:00:00+09:00',
        items: [
            { category: '맛집', keyword: '성수 맛집', changeRaw: '▲ 48' },
            { category: '', keyword: '무효', changeRaw: '▲ 1' },
            { category: '여행', keyword: '제주 여행', changeRaw: '-' }
        ]
    });

    assert.equal(payload.source, 'naver_trends');
    assert.equal(payload.trendDate, '2026-04-02');
    assert.equal(payload.items.length, 2);
    assert.deepEqual(payload.items[1], {
        category: '여행',
        keyword: '제주 여행',
        variation: '-',
        changeRaw: '-',
        changeType: 'steady',
        changeAmount: null,
        displayOrder: 3
    });
});

test('mapPayloadToTrendRows prepares deterministic upsert rows', () => {
    const rows = mapPayloadToTrendRows({
        source: 'naver_trends',
        trendDate: '2026-04-02',
        collectedAt: '2026-04-02T01:00:00.000Z',
        items: [
            { category: '맛집', keyword: '성수 맛집', changeRaw: '▲ 48', displayOrder: 1 },
            { category: '여행', keyword: '제주 여행', changeRaw: 'new', displayOrder: 2 }
        ]
    });

    assert.equal(rows.length, 2);
    assert.equal(rows[0].display_order, 1);
    assert.equal(rows[1].display_order, 2);
    assert.equal(rows[0].trend_date, '2026-04-02');
    assert.equal(rows[0].change_type, 'up');
    assert.equal(rows[0].change_amount, 48);
    assert.equal(rows[1].change_raw, 'new');
    assert.equal(rows[1].change_type, 'new');
    assert.equal(rows[1].change_amount, null);
});

test('dedupeTrendRows collapses rows that share the upsert conflict key', () => {
    const rows = dedupeTrendRows([
        {
            source: 'naver_creator_advisor',
            trend_date: '2026-04-01',
            category: '맛집',
            keyword: '버거킹 와퍼',
            display_order: 1
        },
        {
            source: 'naver_creator_advisor',
            trend_date: '2026-04-01',
            category: '맛집',
            keyword: '버거킹 와퍼',
            display_order: 2
        },
        {
            source: 'naver_creator_advisor',
            trend_date: '2026-04-01',
            category: '국내여행',
            keyword: '서울 벚꽃 명소',
            display_order: 1
        }
    ]);

    assert.equal(rows.length, 2);
    assert.equal(rows[0].display_order, 1);
});

test('buildTrendConflictKey matches the upsert uniqueness contract', () => {
    const key = buildTrendConflictKey({
        source: 'naver_creator_advisor',
        trend_date: '2026-04-01',
        category: '맛집',
        keyword: '버거킹 와퍼'
    });

    assert.equal(key, 'naver_creator_advisor\u00012026-04-01\u0001맛집\u0001버거킹 와퍼');
});

test('countExistingTrendRows separates inserts from updates using conflict keys', () => {
    const rows = [
        {
            source: 'naver_creator_advisor',
            trend_date: '2026-04-01',
            category: '맛집',
            keyword: '버거킹 와퍼'
        },
        {
            source: 'naver_creator_advisor',
            trend_date: '2026-04-01',
            category: '국내여행',
            keyword: '서울 벚꽃'
        }
    ];
    const existingRows = [
        {
            source: 'naver_creator_advisor',
            trend_date: '2026-04-01',
            category: '맛집',
            keyword: '버거킹 와퍼'
        }
    ];

    assert.equal(countExistingTrendRows(rows, existingRows), 1);
});

test('toTrendCsv serializes rows with a header line', () => {
    const csv = toTrendCsv([
        {
            source: 'naver_trends',
            trend_date: '2026-04-02',
            category: '맛집',
            keyword: '성수 맛집',
            change_raw: '▲ 48',
            change_type: 'up',
            change_amount: 48,
            display_order: 1,
            collected_at: '2026-04-02T01:00:00.000Z'
        }
    ]);

    assert.match(csv, /^source,trend_date,category,keyword,change_raw,change_type,change_amount,display_order,collected_at\n/);
    assert.match(csv, /naver_trends,2026-04-02,맛집,성수 맛집,▲ 48,up,48,1,2026-04-02T01:00:00.000Z/);
});

test('resolveApiConfig defaults to trends.items and sensible scan limits', () => {
    const config = resolveApiConfig({});

    assert.equal(config.supabaseSchema, 'trends');
    assert.equal(config.supabaseTable, 'items');
    assert.equal(config.exportMaxRows, 5000);
    assert.equal(config.metaFunction, 'get_items_meta');
    assert.equal(config.metaCacheTtlMs, 300000);
    assert.equal(config.maxConcurrentRequests, 8);
    assert.equal(config.requestBodyMaxBytes, 1048576);
    assert.equal(config.requestTimeoutMs, 30000);
    assert.equal(config.upstreamTimeoutMs, 7000);
    assert.equal(config.supabaseAdminKey, '');
    assert.equal(config.readTokenIssuer, 'bloggenius-license');
    assert.equal(config.readTokenAudience, 'trends-api');
    assert.equal(config.readRateLimitPerMinute, 120);
});

test('resolveApiConfig prefers new secret key over legacy service role key', () => {
    const config = resolveApiConfig({
        SUPABASE_SECRET_KEY: 'sb_secret_new',
        SUPABASE_SERVICE_ROLE_KEY: 'legacy_service_role'
    });

    assert.equal(config.supabaseAdminKey, 'sb_secret_new');
});

test('resolveTrendQueryParams validates dates and change filters', () => {
    const params = new URLSearchParams({
        trend_date: '2026-04-02',
        source: 'naver_creator_advisor',
        change_type: 'up',
        change_amount_min: '10',
        change_amount_max: '100',
        category: '맛집',
        limit: '9999'
    });
    const filters = resolveTrendQueryParams(params, { exportMaxRows: 5000 });

    assert.equal(filters.trendDate, '2026-04-02');
    assert.equal(filters.source, 'naver_creator_advisor');
    assert.equal(filters.changeType, 'up');
    assert.equal(filters.changeAmountMin, 10);
    assert.equal(filters.changeAmountMax, 100);
    assert.deepEqual(filters.categories, ['맛집']);
    assert.equal(filters.limit, 5000);
});

test('normalizeCategoryList supports repeated categories, comma-separated categories, and ALL semantics', () => {
    const repeated = new URLSearchParams([
        ['category', '맛집'],
        ['category', '국내여행'],
        ['category', '맛집']
    ]);
    const commaSeparated = new URLSearchParams({
        categories: '맛집, 국내여행,맛집'
    });
    const all = new URLSearchParams([
        ['category', 'ALL'],
        ['category', '맛집']
    ]);

    assert.deepEqual(normalizeCategoryList(repeated), ['맛집', '국내여행']);
    assert.deepEqual(normalizeCategoryList(commaSeparated), ['맛집', '국내여행']);
    assert.deepEqual(normalizeCategoryList(all), []);
});

test('resolveTrendQueryParams rejects invalid date ranges', () => {
    assert.throws(() => {
        resolveTrendQueryParams(new URLSearchParams({
            date_from: '2026-04-03',
            date_to: '2026-04-02'
        }), { exportMaxRows: 5000 });
    }, /date_from must be earlier than or equal to date_to/);
});

test('buildTrendExportFileName reflects filters for downloads', () => {
    const singleCategory = buildTrendExportFileName({
        dateFrom: '2026-04-01',
        dateTo: '2026-04-02',
        categories: ['국내여행']
    }, 'csv');
    const multiCategory = buildTrendExportFileName({
        dateFrom: '2026-04-01',
        dateTo: '2026-04-02',
        categories: ['맛집', '국내여행']
    }, 'csv');

    assert.equal(singleCategory, 'naver-trends-2026-04-01-2026-04-02-국내여행.csv');
    assert.equal(multiCategory, 'naver-trends-2026-04-01-2026-04-02-multi.csv');
});

test('buildDownloadContentDisposition keeps headers ASCII-safe while preserving UTF-8 filename', () => {
    const header = buildDownloadContentDisposition('naver-trends-2026-04-01-2026-04-02-국내여행.csv');

    assert.match(header, /^attachment; filename="[^"]+"; filename\*=UTF-8''/);
    assert.match(header, /filename\*=UTF-8''naver-trends-2026-04-01-2026-04-02-%EA%B5%AD%EB%82%B4%EC%97%AC%ED%96%89\.csv$/);
});

test('normalizeMetaPayload accepts the database aggregate shape', () => {
    const summary = normalizeMetaPayload({
        categories: ['맛집', ' 국내여행 ', ''],
        sources: ['naver_creator_advisor'],
        availableDates: ['2026-04-01', '2026-04-02'],
        dateRange: {
            min: '2026-04-01',
            max: '2026-04-02'
        },
        totalRows: 48120
    });

    assert.deepEqual(summary.categories, ['맛집', '국내여행']);
    assert.equal(summary.dateRange.max, '2026-04-02');
    assert.equal(summary.totalRows, 48120);
});

test('createExpiringSingleFlightCache shares concurrent loads', async () => {
    const cache = createExpiringSingleFlightCache(10000);
    let loadCount = 0;
    const loader = async () => {
        loadCount += 1;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { categories: ['맛집'] };
    };

    const [first, second] = await Promise.all([
        cache.getOrLoad(loader),
        cache.getOrLoad(loader)
    ]);
    const third = await cache.getOrLoad(loader);

    assert.equal(loadCount, 1);
    assert.deepEqual(first.value, second.value);
    assert.equal(second.cacheStatus, 'shared');
    assert.equal(third.cacheStatus, 'hit');
});

test('createConcurrencyGate rejects work above its limit', () => {
    const gate = createConcurrencyGate(2);

    assert.equal(gate.tryEnter(), true);
    assert.equal(gate.tryEnter(), true);
    assert.equal(gate.tryEnter(), false);
    gate.leave();
    assert.equal(gate.tryEnter(), true);
});

test('verifyTrendReadToken accepts only an unexpired token with the expected issuer, audience, and scope', () => {
    const config = resolveApiConfig({
        TRENDS_READ_TOKEN_SECRET: 'read-secret',
        TRENDS_READ_TOKEN_ISSUER: 'license-service',
        TRENDS_READ_TOKEN_AUDIENCE: 'trends-api'
    });
    const validToken = createTrendReadToken({
        iss: 'license-service',
        aud: 'trends-api',
        scope: 'trends:read',
        exp: 2000
    }, 'read-secret');
    const wrongScope = createTrendReadToken({
        iss: 'license-service',
        aud: 'trends-api',
        scope: 'trends:write',
        exp: 2000
    }, 'read-secret');
    const expired = createTrendReadToken({
        iss: 'license-service',
        aud: 'trends-api',
        scope: 'trends:read',
        exp: 1000
    }, 'read-secret');

    assert.equal(verifyTrendReadToken(validToken, config, 1500)?.scope, 'trends:read');
    assert.equal(verifyTrendReadToken(wrongScope, config, 1500), null);
    assert.equal(verifyTrendReadToken(expired, config, 1000), null);
    assert.equal(verifyTrendReadToken(`${validToken}tampered`, config, 1500), null);
});

test('createFixedWindowRateLimiter resets usage at the next minute window', () => {
    let currentTime = 1000;
    const limiter = createFixedWindowRateLimiter(2, () => currentTime);

    assert.equal(limiter.tryConsume('127.0.0.1').allowed, true);
    assert.equal(limiter.tryConsume('127.0.0.1').allowed, true);
    assert.equal(limiter.tryConsume('127.0.0.1').allowed, false);

    currentTime = 60000;
    assert.equal(limiter.tryConsume('127.0.0.1').allowed, true);
});

test('readJsonBody rejects payloads above the configured limit', async () => {
    const request = Readable.from([Buffer.from('{"value":"too large"}')]);
    request.headers = {
        'content-length': String(Buffer.byteLength('{"value":"too large"}'))
    };

    await assert.rejects(
        readJsonBody(request, 8),
        (error) => error.code === 'BODY_TOO_LARGE'
    );
});

test('createServer leaves health public and protects data endpoints with the configured token', async (t) => {
    const config = resolveApiConfig({
        TRENDS_API_HOST: '127.0.0.1',
        TRENDS_API_PORT: '4581',
        TRENDS_API_TOKEN: 'secret-token'
    });
    const server = createServer(config);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));

    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const healthResponse = await fetch(`${baseUrl}/health`);
    const protectedResponse = await fetch(`${baseUrl}/api/v1/trends/meta`);

    assert.equal(healthResponse.status, 200);
    assert.equal(protectedResponse.status, 401);
});
