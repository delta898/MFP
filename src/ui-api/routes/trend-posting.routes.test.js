const test = require('node:test');
const assert = require('node:assert/strict');

const { createTrendPostingController } = require('../controllers/trend-posting.controller');
const { createTrendPostingRouteHandler } = require('./trend-posting.routes');

function createHarness(service) {
    const responses = [];
    const controller = createTrendPostingController({
        service,
        sendSuccess(_res, requestId, data) {
            responses.push({ type: 'success', requestId, data });
            return true;
        },
        sendError(_res, requestId, status, code, message) {
            responses.push({ type: 'error', requestId, status, code, message });
            return true;
        }
    });
    return {
        responses,
        route: createTrendPostingRouteHandler({ controller })
    };
}

test('trend posting route exposes metadata, keyword reads, recent topics, and topic saves', async () => {
    const searchParams = new URLSearchParams({ categories: '맛집' });
    const harness = createHarness({
        async getMeta() { return { categories: ['맛집'] }; },
        async getKeywords(input) {
            assert.equal(input.searchParams, searchParams);
            return { count: 1, items: [{ keyword: '성수 맛집' }] };
        },
        async getRecentTopicKeywords(input) {
            assert.equal(input.searchParams.get('days'), '15');
            return { days: 15, keywords: ['성수 맛집'] };
        },
        async saveTopic(input) {
            assert.deepEqual(input.body, { keyword: '성수 맛집', trendDate: '2026-08-11' });
            return { keyword: '성수 맛집', status: '대기' };
        }
    });

    assert.equal(await harness.route({
        pathname: '/api/v1/trend-posting/meta',
        requestId: 'meta-1',
        method: 'GET',
        res: {}
    }), true);
    assert.equal(await harness.route({
        pathname: '/api/v1/trend-posting/keywords',
        requestId: 'keywords-1',
        method: 'GET',
        searchParams,
        res: {}
    }), true);
    assert.equal(harness.responses[0].data.categories[0], '맛집');
    assert.equal(harness.responses[1].data.items[0].keyword, '성수 맛집');
    assert.equal(await harness.route({
        pathname: '/api/v1/trend-posting/recent-topics',
        requestId: 'recent-1',
        method: 'GET',
        searchParams: new URLSearchParams({ days: '15' }),
        res: {}
    }), true);
    assert.equal(harness.responses[2].data.keywords[0], '성수 맛집');
    assert.equal(await harness.route({
        pathname: '/api/v1/trend-posting/topics',
        requestId: 'topic-1',
        method: 'POST',
        requestBody: { keyword: '성수 맛집', trendDate: '2026-08-11' },
        res: {}
    }), true);
    assert.equal(harness.responses[3].data.status, '대기');
});

test('trend posting route rejects mutation methods and ignores unrelated paths', async () => {
    const harness = createHarness({
        async getMeta() { return {}; },
        async getKeywords() { return {}; },
        async getRecentTopicKeywords() { return {}; },
        async saveTopic() { return {}; }
    });

    assert.equal(await harness.route({
        pathname: '/api/v1/trend-posting/meta',
        requestId: 'meta-2',
        method: 'POST',
        res: {}
    }), true);
    assert.equal(harness.responses[0].status, 405);
    assert.equal(await harness.route({
        pathname: '/api/v1/unrelated',
        requestId: 'none',
        method: 'GET',
        res: {}
    }), false);
});
