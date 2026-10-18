'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createShoppingGenerationApplication } = require('./application');

test('Shopping Generation Application resolves configured model and delegates JSON text generation to AI Gateway', async () => {
    const calls = [];
    const signal = new AbortController().signal;
    const application = createShoppingGenerationApplication({
        getTextModel: () => ({ provider: 'google', code: 'writer-v1' }),
        logger: { info() {}, warn() {} },
        aiGeneration: {
            resolveModel(kind, selection) {
                assert.equal(kind, 'text');
                return selection.modelId === 'writer-v1' ? selection : null;
            },
            getSupportedModels: () => [{ provider: 'google', code: 'writer-v1', name: 'Writer', transport: 'gemini' }],
            supportsFeature: (_kind, _selection, feature) => feature === 'jsonResponse',
            async generateText(request, context) { calls.push({ request, context }); return { content: '{"title":"상품"}' }; }
        }
    });

    const result = await application.generateText('  상품 원고를 써주세요  ', {
        signal,
        generationOptions: { temperature: 0.3 }
    });

    assert.equal(result, '{"title":"상품"}');
    assert.equal(calls[0].request.prompt, '상품 원고를 써주세요');
    assert.deepEqual(calls[0].request.modelSelection, { provider: 'google', modelId: 'writer-v1' });
    assert.equal(calls[0].request.responseFormat, 'json');
    assert.deepEqual(calls[0].request.options, { temperature: 0.3 });
    assert.equal(calls[0].context.signal, signal);
});

test('Shopping Generation Application rejects unavailable models and empty prompts before Gateway calls', async () => {
    let calls = 0;
    const application = createShoppingGenerationApplication({
        textModel: { provider: 'google', code: 'missing' },
        aiGeneration: {
            resolveModel() { return null; },
            async generateText() { calls += 1; return { content: 'unused' }; }
        }
    });

    await assert.rejects(application.generateText('prompt'), { code: 'SHOPPING_AI_MODEL_UNAVAILABLE' });
    await assert.rejects(application.generateText('   '), /prompt must be a non-empty string/);
    assert.equal(calls, 0);
});
