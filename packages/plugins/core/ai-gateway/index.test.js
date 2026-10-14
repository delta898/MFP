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

test('Anthropic text requests omit deprecated temperature while preserving shared generation options', async () => {
    let request;
    const plugin = createPlugin({ transport: { async request(input) {
        request = input;
        return { status: 200, headers: {}, body: { choices: [{ message: { content: 'hello' } }] } };
    } } });
    await plugin.operations['text.generate'].execute({
        model: { provider: 'anthropic', modelId: 'claude-haiku-5-5' },
        messages: [{ role: 'user', content: 'hi' }],
        options: { temperature: 0.8, maxOutputTokens: 600 }
    });
    assert.equal(request.path, '/v1/chat/completions');
    assert.equal(Object.hasOwn(request.body, 'temperature'), false);
    assert.equal(request.body.max_tokens, 600);
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

test('image operation rejects a size that the selected model cannot execute', async () => {
    const plugin = createPlugin({ transport: { async request() { throw new Error('should not execute'); } } });
    await assert.rejects(plugin.operations['image.generate'].execute({
        model: { provider: 'kie', modelId: 'nano-banana-2-lite' },
        input: { prompt: 'a tree' }, options: { size: '2K' }
    }), (error) => error.code === 'AI_GATEWAY_UNSUPPORTED_CAPABILITY');
});

test('image support describes model aspect ratios and rejects unsupported ratios before provider dispatch', async () => {
    let requests = 0;
    const plugin = createPlugin({ transport: { async request() { requests += 1; throw new Error('should not execute'); } } });
    const support = describeSupport();
    const google = support.routes.find((route) => route.provider === 'google' && route.kind === 'image');
    const openai = support.routes.find((route) => route.provider === 'openai' && route.kind === 'image');
    assert.ok(google.aspectRatios.includes('4:5'));
    assert.ok(!openai.aspectRatios.includes('4:5'));
    await assert.rejects(plugin.operations['image.generate'].execute({
        model: { provider: 'openai', modelId: 'gpt-image-2' },
        input: { prompt: 'portrait card' }, options: { aspectRatio: '4:5', size: '1K' }
    }), { code: 'AI_GATEWAY_UNSUPPORTED_CAPABILITY' });
    assert.equal(requests, 0);
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
