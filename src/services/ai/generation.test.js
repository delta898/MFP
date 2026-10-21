'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createAiGenerationService } = require('./generation');

test('AI service uses the Gateway catalog snapshot without maintaining a second model allowlist', async () => {
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
            { kind: 'image', provider: 'google', transport: 'gemini', modelIds: ['image-v1'], aspectRatios: ['1:1'], aspectRatiosByModel: { 'image-v1': ['1:1', '4:3', '4:5'] } },
            { kind: 'image', provider: 'openai', transport: 'openai', modelIds: ['image-v2'], aspectRatios: ['1:1', '3:2'] },
            { kind: 'image', provider: 'kie', transport: 'kie', modelIds: ['image-v3'] }
        ] }),
        async generateText(request, context) { calls.push({ kind: 'text', request, context }); return { content: 'ok' }; },
        async generateImage(request, context) { calls.push({ kind: 'image', request, context }); return { images: ['image'] }; }
    };
    const service = createAiGenerationService({ gateway, getModelCatalog: () => catalog });
    assert.deepEqual(service.getSupportedModels('text').map(({ code }) => code), ['text-v1', 'text-v2']);
    assert.equal(service.supportsFeature('text', { provider: 'openai', modelId: 'text-v1' }, 'jsonResponse'), true);
    assert.equal(service.supportsOption('image', { provider: 'google', modelId: 'image-v1' }, 'aspectRatio', '4:5'), true);
    assert.equal(service.supportsOption('image', { provider: 'google', modelId: 'image-v1' }, 'aspectRatio', '4:3'), true);
    assert.equal(service.supportsOption('image', { provider: 'openai', modelId: 'image-v2' }, 'aspectRatio', '4:5'), undefined);
    assert.equal(service.supportsOption('image', { provider: 'kie', modelId: 'image-v3' }, 'aspectRatio', '4:5'), undefined);
    const context = { signal: new AbortController().signal };
    await service.generateText({ modelSelection: { provider: 'openai', modelId: 'text-v1' }, prompt: 'Hello', responseFormat: 'json' }, context);
    await service.generateImage({ modelSelection: { provider: 'google', modelId: 'image-v1' }, prompt: 'Tree' }, context);
    assert.equal(calls[0].request.model.modelId, 'text-v1');
    assert.equal(calls[0].request.model.transport, 'openai');
    assert.equal(calls[0].request.options.responseFormat, 'json');
    assert.strictEqual(calls[0].context, context);
    assert.equal(calls[1].request.model.modelId, 'image-v1');
    await service.generateText({ modelSelection: { provider: 'google', modelId: 'text-v2' }, prompt: 'Gateway validates this route' });
    assert.equal(calls.length, 3);
});

test('AI service forwards the selected KIE transport so the Gateway chooses the catalog protocol', async () => {
    let captured;
    const gateway = {
        describeSupport: () => ({ routes: [
            { kind: 'text', provider: 'kie', transport: 'kie_responses', modelIds: null },
            { kind: 'text', provider: 'kie', transport: 'kie_claude_messages', modelIds: null }
        ] }),
        async generateText(request) { captured = request; return { content: 'ok' }; },
        async generateImage() { return { images: [] }; }
    };
    const service = createAiGenerationService({
        gateway,
        getModelCatalog: () => ({
            text: [{ provider: 'kie', code: 'claude-sonnet-5-5', transport: 'kie_claude_messages' }],
            image: []
        })
    });

    await service.generateText({
        modelSelection: { provider: 'kie', modelId: 'claude-sonnet-5-5' },
        prompt: '작성 지침과 주제를 포함한 전체 원고 프롬프트'
    });

    assert.deepEqual(captured.model, {
        provider: 'kie', modelId: 'claude-sonnet-5-5', transport: 'kie_claude_messages'
    });
    assert.deepEqual(captured.messages, [{
        role: 'user', content: '작성 지침과 주제를 포함한 전체 원고 프롬프트'
    }]);
});

test('AI service logs model identity and system/user prompt lengths without logging prompt content', async () => {
    const logs = [];
    const systemPrompt = 'private system instructions';
    const userPrompt = 'private user topic';
    const gateway = {
        describeSupport: () => ({ routes: [{ kind: 'text', provider: 'kie', transport: 'kie_claude_messages' }] }),
        async generateText() { return { content: 'ok' }; },
        async generateImage() { return { images: [] }; }
    };
    const service = createAiGenerationService({
        gateway,
        getModelCatalog: () => ({ text: [{
            provider: 'kie', code: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5', transport: 'kie_claude_messages'
        }], image: [] }),
        logger: { info(message) { logs.push(message); } }
    });

    await service.generateText({
        modelSelection: { provider: 'kie', modelId: 'claude-sonnet-5-5' },
        logContext: { imageModel: {
            provider: 'google', modelId: 'gemini-nano-banana-2.1', name: 'Nano Banana 2.1', transport: 'gemini_generate_content'
        } },
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ]
    });

    assert.match(logs[0], /provider=kie/);
    assert.match(logs[0], /model=Claude Sonnet 5\.5/);
    assert.match(logs[0], /modelId=claude-sonnet-5-5/);
    assert.match(logs[0], /transport=kie_claude_messages/);
    assert.match(logs[0], /imageModel=Nano Banana 2\.1 \/ provider=google \/ modelId=gemini-nano-banana-2\.1 \/ transport=gemini_generate_content/);
    assert.match(logs[0], /promptChars\(system=27, user=18\)/);
    assert.equal(logs[0].includes(systemPrompt), false);
    assert.equal(logs[0].includes(userPrompt), false);
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
    assert.deepEqual(calls[0].model, {
        provider: 'direct', modelId: 'local-model', transport: 'openai_chat_completions'
    });
    assert.equal(JSON.stringify(calls).includes('must-not-be-exposed'), false);
    await assert.rejects(service.generateText({ modelSelection: { provider: 'direct', modelId: 'arbitrary-model' }, prompt: 'Hi' }), { code: 'AI_GATEWAY_UNSUPPORTED_ROUTE' });
    assert.equal(calls.length, 1);
});

test('AI service omits temperature only when the selected Catalog model declares it unsupported', async () => {
    const requests = [];
    const gateway = {
        describeSupport: () => ({ routes: [{ kind: 'text', provider: 'openai', transport: 'openai_chat_completions', modelIds: null }] }),
        async generateText(request) { requests.push(request); return { content: 'ok' }; },
        async generateImage() { return { images: [] }; }
    };
    const catalog = {
        text: [
            { provider: 'openai', code: 'fixed-temperature', transport: 'openai_chat_completions', capabilities: { temperature: false } },
            { provider: 'openai', code: 'adjustable-temperature', transport: 'openai_chat_completions', capabilities: { temperature: true } },
            { provider: 'openai', code: 'unknown-temperature', transport: 'openai_chat_completions', capabilities: {} }
        ],
        image: []
    };
    const service = createAiGenerationService({ gateway, getModelCatalog: () => catalog });
    const request = (modelId) => service.generateText({
        modelSelection: { provider: 'openai', modelId },
        prompt: 'SNS optimization',
        options: { temperature: 0.35, maxOutputTokens: 500 }
    });

    assert.equal(service.supportsOption('text', { provider: 'openai', modelId: 'fixed-temperature' }, 'temperature'), false);
    assert.equal(service.supportsOption('text', { provider: 'openai', modelId: 'adjustable-temperature' }, 'temperature'), true);
    assert.equal(service.supportsOption('text', { provider: 'openai', modelId: 'unknown-temperature' }, 'temperature'), undefined);
    await request('fixed-temperature');
    await request('adjustable-temperature');
    await request('unknown-temperature');

    assert.equal(Object.hasOwn(requests[0].options, 'temperature'), false);
    assert.equal(requests[0].options.maxOutputTokens, 500);
    assert.equal(requests[1].options.temperature, 0.35);
    assert.equal(requests[2].options.temperature, 0.35);
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
