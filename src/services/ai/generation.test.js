'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createAiGenerationService } = require('./generation');

test('AI service intersects Catalog and Gateway routes and rejects unsupported selections before execution', async () => {
    const calls = [];
    const catalog = {
        text: [
            { provider: 'openai', code: 'text-v1', transport: 'openai', capabilities: { structured_output: true } },
            { provider: 'google', code: 'text-v2', transport: 'gemini' }
        ],
        image: [{ provider: 'google', code: 'image-v1', transport: 'gemini' }]
    };
    const gateway = {
        describeSupport: () => ({ routes: [
            { kind: 'text', provider: 'openai', transport: 'openai', modelIds: ['text-v1'], jsonMode: true },
            { kind: 'image', provider: 'google', transport: 'gemini', modelIds: ['image-v1'] }
        ] }),
        async generateText(request, context) { calls.push({ kind: 'text', request, context }); return { content: 'ok' }; },
        async generateImage(request, context) { calls.push({ kind: 'image', request, context }); return { images: ['image'] }; }
    };
    const service = createAiGenerationService({ gateway, getModelCatalog: () => catalog });
    assert.deepEqual(service.getSupportedModels('text').map(({ code }) => code), ['text-v1']);
    assert.equal(service.supportsFeature('text', { provider: 'openai', modelId: 'text-v1' }, 'jsonResponse'), true);
    const context = { signal: new AbortController().signal };
    await service.generateText({ modelSelection: { provider: 'openai', modelId: 'text-v1' }, prompt: 'Hello', responseFormat: 'json' }, context);
    await service.generateImage({ modelSelection: { provider: 'google', modelId: 'image-v1' }, prompt: 'Tree' }, context);
    assert.equal(calls[0].request.model.modelId, 'text-v1');
    assert.equal(calls[0].request.options.responseFormat, 'json');
    assert.strictEqual(calls[0].context, context);
    assert.equal(calls[1].request.model.modelId, 'image-v1');
    await assert.rejects(service.generateText({ modelSelection: { provider: 'google', modelId: 'text-v2' }, prompt: 'No route' }), { code: 'AI_GATEWAY_UNSUPPORTED_ROUTE' });
    assert.equal(calls.length, 2);
});
