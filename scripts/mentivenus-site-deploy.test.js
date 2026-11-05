'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { TARGETS, getTarget, ensureSiteDomain } = require('./deploy-mentivenus-site');

const githubEnv = (environment, event = 'push', ref = environment === 'development' ? 'refs/heads/dev' : 'refs/heads/release/v0.7.2') => ({
    GITHUB_ACTIONS: 'true',
    GITHUB_EVENT_NAME: event,
    GITHUB_REF: ref,
    MENTIVENUS_ENV: environment
});

test('MentiVenus deployment is paired to dev and release refs', () => {
    assert.deepEqual(getTarget('development', githubEnv('development')), TARGETS.development);
    assert.deepEqual(getTarget('production', githubEnv('production')), TARGETS.production);
    assert.throws(() => getTarget('development', githubEnv('development', 'push', 'refs/heads/main')), /matching GitHub/);
    assert.throws(() => getTarget('production', githubEnv('production', 'push', 'refs/heads/dev')), /matching GitHub/);
});

test('MentiVenus deployment attaches an unbound hostname and preserves an existing target binding', async () => {
    let owner = '';
    const calls = [];
    const adapter = {
        listWorkerScripts: async () => [{ id: TARGETS.development.workerName }],
        listWorkerDomains: async () => owner ? [{ hostname: TARGETS.development.hostname, service: owner }] : [],
        attachWorkerDomain: async (args) => { calls.push(args); owner = args.workerName; }
    };

    const attached = await ensureSiteDomain(adapter, 'account-id', TARGETS.development);
    assert.equal(attached.changed, true);
    assert.equal(owner, TARGETS.development.workerName);
    const preserved = await ensureSiteDomain(adapter, 'account-id', TARGETS.development);
    assert.equal(preserved.changed, false);
    assert.equal(calls.length, 1);
});

test('MentiVenus deployment refuses to take a hostname from another Worker', async () => {
    const adapter = {
        listWorkerScripts: async () => [{ id: TARGETS.production.workerName }],
        listWorkerDomains: async () => [{ hostname: TARGETS.production.hostname, service: 'existing-production-site' }],
        attachWorkerDomain: async () => assert.fail('unexpected owner must not be replaced')
    };
    await assert.rejects(() => ensureSiteDomain(adapter, 'account-id', TARGETS.production), /unexpected Worker existing-production-site/);
});
