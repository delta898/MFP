const test = require('node:test');
const assert = require('node:assert/strict');
const { createTopicRecommendationsRouteHandler } = require('./topic-recommendations.routes');

test('topic recommendation routes dispatch list and explicit outcome endpoints', async () => {
    const calls = [];
    const handler = createTopicRecommendationsRouteHandler({
        controller: {
            async list(ctx) { calls.push(['list', ctx.method]); },
            async outcome(ctx) { calls.push(['outcome', ctx.method]); }
        }
    });

    assert.equal(await handler({ pathname: '/api/v1/blog/topic-recommendations', method: 'GET' }), true);
    assert.equal(await handler({ pathname: '/api/v1/blog/topic-recommendations/outcome', method: 'POST' }), true);
    assert.equal(await handler({ pathname: '/api/v1/blog/other', method: 'GET' }), false);
    assert.deepEqual(calls, [['list', 'GET'], ['outcome', 'POST']]);
});
