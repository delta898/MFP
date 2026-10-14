'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createPlugin, PACKAGE_VERSION } = require('./index');
const PLUGIN_MANIFEST = require('./package.json').bloggeniusPlugin;
const { createPluginHost } = require('../../../../src/platform/plugin-host');

function createHost(generateText) {
    const implementation = createPlugin({ generateText });
    return createPluginHost({ plugins: [{
        manifest: PLUGIN_MANIFEST,
        version: PACKAGE_VERSION,
        operations: implementation.operations
    }] });
}

test('content generator declares a versioned provider-neutral manifest operation', () => {
    const plugin = createPlugin({ generateText: async () => 'generated' });

    assert.equal(PLUGIN_MANIFEST.id, 'content-generator');
    assert.equal(PACKAGE_VERSION, '0.1.0');
    assert.deepEqual(Object.keys(plugin.operations), ['text.generate']);
    assert.deepEqual(PLUGIN_MANIFEST.operations['text.generate'].capabilities, ['ai.transport']);
});

test('content generator requires an injected provider function', () => {
    assert.throws(() => createPlugin(), /requires an injected generateText/i);
    assert.throws(() => createPlugin({ generateText: true }), /requires an injected generateText/i);
});

test('Host schema validates inputs and Plugin normalizes generated text', async () => {
    let request;
    const host = createHost(async (input) => {
        request = input;
        return '  generated draft  ';
    });

    assert.deepEqual(await host.execute('content-generator', 'text.generate', { prompt: '  write this  ' }), {
        text: 'generated draft'
    });
    assert.deepEqual(request, { prompt: 'write this', signal: undefined });
    await assert.rejects(host.execute('content-generator', 'text.generate', {}), {
        code: 'PLUGIN_OPERATION_CONTRACT_VIOLATION'
    });
    await assert.rejects(host.execute('content-generator', 'text.generate', { prompt: '  ' }), {
        code: 'PLUGIN_OPERATION_CONTRACT_VIOLATION'
    });
});

test('content generator forwards only prompt and cancellation signal to its provider boundary', async () => {
    const controller = new AbortController();
    let request;
    const plugin = createPlugin({
        async generateText(input) {
            request = input;
            return 'Generated draft';
        }
    });

    const result = await plugin.operations['text.generate'].execute(
        { prompt: 'Write a short draft' },
        { signal: controller.signal, unrelated: 'ignored' }
    );

    assert.deepEqual(request, { prompt: 'Write a short draft', signal: controller.signal });
    assert.deepEqual(result, { text: 'Generated draft' });
});

test('content generator preserves provider errors without logging or retrying', async () => {
    const failure = new Error('provider failed');
    let calls = 0;
    const host = createHost(async () => {
        calls += 1;
        throw failure;
    });

    await assert.rejects(host.execute('content-generator', 'text.generate', { prompt: 'draft' }), (error) => error === failure);
    assert.equal(calls, 1);
});
