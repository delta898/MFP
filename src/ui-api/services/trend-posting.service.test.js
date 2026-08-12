const test = require('node:test');
const assert = require('node:assert/strict');

const { createTrendPostingService } = require('./trend-posting.service');

function createService(remoteClient) {
    return createTrendPostingService({
        License: { async issueTrendsAccessToken() { throw new Error('not used'); } },
        tokenCache: { clear() {} },
        remoteClient,
        Logger: { warn() {} }
    });
}

function createWritableService(Utils) {
    return createTrendPostingService({
        License: {
            async issueTrendsAccessToken() { throw new Error('not used'); },
            async checkLicenseStatus() { return { success: true }; }
        },
        tokenCache: { clear() {} },
        remoteClient: {},
        Utils,
        Logger: { warn() {} }
    });
}

test('trend posting service exposes only the metadata required by the UI', async () => {
    const service = createService({
        async getMeta() {
            return {
                success: true,
                categories: ['맛집'],
                availableDates: ['2026-08-11'],
                dateRange: { min: '2026-03-29', max: '2026-08-11' },
                totalRows: 84140,
                sources: ['naver_creator_advisor']
            };
        }
    });

    assert.deepEqual(await service.getMeta(), {
        categories: ['맛집'],
        availableDates: ['2026-08-11'],
        dateRange: { min: '2026-03-29', max: '2026-08-11' }
    });
});

test('trend posting service validates filters and aggregates remote rows', async () => {
    let receivedFilters;
    const service = createService({
        async getRows(filters) {
            receivedFilters = filters;
            return {
                success: true,
                items: [
                    {
                        keyword: '성수 맛집',
                        category: '맛집',
                        trend_date: '2026-08-11',
                        change_raw: '▲ 48',
                        change_type: 'up',
                        change_amount: 48,
                        display_order: 1
                    }
                ]
            };
        }
    });

    const result = await service.getKeywords({
        searchParams: new URLSearchParams({
            categories: '맛집',
            dateFrom: '2026-08-11',
            dateTo: '2026-08-11'
        })
    });

    assert.deepEqual(receivedFilters, {
        categories: ['맛집'],
        dateFrom: '2026-08-11',
        dateTo: '2026-08-11'
    });
    assert.equal(result.rawCount, 1);
    assert.equal(result.count, 1);
    assert.equal(result.items[0].keyword, '성수 맛집');
});

test('trend posting service maps invalid filters and upstream rate limits', async () => {
    const service = createService({
        async getRows() {
            const error = new Error('remote detail');
            error.code = 'TRENDS_REMOTE_RATE_LIMITED';
            throw error;
        }
    });

    await assert.rejects(
        service.getKeywords({ searchParams: new URLSearchParams() }),
        (error) => error.status === 400 && error.apiCode === 'TREND_POSTING_FILTER_INVALID'
    );
    await assert.rejects(
        service.getKeywords({
            searchParams: new URLSearchParams({
                categories: '맛집',
                dateFrom: '2026-08-11',
                dateTo: '2026-08-11'
            })
        }),
        (error) => error.status === 429 && error.apiCode === 'TRENDS_REMOTE_RATE_LIMITED'
    );
});

test('trend posting service separates inactive licenses from temporary token issuance failures', async () => {
    for (const [code, status] of [['LICENSE_NOT_ACTIVE', 401], ['TRENDS_TOKEN_ISSUE_FAILED', 503]]) {
        const service = createService({
            async getMeta() {
                const error = new Error(code);
                error.code = code;
                throw error;
            }
        });
        await assert.rejects(
            service.getMeta(),
            (error) => error.status === status && error.apiCode === code
        );
    }
});

test('trend posting service rejects queries that reach the remote row cap', async () => {
    const service = createService({
        async getRows() {
            return { success: true, items: Array.from({ length: 5000 }, () => ({})) };
        }
    });

    await assert.rejects(
        service.getKeywords({
            searchParams: new URLSearchParams({
                categories: '맛집',
                dateFrom: '2026-08-11',
                dateTo: '2026-08-11'
            })
        }),
        (error) => error.status === 400 && error.apiCode === 'TREND_POSTING_QUERY_TOO_BROAD'
    );
});

test('trend posting service saves a selected keyword as a waiting topics row', async () => {
    let appended;
    let appendOptions;
    let ensureCalls = 0;
    const service = createWritableService({
        async ensureAllSheetsExist() { ensureCalls += 1; },
        async appendGoogleSheetTopics(topics, options) {
            appended = topics;
            appendOptions = options;
            return { success: true, rowNumbers: [12], rowIndices: [10] };
        }
    });

    const result = await service.saveTopic({
        body: { keyword: '  성수   맛집 ', trendDate: '2026-08-11' }
    });

    assert.deepEqual(appended, [{
        subject: '성수 맛집',
        keywords: ['성수 맛집'],
        source: 'naver_trend',
        trendDate: '2026-08-11',
        status: '대기'
    }]);
    assert.deepEqual(appendOptions, { defaultStatus: '대기', postAppendDelayMs: 0 });
    assert.equal(ensureCalls, 0);
    assert.deepEqual(result, {
        keyword: '성수 맛집',
        trendDate: '2026-08-11',
        source: 'naver_trend',
        status: '대기',
        rowNumber: 12,
        rowIndex: 10
    });
});

test('trend posting service rejects missing keywords and impossible dates before append', async () => {
    let appendCalls = 0;
    const service = createWritableService({
        async appendGoogleSheetTopics() { appendCalls += 1; }
    });

    await assert.rejects(
        service.saveTopic({ body: { keyword: '', trendDate: '2026-08-11' } }),
        (error) => error.status === 400 && error.apiCode === 'TREND_POSTING_TOPIC_INVALID'
    );
    await assert.rejects(
        service.saveTopic({ body: { keyword: '성수 맛집', trendDate: '2026-02-31' } }),
        (error) => error.status === 400 && error.apiCode === 'TREND_POSTING_TOPIC_INVALID'
    );
    assert.equal(appendCalls, 0);
});

test('trend posting service checks the active license before saving', async () => {
    let appendCalls = 0;
    const service = createTrendPostingService({
        License: {
            async issueTrendsAccessToken() { throw new Error('not used'); },
            async checkLicenseStatus() { return { success: false, message: '만료됨' }; }
        },
        tokenCache: { clear() {} },
        remoteClient: {},
        Utils: {
            async appendGoogleSheetTopics() { appendCalls += 1; }
        },
        Logger: { warn() {} }
    });

    await assert.rejects(
        service.saveTopic({ body: { keyword: '성수 맛집', trendDate: '2026-08-11' } }),
        (error) => error.status === 401 && error.apiCode === 'LICENSE_NOT_ACTIVE'
    );
    assert.equal(appendCalls, 0);
});
