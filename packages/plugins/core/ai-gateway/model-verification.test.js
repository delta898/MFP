'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createPlugin } = require('./index');

function createVerificationPlugin(response, options = {}) {
    const requests = [];
    const plugin = createPlugin({
        getProviderProfile: async () => ({ api_key: 'verification-secret' }),
        transport: {
            async request() { throw new Error('verification must not generate content'); },
            async inspectModel(input) {
                requests.push(input);
                if (options.error) throw options.error;
                return { status: 200, body: response };
            }
        },
        now: (() => { const times = [100, 124]; return () => times.shift(); })()
    });
    return { plugin, requests };
}

test('models.verify checks metadata without generation and returns normalized model identity', async () => {
    const { plugin, requests } = createVerificationPlugin({
        name: 'models/gemini-3.7-flash',
        supportedGenerationMethods: ['generateContent']
    });
    const result = await plugin.operations['models.verify'].execute({
        kind: 'text', model: { provider: 'google', modelId: 'gemini-3.7-flash', transport: 'gemini_generate_content' },
        profileRef: '0a1b2c3d-4e5f-4678-9012-123456789abc'
    });
    assert.deepEqual(requests[0], {
        kind: 'text', provider: 'google', modelId: 'gemini-3.7-flash', transport: 'gemini_generate_content',
        profileRef: '0a1b2c3d-4e5f-4678-9012-123456789abc',
        signal: undefined, timeoutMs: 15000
    });
    assert.equal(result.generation_performed, false);
    assert.equal(result.check_type, 'metadata');
    assert.equal(result.latency_ms, 24);
});

test('models.verify accepts a dated Anthropic alias and rejects another model', async () => {
    const { plugin } = createVerificationPlugin({ id: 'claude-haiku-4-5-20261001' });
    const result = await plugin.operations['models.verify'].execute({
        kind: 'text', model: { provider: 'anthropic', modelId: 'claude-haiku-4-5' }
    });
    assert.equal(result.success, true);

    const mismatch = createVerificationPlugin({ id: 'claude-sonnet-4-5-20261001' }).plugin;
    await assert.rejects(mismatch.operations['models.verify'].execute({
        kind: 'text', model: { provider: 'anthropic', modelId: 'claude-haiku-4-5' }
    }), /서버가 다른 모델 정보를 반환했습니다/);
});

test('models.verify checks KIE account credit and validates the response', async () => {
    const { plugin } = createVerificationPlugin({ code: 200, data: 88.5 });
    const result = await plugin.operations['models.verify'].execute({
        kind: 'image', model: { provider: 'kie', modelId: 'nano-banana-pro', transport: 'kie_market_image_jobs' }
    });
    assert.equal(result.check_type, 'account_credit');
    assert.equal(result.credit_balance, 88.5);
    assert.equal(result.generation_performed, false);

    const malformed = createVerificationPlugin({ code: 200, data: null }).plugin;
    await assert.rejects(malformed.operations['models.verify'].execute({
        kind: 'image', model: { provider: 'kie', modelId: 'nano-banana-pro' }
    }), /잔여 크레딧 응답을 확인하지 못했습니다/);
});

test('models.verify finds direct models in /models and keeps provider errors safe', async () => {
    const direct = createVerificationPlugin({ data: [{ id: 'local-model' }] }).plugin;
    const result = await direct.operations['models.verify'].execute({
        kind: 'text', model: { provider: 'direct', modelId: 'local-model', transport: 'openai_chat_completions' }
    });
    assert.equal(result.model, 'local-model');

    const failed = createVerificationPlugin(null, {
        error: Object.assign(new Error('invalid key'), { status: 401 })
    }).plugin;
    await assert.rejects(failed.operations['models.verify'].execute({
        kind: 'text', model: { provider: 'openai', modelId: 'gpt-6-sol' }
    }), (error) => error.code === 'AI_MODEL_CONNECTION_CHECK_FAILED' && error.status === 401);
});
