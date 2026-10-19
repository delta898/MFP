const test = require('node:test');
const assert = require('node:assert/strict');
const { createTrendsService } = require('./service');

test('maps imported trend and keyword query parameters to the Sheets adapter', async () => {
    const calls = [];
    const service = createTrendsService({
        async ensureSheetsReadyForUi() { calls.push(['ready']); },
        parseIntSafe(value, fallback, minimum) {
            const parsed = Number(value);
            return Number.isFinite(parsed) && parsed >= minimum ? parsed : fallback;
        },
        normalizeSortDir(value, fallback) { return value === 'asc' ? 'asc' : fallback; },
        GoogleSheets: {
            async readGoogleSheetTrendsAll(input) { calls.push(['trends', input]); return { items: [] }; },
            async readGoogleSheetKeywordsAll(input) { calls.push(['keywords', input]); return { items: [] }; }
        }
    });

    const trends = await service.getTrendsItems({
        searchParams: new URLSearchParams('status=new&q=ai&limit=20&offset=5&sortBy=createdAt&sortDir=asc')
    });
    const keywords = await service.getKeywordsItems({
        searchParams: new URLSearchParams('status=ready&q=blog&limit=10&offset=2')
    });

    assert.deepEqual(trends, { items: [] });
    assert.deepEqual(keywords, { items: [] });
    assert.deepEqual(calls, [
        ['ready'],
        ['trends', { status: 'new', q: 'ai', limit: 20, offset: 5, sortBy: 'createdAt', sortDir: 'asc' }],
        ['ready'],
        ['keywords', { status: 'ready', q: 'blog', limit: 10, offset: 2 }]
    ]);
});

test('converts a failed trend-to-topic application result into an API error', async () => {
    const service = createTrendsService({
        executeTrendsToTopicsAction: async () => ({ success: false, code: 'NO_TRENDS', message: '가져올 트렌드가 없습니다.' })
    });

    await assert.rejects(service.trendsToTopics({}), (error) => {
        assert.equal(error.status, 400);
        assert.equal(error.apiCode, 'NO_TRENDS');
        assert.equal(error.message, '가져올 트렌드가 없습니다.');
        return true;
    });
});
