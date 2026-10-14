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

test('bundled registry lists and creates the declared Core Plugin set in order', () => {
    const registry = createCorePluginRegistry([
        { id: 'first-plugin', create: () => plugin('first-plugin') },
        { id: 'second-plugin', create: () => plugin('second-plugin') }
    ]);

    assert.deepEqual(registry.list(), ['first-plugin', 'second-plugin']);
    assert.deepEqual(registry.createPlugins().map((item) => item.id), registry.list());
    assert.equal(Object.isFrozen(registry.createPlugins()), true);
    assert.deepEqual(CORE_PLUGIN_REGISTRATIONS.map((item) => item.id), ['wordpress-publisher']);
});

test('registry rejects malformed and duplicate registrations', () => {
    assert.throws(() => createCorePluginRegistry([null]), CorePluginRegistryError);
    assert.throws(() => createCorePluginRegistry([{ id: 'Bad_Id', create() {} }]), /invalid id/i);
    assert.throws(() => createCorePluginRegistry([{ id: 'missing-factory' }]), /create\(\)/i);
    assert.throws(() => createCorePluginRegistry([
        { id: 'duplicate-plugin', create: () => plugin('duplicate-plugin') },
        { id: 'duplicate-plugin', create: () => plugin('duplicate-plugin') }
    ]), (error) => error.code === 'CORE_PLUGIN_DUPLICATE');
});

test('registry rejects missing, mismatched, and unregistered factory results', () => {
    assert.throws(() => createCorePluginRegistry([
        { id: 'missing-plugin', create: () => undefined }
    ]).createPlugins(), (error) => error.code === 'CORE_PLUGIN_INSTANCE_MISSING');

    assert.throws(() => createCorePluginRegistry([
        { id: 'expected-plugin', create: () => plugin('different-plugin') }
    ]).createPlugins(), (error) => error.code === 'CORE_PLUGIN_ID_MISMATCH');

    assert.throws(() => createCorePluginRegistry([]).createPlugins({ 'unknown-plugin': {} }), (error) => (
        error.code === 'CORE_PLUGIN_NOT_REGISTERED'
    ));
});

test('registry validates dependency input before creating plugin instances', () => {
    let created = false;
    const registry = createCorePluginRegistry([{ id: 'sample-plugin', create: () => { created = true; return plugin(); } }]);
    assert.throws(() => registry.createPlugins([]), /dependencies must be an object/i);
    assert.equal(created, false);
});
