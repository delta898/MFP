'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createCloudflareConnectionRouteHandler } = require('./cloudflare-connection.routes');

function createHarness() {
    const calls = [];
    let response = null;
    const service = {
        getStatus: async () => { calls.push('getStatus'); return { connected: false, accounts: [] }; },
        start: async () => { calls.push('start'); return { flowId: 'test-flow', status: 'pending' }; },
        disconnect: async () => { calls.push('disconnect'); return { disconnected: true }; },
        cancel: (flowId) => { calls.push(`cancel:${flowId}`); return { cancelled: true }; },
        getFlow: (flowId) => { calls.push(`getFlow:${flowId}`); return { flowId, status: 'pending' }; }
    };
    const handler = createCloudflareConnectionRouteHandler({
        service,
        sendSuccess: async (_res, requestId, data) => { response = { ok: true, requestId, data }; },
        sendError: async (_res, requestId, status, code, message) => { response = { ok: false, requestId, status, code, message }; }
    });

    async function call(overrides = {}) {
        response = null;
        const handled = await handler({
            method: 'POST',
            pathname: '/api/v1/site-hosting/cloudflare/disconnect',
            requestId: 'req-cloudflare-test',
            remoteAddress: '127.0.0.1',
            host: '127.0.0.1:4577',
            origin: 'http://127.0.0.1:4577',
            contentType: 'application/json',
            res: {},
            ...overrides
        });
        return { handled, response };
    }

    return { calls, call };
}

test('Cloudflare disconnect accepts a same-origin loopback JSON request', async () => {
    const harness = createHarness();

    const { handled, response } = await harness.call();

    assert.equal(handled, true);
    assert.equal(response.ok, true);
    assert.deepEqual(harness.calls, ['disconnect']);
});

test('Cloudflare routes reject cross-origin POSTs before invoking the service', async (t) => {
    const cases = [
        ['foreign Origin', { origin: 'https://attacker.example' }],
        ['missing Origin', { origin: '' }],
        ['simple text request', { contentType: 'text/plain' }],
        ['DNS-rebinding Host', { host: 'attacker.example:4577', origin: 'http://attacker.example:4577' }],
        ['remote client', { remoteAddress: '192.168.1.50' }]
    ];

    for (const [label, overrides] of cases) {
        await t.test(label, async () => {
            const harness = createHarness();
            const { handled, response } = await harness.call(overrides);

            assert.equal(handled, true);
            assert.equal(response.ok, false);
            assert.equal(response.status, 403);
            assert.deepEqual(harness.calls, []);
        });
    }
});

test('Cloudflare routes accept the localhost alias when Origin and Host match', async () => {
    const harness = createHarness();

    const { response } = await harness.call({ host: 'localhost:4577', origin: 'http://localhost:4577' });

    assert.equal(response.ok, true);
    assert.deepEqual(harness.calls, ['disconnect']);
});

test('Cloudflare status remains available to local non-browser clients without Origin', async () => {
    const harness = createHarness();

    const { handled, response } = await harness.call({
        method: 'GET',
        pathname: '/api/v1/site-hosting/cloudflare/status',
        origin: '',
        contentType: ''
    });

    assert.equal(handled, true);
    assert.equal(response.ok, true);
    assert.deepEqual(harness.calls, ['getStatus']);
});
