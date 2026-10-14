'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createCapabilityRegistry } = require('./index');

test('capability registry uses the shared Core Plugin catalog while preserving Core capabilities', async () => {
    const registry = createCapabilityRegistry({
        CONFIG: { knowledge: { providers: [], routing: {} } },
        Logger: { info() {}, warn() {} }
    });

    assert.deepEqual(registry.listPlugins(), []);
    assert.equal(registry.has('agent.meta.get_current_time'), true);
    await assert.rejects(registry.setPluginEnabled('wordpress-publisher', false), /not registered/);
});
