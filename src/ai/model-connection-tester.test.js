const test = require('node:test');
const assert = require('node:assert/strict');

const {
    testModelConnection
} = require('./model-connection-tester');
const { createSettingsService } = require('../ui-api/services/settings.service');

function createHttpClient(responseData, calls) {
    return {
        async post(url, body, config) {
            calls.push({ url, body, config });
            return { data: responseData };
        }
    };
}

test('tests Gemini text with a minimal native request', async () => {
    const calls = [];
    const result = await testModelConnection({
        kind: 'text',
        modelConfig: {
            provider: 'gemini',
            code: 'gemini-3.6-flash',
            api_key: 'gemini-secret'
        },
        httpClient: createHttpClient({
            candidates: [{ content: { parts: [{ text: 'OK' }] } }]
        }, calls),
        now: (() => {
            const values = [100, 145];
            return () => values.shift();
        })()
    });

    assert.equal(calls[0].url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent');
    assert.equal(calls[0].config.params.key, 'gemini-secret');
    assert.equal(calls[0].body.generationConfig.maxOutputTokens, 16);
    assert.equal(result.latency_ms, 45);
    assert.equal(result.transport, 'gemini_generate_content');
});

test('tests OpenAI text with the catalog runtime request policy', async () => {
    const calls = [];
    await testModelConnection({
        kind: 'text',
        modelConfig: {
            provider: 'openai',
            code: 'gpt-5.6-sol',
            base_url: 'https://api.openai.com/v1',
            api_key: 'openai-secret'
        },
        httpClient: createHttpClient({
            choices: [{ message: { content: 'OK' } }]
        }, calls)
    });

    assert.equal(calls[0].url, 'https://api.openai.com/v1/chat/completions');
    assert.equal(calls[0].body.max_completion_tokens, 32);
    assert.equal(calls[0].config.headers.Authorization, 'Bearer openai-secret');
});

test('tests direct OpenAI-compatible text without requiring an API key', async () => {
    const calls = [];
    await testModelConnection({
        kind: 'text',
        modelConfig: {
            provider: 'direct',
            code: 'local-model',
            base_url: 'http://127.0.0.1:1234/v1/'
        },
        httpClient: createHttpClient({
            choices: [{ message: { content: [{ type: 'text', text: 'OK' }] } }]
        }, calls)
    });

    assert.equal(calls[0].url, 'http://127.0.0.1:1234/v1/chat/completions');
    assert.equal(calls[0].config.headers.Authorization, undefined);
});

test('tests Gemini and Imagen image transports without returning image bytes', async () => {
    const geminiCalls = [];
    const geminiResult = await testModelConnection({
        kind: 'image',
        modelConfig: {
            provider: 'gemini',
            code: 'gemini-3.1-flash-image',
            api_key: 'gemini-secret'
        },
        httpClient: createHttpClient({
            candidates: [{ content: { parts: [{ inlineData: { data: 'aW1hZ2U=' } }] } }]
        }, geminiCalls)
    });
    assert.equal(geminiCalls[0].body.generationConfig.responseModalities[0], 'IMAGE');
    assert.equal(geminiResult.model, 'gemini-3.1-flash-image');

    const imagenCalls = [];
    await testModelConnection({
        kind: 'image',
        modelConfig: {
            provider: 'imagen4',
            code: 'imagen-4.0-generate-001',
            api_key: 'gemini-secret'
        },
        httpClient: createHttpClient({
            predictions: [{ bytesBase64Encoded: 'aW1hZ2U=' }]
        }, imagenCalls)
    });
    assert.match(imagenCalls[0].url, /:predict$/);
    assert.equal(imagenCalls[0].config.headers['x-goog-api-key'], 'gemini-secret');
});

test('uses the lowest supported quality for an OpenAI image test', async () => {
    const calls = [];
    await testModelConnection({
        kind: 'image',
        modelConfig: {
            provider: 'openai',
            code: 'gpt-image-2',
            base_url: 'https://api.openai.com/v1',
            api_key: 'openai-secret'
        },
        httpClient: createHttpClient({
            data: [{ b64_json: 'aW1hZ2U=' }]
        }, calls)
    });

    assert.equal(calls[0].url, 'https://api.openai.com/v1/images/generations');
    assert.equal(calls[0].body.size, '1024x1024');
    assert.equal(calls[0].body.quality, 'low');
});

test('returns a concise remote error without exposing the API key', async () => {
    await assert.rejects(
        testModelConnection({
            kind: 'text',
            modelConfig: {
                provider: 'openai',
                code: 'gpt-5.6-sol',
                base_url: 'https://api.openai.com/v1',
                api_key: 'do-not-expose'
            },
            httpClient: {
                async post() {
                    const error = new Error('request failed');
                    error.response = {
                        status: 401,
                        data: { error: { message: 'Invalid credential' } }
                    };
                    throw error;
                }
            }
        }),
        (error) => {
            assert.equal(error.message, 'HTTP 401: Invalid credential');
            assert.doesNotMatch(error.message, /do-not-expose/);
            return true;
        }
    );
});

test('settings service resolves the unsaved catalog selection before testing', async () => {
    let received = null;
    const service = createSettingsService({
        ModelConnectionTester: {
            async testModelConnection(options) {
                received = options;
                return {
                    success: true,
                    kind: options.kind,
                    provider: options.modelConfig.provider,
                    model: options.modelConfig.code,
                    transport: options.modelConfig.transport,
                    latency_ms: 12
                };
            }
        }
    });

    const result = await service.testAiModelConnection({
        kind: 'text',
        provider: 'openai',
        presetCode: 'gpt-5.6-terra',
        apiKey: 'unsaved-secret'
    });

    assert.equal(received.modelConfig.name, 'GPT-5.6 Terra');
    assert.equal(received.modelConfig.api_key, 'unsaved-secret');
    assert.equal(result.display_name, 'GPT-5.6 Terra');
    assert.equal(result.latency_ms, 12);
});
