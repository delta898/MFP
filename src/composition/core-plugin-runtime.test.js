'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createCorePluginRuntime } = require('./core-plugin-runtime');
const { createCorePluginRegistry } = require('./core-plugin-registry');

function plugin(id, name = id) {
    return {
        operations: {
            run: {
                async execute(input) { return { value: input.value }; }
            }
        }
    };
}

function manifest(id, name = id) {
    return {
        manifestVersion: 1,
        id,
        name,
        hostApi: '^1.0.0',
        summary: 'Creates text.',
        operations: {
            run: {
                description: 'Run the test operation.',
                inputSchema: { type: 'object', properties: { value: {} }, required: ['value'], additionalProperties: false },
                outputSchema: { type: 'object', properties: { value: {} }, required: ['value'], additionalProperties: false },
                capabilities: []
            }
        }
    };
}

test('shared Core Plugin runtime joins bundled metadata with live Host state without exposing dependencies', async () => {
    const registry = createCorePluginRegistry([{
        manifest: manifest('writer', 'Writer'),
        version: '1.2.3',
        create: (dependencies) => {
            assert.equal(dependencies.secret, 'private-value');
            return plugin('writer', 'Writer');
        }
    }]);
    const runtime = createCorePluginRuntime({ registry });

    const writerManifest = manifest('writer', 'Writer');
    assert.deepEqual(runtime.listPlugins(), [{
        manifestVersion: 1,
        id: 'writer', name: 'Writer', version: '1.2.3', summary: 'Creates text.',
        hostApi: '^1.0.0',
        operations: [{
            id: 'run', description: 'Run the test operation.',
            inputSchema: writerManifest.operations.run.inputSchema,
            outputSchema: writerManifest.operations.run.outputSchema,
            capabilities: []
        }],
        state: 'not_loaded', activeExecutions: 0
    }]);

    const { executeOperation } = runtime.ensurePlugins(['writer'], { writer: { secret: 'private-value' } });
    assert.deepEqual(await executeOperation('writer', 'run', { value: 'ok' }), { value: 'ok' });
    assert.equal(runtime.getPlugin('writer').state, 'enabled');
    assert.equal(JSON.stringify(runtime.listPlugins()).includes('private-value'), false);
});

test('shared Core Plugin runtime reuses an instance and rejects unknown or duplicate selections', () => {
    let created = 0;
    const runtime = createCorePluginRuntime({
        registry: createCorePluginRegistry([{
            manifest: manifest('writer'),
            version: '1.2.3',
            create() { created += 1; return plugin('writer'); }
        }])
    });

    runtime.ensurePlugins(['writer']);
    runtime.ensurePlugins(['writer']);
    assert.equal(created, 1);
    assert.throws(() => runtime.ensurePlugins(['missing']), { code: 'PLUGIN_NOT_IN_CATALOG' });
    assert.throws(() => runtime.ensurePlugins(['writer', 'writer']), { code: 'PLUGIN_DUPLICATE_SELECTION' });
});
