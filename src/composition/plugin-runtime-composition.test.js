'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createCorePluginRegistry } = require('./core-plugin-registry');
const { PluginRuntimeCompositionError, composePlugins } = require('./plugin-runtime-composition');

function plugin(id) {
    return { id, name: id, version: '1.0.0', operations: { run: {} } };
}

test('runtime composition creates only the selected Plugins in requested order', () => {
    const created = [];
    const catalog = createCorePluginRegistry([
        { id: 'publisher', create: () => { created.push('publisher'); return plugin('publisher'); } },
        { id: 'generator', create: () => { created.push('generator'); return plugin('generator'); } }
    ]);

    const selected = composePlugins({
        catalog,
        pluginIds: ['generator', 'publisher'],
        dependenciesByPluginId: { generator: { model: 'fake' }, publisher: {} }
    });

    assert.deepEqual(created, ['generator', 'publisher']);
    assert.deepEqual(selected.map(({ id }) => id), ['generator', 'publisher']);
    assert.equal(Object.isFrozen(selected), true);
    assert.deepEqual(catalog.list(), ['publisher', 'generator']);
});

test('runtime composition rejects invalid selections and dependency mappings before factory calls', () => {
    let factoryCalls = 0;
    const catalog = createCorePluginRegistry([{ id: 'sample-plugin', create: () => { factoryCalls += 1; return plugin('sample-plugin'); } }]);

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
