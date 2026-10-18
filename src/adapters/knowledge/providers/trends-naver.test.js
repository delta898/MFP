const test = require('node:test');
const assert = require('node:assert/strict');
const {
    createDefaultNaverTrendsDefinition,
    createNaverTrendsProvider,
    normalizeNaverTrendItem,
    resolveLatestDate
} = require('./trends-naver');

test('resolves the latest available Naver trend date', () => {
    assert.equal(resolveLatestDate({ availableDates: ['2026-08-12', '2026-08-14', '2026-08-13'] }), '2026-08-14');
    assert.equal(resolveLatestDate({ dateRange: { max: '2026-08-15' } }), '2026-08-15');
});

test('normalizes Naver trend data as observed weak knowledge', () => {
    const item = normalizeNaverTrendItem({
        keyword: 'AI 글쓰기',
        categories: ['IT·컴퓨터'],
        latestTrendDate: '2026-08-14',
        change: { type: 'up', amount: 7, raw: '▲7' },
        displayOrder: 2
    }, { id: 'fixture-provider' });

    assert.equal(item.title, 'AI 글쓰기');
    assert.equal(item.source, 'naver-trend-posting');
    assert.equal(item.keyword, 'AI 글쓰기');
    assert.equal(item.change_type, 'up');
    assert.equal(item.change_amount, 7);
    assert.match(item.id, /^trend_[a-f0-9]{64}$/);
});

test('fetches a bounded latest-day snapshot without creating user evidence', async () => {
    const calls = [];
    const provider = createNaverTrendsProvider({
        now: () => new Date('2026-08-24T00:00:00.000Z'),
        remoteClient: {
            async getMeta() {
                return {
                    success: true,
                    categories: ['IT·컴퓨터', '건강·의학', '게임', '방송', '여행', '영화'],
                    availableDates: ['2026-08-13', '2026-08-14'],
                    dateRange: { max: '2026-08-14' }
                };
            },
            async getRows(filters) {
                calls.push(filters);
                return {
                    success: true,
                    items: [
                        { keyword: '키워드 A', category: 'IT·컴퓨터', trend_date: '2026-08-14', change_type: 'up', change_amount: 5, change_raw: '▲5', display_order: 2 },
                        { keyword: '키워드 B', category: '건강·의학', trend_date: '2026-08-14', change_type: 'new', change_amount: null, change_raw: 'new', display_order: 1 }
                    ]
                };
            }
        }
    });
    const definition = createDefaultNaverTrendsDefinition();
    const result = await provider.fetch({ definition, query: { limit: 1 } });

    assert.deepEqual(calls[0], {
        categories: ['IT·컴퓨터', '건강·의학', '게임', '방송', '여행'],
        dateFrom: '2026-08-14',
        dateTo: '2026-08-14'
    });
    assert.equal(result.kind, 'trends');
    assert.equal(result.provider_id, 'naver-trends');
    assert.equal(result.transport, 'builtin_api');
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].source, 'naver-trend-posting');
    assert.equal(Object.hasOwn(result.items[0], 'owner_user_id'), false);
    assert.equal(result.observed_at, '2026-08-24T00:00:00.000Z');
    assert.equal(result.expires_at, '2026-08-24T00:15:00.000Z');
});
