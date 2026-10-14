'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createCorePluginRegistry } = require('./core-plugin-registry');
const { PluginRuntimeCompositionError, composePlugins } = require('./plugin-runtime-composition');

function manifest(id) {
    return {
        manifestVersion: 1,
        id,
        name: id,
        hostApi: '^1.0.0',
        summary: `${id} test plugin`,
        operations: {
            run: {
                description: 'Run the test operation.',
                inputSchema: { type: 'object' },
                outputSchema: { type: 'object' },
                capabilities: []
            }
        }
    };
}

function plugin() {
    return { operations: { run: { execute: async (input) => input } } };
}

function registration(id, create) {
    return { manifest: manifest(id), version: '1.0.0', create };
}

test('runtime composition creates only the selected Plugins in requested order', () => {
    const created = [];
    const catalog = createCorePluginRegistry([
        registration('publisher', () => { created.push('publisher'); return plugin(); }),
        registration('generator', () => { created.push('generator'); return plugin(); })
    ]);

    const selected = composePlugins({
        catalog,
        pluginIds: ['generator', 'publisher'],
        dependenciesByPluginId: { generator: { model: 'fake' }, publisher: {} }
    });

    assert.deepEqual(created, ['generator', 'publisher']);
    assert.deepEqual(selected.map(({ manifest: pluginManifest }) => pluginManifest.id), ['generator', 'publisher']);
    assert.equal(Object.isFrozen(selected), true);
    assert.deepEqual(catalog.list(), ['publisher', 'generator']);
});

test('runtime composition rejects invalid selections and dependency mappings before factory calls', () => {
    let factoryCalls = 0;
    const catalog = createCorePluginRegistry([registration('sample-plugin', () => { factoryCalls += 1; return plugin(); })]);

    assert.throws(() => composePlugins({ catalog }), /Plugin ids/i);
    assert.throws(() => composePlugins({ catalog, pluginIds: ['sample-plugin', 'sample-plugin'] }), (error) => (
        error instanceof PluginRuntimeCompositionError && error.code === 'PLUGIN_DUPLICATE_SELECTION'
    ));
    assert.throws(() => composePlugins({ catalog, pluginIds: ['unknown-plugin'] }), (error) => (
        error instanceof PluginRuntimeCompositionError && error.code === 'PLUGIN_NOT_IN_CATALOG'
    ));
    assert.throws(() => composePlugins({ catalog, pluginIds: ['sample-plugin'], dependenciesByPluginId: [] }), /dependencies.*object/i);
    assert.throws(() => composePlugins({
        catalog,
        pluginIds: [],
        dependenciesByPluginId: { 'sample-plugin': {} }
    }), (error) => error.code === 'PLUGIN_NOT_SELECTED');
    assert.equal(factoryCalls, 0);
});
