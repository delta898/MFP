const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const Utils = require('./utils');

const heartbeat = { runWithHeartbeat: async (_label, task) => task(), sleep: async () => {} };

function abortablePost(calls) {
    return (url, _body, config) => {
        calls.push({ url, config });
        return new Promise((_resolve, reject) => {
            config.signal.addEventListener('abort', () => {
                reject(Object.assign(new Error('canceled'), { code: 'ERR_CANCELED' }));
            }, { once: true });
        });
    };
}

test('Gemini text aborts an active HTTP request without retrying', async () => {
    const controller = new AbortController();
    const calls = [];
    const previousPost = axios.post;
    axios.post = abortablePost(calls);
    try {
        const pending = Utils.callGeminiText.call(heartbeat, 'prompt', 3, {
            apiKey: 'fixture-key', provider: 'google', modelCode: 'gemini-3-flash',
            signal: controller.signal, logStart: false
        });
        await new Promise((resolve) => setImmediate(resolve));
        controller.abort();
        await assert.rejects(pending, (error) => error.code === 'AI_GENERATION_CANCELED');
        assert.equal(calls.length, 1);
    assert.equal(calls[0].config.signal, controller.signal);
    } finally {
        axios.post = previousPost;
    }
});

test('OpenAI-compatible text transports share the abort contract', async () => {
    const models = [
        { provider: 'openai', code: 'gpt-6-sol', base_url: 'https://api.openai.com/v1' },
        { provider: 'anthropic', code: 'claude-fable-5-1', base_url: 'https://api.anthropic.com/v1' },
        { provider: 'kie', code: 'gpt-5-6-sol', base_url: 'https://api.kie.ai' },
        { provider: 'kie', code: 'gemini-3-6-flash-openai', base_url: 'https://api.kie.ai' }
    ];
    const previousPost = axios.post;
    const calls = [];
    axios.post = abortablePost(calls);
    try {
        for (const model of models) {
            const controller = new AbortController();
            const pending = Utils.callOpenAiCompatibleTextByConfig.call(heartbeat, {
                ...model, api_key: 'fixture-key'
            }, 'prompt', 3, { signal: controller.signal, logStart: false });
            await new Promise((resolve) => setImmediate(resolve));
            controller.abort();
            await assert.rejects(pending, (error) => error.code === 'AI_GENERATION_CANCELED');
        }
        assert.equal(calls.length, models.length);
        assert.ok(calls.every((call) => call.config.signal));
        assert.match(calls[0].url, /api[.]openai[.]com\/v1\/chat\/completions/);
        assert.match(calls[1].url, /api[.]anthropic[.]com\/v1\/chat\/completions/);
        assert.match(calls[2].url, /api[.]kie[.]ai\/codex\/v1\/responses/);
        assert.match(calls[3].url, /api[.]kie[.]ai\/gemini-3-6-flash-openai\/v1\/chat\/completions/);
    } finally {
        axios.post = previousPost;
    }
});

test('abort during retry delay prevents a second text request', async () => {
    const controller = new AbortController();
    const previousPost = axios.post;
    let calls = 0;
    axios.post = async () => {
        calls += 1;
        throw Object.assign(new Error('temporary outage'), { response: { status: 503 } });
    };
    try {
        const startedAt = Date.now();
        await assert.rejects(
            Utils.callOpenAiCompatibleTextByConfig.call(heartbeat, {
                provider: 'openai', code: 'gpt-6-sol', api_key: 'fixture-key',
                base_url: 'https://api.openai.com/v1'
            }, 'prompt', 3, {
                signal: controller.signal,
                logStart: false,
                onRetry: () => setTimeout(() => controller.abort(), 10)
            }),
            (error) => error.code === 'AI_GENERATION_CANCELED'
        );
        assert.equal(calls, 1);
        assert.ok(Date.now() - startedAt < 500);
    } finally {
        axios.post = previousPost;
    }
});

test('writing model accepts a per-operation selection instead of reading a later global setting', async () => {
    const previous = Utils.callTextByConfig;
    const selected = { provider: 'openai', code: 'gpt-6-sol' };
    let seen;
    Utils.callTextByConfig = async (modelConfig) => { seen = modelConfig; return 'ok'; };
    try {
        assert.equal(await Utils.callWritingText('prompt', 1, { modelConfig: selected }), 'ok');
        assert.equal(seen, selected);
    } finally {
        Utils.callTextByConfig = previous;
    }
});
