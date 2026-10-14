'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createCorePluginRuntime } = require('./core-plugin-runtime');
const { createCorePluginRegistry } = require('./core-plugin-registry');

function plugin(id, name = id) {
    return {
        id,
        name,
        version: '1.2.3',
        operations: {
            run: {
                description: 'Run the test operation.',
                input: { parse: (value) => value },
                output: { parse: (value) => value },
                async execute(input) { return { value: input.value }; }
            }
        }
    };
}

test('shared Core Plugin runtime joins bundled metadata with live Host state without exposing dependencies', async () => {
    const registry = createCorePluginRegistry([{
        id: 'writer',
        metadata: {
            id: 'writer', name: 'Writer', version: '1.2.3', summary: 'Creates text.',
            operations: [{ id: 'run', description: 'Run the test operation.' }]
        },
        create: (dependencies) => {
            assert.equal(dependencies.secret, 'private-value');
            return plugin('writer', 'Writer');
        }
    }]);
    const runtime = createCorePluginRuntime({ registry });

    assert.deepEqual(runtime.listPlugins(), [{
        id: 'writer', name: 'Writer', version: '1.2.3', summary: 'Creates text.',
        operations: [{ id: 'run', description: 'Run the test operation.' }],
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
        registry: createCorePluginRegistry([{ id: 'writer', create() { created += 1; return plugin('writer'); } }])
    });

    runtime.ensurePlugins(['writer']);
    runtime.ensurePlugins(['writer']);
    assert.equal(created, 1);
    assert.throws(() => runtime.ensurePlugins(['missing']), { code: 'PLUGIN_NOT_IN_CATALOG' });
    assert.throws(() => runtime.ensurePlugins(['writer', 'writer']), { code: 'PLUGIN_DUPLICATE_SELECTION' });
});
