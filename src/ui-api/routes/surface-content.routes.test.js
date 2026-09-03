const test = require('node:test');
const assert = require('node:assert/strict');

const { createSurfaceContentController } = require('../controllers/surface-content.controller');
const { createSurfaceContentRouteHandler } = require('./surface-content.routes');

function createHarness() {
    const calls = [];
    const responses = [];
    const service = {
        async getHelp() {
            calls.push('help');
            return { schemaVersion: 1, surface: 'help', regions: {} };
        }
    };
    const controller = createSurfaceContentController({
        service,
        sendSuccess: (_res, requestId, data) => responses.push({ ok: true, requestId, data }),
        sendError: (_res, requestId, status, code, message) => responses.push({
            ok: false, requestId, status, code, message
        })
    });
    return { calls, responses, handler: createSurfaceContentRouteHandler({ controller }) };
}

test('Help surface route exposes the read-only catalog', async () => {
    const harness = createHarness();
    const handled = await harness.handler({
        pathname: '/api/v1/surface-content/help', method: 'GET', requestId: 'help-1'
    });

    assert.equal(handled, true);
    assert.deepEqual(harness.calls, ['help']);
    assert.equal(harness.responses[0].data.surface, 'help');
});

test('Help surface route rejects mutation methods', async () => {
    const harness = createHarness();
    await harness.handler({
        pathname: '/api/v1/surface-content/help', method: 'POST', requestId: 'help-write'
    });

    assert.deepEqual(harness.calls, []);
    assert.equal(harness.responses[0].status, 405);
    assert.equal(harness.responses[0].code, 'METHOD_NOT_ALLOWED');
});
