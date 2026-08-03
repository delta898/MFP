const test = require('node:test');
const assert = require('node:assert/strict');

const { testModelConnection } = require('./model-connection-tester');
const { createSettingsService } = require('../ui-api/services/settings.service');

function createHttpClient(responseData, calls) {
    return {
        async get(url, config) {
            calls.push({ url, config });
            return { data: responseData };
        }
    };
}

test('checks Gemini text through model metadata without generation', async () => {
    const calls = [];
    const result = await testModelConnection({
        kind: 'text',
        modelConfig: {
            provider: 'google',
            code: 'gemini-3.6-flash',
            api_key: 'gemini-secret'
        },
        httpClient: createHttpClient({
            name: 'models/gemini-3.6-flash',
            supportedGenerationMethods: ['generateContent', 'countTokens']
        }, calls),
        now: (() => {
            const values = [100, 145];
            return () => values.shift();
        })()
    });

    assert.equal(calls[0].url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash');
    assert.equal(calls[0].config.params.key, 'gemini-secret');
    assert.equal(result.generation_performed, false);
    assert.equal(result.check_type, 'metadata');
    assert.equal(result.latency_ms, 45);
});

test('checks OpenAI text and image models through the metadata endpoint', async () => {
    for (const kind of ['text', 'image']) {
        const calls = [];
        const code = kind === 'text' ? 'gpt-5.6-sol' : 'gpt-image-2';
        await testModelConnection({
            kind,
            modelConfig: {
                provider: 'openai',
                code,
                base_url: 'https://api.openai.com/v1',
                api_key: 'openai-secret'
            },
            httpClient: createHttpClient({ id: code, object: 'model' }, calls)
        });

        assert.equal(calls[0].url, `https://api.openai.com/v1/models/${code}`);
        assert.equal(calls[0].config.headers.Authorization, 'Bearer openai-secret');
    }
});

test('checks Claude through its native model metadata endpoint', async () => {
    const calls = [];
    await testModelConnection({
        kind: 'text',
        modelConfig: {
            provider: 'anthropic',
            code: 'claude-opus-5',
            base_url: 'https://api.anthropic.com/v1',
            api_key: 'claude-secret'
        },
        httpClient: createHttpClient({ id: 'claude-opus-5', type: 'model' }, calls)
    });

    assert.equal(calls[0].url, 'https://api.anthropic.com/v1/models/claude-opus-5');
    assert.equal(calls[0].config.headers['x-api-key'], 'claude-secret');
    assert.equal(calls[0].config.headers['anthropic-version'], '2023-06-01');
});

test('checks KIE at provider account level without generation', async () => {
    const calls = [];
    const result = await testModelConnection({
        kind: 'text',
        modelConfig: {
            provider: 'kie',
            code: 'gemini-3-6-flash-openai',
            base_url: 'https://api.kie.ai',
            api_key: 'kie-secret'
        },
        httpClient: createHttpClient({
            code: 200,
            msg: 'success',
            data: 123.45
        }, calls),
        now: (() => {
            const values = [100, 118];
            return () => values.shift();
        })()
    });

    assert.equal(calls[0].url, 'https://api.kie.ai/api/v1/chat/credit');
    assert.equal(calls[0].config.headers.Authorization, 'Bearer kie-secret');
    assert.equal(result.check_type, 'account_credit');
    assert.equal(result.generation_performed, false);
    assert.equal(result.credit_balance, 123.45);
    assert.equal(result.latency_ms, 18);
});

test('checks a KIE image selection at provider account level without generation', async () => {
    const calls = [];
    const result = await testModelConnection({
        kind: 'image',
        modelConfig: {
            provider: 'kie',
            code: 'nano-banana-2',
            base_url: 'https://api.kie.ai',
            api_key: 'kie-secret'
        },
        httpClient: createHttpClient({
            code: 200,
            msg: 'success',
            data: 79.9
        }, calls)
    });

    assert.equal(calls[0].url, 'https://api.kie.ai/api/v1/chat/credit');
    assert.equal(result.check_type, 'account_credit');
    assert.equal(result.generation_performed, false);
    assert.equal(result.credit_balance, 79.9);
});

test('rejects malformed KIE credit responses instead of claiming success', async () => {
    await assert.rejects(
        testModelConnection({
            kind: 'text',
            modelConfig: {
                provider: 'kie',
                code: 'gemini-3-6-flash-openai',
                api_key: 'kie-secret'
            },
            httpClient: createHttpClient({
                code: 200,
                msg: 'success',
                data: null
            }, [])
        }),
        /잔여 크레딧 응답을 확인하지 못했습니다/
    );
});

test('checks a direct OpenAI-compatible model through its model list', async () => {
    const calls = [];
    await testModelConnection({
        kind: 'text',
        modelConfig: {
            provider: 'direct',
            code: 'local-model',
            base_url: 'http://127.0.0.1:1234/v1/'
        },
        httpClient: createHttpClient({
            data: [{ id: 'local-model' }]
        }, calls)
    });

    assert.equal(calls[0].url, 'http://127.0.0.1:1234/v1/models');
    assert.equal(calls[0].config.headers.Authorization, undefined);
});

test('rejects metadata that does not expose generateContent', async () => {
    await assert.rejects(
        testModelConnection({
            kind: 'image',
            modelConfig: {
                provider: 'google',
                code: 'gemini-3.1-flash-image',
                api_key: 'gemini-secret'
            },
            httpClient: createHttpClient({
                name: 'models/gemini-3.1-flash-image',
                supportedActions: ['predict']
            }, [])
        }),
        /generateContent 기능을 지원하지 않습니다/
    );
});

test('returns a concise authentication error without exposing the API key', async () => {
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
                async get() {
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

test('settings service resolves the unsaved catalog selection before checking', async () => {
    let received = null;
    const service = createSettingsService({
        ModelConnectionTester: {
            async testModelConnection(options) {
                received = options;
                return {
                    success: true,
                    check_type: 'metadata',
                    generation_performed: false,
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
    assert.equal(result.generation_performed, false);
});

test('settings service labels a KIE provider-level connection check accurately', async () => {
    const service = createSettingsService({
        ModelConnectionTester: {
            async testModelConnection(options) {
                return {
                    success: true,
                    check_type: 'account_credit',
                    generation_performed: false,
                    kind: options.kind,
                    provider: options.modelConfig.provider,
                    model: options.modelConfig.code,
                    transport: options.modelConfig.transport,
                    credit_balance: 88,
                    latency_ms: 9
                };
            }
        }
    });

    const result = await service.testAiModelConnection({
        kind: 'text',
        provider: 'kie',
        presetCode: 'gemini-3-6-flash-openai',
        apiKey: 'unsaved-kie-secret'
    });

    assert.equal(result.display_name, 'KIE.ai');
    assert.equal(result.check_type, 'account_credit');
    assert.equal(result.credit_balance, 88);
});
