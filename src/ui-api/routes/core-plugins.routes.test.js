'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createCorePluginsRouteHandler } = require('./core-plugins.routes');

function createHarness() {
    const responses = [];
    const corePluginRuntime = {
        listPlugins: () => [{ id: 'writer', name: 'Writer', state: 'not_loaded', operations: [] }],
        getPlugin: (id) => id === 'writer' ? { id, name: 'Writer', state: 'not_loaded', operations: [] } : null
    };
    return {
        responses,
        handler: createCorePluginsRouteHandler({
            corePluginRuntime,
            sendSuccess: (_res, requestId, data) => responses.push({ requestId, data }),
            sendError: (_res, requestId, status, code, message) => responses.push({ requestId, status, code, message })
        })
    };
}

test('Core Plugin routes expose bundled inventory and selected safe details as read-only queries', async () => {
    const harness = createHarness();
    assert.equal(await harness.handler({ pathname: '/api/v1/plugins/core', method: 'GET', requestId: 'list' }), true);
    assert.deepEqual(harness.responses[0].data.plugins.map(({ id }) => id), ['writer']);
    assert.equal(await harness.handler({ pathname: '/api/v1/plugins/core/writer', method: 'GET', requestId: 'detail' }), true);
    assert.deepEqual(harness.responses[1].data.plugin, { id: 'writer', name: 'Writer', state: 'not_loaded', operations: [] });
    assert.equal(await harness.handler({ pathname: '/api/v1/plugins/core/missing', method: 'GET', requestId: 'missing' }), true);
    assert.equal(harness.responses[2].status, 404);
});

test('Core Plugin routes reject mutation methods', async () => {
    const harness = createHarness();
    await harness.handler({ pathname: '/api/v1/plugins/core', method: 'POST', requestId: 'mutation' });
    assert.equal(harness.responses[0].status, 405);
});
