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

test('Gateway package owns built-in provider URL and transport; Host provides only the private profile resolver', async () => {
    let requestedUrl = '';
    const plugin = createPlugin({
        getProviderProfile: async ({ kind, provider }) => (kind === 'text' && provider === 'openai'
            ? { api_key: 'private-key' }
            : null),
        fetch: async (url) => {
            requestedUrl = String(url);
            return {
                status: 200,
                headers: {},
                async json() { return { choices: [{ message: { content: 'gateway-owned transport' } }] }; }
            };
        }
    });
    const result = await plugin.operations['text.generate'].execute({
        model: { provider: 'openai', modelId: 'gpt-6-astra' },
        messages: [{ role: 'user', content: 'hello' }]
    });
    assert.equal(requestedUrl, 'https://api.openai.com/v1/chat/completions');
    assert.equal(result.content, 'gateway-owned transport');
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
                        { provider: 'kie', code: 'claude-haiku-5-5', transport: 'kie_claude_messages' },
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
    assert.deepEqual(catalog.text.map(({ code }) => code), ['new-model', 'claude-haiku-5-5']);
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

test('KIE image task API body validation code 500 is not treated as an HTTP outage', async () => {
    const plugin = createPlugin({ transport: { async request(input) {
        assert.equal(input.path, '/api/v1/jobs/createTask');
        return {
            status: 200,
            body: { code: 500, msg: 'This aspect_ratio is not within the range of allowed options' },
            providerError: { code: '500', message: 'This aspect_ratio is not within the range of allowed options' }
        };
    } } });
    await assert.rejects(plugin.operations['image.generate'].execute({
        model: { provider: 'kie', modelId: 'grok-imagine-image-2-0/text-to-image', transport: 'kie_market_image_jobs' },
        input: { prompt: 'scene' }, options: { aspectRatio: '4:5' }
    }), (error) => error.code === 'AI_GATEWAY_PROVIDER_REJECTED_REQUEST'
        && error.providerCode === '500'
        && error.providerMessage === 'This aspect_ratio is not within the range of allowed options'
        && error.status === undefined);
});

test('KIE FLUX 3, Grok Imagine 2.0 and Qwen 3 map unsupported card-news 4:5 to supported 3:4', async () => {
    const requests = [];
    let taskId = 0;
    const plugin = createPlugin({ transport: {
        async request(input) {
            if (input.method === 'POST') {
                requests.push(input);
                taskId += 1;
                return { status: 200, body: { data: { taskId: `ratio-task-${taskId}` } } };
            }
            return { status: 200, body: { data: { state: 'success', resultUrls: [`https://image.example/${taskId}.png`] } } };
        },
        async downloadUrl() { return { bytes: Buffer.from('image'), mimeType: 'image/png' }; }
    }, sleep: async () => {} });
    for (const modelId of ['flux-3/klein-text-to-image', 'grok-imagine-image-2-0/text-to-image', 'qwen3/text-to-image']) {
        await plugin.operations['image.generate'].execute({
            model: { provider: 'kie', modelId, transport: 'kie_market_image_jobs' },
            input: { prompt: 'portrait card' }, options: { aspectRatio: '4:5', size: '1K' }
        });
    }
    assert.deepEqual(requests.map(({ body }) => body.input.aspect_ratio || body.input.image_size), ['3:4', '3:4', '3:4']);
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

test('KIE Claude Messages models use the fixed Messages endpoint and normalize Claude responses', async () => {
    const requests = [];
    const plugin = createPlugin({ transport: { async request(input) {
        requests.push(input);
        return { status: 200, headers: {}, body: {
            type: 'message',
            content: [{ type: 'thinking', thinking: 'hidden' }, { type: 'text', text: 'Claude result' }],
            stop_reason: 'end_turn',
            usage: { input_tokens: 12, output_tokens: 7 }
        } };
    } } });
    const result = await plugin.operations['text.generate'].execute({
        model: { provider: 'kie', modelId: 'claude-sonnet-5-5', transport: 'kie_claude_messages' },
        messages: [
            { role: 'system', content: 'Write clearly.' },
            { role: 'user', content: 'Write a short greeting.' }
        ],
        options: { maxOutputTokens: 128, temperature: 0.3 }
    });

    assert.deepEqual(result, {
        content: 'Claude result',
        model: { provider: 'kie', modelId: 'claude-sonnet-5-5' },
        usage: { inputTokens: 12, outputTokens: 7 },
        finishReason: 'end_turn'
    });
    assert.equal(requests[0].path, '/claude/v1/messages');
    assert.deepEqual(requests[0].body, {
        model: 'claude-sonnet-5-5',
        messages: [{ role: 'user', content: 'Write a short greeting.' }],
        max_tokens: 128,
        stream: false,
        system: 'Write clearly.',
        temperature: 0.3
    });
});

test('KIE Kimi and DeepSeek use non-streaming OpenAI Responses requests', async () => {
    const requests = [];
    const plugin = createPlugin({ transport: { async request(input) {
        requests.push(input);
        return { status: 200, headers: {}, body: { output_text: 'Responses result', usage: { input_tokens: 5, output_tokens: 3 } } };
    } } });
    for (const modelId of ['kimi-k3', 'deepseek-v4-1-flash']) {
        const result = await plugin.operations['text.generate'].execute({
            model: { provider: 'kie', modelId, transport: 'kie_openai_responses' },
            messages: [{ role: 'system', content: 'Write carefully.' }, { role: 'user', content: 'Draft a post.' }]
        });
        assert.equal(result.content, 'Responses result');
    }
    assert.deepEqual(requests.map(({ path }) => path), ['/openai/v1/responses', '/openai/v1/responses']);
    assert.deepEqual(requests[0].body, {
        model: 'kimi-k3', stream: false,
        input: [
            { role: 'system', content: [{ type: 'input_text', text: 'Write carefully.' }] },
            { role: 'user', content: [{ type: 'input_text', text: 'Draft a post.' }] }
        ]
    });
});

test('KIE Grok Responses requests use input_text messages and normalize the completed response', async () => {
    let request;
    const plugin = createPlugin({ transport: { async request(input) {
        request = input;
        return { status: 200, headers: {}, body: {
            output: [{ type: 'message', content: [{ type: 'output_text', text: 'Grok result' }] }],
            usage: { input_tokens: 8, output_tokens: 4 }
        } };
    } } });
    const result = await plugin.operations['text.generate'].execute({
        model: { provider: 'kie', modelId: 'grok-4-7', transport: 'kie_grok_responses' },
        messages: [{ role: 'user', content: 'Hello Grok.' }], options: { reasoningEffort: 'high' }
    });
    assert.equal(result.content, 'Grok result');
    assert.equal(request.path, '/grok/v1/responses');
    assert.deepEqual(request.body, {
        model: 'grok-4-7', stream: true,
        input: [{ role: 'user', content: [{ type: 'input_text', text: 'Hello Grok.' }] }],
        reasoning: { effort: 'high' }
    });
});

test('KIE Responses errors carried in HTTP 200 envelopes do not become empty responses', async () => {
    const plugin = createPlugin({ transport: { async request() {
        return { status: 200, headers: {}, body: { code: 402, msg: 'insufficient credits' } };
    } } });
    await assert.rejects(plugin.operations['text.generate'].execute({
        model: { provider: 'kie', modelId: 'kimi-k3', transport: 'kie_openai_responses' },
        messages: [{ role: 'user', content: 'Hello' }]
    }), (error) => error.code === 'AI_GATEWAY_PROVIDER_REJECTED_REQUEST' && error.status === 402);
});

test('KIE image adapters send each new model documented input fields', async () => {
    const requests = [];
    let taskNumber = 0;
    const plugin = createPlugin({ transport: {
        async request(input) {
            if (input.method === 'POST') {
                requests.push(input);
                taskNumber += 1;
                return { status: 200, body: { data: { taskId: `task-${taskNumber}` } } };
            }
            return { status: 200, body: { data: { state: 'success', resultUrls: [`https://image.example/${taskNumber}.png`] } } };
        },
        async downloadUrl() { return { bytes: Buffer.from('image'), mimeType: 'image/png' }; }
    }, sleep: async () => {} });
    const cases = [
        ['flux-3/klein-text-to-image', { prompt: 'scene', aspect_ratio: '4:3', resolution: '2K', output_format: 'png', num_images: 1, enhance_prompt: true }],
        ['qwen2-1/text-to-image', { prompt: 'scene', aspect_ratio: '4:3', resolution: '2K', background: 'opaque', output_format: 'png', enhance_prompt: true }],
        ['qwen3/text-to-image', { prompt: 'scene', resolution: '2K', image_size: '4:3', output_format: 'png', prompt_extend: true, nsfw_checker: false }],
        ['grok-imagine-image-2-0/text-to-image', { prompt: 'scene', aspect_ratio: '4:3' }],
        ['wan/2-7-image', { prompt: 'scene', aspect_ratio: '4:3', n: 1, enable_sequential: false, resolution: '2K', thinking_mode: false, watermark: false }],
        ['z-image', { prompt: 'scene', aspect_ratio: '4:3', nsfw_checker: true }]
    ];
    for (const [modelId] of cases) {
        await plugin.operations['image.generate'].execute({
            model: { provider: 'kie', modelId, transport: 'kie_market_image_jobs' },
            input: { prompt: 'scene' }, options: { aspectRatio: '4:3', size: '2K' }
        });
    }
    assert.deepEqual(requests.map(({ body }) => body.input), cases.map(([, input]) => input));
});

test('KIE Claude Messages route does not fall through to the first KIE text transport', async () => {
    let request;
    const plugin = createPlugin({ transport: { async request(input) {
        request = input;
        return { status: 200, headers: {}, body: { content: [{ type: 'text', text: 'ok' }] } };
    } } });
    await plugin.operations['text.generate'].execute({
        model: { provider: 'kie', modelId: 'claude-haiku-5-5', transport: 'kie_claude_messages' },
        messages: [{ role: 'user', content: 'hello' }]
    });
    assert.equal(request.path, '/claude/v1/messages');
    assert.equal(request.body.max_tokens, 4096);
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
    await assert.rejects(host.execute('ai-gateway', 'models.verify', {
        kind: 'text', model: { provider: 'openai', modelId: 'gpt-6-astra' }, apiKey: 'must-not-cross-the-plugin-boundary'
    }), { code: 'PLUGIN_OPERATION_CONTRACT_VIOLATION' });
});

test('manifest Host contract accepts the catalog transport for text generation', async () => {
    const requests = [];
    const plugin = createCorePluginRegistry().createPlugin('ai-gateway', {
        transport: { async request(input) {
            requests.push(input);
            return { status: 200, body: { content: [{ type: 'text', text: 'Claude result' }] } };
        } }
    });
    const host = createPluginHost({ plugins: [plugin] });

    const result = await host.execute('ai-gateway', 'text.generate', {
        model: { provider: 'kie', modelId: 'claude-sonnet-5-5', transport: 'kie_claude_messages' },
        messages: [{ role: 'user', content: '주제만 전달해도 작성할 수 있습니다.' }]
    });

    assert.equal(result.content, 'Claude result');
    assert.equal(requests[0].path, '/claude/v1/messages');
});

test('manifest Host contract accepts the catalog transport for KIE image generation', async () => {
    const plugin = createCorePluginRegistry().createPlugin('ai-gateway', {
        sleep: async () => {},
        transport: {
            async request(input) {
                if (input.path.endsWith('createTask')) return { status: 200, body: { data: { taskId: 'contract-image-task' } } };
                return { status: 200, body: { data: { state: 'success', resultUrls: ['https://image.example/result.png'] } } };
            },
            async downloadUrl() { return { bytes: Buffer.from('image-bytes'), mimeType: 'image/png' }; }
        }
    });
    const host = createPluginHost({ plugins: [plugin] });

    const result = await host.execute('ai-gateway', 'image.generate', {
        model: { provider: 'kie', modelId: 'nano-banana-2-1', transport: 'kie_market_image_jobs' },
        input: { prompt: 'A green tea cup' },
        options: { aspectRatio: '4:3', size: '1K', count: 1 }
    });

    assert.equal(result.images.length, 1);
    assert.equal(Buffer.from(result.images[0].dataBase64, 'base64').toString(), 'image-bytes');
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
