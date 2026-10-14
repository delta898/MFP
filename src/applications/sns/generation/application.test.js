'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createSnsGenerationApplication } = require('./application');

function createAiGeneration() {
    const calls = [];
    const models = {
        text: [
            { provider: 'anthropic', code: 'writer', name: 'Writer', transport: 'anthropic_openai_compat' },
            { provider: 'openai', code: 'chat', name: 'Chat', transport: 'openai_chat_completions' }
        ],
        image: [{ provider: 'kie', code: 'image', name: 'Image', transport: 'kie_market_image_jobs' }]
    };
    const service = {
        calls,
        getSupportedModels(kind) { return models[kind]; },
        resolveModel(kind, selection) {
            return models[kind].some((model) => model.provider === selection.provider && model.code === selection.modelId)
                ? selection : null;
        },
        supportsOption(_kind, _selection, _option, value) { return value === '4:3'; },
        async generateText(input, context) {
            calls.push({ kind: 'text', input, context });
            return { content: 'normalized text' };
        },
        async generateImage(input, context) {
            calls.push({ kind: 'image', input, context });
            return { images: [{ mimeType: 'image/png', dataBase64: Buffer.from('png').toString('base64') }] };
        }
    };
    return service;
}

test('SNS generation resolves writing, chat, and image models through the shared AI service', async () => {
    const aiGeneration = createAiGeneration();
    const signals = new AbortController();
    const app = createSnsGenerationApplication({
        aiGeneration,
        getWritingModel: () => ({ provider: 'anthropic', code: 'writer' }),
        getChatModel: () => ({ provider: 'openai', code: 'chat' }),
        getImageModel: () => ({ provider: 'kie', code: 'image' })
    });

    assert.deepEqual(app.getTextAvailability('writing'), { available: true, model_name: 'Writer', model: { provider: 'anthropic', modelId: 'writer' } });
    assert.deepEqual(app.getTextAvailability('chat'), { available: true, model_name: 'Chat', model: { provider: 'openai', modelId: 'chat' } });
    assert.equal(app.getImageAvailability().model_name, 'Image');
    assert.equal(await app.generateText({ role: 'writing', prompt: 'hashtags', options: { maxOutputTokens: 160 } }), 'normalized text');
    const image = await app.generateImage({ prompt: 'post art' }, { signal: signals.signal });

    assert.equal(image.mimeType, 'image/png');
    assert.deepEqual(aiGeneration.calls.map((call) => call.kind), ['text', 'image']);
    assert.deepEqual(aiGeneration.calls[0].input.modelSelection, { provider: 'anthropic', modelId: 'writer' });
    assert.deepEqual(aiGeneration.calls[0].input.options, { maxOutputTokens: 160 });
    assert.deepEqual(aiGeneration.calls[1].input.options, { aspectRatio: '4:3', size: '1K', count: 1 });
    assert.equal(aiGeneration.calls[1].context.signal, signals.signal);
});

test('SNS generation rejects a model selection absent from the shared AI service', async () => {
    const app = createSnsGenerationApplication({
        aiGeneration: createAiGeneration(),
        getWritingModel: () => ({ provider: 'anthropic', code: 'missing' }),
        getChatModel: () => ({}),
        getImageModel: () => ({})
    });
    assert.deepEqual(app.getTextAvailability('writing'), { available: false, model_name: '' });
    await assert.rejects(app.generateText({ role: 'writing', prompt: 'hello' }), { code: 'SNS_AI_MODEL_UNAVAILABLE' });
    await assert.rejects(app.generateImage({ prompt: 'hello' }), { code: 'SNS_AI_MODEL_UNAVAILABLE' });
});

test('SNS generation omits a fixed image ratio when the Gateway declares it unsupported', async () => {
    const aiGeneration = createAiGeneration();
    aiGeneration.supportsOption = () => false;
    const app = createSnsGenerationApplication({
        aiGeneration,
        getImageModel: () => ({ provider: 'kie', code: 'image' })
    });
    await app.generateImage({ prompt: 'image' });
    assert.deepEqual(aiGeneration.calls[0].input.options, { size: '1K', count: 1 });
});
