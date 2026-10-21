'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    CORE_PLUGIN_REGISTRATIONS,
    CorePluginRegistryError,
    createCorePluginRegistry
} = require('./core-plugin-registry');

function manifest(id = 'sample-plugin') {
    return {
        manifestVersion: 1,
        id,
        name: id,
        hostApi: '^1.0.0',
        summary: `${id} plugin`,
        operations: {
            run: {
                description: 'Run the sample operation.',
                inputSchema: { type: 'object' },
                outputSchema: { type: 'object' },
                capabilities: []
            }
        }
    };
}

function plugin(id = 'sample-plugin') {
    return { operations: { run: { async execute(input) { return input; } } } };
}

test('Core Plugin registry lists bundled factories and creates a requested Plugin by ID', () => {
    const receivedDependencies = { endpoint: 'https://example.test' };
    let actualDependencies;
    const registry = createCorePluginRegistry([
        { manifest: manifest('first-plugin'), version: '1.0.0', create: () => plugin('first-plugin') },
        { manifest: manifest('second-plugin'), version: '1.0.0', create: (dependencies) => { actualDependencies = dependencies; return plugin('second-plugin'); } }
    ]);

    assert.deepEqual(registry.list(), ['first-plugin', 'second-plugin']);
    assert.equal(registry.has('second-plugin'), true);
    assert.equal(registry.has('missing-plugin'), false);
    const createdPlugin = registry.createPlugin('second-plugin', receivedDependencies);
    assert.deepEqual(createdPlugin.manifest, manifest('second-plugin'));
    assert.equal(createdPlugin.version, '1.0.0');
    assert.deepEqual(Object.keys(createdPlugin.operations), ['run']);
    assert.equal(actualDependencies, receivedDependencies);
    assert.deepEqual(CORE_PLUGIN_REGISTRATIONS.map((item) => item.id), [
        'naver-publisher',
        'wordpress-publisher',
        'social-publisher',
        'ai-gateway',
        'astro-site-hosting'
    ]);
});

test('Core Plugin registry validates registrations and factory results', () => {
    assert.throws(() => createCorePluginRegistry([null]), CorePluginRegistryError);
    assert.throws(() => createCorePluginRegistry([{ manifest: manifest('Bad_Id'), version: '1.0.0', create() {} }]), /invalid manifest/i);
    assert.throws(() => createCorePluginRegistry([{ manifest: manifest('missing-factory') }]), /create\(\)/i);
    assert.throws(() => createCorePluginRegistry([
        { manifest: manifest('duplicate-plugin'), version: '1.0.0', create: () => plugin('duplicate-plugin') },
        { manifest: manifest('duplicate-plugin'), version: '1.0.0', create: () => plugin('duplicate-plugin') }
    ]), (error) => error.code === 'CORE_PLUGIN_DUPLICATE');
    assert.throws(() => createCorePluginRegistry([
        { manifest: manifest('missing-plugin'), version: '1.0.0', create: () => undefined }
    ]).createPlugin('missing-plugin'), (error) => error.code === 'CORE_PLUGIN_INSTANCE_MISSING');
    assert.throws(() => createCorePluginRegistry([
        { manifest: manifest('expected-plugin'), version: '1.0.0', create: () => ({ operations: {} }) }
    ]).createPlugin('expected-plugin'), (error) => error.code === 'CORE_PLUGIN_OPERATION_MISMATCH');
});

test('Core Plugin registry rejects unknown IDs and malformed dependencies', () => {
    const registry = createCorePluginRegistry([{ manifest: manifest(), version: '1.0.0', create: () => plugin() }]);
    assert.throws(() => registry.createPlugin('unknown-plugin'), (error) => error.code === 'CORE_PLUGIN_NOT_REGISTERED');
    assert.throws(() => registry.createPlugin('sample-plugin', []), /dependencies.*object/i);
});
