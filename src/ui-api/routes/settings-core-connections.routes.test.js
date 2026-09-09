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
            },
            async getOptionalServiceSettings() {
                return { fields: { NOTIFY_BITLY_TOKEN_CONFIGURED: true } };
            },
            async saveOptionalServiceSettings(body) {
                calls.push(body);
                return { scope: body.scope };
            },
            async getExternalConnectionSettings() {
                return { fields: { MCP_REMOTE_AUTH_TOKEN_CONFIGURED: true } };
            },
            async saveExternalConnectionSettings(body) {
                calls.push(body);
                return { scope: body.scope };
            },
            async getAppGeneralSettings() {
                return { fields: { LISTEN_HOST: '127.0.0.1', LISTEN_PORT: 4577 } };
            },
            async saveAppGeneralSettings(body) {
                calls.push(body);
                return { fields: body.values };
            },
            async testOptionalServiceConnection(body) {
                calls.push(body);
                return { message: 'ok' };
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

test('optional services route exposes safe reads and scoped connection actions', async () => {
    const harness = createHarness();
    await harness.handler({ pathname: '/api/v1/settings/optional-services', method: 'GET', requestId: 'optional-get' });
    assert.equal(harness.responses[0].data.fields.NOTIFY_BITLY_TOKEN_CONFIGURED, true);
    const body = { scope: 'bitly', values: { NOTIFY_BITLY_TOKEN: '' } };
    await harness.handler({ pathname: '/api/v1/settings/optional-services/test', method: 'POST', requestId: 'optional-test', requestBody: body });
    assert.deepEqual(harness.calls, [body]);
});

test('external connections route exposes safe reads and scoped saves', async () => {
    const harness = createHarness();
    await harness.handler({ pathname: '/api/v1/settings/external-connections', method: 'GET', requestId: 'external-get' });
    assert.equal(harness.responses[0].data.fields.MCP_REMOTE_AUTH_TOKEN_CONFIGURED, true);
    const body = { scope: 'mcp', values: { MCP_REMOTE_ENABLED: true } };
    await harness.handler({ pathname: '/api/v1/settings/external-connections', method: 'POST', requestId: 'external-save', requestBody: body });
    assert.deepEqual(harness.calls, [body]);
    assert.deepEqual(harness.responses[1].data, { scope: 'mcp' });
});

test('app general route exposes the UI server address and applies scoped values', async () => {
    const harness = createHarness();
    await harness.handler({ pathname: '/api/v1/settings/app-general', method: 'GET', requestId: 'app-general-get' });
    assert.equal(harness.responses[0].data.fields.LISTEN_PORT, 4577);
    const body = { values: { LISTEN_HOST: '0.0.0.0', LISTEN_PORT: '4588' } };
    await harness.handler({ pathname: '/api/v1/settings/app-general', method: 'POST', requestId: 'app-general-save', requestBody: body });
    assert.deepEqual(harness.calls, [body]);
    assert.deepEqual(harness.responses[1].data, { fields: body.values });
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
