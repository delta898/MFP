'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createPlugin, describeSupport } = require('./index');
const { resolveGatewayModels } = require('../../../../src/ai/gateway-model-resolver');
const { createCorePluginRegistry } = require('../../../../src/composition/core-plugin-registry');
const { createPluginHost } = require('../../../../src/platform/plugin-host');

test('Gateway discovers only Catalog models with matching supported provider and transport', () => {
    const catalog = {
        text: [
            { provider: 'openai', code: 'gpt-6-astra', transport: 'openai_chat_completions' },
            { provider: 'kie', code: 'unknown', transport: 'kie_responses' },
            { provider: 'direct', code: 'custom', transport: 'openai_chat_completions' }
        ],
        image: [{ provider: 'kie', code: 'nano-banana-pro', transport: 'kie_market_image_jobs' }]
    };
    const text = resolveGatewayModels('text', catalog);
    assert.equal(text.length, 1);
    assert.equal(text[0].code, 'gpt-6-astra');
    assert.equal(resolveGatewayModels('image', catalog).length, 1);
    assert.ok(Object.isFrozen(describeSupport().routes));
});

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
    assert.equal(Object.hasOwn(requests[0], 'apiKey'), false);
    assert.equal(Object.hasOwn(requests[0], 'headers'), false);
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
        input: { prompt: 'a tree' }, options: { aspectRatio: '1:1', size: '1K' }
    }, { reportProgress: (event) => events.push(event) });
    assert.equal(result.images.length, 1);
    assert.equal(Buffer.from(result.images[0].dataBase64, 'base64').toString(), 'png-data');
    assert.deepEqual(events.map((event) => event.phase), ['submitted', 'generating', 'downloading']);
    assert.equal(requests.length, 3);
    assert.deepEqual(requests[0].body.input, {
        prompt: 'a tree', aspect_ratio: '1:1', image_input: [], resolution: '1K', output_format: 'png'
    });
});

test('image operation rejects a size that the selected model cannot execute', async () => {
    const plugin = createPlugin({ transport: { async request() { throw new Error('should not execute'); } } });
    await assert.rejects(plugin.operations['image.generate'].execute({
        model: { provider: 'kie', modelId: 'nano-banana-2-lite' },
        input: { prompt: 'a tree' }, options: { size: '2K' }
    }), (error) => error.code === 'AI_GATEWAY_UNSUPPORTED_CAPABILITY');
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
