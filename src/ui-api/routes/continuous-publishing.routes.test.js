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
        },
        async getDashboardResultStats() {
            calls.push('stats');
            return { schema_version: 1, periods: { today: { processed_count: 2 } } };
        },
        async captureShoppingTopic(body) {
            calls.push({ shoppingTopic: body });
            return { action: 'save', rowIndex: 3, status: '준비' };
        },
        async startShoppingReadyTopic(body) {
            calls.push({ shoppingRunner: body });
            return { rowIndex: 3, status: '발행 완료', targets: ['naver'] };
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

test('dashboard result stats route exposes only the read model', async () => {
    const harness = createHarness();
    await harness.handler({
        pathname: '/api/v1/continuous-publishing/dashboard-result-stats',
        method: 'GET',
        requestId: 'stats-1'
    });

    assert.deepEqual(harness.calls, ['stats']);
    assert.equal(harness.responses[0].data.periods.today.processed_count, 2);

    const rejected = createHarness();
    await rejected.handler({
        pathname: '/api/v1/continuous-publishing/dashboard-result-stats',
        method: 'POST',
        requestId: 'stats-write'
    });
    assert.deepEqual(rejected.calls, []);
    assert.equal(rejected.responses[0].status, 405);
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

test('shopping topic capture is served by the continuous publishing route', async () => {
    const harness = createHarness();
    const handled = await harness.handler({
        pathname: '/api/v1/continuous-publishing/shopping/topics',
        method: 'POST',
        requestId: 'shopping-topic-1',
        requestBody: { shortUrl: 'https://smartstore.naver.com/example/products/1' }
    });

    assert.equal(handled, true);
    assert.deepEqual(harness.calls, [{
        shoppingTopic: { shortUrl: 'https://smartstore.naver.com/example/products/1' }
    }]);
    assert.equal(harness.responses[0].data.status, '준비');
});

test('shopping lifecycle runner is served by the continuous publishing route', async () => {
    const harness = createHarness();
    const handled = await harness.handler({
        pathname: '/api/v1/continuous-publishing/shopping/runner/start',
        method: 'POST',
        requestId: 'shopping-runner-1',
        requestBody: { rowIndex: 3, headless: false }
    });

    assert.equal(handled, true);
    assert.deepEqual(harness.calls, [{ shoppingRunner: { rowIndex: 3, headless: false } }]);
    assert.equal(harness.responses[0].data.status, '발행 완료');
});
