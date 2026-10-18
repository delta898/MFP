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

test('AI Gateway adapter reads the catalog through the declared operation', async () => {
    const calls = [];
    const adapter = createAiGatewayAdapter({ async executeOperation(...args) {
        calls.push(args);
        return { text: [], image: [], providers: { text: [], image: [] } };
    } });
    const result = await adapter.getModelCatalog({ forceRefresh: true });
    assert.deepEqual(result.text, []);
    assert.deepEqual(calls, [['ai-gateway', 'models.list', { forceRefresh: true }]]);
});

test('AI Gateway verifies with a transient reference and never puts credentials in operation input', async () => {
    const calls = [];
    const released = [];
    const adapter = createAiGatewayAdapter({
        registerVerificationProfile(kind, profile) {
            assert.equal(kind, 'text');
            assert.equal(profile.api_key, 'temporary-secret');
            return 'e146f0f2-078b-492a-b94c-4ab31eaa4bb4';
        },
        releaseVerificationProfile(reference) { released.push(reference); },
        async executeOperation(...args) {
            calls.push(args);
            return { success: true, check_type: 'metadata', generation_performed: false };
        }
    });
    await adapter.verifyModelConnection({
        kind: 'text',
        modelConfig: { provider: 'openai', code: 'gpt-6-sol', transport: 'openai_chat_completions', api_key: 'temporary-secret' }
    });
    assert.deepEqual(calls, [[
        'ai-gateway', 'models.verify', {
            kind: 'text',
            model: { provider: 'openai', modelId: 'gpt-6-sol', transport: 'openai_chat_completions' },
            profileRef: 'e146f0f2-078b-492a-b94c-4ab31eaa4bb4'
        }
    ]]);
    assert.equal(JSON.stringify(calls).includes('temporary-secret'), false);
    assert.deepEqual(released, ['e146f0f2-078b-492a-b94c-4ab31eaa4bb4']);
});

test('AI Gateway releases a transient profile when the verification operation fails', async () => {
    const released = [];
    const adapter = createAiGatewayAdapter({
        registerVerificationProfile: () => 'e146f0f2-078b-492a-b94c-4ab31eaa4bb4',
        releaseVerificationProfile(reference) { released.push(reference); },
        async executeOperation() { throw new Error('verification failed'); }
    });
    await assert.rejects(adapter.verifyModelConnection({
        kind: 'image', modelConfig: { provider: 'kie', code: 'nano-banana-pro', api_key: 'secret' }
    }), /verification failed/);
    assert.equal(released.length, 1);
});
