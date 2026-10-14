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
        image: [
            { provider: 'google', code: 'image-v1', transport: 'gemini' },
            { provider: 'openai', code: 'image-v2', transport: 'openai' },
            { provider: 'kie', code: 'image-v3', transport: 'kie' }
        ]
    };
    const gateway = {
        describeSupport: () => ({ routes: [
            { kind: 'text', provider: 'openai', transport: 'openai', modelIds: ['text-v1'], jsonMode: true },
            { kind: 'image', provider: 'google', transport: 'gemini', modelIds: ['image-v1'], aspectRatios: ['1:1', '4:5'] },
            { kind: 'image', provider: 'openai', transport: 'openai', modelIds: ['image-v2'], aspectRatios: ['1:1', '3:2'] },
            { kind: 'image', provider: 'kie', transport: 'kie', modelIds: ['image-v3'] }
        ] }),
        async generateText(request, context) { calls.push({ kind: 'text', request, context }); return { content: 'ok' }; },
        async generateImage(request, context) { calls.push({ kind: 'image', request, context }); return { images: ['image'] }; }
    };
    const service = createAiGenerationService({ gateway, getModelCatalog: () => catalog });
    assert.deepEqual(service.getSupportedModels('text').map(({ code }) => code), ['text-v1']);
    assert.equal(service.supportsFeature('text', { provider: 'openai', modelId: 'text-v1' }, 'jsonResponse'), true);
    assert.equal(service.supportsOption('image', { provider: 'google', modelId: 'image-v1' }, 'aspectRatio', '4:5'), true);
    assert.equal(service.supportsOption('image', { provider: 'openai', modelId: 'image-v2' }, 'aspectRatio', '4:5'), false);
    assert.equal(service.supportsOption('image', { provider: 'kie', modelId: 'image-v3' }, 'aspectRatio', '4:5'), undefined);
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

test('AI service exposes only the configured direct model identity and routes it through Gateway', async () => {
    const calls = [];
    const gateway = {
        describeSupport: () => ({ routes: [
            { kind: 'text', provider: 'direct', transport: 'openai_chat_completions', modelIds: null },
            { kind: 'image', provider: 'direct', transport: 'openai_images', modelIds: null }
        ] }),
        async generateText(request) { calls.push(request); return { content: 'ok' }; },
        async generateImage(request) { calls.push(request); return { images: [] }; }
    };
    const service = createAiGenerationService({
        gateway,
        getModelCatalog: () => ({ text: [], image: [] }),
        getConfiguredModels: (kind) => kind === 'text' ? [{
            provider: 'direct', code: 'local-model', name: 'Local Model', transport: 'openai_chat_completions',
            base_url: 'http://127.0.0.1:1234/v1', api_key: 'must-not-be-exposed'
        }] : [{ provider: 'direct', code: 'local-image', transport: 'openai_images', base_url: 'http://127.0.0.1/v1' }]
    });
    assert.deepEqual(service.getSupportedModels('text'), [{
        provider: 'direct', code: 'local-model', name: 'Local Model', transport: 'openai_chat_completions', capabilities: {}
    }]);
    assert.equal(service.supportsOption('image', { provider: 'direct', modelId: 'local-image' }, 'aspectRatio', '4:5'), undefined);
    await service.generateText({ modelSelection: { provider: 'direct', modelId: 'local-model' }, prompt: 'Hi' });
    assert.deepEqual(calls[0].model, { provider: 'direct', modelId: 'local-model' });
    assert.equal(JSON.stringify(calls).includes('must-not-be-exposed'), false);
    await assert.rejects(service.generateText({ modelSelection: { provider: 'direct', modelId: 'arbitrary-model' }, prompt: 'Hi' }), { code: 'AI_GATEWAY_UNSUPPORTED_ROUTE' });
    assert.equal(calls.length, 1);
});

test('AI service logs safe provider error diagnostics without logging the request prompt', async () => {
    const logs = [];
    const prompt = 'private user prompt that must not be logged';
    const gateway = {
        describeSupport: () => ({ routes: [
            { kind: 'text', provider: 'anthropic', transport: 'anthropic_openai_compat', modelIds: null }
        ] }),
        async generateText() {
            throw Object.assign(new Error('The AI provider rejected the generation request.'), {
                code: 'AI_GATEWAY_PROVIDER_REJECTED_REQUEST',
                status: 400,
                providerCode: 'invalid_request_error',
                providerMessage: 'temperature parameter is not supported',
                providerRequestId: 'anthropic-req-123'
            });
        },
        async generateImage() { throw new Error('unused'); }
    };
    const service = createAiGenerationService({
        gateway,
        getModelCatalog: () => ({ text: [{ provider: 'anthropic', code: 'claude-haiku', transport: 'anthropic_openai_compat' }], image: [] }),
        logger: { warn(message) { logs.push(message); } }
    });
    await assert.rejects(service.generateText({
        modelSelection: { provider: 'anthropic', modelId: 'claude-haiku' }, prompt
    }), { code: 'AI_GATEWAY_PROVIDER_REJECTED_REQUEST' });
    assert.match(logs[0], /provider=anthropic/);
    assert.match(logs[0], /httpStatus=400/);
    assert.match(logs[0], /providerCode=invalid_request_error/);
    assert.match(logs[0], /temperature parameter is not supported/);
    assert.match(logs[0], /providerRequestId=anthropic-req-123/);
    assert.equal(logs[0].includes(prompt), false);
});
