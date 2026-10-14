'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createAiGatewayAdapter } = require('./ai-gateway');

test('AI Gateway adapter maps neutral requests to Host operations and preserves cancellation context', async () => {
    const calls = [];
    const adapter = createAiGatewayAdapter({
        getSupport: () => ({ routes: [{ kind: 'text', provider: 'openai' }] }),
        async executeOperation(...args) { calls.push(args); return args[1] === 'text.generate' ? { content: 'ok' } : { images: [] }; }
    });
    const context = { signal: new AbortController().signal, reportProgress() {} };
    await adapter.generateText({ model: { provider: 'openai', modelId: 'text-v1' }, messages: [{ role: 'user', content: 'Hi' }] }, context);
    await adapter.generateImage({ model: { provider: 'google', modelId: 'image-v1' }, prompt: 'A tree', options: { aspectRatio: '4:3' } }, context);

    assert.equal(adapter.describeSupport().routes[0].provider, 'openai');
    assert.deepEqual(calls.map(([pluginId, operationId]) => [pluginId, operationId]), [
        ['ai-gateway', 'text.generate'], ['ai-gateway', 'image.generate']
    ]);
    assert.deepEqual(calls[0][2].messages[0], { role: 'user', content: 'Hi' });
    assert.deepEqual(calls[1][2], {
        model: { provider: 'google', modelId: 'image-v1' }, input: { prompt: 'A tree' }, options: { aspectRatio: '4:3' }
    });
    assert.strictEqual(calls[0][3], context);
    assert.strictEqual(calls[1][3], context);
});
