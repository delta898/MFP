'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createCorePluginRuntime } = require('../../../../src/composition/core-plugin-runtime');

test('Hello World is discovered from its manifest, registered, and invoked through the Plugin Host', async () => {
    const runtime = createCorePluginRuntime();
    const discovered = runtime.getPlugin('hello-world');

    assert.equal(discovered.state, 'not_loaded');
    assert.deepEqual(discovered.operations.map(({ id }) => id), ['hello.say']);
    assert.deepEqual(discovered.operations[0].capabilities, []);

    const { executeOperation } = runtime.ensurePlugins(['hello-world']);
    assert.deepEqual(await executeOperation('hello-world', 'hello.say', { name: 'Ada' }), {
        message: 'Hello, Ada!'
    });
    assert.equal(runtime.getPlugin('hello-world').state, 'enabled');
});

test('Hello World manifest rejects malformed operation inputs before execution', async () => {
    const runtime = createCorePluginRuntime();
    const { executeOperation } = runtime.ensurePlugins(['hello-world']);

    await assert.rejects(executeOperation('hello-world', 'hello.say', { name: '   ' }), {
        code: 'PLUGIN_OPERATION_CONTRACT_VIOLATION'
    });
});
