'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createPluginHost } = require('../platform/plugin-host');
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
    const plugins = registry.createPlugins({ pluginIds: registry.list() });
    assert.deepEqual(plugins.map((item) => item.id), registry.list());
    assert.equal(Object.isFrozen(plugins), true);
    assert.deepEqual(CORE_PLUGIN_REGISTRATIONS.map((item) => item.id), ['wordpress-publisher', 'content-generator']);
});

test('composition can register only the selected Core Plugins and their dependencies', () => {
    let generationFactoryCalled = false;
    const registry = createCorePluginRegistry([
        { id: 'publisher', create: () => plugin('publisher') },
        { id: 'generator', create: ({ generateText }) => {
            generationFactoryCalled = true;
            assert.equal(typeof generateText, 'function');
            return plugin('generator');
        } }
    ]);

    const selected = registry.createPlugins({
        pluginIds: ['publisher'],
        dependenciesByPluginId: { publisher: {} }
    });

    assert.deepEqual(registry.list(), ['publisher', 'generator']);
    assert.deepEqual(selected.map((item) => item.id), ['publisher']);
    assert.equal(generationFactoryCalled, false);
});

test('content generation operation is discoverable and executable through the Kernel Host', async () => {
    const registry = createCorePluginRegistry();
    const plugins = registry.createPlugins({
        pluginIds: ['content-generator'],
        dependenciesByPluginId: {
            'content-generator': {
                async generateText({ prompt }) { return `Generated: ${prompt}`; }
            }
        }
    });
    const pluginHost = createPluginHost({ plugins });

    assert.deepEqual(registry.list(), ['wordpress-publisher', 'content-generator']);
    assert.deepEqual(pluginHost.listPlugins().map(({ id, state }) => ({ id, state })), [
        { id: 'content-generator', state: 'enabled' }
    ]);
    assert.deepEqual(pluginHost.listOperations().map(({ pluginId, operationId }) => ({ pluginId, operationId })), [
        { pluginId: 'content-generator', operationId: 'text.generate' }
    ]);
    assert.deepEqual(await pluginHost.execute('content-generator', 'text.generate', { prompt: 'a topic' }), {
        text: 'Generated: a topic'
    });

    await pluginHost.setEnabled('content-generator', false);
    assert.deepEqual(pluginHost.listOperations(), []);
    await assert.rejects(pluginHost.execute('content-generator', 'text.generate', { prompt: 'a topic' }), {
        code: 'PLUGIN_DISABLED'
    });
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
    ]).createPlugins({ pluginIds: ['missing-plugin'] }), (error) => error.code === 'CORE_PLUGIN_INSTANCE_MISSING');

    assert.throws(() => createCorePluginRegistry([
        { id: 'expected-plugin', create: () => plugin('different-plugin') }
    ]).createPlugins({ pluginIds: ['expected-plugin'] }), (error) => error.code === 'CORE_PLUGIN_ID_MISMATCH');

    assert.throws(() => createCorePluginRegistry([]).createPlugins({
        pluginIds: [],
        dependenciesByPluginId: { 'unknown-plugin': {} }
    }), (error) => (
        error.code === 'CORE_PLUGIN_NOT_REGISTERED'
    ));
});

test('registry validates dependency input before creating plugin instances', () => {
    let created = false;
    const registry = createCorePluginRegistry([{ id: 'sample-plugin', create: () => { created = true; return plugin(); } }]);
    assert.throws(() => registry.createPlugins(), /selected Core Plugin ids must be an array/i);
    assert.throws(() => registry.createPlugins({ pluginIds: ['sample-plugin'], dependenciesByPluginId: [] }), /dependencies must be an object/i);
    assert.equal(created, false);
});

test('registry rejects duplicate or unknown selected plugins and dependencies for unselected plugins', () => {
    const registry = createCorePluginRegistry([{ id: 'sample-plugin', create: () => plugin() }]);

    assert.throws(() => registry.createPlugins({ pluginIds: ['sample-plugin', 'sample-plugin'] }), (error) => (
        error.code === 'CORE_PLUGIN_DUPLICATE_SELECTION'
    ));
    assert.throws(() => registry.createPlugins({ pluginIds: ['unknown-plugin'] }), (error) => (
        error.code === 'CORE_PLUGIN_NOT_REGISTERED'
    ));
    assert.throws(() => registry.createPlugins({
        pluginIds: [],
        dependenciesByPluginId: { 'sample-plugin': {} }
    }), (error) => error.code === 'CORE_PLUGIN_NOT_SELECTED');
});
