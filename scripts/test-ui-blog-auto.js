#!/usr/bin/env node
const assert = require('assert');
const { createBlogAutoService } = require('../src/adapters/ui/blog/automation/service');
const { createBlogAutoController } = require('../src/adapters/ui/blog/automation/controller');
const { createBlogAutoRouteHandler } = require('../src/adapters/ui/blog/automation/routes');
function createHarness(overrides = {}) {
    const events = [];
    const Logger = {
        info: (...args) => events.push({ level: 'info', args }),
        warn: (...args) => events.push({ level: 'warn', args }),
        error: (...args) => events.push({ level: 'error', args })
    };

    const service = createBlogAutoService({
        Logger,
        getAutoStatusPayload: overrides.getAutoStatusPayload || (() => ({ enabled: true, status: 'waiting' })),
        triggerSnsDiscoveryCycle: overrides.triggerSnsDiscoveryCycle || (async () => ({ success: true, data: { discoveredCount: 1 } })),
        triggerSnsDistributionCycle: overrides.triggerSnsDistributionCycle || (async () => ({ success: true, data: { completedCount: 1 } })),
        runAutoPublishCycle: overrides.runAutoPublishCycle || (async () => ({ success: true, data: { completedCount: 1 } })),
        triggerAutoPublishCycle: overrides.triggerAutoPublishCycle || (async () => ({ success: true, data: { started: true } }))
    });

    let lastResponse = null;
    const sendSuccess = (_res, requestId, data) => {
        lastResponse = { ok: true, requestId, data };
        return true;
    };
    const sendError = (_res, requestId, status, code, message) => {
        lastResponse = { ok: false, requestId, status, code, message };
        return true;
    };

    const controller = createBlogAutoController({
        service,
        sendSuccess,
        sendError,
        Logger,
        validators: {}
    });

    const routeHandler = createBlogAutoRouteHandler({ controller });

    async function call(pathname, method = 'GET', { search = '', body = {} } = {}) {
        lastResponse = null;
        const ctx = {
            requestId: 'req-test',
            pathname,
            method,
            searchParams: new URLSearchParams(search),
            requestBody: body,
            res: {}
        };
        const handled = await routeHandler(ctx);
        return { handled, response: lastResponse };
    }

    return { call, events };
}

async function run() {
    const h = createHarness();

    {
        const { handled, response } = await h.call('/api/v1/auto/status', 'GET');
        assert.strictEqual(handled, true);
        assert.strictEqual(response.ok, true);
        assert.strictEqual(response.data.enabled, true);
    }

    {
        const retiredRoutes = [
            '/api/v1/blog/auto/categories',
            '/api/v1/blog/auto/run-manual',
            '/api/v1/auto/start',
            '/api/v1/auto/collect/trends/run',
            '/api/v1/auto/collect/rss/run'
        ];
        for (const pathname of retiredRoutes) {
            const { handled } = await h.call(pathname, 'POST');
            assert.strictEqual(handled, false, `${pathname} should be removed`);
        }
    }

    {
        const { handled } = await h.call('/api/v1/not-exists', 'GET');
        assert.strictEqual(handled, false);
    }

    console.log('✅ blog auto api smoke test passed');
}

run().catch((e) => {
    console.error('❌ blog auto api smoke test failed');
    console.error(e && e.stack ? e.stack : e);
    process.exit(1);
});
