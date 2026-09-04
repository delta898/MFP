const test = require('node:test');
const assert = require('node:assert/strict');
const { createCardNewsRouteHandler } = require('./card-news.routes');

test('routes only card-news endpoints to their controllers', async () => {
    const calls = [];
    const controller = {
        sources: async (ctx) => calls.push(['sources', ctx.method]),
        preview: async (ctx) => calls.push(['preview', ctx.method]),
        projects: async (ctx) => calls.push(['projects', ctx.method])
    };
    const handler = createCardNewsRouteHandler({ controller });

    assert.equal(await handler({ pathname: '/api/v1/card-news/sources', method: 'GET' }), true);
    assert.equal(await handler({ pathname: '/api/v1/card-news/source-preview', method: 'POST' }), true);
    assert.equal(await handler({ pathname: '/api/v1/card-news/projects', method: 'GET' }), true);
    assert.equal(await handler({ pathname: '/api/v1/other', method: 'GET' }), false);
    assert.deepEqual(calls, [['sources', 'GET'], ['preview', 'POST'], ['projects', 'GET']]);
});
