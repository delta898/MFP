'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createBlogGeniusAiTransport, isAllowedRoute, isPrivateAddress, sanitizeProviderDiagnostic } = require('./gateway-transport');

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

test('direct OpenAI-compatible requests use only the Host profile endpoint and allow keyless local models', async () => {
    const calls = [];
    const transport = createBlogGeniusAiTransport({
        config: { AI_MODEL_PROFILES: { text: { direct: {
            provider: 'direct', code: 'local-text-v1', base_url: 'http://127.0.0.1:1234/v1', api_key: ''
        } } } },
        fetch: async (url, init) => {
            calls.push({ url: String(url), init });
            return { status: 200, headers: {}, async json() { return { choices: [] }; } };
        }
    });
    await transport.request({
        provider: 'direct', kind: 'text', modelId: 'local-text-v1', method: 'POST',
        path: '/chat/completions', body: { model: 'local-text-v1' }
    });
    assert.equal(calls[0].url, 'http://127.0.0.1:1234/v1/chat/completions');
    assert.equal(Object.hasOwn(calls[0].init.headers, 'Authorization'), false);
    await assert.rejects(transport.request({
        provider: 'direct', kind: 'text', modelId: 'other-model', method: 'POST',
        path: '/chat/completions', body: {}
    }), { code: 'AI_GATEWAY_UNSUPPORTED_ROUTE' });
    await assert.rejects(transport.request({
        provider: 'direct', kind: 'text', modelId: 'local-text-v1', method: 'POST', path: '/admin'
    }), { code: 'AI_GATEWAY_UNSUPPORTED_ROUTE' });
});

test('direct transport validates configured origins and attaches the Host-owned optional key', async () => {
    const calls = [];
    const config = { AI_MODEL_PROFILES: { image: { direct: {
        provider: 'direct', code: 'remote-image-v1', base_url: 'https://images.example/custom/v1', api_key: 'profile-secret'
    } } } };
    const transport = createBlogGeniusAiTransport({
        config,
        fetch: async (url, init) => {
            calls.push({ url: String(url), init });
            return { status: 200, headers: {}, async json() { return {}; } };
        }
    });
    await transport.request({
        provider: 'direct', kind: 'image', modelId: 'remote-image-v1', method: 'POST',
        path: '/images/generations', body: { model: 'remote-image-v1' }
    });
    assert.equal(calls[0].url, 'https://images.example/custom/v1/images/generations');
    assert.equal(calls[0].init.headers.Authorization, 'Bearer profile-secret');
    config.AI_MODEL_PROFILES.image.direct.base_url = 'https://user:pass@images.example/v1';
    await assert.rejects(transport.request({
        provider: 'direct', kind: 'image', modelId: 'remote-image-v1', method: 'POST',
        path: '/images/generations', body: {}
    }), /cannot contain credentials/);
    config.AI_MODEL_PROFILES.image.direct.base_url = 'http://images.example/v1';
    await assert.rejects(transport.request({
        provider: 'direct', kind: 'image', modelId: 'remote-image-v1', method: 'POST',
        path: '/images/generations', body: {}
    }), /must use HTTPS/);
});

test('Host transport returns bounded provider diagnostics with keys and echoed prompts redacted', async () => {
    const prompt = 'A detailed private prompt that must never appear in diagnostic logs.';
    const transport = createBlogGeniusAiTransport({
        config: { AI_MODEL_PROFILES: { text: { openai: { api_key: 'secret-key-value' } } } },
        fetch: async () => ({
            status: 400,
            headers: { 'x-request-id': 'req-123' },
            async json() {
                return { error: {
                    code: 'invalid_request_error',
                    message: `Invalid request for prompt ${prompt}; token secret-key-value was rejected.`
                } };
            }
        })
    });
    const result = await transport.request({
        provider: 'openai', kind: 'text', modelId: 'gpt-6-astra', method: 'POST',
        path: '/v1/chat/completions', body: { messages: [{ role: 'user', content: prompt }] }
    });
    assert.deepEqual(result.providerError, {
        code: 'invalid_request_error',
        message: 'Provider error message redacted because it echoed request content.'
    });
    assert.equal(JSON.stringify(result.providerError).includes(prompt), false);
    assert.equal(JSON.stringify(result.providerError).includes('secret-key-value'), false);
    const keyOnlyDiagnostic = sanitizeProviderDiagnostic('Invalid credential secret-key-value was rejected.', { apiKey: 'secret-key-value' });
    assert.equal(keyOnlyDiagnostic, 'Invalid credential [redacted] was rejected.');
});
