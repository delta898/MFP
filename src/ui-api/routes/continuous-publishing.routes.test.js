const test = require('node:test');
const assert = require('node:assert/strict');

const { createContinuousPublishingController } = require('../controllers/continuous-publishing.controller');
const { createContinuousPublishingRouteHandler } = require('./continuous-publishing.routes');

function createHarness() {
    const calls = [];
    const responses = [];
    const service = {
        async getDashboardOverview() {
            calls.push('overview');
            return { schema_version: 1, queue: { ready_count: 2 } };
        }
    };
    const controller = createContinuousPublishingController({
        service,
        sendSuccess: (_res, requestId, data) => {
            responses.push({ ok: true, requestId, data });
            return true;
        },
        sendError: (_res, requestId, status, code, message) => {
            responses.push({ ok: false, requestId, status, code, message });
            return true;
        }
    });
    return { calls, responses, handler: createContinuousPublishingRouteHandler({ controller }) };
}

test('dashboard overview route exposes the continuous publishing read model', async () => {
    const harness = createHarness();
    const handled = await harness.handler({
        pathname: '/api/v1/continuous-publishing/dashboard-overview',
        method: 'GET',
        requestId: 'overview-1'
    });

    assert.equal(handled, true);
    assert.deepEqual(harness.calls, ['overview']);
    assert.equal(harness.responses[0].data.queue.ready_count, 2);
});

test('dashboard overview route rejects mutation methods', async () => {
    const harness = createHarness();
    await harness.handler({
        pathname: '/api/v1/continuous-publishing/dashboard-overview',
        method: 'POST',
        requestId: 'overview-write'
    });

    assert.deepEqual(harness.calls, []);
    assert.equal(harness.responses[0].status, 405);
    assert.equal(harness.responses[0].code, 'METHOD_NOT_ALLOWED');
});
