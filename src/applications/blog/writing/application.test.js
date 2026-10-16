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
    const text = await application.generateText('  Write a post  ', {
        signal,
        generationOptions: { maxOutputTokens: 900, temperature: 0.4 }
    });
    const image = await application.generateImage(' tree \,', { aspectRatio: '4:3' }, { signal });
    const selectedImage = await application.generateImage(' selected model ', {}, {
        modelSelection: { provider: 'openai', modelId: 'image-override' }
    });

    assert.equal(text, 'structured text');
    assert.equal(Buffer.from(image.dataBase64, 'base64').toString(), 'image');
    assert.deepEqual(calls.map(({ kind }) => kind), ['text', 'image', 'image']);
    assert.equal(calls[0].request.prompt, 'Write a post');
    assert.equal(calls[0].request.responseFormat, 'json');
    assert.deepEqual(calls[0].request.options, { maxOutputTokens: 900, temperature: 0.4 });
    assert.equal(calls[0].context.signal, signal);
    assert.equal(calls[1].request.modelSelection.modelId, 'image-v1');
    assert.equal(calls[1].request.options.aspectRatio, '4:3');
    assert.equal(calls[2].request.modelSelection.modelId, 'image-override');
    assert.equal(Buffer.from(selectedImage.dataBase64, 'base64').toString(), 'image');
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

test('Blog Writing Application routes chat-role text through AI Generation with the configured chat model', async () => {
    let received;
    const application = createBlogWritingApplication({
        getTextModel: () => ({ provider: 'google', modelId: 'writer-model' }),
        getChatModel: () => ({ provider: 'openai', modelId: 'chat-model' }),
        aiGeneration: {
            async generateText(request) { received = request; return { content: 'ideas' }; },
            async generateImage() { return { images: [] }; }
        }
    });

    assert.equal(await application.generateChatText('recommend'), 'ideas');
    assert.deepEqual(received.modelSelection, { provider: 'openai', modelId: 'chat-model' });
    assert.equal(received.prompt, 'recommend');
});
