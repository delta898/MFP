'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createCorePluginHost } = require('./core-host');

function capability(id) {
    return { id, validate() {}, preview() {}, execute() {} };
}

function plugin(id, contributions = {}) {
    return {
        id,
        name: `${id} plugin`,
        version: '1.0.0',
        kind: 'core',
        contribute() {
            return contributions;
        }
    };
}

test('Core Plugin capabilities are registered and enabled by default', () => {
    const host = createCorePluginHost({
        coreCapabilities: [capability('agent.status')],
        plugins: [plugin('wordpress-publisher', { capabilities: [capability('wordpress.publish')] })]
    });

    assert.deepEqual(host.listPlugins(), [{
        id: 'wordpress-publisher',
        name: 'wordpress-publisher plugin',
        version: '1.0.0',
        kind: 'core',
        enabled: true,
        state: 'enabled'
    }]);
    assert.deepEqual(host.listCapabilities().map((item) => item.id), ['agent.status', 'wordpress.publish']);
    assert.equal(host.hasCapability('wordpress.publish'), true);
});

test('disabling a Core Plugin removes its capabilities from lookup and listing', async () => {
    const host = createCorePluginHost({
        coreCapabilities: [capability('agent.status')],
        plugins: [plugin('wordpress-publisher', { capabilities: [capability('wordpress.publish')] })]
    });

    assert.deepEqual(await host.setPluginEnabled('wordpress-publisher', false), {
        id: 'wordpress-publisher',
        enabled: false,
        state: 'disabled'
    });
    assert.deepEqual(host.listCapabilities().map((item) => item.id), ['agent.status']);
    assert.equal(host.getCapability('wordpress.publish'), null);
    assert.equal(host.hasCapability('agent.status'), true);

    await host.setPluginEnabled('wordpress-publisher', true);
    assert.equal(host.hasCapability('wordpress.publish'), true);
});

test('Core Plugin registration rejects duplicate plugin and capability ids', () => {
    assert.throws(() => createCorePluginHost({
        plugins: [plugin('wordpress-publisher'), plugin('wordpress-publisher')]
    }), /Duplicate Core Plugin id/);

    assert.throws(() => createCorePluginHost({
        coreCapabilities: [capability('wordpress.publish')],
        plugins: [plugin('wordpress-publisher', { capabilities: [capability('wordpress.publish')] })]
    }), /Duplicate capability wordpress.publish/);
});

test('host registers bundled Core Plugins only and requires a complete descriptor', () => {
    assert.throws(() => createCorePluginHost({
        plugins: [{ ...plugin('community-test'), kind: 'community' }]
    }), /Only bundled Core Plugins/);
    assert.throws(() => createCorePluginHost({
        plugins: [{ ...plugin('missing-kind'), kind: undefined }]
    }), /Only bundled Core Plugins/);
    assert.throws(() => createCorePluginHost({
        plugins: [{ id: 'wordpress-publisher', kind: 'core', contribute() {} }]
    }), /must provide a name/);
    assert.throws(() => createCorePluginHost({
        plugins: [{ ...plugin('invalid-default'), enabledByDefault: 'false' }]
    }), /enabledByDefault must be a boolean/);
});

test('unknown Core Plugin cannot be toggled', async () => {
    const host = createCorePluginHost();
    await assert.rejects(host.setPluginEnabled('missing', false), /not registered/);
});

test('Core Plugin enablement requires an explicit boolean', async () => {
    const host = createCorePluginHost({ plugins: [plugin('wordpress-publisher')] });
    await assert.rejects(host.setPluginEnabled('wordpress-publisher', 'false'), /must be a boolean/);
    assert.equal(host.listPlugins()[0].enabled, true);
});

test('plugin contribution receives only its explicit host context, never registry dependencies', () => {
    const context = { wordpress: { publish: async () => ({ ok: true }) } };
    let received;
    createCorePluginHost({
        deps: { secret: 'must not be forwarded' },
        contexts: { 'wordpress-publisher': context },
        plugins: [{
            ...plugin('wordpress-publisher'),
            contribute(input) {
                received = input;
                return {};
            }
        }]
    });

    assert.deepEqual(Object.keys(received), ['context']);
    assert.deepEqual(received.context, context);
    assert.equal(Object.isFrozen(received.context), true);
});

test('disabling a Core Plugin blocks new actions and waits for an active execution to finish', async () => {
    let finishExecution;
    const activeExecution = new Promise((resolve) => { finishExecution = resolve; });
    const host = createCorePluginHost({
        plugins: [plugin('wordpress-publisher', {
            capabilities: [{
                ...capability('wordpress.publish'),
                async execute() {
                    await activeExecution;
                    return { ok: true };
                }
            }]
        })]
    });
    const capabilityReference = host.getCapability('wordpress.publish');
    const execution = capabilityReference.execute({});
    const disabling = host.setPluginEnabled('wordpress-publisher', false);

    assert.equal(host.hasCapability('wordpress.publish'), false);
    assert.equal(host.listPlugins()[0].state, 'disabling');
    await assert.rejects(capabilityReference.execute({}), /not enabled/);

    let disableCompleted = false;
    disabling.then(() => { disableCompleted = true; });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(disableCompleted, false);

    finishExecution();
    assert.deepEqual(await execution, { ok: true });
    assert.deepEqual(await disabling, {
        id: 'wordpress-publisher',
        enabled: false,
        state: 'disabled'
    });
});
