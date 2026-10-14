'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    CORE_PLUGIN_REGISTRATIONS,
    CorePluginRegistryError,
    createCorePluginRegistry
} = require('./core-plugin-registry');

function plugin(id = 'sample-plugin') {
    return { id, name: id, version: '1.0.0', operations: { run: {} } };
}

test('Core Plugin registry lists bundled factories and creates a requested Plugin by ID', () => {
    const receivedDependencies = { endpoint: 'https://example.test' };
    let actualDependencies;
    const registry = createCorePluginRegistry([
        { id: 'first-plugin', create: () => plugin('first-plugin') },
        { id: 'second-plugin', create: (dependencies) => { actualDependencies = dependencies; return plugin('second-plugin'); } }
    ]);

    assert.deepEqual(registry.list(), ['first-plugin', 'second-plugin']);
    assert.equal(registry.has('second-plugin'), true);
    assert.equal(registry.has('missing-plugin'), false);
    assert.deepEqual(registry.createPlugin('second-plugin', receivedDependencies), plugin('second-plugin'));
    assert.equal(actualDependencies, receivedDependencies);
    assert.deepEqual(CORE_PLUGIN_REGISTRATIONS.map((item) => item.id), ['wordpress-publisher', 'content-generator']);
});

test('Core Plugin registry validates registrations and factory results', () => {
    assert.throws(() => createCorePluginRegistry([null]), CorePluginRegistryError);
    assert.throws(() => createCorePluginRegistry([{ id: 'Bad_Id', create() {} }]), /invalid id/i);
    assert.throws(() => createCorePluginRegistry([{ id: 'missing-factory' }]), /create\(\)/i);
    assert.throws(() => createCorePluginRegistry([
        { id: 'duplicate-plugin', create: () => plugin('duplicate-plugin') },
        { id: 'duplicate-plugin', create: () => plugin('duplicate-plugin') }
    ]), (error) => error.code === 'CORE_PLUGIN_DUPLICATE');
    assert.throws(() => createCorePluginRegistry([
        { id: 'missing-plugin', create: () => undefined }
    ]).createPlugin('missing-plugin'), (error) => error.code === 'CORE_PLUGIN_INSTANCE_MISSING');
    assert.throws(() => createCorePluginRegistry([
        { id: 'expected-plugin', create: () => plugin('different-plugin') }
    ]).createPlugin('expected-plugin'), (error) => error.code === 'CORE_PLUGIN_ID_MISMATCH');
});

test('Core Plugin registry rejects unknown IDs and malformed dependencies', () => {
    const registry = createCorePluginRegistry([{ id: 'sample-plugin', create: () => plugin() }]);
    assert.throws(() => registry.createPlugin('unknown-plugin'), (error) => error.code === 'CORE_PLUGIN_NOT_REGISTERED');
    assert.throws(() => registry.createPlugin('sample-plugin', []), /dependencies.*object/i);
});
