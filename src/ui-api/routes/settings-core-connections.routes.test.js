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
            },
            async saveAiRoleSettings(body) {
                calls.push(body);
                return { scope: body.scope };
            },
            async getCoreConnectionSettings() {
                return { fields: {} };
            },
            async getAiRoleSettings() {
                return { fields: {} };
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

test('AI roles route accepts scoped POST requests', async () => {
    const harness = createHarness();
    const requestBody = { scope: 'text', values: { provider: 'direct', name: 'model', baseUrl: 'https://example.com/v1' } };
    assert.equal(await harness.handler({
        pathname: '/api/v1/settings/ai-roles', method: 'POST', requestId: 'ai-1', requestBody
    }), true);
    assert.deepEqual(harness.calls, [requestBody]);
    assert.deepEqual(harness.responses[0].data, { scope: 'text' });
});

test('core connections route exposes a safe GET read and rejects unsupported methods', async () => {
    const harness = createHarness();

    await harness.handler({
        pathname: '/api/v1/settings/core-connections',
        method: 'GET',
        requestId: 'core-get'
    });
    assert.equal(harness.calls.length, 0);
    assert.deepEqual(harness.responses[0].data, { fields: {} });
    await harness.handler({
        pathname: '/api/v1/settings/core-connections',
        method: 'PUT',
        requestId: 'core-put'
    });
    assert.equal(harness.responses[1].status, 405);
    assert.equal(harness.responses[1].code, 'METHOD_NOT_ALLOWED');
});
