'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { ensureDevelopmentSiteDomain } = require('./deploy-development-site');

function makeAdapter(owner = '') {
    const calls = [];
    let currentOwner = owner;
    return {
        calls,
        getOwner: () => currentOwner,
        adapter: {
            listWorkerScripts: async () => [{ id: 'www-bloggenius-kr-dev' }],
            listWorkerDomains: async () => currentOwner
                ? [{ hostname: 'www-dev.bloggenius.kr', service: currentOwner }]
                : [],
            attachWorkerDomain: async (args) => {
                calls.push(args);
                currentOwner = args.workerName;
            }
        }
    };
}

test('Development deployment attaches its hostname when it is unbound', async () => {
    const state = makeAdapter();
    const result = await ensureDevelopmentSiteDomain(state.adapter, 'account-1');
    assert.deepEqual(result, {
        hostname: 'www-dev.bloggenius.kr',
        workerName: 'www-bloggenius-kr-dev',
        changed: true
    });
    assert.equal(state.getOwner(), 'www-bloggenius-kr-dev');
    assert.deepEqual(state.calls, [{
        accountId: 'account-1',
        hostname: 'www-dev.bloggenius.kr',
        workerName: 'www-bloggenius-kr-dev'
    }]);
});

test('Development deployment keeps an existing target binding and rejects other owners', async () => {
    const alreadyBound = makeAdapter('www-bloggenius-kr-dev');
    const result = await ensureDevelopmentSiteDomain(alreadyBound.adapter, 'account-1');
    assert.equal(result.changed, false);
    assert.deepEqual(alreadyBound.calls, []);

    const unexpectedOwner = makeAdapter('legacy-site-worker');
    await assert.rejects(
        () => ensureDevelopmentSiteDomain(unexpectedOwner.adapter, 'account-1'),
        /unexpected Worker legacy-site-worker/
    );
    assert.deepEqual(unexpectedOwner.calls, []);
});
