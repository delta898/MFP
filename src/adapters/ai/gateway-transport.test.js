'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createBlogGeniusAiTransport, isAllowedRoute, isPrivateAddress } = require('./gateway-transport');

test('Host transport resolves the configured key internally and restricts provider routes', async () => {
    const calls = [];
    const transport = createBlogGeniusAiTransport({
        config: { AI_MODEL_PROFILES: { text: { openai: { api_key: 'secret-key' } } } },
        fetch: async (url, init) => {
            calls.push({ url: String(url), init });
            return { status: 200, headers: {}, async json() { return { choices: [] }; } };
        }
    });
    const response = await transport.request({
        provider: 'openai', kind: 'text', modelId: 'gpt-6-astra',
        method: 'POST', path: '/v1/chat/completions', body: { model: 'gpt-6-astra' }
    });
    assert.equal(response.status, 200);
    assert.equal(calls[0].url, 'https://api.openai.com/v1/chat/completions');
    assert.equal(calls[0].init.headers.Authorization, 'Bearer secret-key');
    assert.equal(JSON.stringify(response).includes('secret-key'), false);
    await assert.rejects(transport.request({
        provider: 'openai', kind: 'text', modelId: 'gpt-6-astra', method: 'POST', path: '/v1/chat/completions?url=http://127.0.0.1'
    }), /path/);
    await assert.rejects(transport.request({
        provider: 'openai', kind: 'text', modelId: 'gpt-6-astra', method: 'POST', path: '/v1/other'
    }), { code: 'AI_GATEWAY_UNSUPPORTED_ROUTE' });
    assert.equal(isAllowedRoute({ provider: 'kie', kind: 'image', modelId: 'nano-banana-pro', method: 'POST', path: '/api/v1/jobs/createTask' }), true);
});

test('Host image downloads reject non-HTTPS and private destinations and enforce size', async () => {
    const urls = [];
    const transport = createBlogGeniusAiTransport({
        lookup: async () => [{ address: '8.8.8.8', family: 4 }],
        fetch: async (url) => {
            urls.push(String(url));
            return {
                ok: true,
                headers: { get(name) { return name === 'content-type' ? 'image/png' : '3'; } },
                async arrayBuffer() { return Uint8Array.from([1, 2, 3]).buffer; }
            };
        }
    });
    const result = await transport.downloadUrl({ provider: 'kie', url: 'https://images.example/image.png' });
    assert.equal(result.bytes.byteLength, 3);
    assert.equal(urls.length, 1);
    await assert.rejects(transport.downloadUrl({ url: 'http://images.example/a.png' }), /not allowed/);
    await assert.rejects(transport.downloadUrl({ url: 'https://127.0.0.1/a.png' }), /not allowed/);
    assert.equal(isPrivateAddress('192.168.0.1'), true);
    assert.equal(isPrivateAddress('fd00::1'), true);
});
