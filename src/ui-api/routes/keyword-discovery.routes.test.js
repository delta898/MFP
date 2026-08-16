const test = require('node:test');
const assert = require('node:assert/strict');
const { createKeywordDiscoveryRouteHandler } = require('./keyword-discovery.routes');

test('keyword discovery route dispatches its explicit exploration endpoint', async () => {
    const calls = [];
    const handler = createKeywordDiscoveryRouteHandler({
        controller: { async explore(ctx) { calls.push(ctx.method); } }
    });

    assert.equal(await handler({ pathname: '/api/v1/blog/keyword-discovery', method: 'GET' }), true);
    assert.equal(await handler({ pathname: '/api/v1/blog/topic-recommendations', method: 'GET' }), false);
    assert.deepEqual(calls, ['GET']);
});
