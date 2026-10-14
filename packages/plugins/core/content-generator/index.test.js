'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createContentGeneratorPlugin } = require('./index');

test('content generator declares a versioned provider-neutral operation', () => {
    const plugin = createContentGeneratorPlugin({ generateText: async () => 'generated' });

    assert.equal(plugin.id, 'content-generator');
    assert.equal(plugin.version, '0.1.0');
    assert.deepEqual(Object.keys(plugin.operations), ['text.generate']);
    assert.equal(plugin.operations['text.generate'].input.parse({ prompt: '  write this  ' }).prompt, 'write this');
    assert.deepEqual(plugin.operations['text.generate'].output.parse({ text: '  result  ' }), { text: 'result' });
});

test('content generator requires an injected provider function', () => {
    assert.throws(() => createContentGeneratorPlugin(), /requires an injected generateText/i);
    assert.throws(() => createContentGeneratorPlugin({ generateText: true }), /requires an injected generateText/i);
});

test('content generator validates operation input and output', async () => {
    const plugin = createContentGeneratorPlugin({ generateText: async () => '   ' });
    const operation = plugin.operations['text.generate'];

    assert.throws(() => operation.input.parse(null), /must be an object/i);
    assert.throws(() => operation.input.parse({ prompt: '  ' }), /non-empty string/i);
    await assert.rejects(async () => operation.output.parse({ text: '   ' }), /Generated text must be a non-empty string/i);
});

test('content generator forwards only prompt and cancellation signal to the provider boundary', async () => {
    const controller = new AbortController();
    let request;
    const plugin = createContentGeneratorPlugin({
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
    const plugin = createContentGeneratorPlugin({
        async generateText() {
            calls += 1;
            throw failure;
        }
    });

    await assert.rejects(
        plugin.operations['text.generate'].execute({ prompt: 'draft' }),
        (error) => error === failure
    );
    assert.equal(calls, 1);
});
