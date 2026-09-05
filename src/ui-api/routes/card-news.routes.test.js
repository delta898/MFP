const test = require('node:test');
const assert = require('node:assert/strict');
const { createCardNewsRouteHandler } = require('./card-news.routes');

test('routes only card-news endpoints to their controllers', async () => {
    const calls = [];
    const controller = {
        sources: async (ctx) => calls.push(['sources', ctx.method]),
        managed: async (ctx) => calls.push(['managed', ctx.method]),
        generation: async (ctx) => calls.push(['generation', ctx.method]),
        preview: async (ctx) => calls.push(['preview', ctx.method]),
        generate: async (ctx) => calls.push(['generate', ctx.method]),
        generateImages: async (ctx) => calls.push(['generateImages', ctx.method]),
        importImage: async (ctx) => calls.push(['importImage', ctx.method]),
        previewZip: async (ctx) => calls.push(['previewZip', ctx.method]),
        importZip: async (ctx) => calls.push(['importZip', ctx.method]),
        asset: async (ctx) => calls.push(['asset', ctx.method]),
        exportBundle: async (ctx) => calls.push(['exportBundle', ctx.method]),
        publishingConfig: async (ctx) => calls.push(['publishingConfig', ctx.method]),
        publish: async (ctx) => calls.push(['publish', ctx.method]),
        projects: async (ctx) => calls.push(['projects', ctx.method])
    };
    const handler = createCardNewsRouteHandler({ controller });

    assert.equal(await handler({ pathname: '/api/v1/card-news/sources', method: 'GET' }), true);
    assert.equal(await handler({ pathname: '/api/v1/card-news/managed', method: 'GET' }), true);
    assert.equal(await handler({ pathname: '/api/v1/card-news/source-preview', method: 'POST' }), true);
    assert.equal(await handler({ pathname: '/api/v1/card-news/generations', method: 'POST' }), true);
    assert.equal(await handler({ pathname: '/api/v1/card-news/generations/set-1', method: 'GET' }), true);
    assert.equal(await handler({ pathname: '/api/v1/card-news/images/generate', method: 'POST' }), true);
    assert.equal(await handler({ pathname: '/api/v1/card-news/images/import', method: 'POST' }), true);
    assert.equal(await handler({ pathname: '/api/v1/card-news/zip/preview', method: 'POST' }), true);
    assert.equal(await handler({ pathname: '/api/v1/card-news/zip/import', method: 'POST' }), true);
    assert.equal(await handler({ pathname: '/api/v1/card-news/assets/set-1/card-01.png', method: 'GET' }), true);
    assert.equal(await handler({ pathname: '/api/v1/card-news/exports/set-1.zip', method: 'GET' }), true);
    assert.equal(await handler({ pathname: '/api/v1/card-news/publishing/config', method: 'GET' }), true);
    assert.equal(await handler({ pathname: '/api/v1/card-news/publishing/publish', method: 'POST' }), true);
    assert.equal(await handler({ pathname: '/api/v1/card-news/projects', method: 'GET' }), true);
    assert.equal(await handler({ pathname: '/api/v1/other', method: 'GET' }), false);
    assert.deepEqual(calls, [
        ['sources', 'GET'],
        ['managed', 'GET'],
        ['preview', 'POST'],
        ['generate', 'POST'],
        ['generation', 'GET'],
        ['generateImages', 'POST'],
        ['importImage', 'POST'],
        ['previewZip', 'POST'],
        ['importZip', 'POST'],
        ['asset', 'GET'],
        ['exportBundle', 'GET'],
        ['publishingConfig', 'GET'],
        ['publish', 'POST'],
        ['projects', 'GET']
    ]);
});
