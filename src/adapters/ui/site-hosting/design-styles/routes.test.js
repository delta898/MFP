'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createDesignStylesRouteHandler } = require('./routes');

test('design styles route serves a catalog only to the local BlogGenius UI', async () => {
    let returned = null;
    const handler = createDesignStylesRouteHandler({
        catalog: { list: async () => ({ styles: [{ id: 'warm-editorial' }] }) },
        sendSuccess: async (_res, _requestId, data) => { returned = data; },
        sendError: async () => assert.fail('unexpected route error')
    });
    const handled = await handler({
        pathname: '/api/v1/settings/design-styles', method: 'GET', remoteAddress: '127.0.0.1',
        host: '127.0.0.1:4577', requestId: 'style-list'
    });
    assert.equal(handled, true);
    assert.deepEqual(returned.styles.map((style) => style.id), ['warm-editorial']);
});

test('design styles route rejects remote requests', async () => {
    let errorStatus = 0;
    const handler = createDesignStylesRouteHandler({
        catalog: { list: async () => assert.fail('catalog must not be fetched') },
        sendSuccess: async () => assert.fail('unexpected success'),
        sendError: async (_res, _requestId, status) => { errorStatus = status; }
    });
    const handled = await handler({
        pathname: '/api/v1/settings/design-styles', method: 'GET', remoteAddress: '203.0.113.4',
        host: '127.0.0.1:4577', requestId: 'style-remote', res: {}
    });
    assert.equal(handled, true);
    assert.equal(errorStatus, 403);
});
