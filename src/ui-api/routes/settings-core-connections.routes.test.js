const test = require('node:test');
const assert = require('node:assert/strict');

const { createSettingsController } = require('../controllers/settings.controller');
const { createSettingsRouteHandler } = require('./settings.routes');

function createHarness() {
    const calls = [];
    const responses = [];
    const controller = createSettingsController({
        service: {
            async saveCoreConnectionSettings(body) {
                calls.push(body);
                return { scope: body.scope };
            }
        },
        sendSuccess: (_res, requestId, data) => responses.push({ ok: true, requestId, data }),
        sendError: (_res, requestId, status, code, message) => responses.push({ ok: false, requestId, status, code, message })
    });
    return { calls, responses, handler: createSettingsRouteHandler({ controller }) };
}

test('core connections route accepts scoped POST requests', async () => {
    const harness = createHarness();
    const requestBody = { scope: 'naver', values: { NAVER_ID: 'publisher' } };

    assert.equal(await harness.handler({
        pathname: '/api/v1/settings/core-connections',
        method: 'POST',
        requestId: 'core-1',
        requestBody
    }), true);
    assert.deepEqual(harness.calls, [requestBody]);
    assert.deepEqual(harness.responses[0].data, { scope: 'naver' });
});

test('core connections route rejects non-POST methods', async () => {
    const harness = createHarness();

    await harness.handler({
        pathname: '/api/v1/settings/core-connections',
        method: 'GET',
        requestId: 'core-get'
    });
    assert.equal(harness.calls.length, 0);
    assert.equal(harness.responses[0].status, 405);
    assert.equal(harness.responses[0].code, 'METHOD_NOT_ALLOWED');
});
