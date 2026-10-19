const test = require('node:test');
const assert = require('node:assert/strict');
const { createKeywordsRouteHandler } = require('./routes');

test('keywords route handles analysis, title, pipeline, and quick publish suggestion endpoints', async () => {
    const calls = [];
    const controller = {
        status: async (ctx) => calls.push(['status', ctx.pathname]),
        analyze: async (ctx) => calls.push(['analyze', ctx.pathname]),
        suggestTitles: async (ctx) => calls.push(['suggestTitles', ctx.pathname]),
        pipeline: async (ctx) => calls.push(['pipeline', ctx.pathname]),
        quickPublishRecommendations: async (ctx) => calls.push(['quickPublishRecommendations', ctx.pathname])
    };
    const handler = createKeywordsRouteHandler({ controller });

    assert.equal(await handler({ pathname: '/api/v1/keywords/status' }), true);
    assert.equal(await handler({ pathname: '/api/v1/keywords/analyze' }), true);
    assert.equal(await handler({ pathname: '/api/v1/keywords/suggest-titles' }), true);
    assert.equal(await handler({ pathname: '/api/v1/keywords/pipeline' }), true);
    assert.equal(await handler({ pathname: '/api/v1/blog/quick-publish/recommendations' }), true);
    assert.equal(await handler({ pathname: '/api/v1/unknown' }), false);
    assert.deepEqual(calls.map((item) => item[0]), [
        'status',
        'analyze',
        'suggestTitles',
        'pipeline',
        'quickPublishRecommendations'
    ]);
});
