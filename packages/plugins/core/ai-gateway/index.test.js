'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createPlugin, describeSupport } = require('./index');
const { createCorePluginRegistry } = require('../../../../src/composition/core-plugin-registry');
const { createPluginHost } = require('../../../../src/platform/plugin-host');

test('text operation normalizes a supported provider response and never accepts credentials in input', async () => {
    const requests = [];
    const plugin = createPlugin({ transport: { async request(input) {
        requests.push(input);
        return { status: 200, headers: {}, body: {
            choices: [{ message: { content: 'hello' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 4, completion_tokens: 2 }
        } };
    } } });
    const result = await plugin.operations['text.generate'].execute({
        model: { provider: 'openai', modelId: 'gpt-6-astra' },
        messages: [{ role: 'user', content: 'hi' }],
        options: { temperature: 0.2 }
    });
    assert.deepEqual(result, {
        content: 'hello', model: { provider: 'openai', modelId: 'gpt-6-astra' },
        usage: { inputTokens: 4, outputTokens: 2 }, finishReason: 'stop'
    });
    assert.equal(requests[0].provider, 'openai');
    assert.equal(requests[0].body.temperature, 0.2);
    assert.equal(Object.hasOwn(requests[0], 'apiKey'), false);
    assert.equal(Object.hasOwn(requests[0], 'headers'), false);
});

test('models.list delegates catalog refresh and only exposes routes implemented by this Gateway', async () => {
    const calls = [];
    const plugin = createPlugin({
        transport: { async request() { throw new Error('not used'); } },
        catalog: {
            async refresh(force) { calls.push(['refresh', force]); },
            async getCatalog() {
                calls.push(['getCatalog']);
                return {
                    providers: { text: [{ id: 'openai' }], image: [] },
                    text: [
                        { provider: 'openai', code: 'new-model', transport: 'openai_chat_completions' },
                        { provider: 'unknown', code: 'bad-model', transport: 'unknown' }
                    ],
                    image: []
                };
            },
            getStatus() { return { source: 'remote', version: 'catalog-2' }; }
        }
    });

    const catalog = await plugin.operations['models.list'].execute({ forceRefresh: true });
    assert.deepEqual(calls, [['refresh', true], ['getCatalog']]);
    assert.deepEqual(catalog.text.map(({ code }) => code), ['new-model']);
    assert.equal(catalog.status.version, 'catalog-2');
});

test('KIE image route accepts newly catalogued model IDs using the shared job protocol', async () => {
    const requests = [];
    const plugin = createPlugin({ transport: { async request(input) {
        requests.push(input);
        if (input.path.endsWith('createTask')) return { status: 200, body: { data: { taskId: 'new-model-task' } } };
        return { status: 200, body: { data: { state: 'success', resultUrls: ['https://image.example/new.png'] } } };
    }, async downloadUrl() { return { bytes: Buffer.from('image'), mimeType: 'image/png' }; } }, sleep: async () => {} });
    const result = await plugin.operations['image.generate'].execute({
        model: { provider: 'kie', modelId: 'new-kie-image-model' },
        input: { prompt: 'test' }, options: {}
    });
    assert.equal(result.model.modelId, 'new-kie-image-model');
    assert.equal(requests[0].body.model, 'new-kie-image-model');
    assert.deepEqual(requests[0].body.input, { prompt: 'test', aspect_ratio: '4:3' });
});

test('Anthropic OpenAI-compatible requests forward caller options for provider runtime validation', async () => {
    let request;
    const plugin = createPlugin({ transport: { async request(input) {
        request = input;
        return { status: 200, headers: {}, body: { choices: [{ message: { content: 'hello' } }] } };
    } } });
    await plugin.operations['text.generate'].execute({
        model: { provider: 'anthropic', modelId: 'claude-haiku-5-5' },
        messages: [{ role: 'user', content: 'hi' }],
        options: { temperature: 0.8, maxOutputTokens: 600, responseFormat: 'json' }
    });
    assert.equal(request.path, '/v1/chat/completions');
    assert.equal(request.body.temperature, 0.8);
    assert.equal(request.body.max_tokens, 600);
    assert.deepEqual(request.body.response_format, { type: 'json_object' });
});

test('direct compatible text and image operations use bounded OpenAI-compatible paths', async () => {
    const requests = [];
    const plugin = createPlugin({ transport: { async request(input) {
        requests.push(input);
        if (input.kind === 'text') return { status: 200, body: { choices: [{ message: { content: 'direct result' } }] } };
        if (input.body.prompt === 'reject-me') return {
            status: 400, headers: new Headers({ 'x-request-id': 'req-direct-4' }),
            providerError: { code: 'invalid_request_error', message: 'unsupported size' },
            body: { error: { message: 'unsupported size' } }
        };
        return { status: 200, body: { data: [{ b64_json: Buffer.from('image-bytes').toString('base64') }] } };
    } } });
    const text = await plugin.operations['text.generate'].execute({
        model: { provider: 'direct', modelId: 'my-text-model' }, messages: [{ role: 'user', content: 'hello' }]
    });
    const image = await plugin.operations['image.generate'].execute({
        model: { provider: 'direct', modelId: 'my-image-model' },
        input: { prompt: 'square' }, options: { aspectRatio: '1:1', size: '1K', count: 1 }
    });
    assert.equal(text.content, 'direct result');
    assert.equal(requests[0].path, '/chat/completions');
    assert.equal(requests[0].body.model, 'my-text-model');
    assert.equal(requests[1].path, '/images/generations');
    assert.equal(requests[1].body.size, '1024x1024');
    assert.equal(requests[1].body.response_format, 'b64_json');
    assert.equal(Buffer.from(image.images[0].dataBase64, 'base64').toString(), 'image-bytes');
    assert.equal(describeSupport().routes.find((route) => route.provider === 'direct' && route.kind === 'image').aspectRatios, undefined);
    await plugin.operations['image.generate'].execute({
        model: { provider: 'direct', modelId: 'my-image-model' },
        input: { prompt: 'portrait' }, options: { aspectRatio: '4:5', size: '1K' }
    });
    assert.equal(requests[2].body.size, '1024x1280');
    await assert.rejects(plugin.operations['image.generate'].execute({
        model: { provider: 'direct', modelId: 'my-image-model' },
        input: { prompt: 'reject-me' }, options: { aspectRatio: '4:5', size: '1K' }
    }), (error) => error.code === 'AI_GATEWAY_PROVIDER_REJECTED_REQUEST'
        && error.status === 400
        && error.providerCode === 'invalid_request_error'
        && error.providerMessage === 'unsupported size'
        && error.providerRequestId === 'req-direct-4');
    assert.equal(requests.length, 4);
});

test('manifest Host contract rejects credentials in operation input before provider dispatch', async () => {
    let requests = 0;
    const plugin = createCorePluginRegistry().createPlugin('ai-gateway', {
        transport: { async request() { requests += 1; return { status: 200, body: {} }; } }
    });
    const host = createPluginHost({ plugins: [plugin] });
    await assert.rejects(host.execute('ai-gateway', 'text.generate', {
        model: { provider: 'openai', modelId: 'gpt-6-astra' },
        messages: [{ role: 'user', content: 'hello' }],
        apiKey: 'must-not-cross-the-plugin-boundary'
    }), { code: 'PLUGIN_OPERATION_CONTRACT_VIOLATION' });
    assert.equal(requests, 0);
});

test('KIE image operation reports async progress, polls and downloads a bounded image', async () => {
    const requests = [];
    const events = [];
    let now = 0;
    let polls = 0;
    const plugin = createPlugin({
        now: () => now,
        sleep: async (ms) => { now += ms; },
        transport: {
            async request(input) {
                requests.push(input);
                if (input.path.endsWith('createTask')) return { status: 200, body: { data: { taskId: 'task-1' } } };
                polls += 1;
                return { status: 200, body: { data: polls === 1
                    ? { state: 'generating', progress: 33 }
                    : { state: 'success', resultJson: '{"resultUrls":["https://image.example/result.png"]}' } } };
            },
            async downloadUrl({ url }) {
                assert.equal(url, 'https://image.example/result.png');
                return { bytes: Buffer.from('png-data'), mimeType: 'image/png' };
            }
        }
    });
    const result = await plugin.operations['image.generate'].execute({
        model: { provider: 'kie', modelId: 'nano-banana-pro' },
        input: { prompt: 'a tree' }, options: { aspectRatio: '4:5', size: '1K' }
    }, { reportProgress: (event) => events.push(event) });
    assert.equal(result.images.length, 1);
    assert.equal(Buffer.from(result.images[0].dataBase64, 'base64').toString(), 'png-data');
    assert.deepEqual(events.map((event) => event.phase), ['submitted', 'generating', 'downloading']);
    assert.equal(requests.length, 3);
    assert.deepEqual(requests[0].body.input, {
        prompt: 'a tree', aspect_ratio: '4:5', image_input: [], resolution: '1K', output_format: 'png'
    });
});

test('image operation forwards model size and returns the provider rejection', async () => {
    const requests = [];
    const plugin = createPlugin({ transport: { async request(input) {
        requests.push(input);
        return {
            status: 400,
            providerError: { code: 'unsupported_value', message: 'image size is not supported' },
            body: { error: { message: 'image size is not supported' } }
        };
    } } });
    await assert.rejects(plugin.operations['image.generate'].execute({
        model: { provider: 'kie', modelId: 'nano-banana-2-lite' },
        input: { prompt: 'a tree' }, options: { size: '2K' }
    }), (error) => error.code === 'AI_GATEWAY_PROVIDER_REJECTED_REQUEST'
        && error.providerCode === 'unsupported_value'
        && error.providerMessage === 'image size is not supported');
    assert.equal(requests.length, 1);
    assert.equal(requests[0].body.input.resolution, '2K');
});

test('image operation reports its own output-count limit separately from provider capabilities', async () => {
    let requests = 0;
    const plugin = createPlugin({ transport: { async request() { requests += 1; } } });
    await assert.rejects(plugin.operations['image.generate'].execute({
        model: { provider: 'google', modelId: 'gemini-nano-banana-2.1' },
        input: { prompt: 'a tree' }, options: { count: 2 }
    }), { code: 'AI_GATEWAY_IMAGE_COUNT_LIMIT_EXCEEDED' });
    assert.equal(requests, 0);
});

test('image support lists are advisory and unknown ratios reach the provider for runtime validation', async () => {
    const requests = [];
    const plugin = createPlugin({ transport: { async request(input) {
        requests.push(input);
        if (input.provider === 'openai') {
            return { status: 200, body: { data: [{ b64_json: Buffer.from('generated-openai-image').toString('base64') }] } };
        }
        return { status: 200, body: { candidates: [{ content: { parts: [
            { inlineData: { mimeType: 'image/png', data: Buffer.from('generated-image').toString('base64') } }
        ] } }] } };
    } } });
    const support = describeSupport();
    const google = support.routes.find((route) => route.provider === 'google' && route.kind === 'image');
    const openai = support.routes.find((route) => route.provider === 'openai' && route.kind === 'image');
    assert.ok(google.aspectRatios.includes('4:5'));
    assert.ok(google.aspectRatios.includes('4:3'));
    assert.ok(!openai.aspectRatios.includes('4:5'));
    const generated = await plugin.operations['image.generate'].execute({
        model: { provider: 'google', modelId: 'gemini-nano-banana-2.1' },
        input: { prompt: 'landscape image' }, options: { aspectRatio: '4:3', size: '1K' }
    });
    assert.deepEqual(requests[0].body.generationConfig.imageConfig, { aspectRatio: '4:3', imageSize: '1K' });
    assert.equal(Buffer.from(generated.images[0].dataBase64, 'base64').toString(), 'generated-image');
    await plugin.operations['image.generate'].execute({
        model: { provider: 'openai', modelId: 'gpt-image-2' },
        input: { prompt: 'portrait card' }, options: { aspectRatio: '4:5', size: '1K' }
    });
    assert.equal(requests.length, 2);
    assert.equal(requests[1].body.size, '1024x1280');
    await plugin.operations['image.generate'].execute({
        model: { provider: 'openai', modelId: 'gpt-image-2' },
        input: { prompt: 'panoramic card' }, options: { aspectRatio: '4:1', size: '1K' }
    });
    assert.equal(requests.length, 3);
    assert.equal(Object.hasOwn(requests[2].body, 'size'), false);
    assert.equal(requests[2].body.aspect_ratio, '4:1');
});

test('Gateway honors cancellation and uses stable provider errors', async () => {
    const controller = new AbortController();
    const plugin = createPlugin({ transport: { async request() { throw Object.assign(new Error('private provider detail'), { status: 401 }); } } });
    await assert.rejects(plugin.operations['text.generate'].execute({
        model: { provider: 'openai', modelId: 'gpt-6-astra' }, messages: [{ role: 'user', content: 'hello' }]
    }), (error) => error.code === 'AI_GATEWAY_AUTHENTICATION_FAILED' && !error.message.includes('private provider detail'));

    controller.abort();
    await assert.rejects(plugin.operations['text.generate'].execute({
        model: { provider: 'openai', modelId: 'gpt-6-astra' }, messages: [{ role: 'user', content: 'hello' }]
    }, { signal: controller.signal }), (error) => error.code === 'AI_GATEWAY_CANCELED');
});
