'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { ensureWorkerDomain } = require('./ensure-worker-domain');

function makeAdapter({ owner = 'legacy-worker', workerExists = true } = {}) {
    const calls = [];
    let currentOwner = owner;
    const adapter = {
        listWorkerScripts: async () => workerExists ? [{ id: 'new-worker' }] : [],
        listWorkerDomains: async () => currentOwner ? [{ hostname: 'www.example.com', service: currentOwner, zone_id: 'zone-1' }] : [],
        attachWorkerDomain: async (args) => { calls.push(args); currentOwner = args.workerName; }
    };
    return { adapter, calls, getOwner: () => currentOwner };
}

test('changes only an explicitly allowed legacy Worker binding and verifies it', async () => {
    const state = makeAdapter();
    const result = await ensureWorkerDomain(state.adapter, {
        accountId: 'account-1', hostname: 'www.example.com', workerName: 'new-worker', allowedCurrentOwners: ['legacy-worker']
    });
    assert.deepEqual(result, { hostname: 'www.example.com', workerName: 'new-worker', changed: true, previousWorkerName: 'legacy-worker' });
    assert.equal(state.getOwner(), 'new-worker');
    assert.deepEqual(state.calls, [{ accountId: 'account-1', hostname: 'www.example.com', workerName: 'new-worker', zoneId: 'zone-1' }]);
});

test('is idempotent when the domain already belongs to the target Worker', async () => {
    const state = makeAdapter({ owner: 'new-worker' });
    const result = await ensureWorkerDomain(state.adapter, {
        accountId: 'account-1', hostname: 'www.example.com', workerName: 'new-worker'
    });
    assert.deepEqual(result, { hostname: 'www.example.com', workerName: 'new-worker', changed: false });
    assert.deepEqual(state.calls, []);
});

test('creates an explicitly allowed unbound domain and verifies the new Worker binding', async () => {
    const state = makeAdapter({ owner: '' });
    const result = await ensureWorkerDomain(state.adapter, {
        accountId: 'account-1', hostname: 'www.example.com', workerName: 'new-worker', allowUnbound: true
    });
    assert.deepEqual(result, { hostname: 'www.example.com', workerName: 'new-worker', changed: true });
    assert.equal(state.getOwner(), 'new-worker');
    assert.deepEqual(state.calls, [{ accountId: 'account-1', hostname: 'www.example.com', workerName: 'new-worker' }]);
});

test('refuses missing target Workers, unknown owners, duplicate bindings, and missing host bindings', async () => {
    const input = { accountId: 'account-1', hostname: 'www.example.com', workerName: 'new-worker', allowedCurrentOwners: ['legacy-worker'] };
    await assert.rejects(() => ensureWorkerDomain(makeAdapter({ workerExists: false }).adapter, input), /must exist exactly once/);
    await assert.rejects(() => ensureWorkerDomain(makeAdapter({ owner: 'unexpected-worker' }).adapter, input), /unexpected Worker/);
    const duplicates = makeAdapter().adapter;
    duplicates.listWorkerDomains = async () => [
        { hostname: 'www.example.com', service: 'legacy-worker' },
        { hostname: 'www.example.com', service: 'legacy-worker' }
    ];
    await assert.rejects(() => ensureWorkerDomain(duplicates, input), /Multiple Worker domain bindings/);
    await assert.rejects(() => ensureWorkerDomain(makeAdapter({ owner: '' }).adapter, input), /no existing Worker binding/);
});
