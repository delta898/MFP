const test = require('node:test');
const assert = require('node:assert/strict');
const { createRecommendationCenterRouteHandler } = require('./recommendation-center.routes');

test('recommendation center routes dispatch list, discovery, interaction and confirmation endpoints', async () => {
    const called = [];
    const handler = createRecommendationCenterRouteHandler({
        controller: {
            async list() { called.push('list'); },
            async discover() { called.push('discover'); },
            async interaction() { called.push('interaction'); },
            async confirmation() { called.push('confirmation'); }
        }
    });
    assert.equal(await handler({ pathname: '/api/v1/recommendations', method: 'GET' }), true);
    assert.equal(await handler({ pathname: '/api/v1/recommendations/discover', method: 'POST' }), true);
    assert.equal(await handler({ pathname: '/api/v1/recommendations/interaction', method: 'POST' }), true);
    assert.equal(await handler({ pathname: '/api/v1/recommendations/confirmation', method: 'POST' }), true);
    assert.equal(await handler({ pathname: '/api/v1/blog/topic-recommendations', method: 'GET' }), false);
    assert.deepEqual(called, ['list', 'discover', 'interaction', 'confirmation']);
});
