'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createBlogWritingApplication } = require('./application');

test('Blog Writing Application delegates text and image generation to shared AI service', async () => {
    const calls = [];
    const signal = new AbortController().signal;
    const service = {
        supportsFeature(kind, selection, feature) { return kind === 'text' && selection.modelId === 'text-v1' && feature === 'jsonResponse'; },
        async generateText(request, context) { calls.push({ kind: 'text', request, context }); return { content: 'structured text' }; },
        async generateImage(request, context) { calls.push({ kind: 'image', request, context }); return { images: [{ dataBase64: 'aW1hZ2U=', mimeType: 'image/png' }] }; }
    };
    const application = createBlogWritingApplication({
        aiGeneration: service,
        getTextModel: () => ({ provider: 'openai', modelId: 'text-v1' }),
        getImageModel: () => ({ provider: 'google', modelId: 'image-v1' })
    });
    const text = await application.generateText('  Write a post  ', { signal });
    const image = await application.generateImage(' tree \,', { aspectRatio: '4:3' }, { signal });

    assert.equal(text, 'structured text');
    assert.equal(Buffer.from(image.dataBase64, 'base64').toString(), 'image');
    assert.deepEqual(calls.map(({ kind }) => kind), ['text', 'image']);
    assert.equal(calls[0].request.prompt, 'Write a post');
    assert.equal(calls[0].request.responseFormat, 'json');
    assert.equal(calls[0].context.signal, signal);
    assert.equal(calls[1].request.modelSelection.modelId, 'image-v1');
    assert.equal(calls[1].request.options.aspectRatio, '4:3');
});

test('Blog Writing Application validates prompts and preserves the execution context', async () => {
    const signal = new AbortController().signal;
    let context;
    const application = createBlogWritingApplication({
        textModel: { provider: 'openai', modelId: 'text-v1' },
        aiGeneration: {
            async generateText(request, executionContext) { context = executionContext; return { content: request.prompt }; },
            async generateImage() { return { images: [] }; }
        }
    });
    await assert.rejects(application.generateText('  '), /prompt must be a non-empty string/);
    assert.equal(await application.generateText('prompt', { signal }), 'prompt');
    assert.equal(context.signal, signal);
});
