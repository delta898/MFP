#!/usr/bin/env node
const assert = require('assert');
const { createSettingsController } = require('../src/ui-api/controllers/settings.controller');
const { createSettingsRouteHandler } = require('../src/ui-api/routes/settings.routes');

function createHarness(overrides = {}) {
    const service = {
        getMajorSettings: overrides.getMajorSettings || (async () => ({ ok: 'major:get' })),
        saveMajorSettings: overrides.saveMajorSettings || (async (body) => ({ ok: 'major:post', body })),
        getAdvancedSettings: overrides.getAdvancedSettings || (async () => ({ ok: 'adv:get' })),
        saveAdvancedSettings: overrides.saveAdvancedSettings || (async (body) => ({ ok: 'adv:post', body })),
        testAiModelConnection: overrides.testAiModelConnection || (async (body) => ({ ok: 'ai-model:test', body }))
    };

    let lastResponse = null;
    const sendSuccess = (_res, requestId, data) => {
        lastResponse = { ok: true, requestId, data };
        return true;
    };
    const sendError = (_res, requestId, status, code, message) => {
        lastResponse = { ok: false, requestId, status, code, message };
        return true;
    };

    const controller = createSettingsController({ service, sendSuccess, sendError });
    const routeHandler = createSettingsRouteHandler({ controller });

    async function call(pathname, method = 'GET', body = {}) {
        lastResponse = null;
        const handled = await routeHandler({
            pathname,
            method,
            requestId: 'req-settings-test',
            requestBody: body,
            searchParams: new URLSearchParams(),
            res: {}
        });
        return { handled, response: lastResponse };
    }

    return { call };
}

async function run() {
    const h = createHarness();

    {
        const { handled, response } = await h.call('/api/v1/settings/major', 'GET');
        assert.strictEqual(handled, true);
        assert.strictEqual(response.ok, true);
        assert.strictEqual(response.data.ok, 'major:get');
    }

    {
        const payload = { GEMINI_API_KEY: 'x' };
        const { handled, response } = await h.call('/api/v1/settings/major', 'POST', payload);
        assert.strictEqual(handled, true);
        assert.strictEqual(response.ok, true);
        assert.strictEqual(response.data.ok, 'major:post');
        assert.deepStrictEqual(response.data.body, payload);
    }

    {
        const { handled, response } = await h.call('/api/v1/settings/advanced', 'GET');
        assert.strictEqual(handled, true);
        assert.strictEqual(response.ok, true);
        assert.strictEqual(response.data.ok, 'adv:get');
    }

    {
        const payload = { content: 'A=B' };
        const { handled, response } = await h.call('/api/v1/settings/advanced', 'POST', payload);
        assert.strictEqual(handled, true);
        assert.strictEqual(response.ok, true);
        assert.strictEqual(response.data.ok, 'adv:post');
        assert.deepStrictEqual(response.data.body, payload);
    }

    {
        const { handled, response } = await h.call('/api/v1/settings/major', 'DELETE');
        assert.strictEqual(handled, true);
        assert.strictEqual(response.ok, false);
        assert.strictEqual(response.status, 405);
        assert.strictEqual(response.code, 'METHOD_NOT_ALLOWED');
    }

    {
        const payload = { kind: 'text', provider: 'openai', presetCode: 'gpt-5.6-sol' };
        const { handled, response } = await h.call('/api/v1/settings/test-ai-model', 'POST', payload);
        assert.strictEqual(handled, true);
        assert.strictEqual(response.ok, true);
        assert.strictEqual(response.data.ok, 'ai-model:test');
        assert.deepStrictEqual(response.data.body, payload);
    }

    {
        const { handled } = await h.call('/api/v1/settings/not-found', 'GET');
        assert.strictEqual(handled, false);
    }

    console.log('✅ settings api smoke test passed');
}

run().catch((e) => {
    console.error('❌ settings api smoke test failed');
    console.error(e && e.stack ? e.stack : e);
    process.exit(1);
});
