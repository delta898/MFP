const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const axios = require('axios');

const Utils = require('./utils');

const HEARTBEAT = { runWithHeartbeat: async (_label, fn) => fn() };

function mockAxiosPost(handler) {
    const original = axios.post;
    axios.post = handler;
    return () => { axios.post = original; };
}

function imageResponse() {
    return { data: { candidates: [{ content: { parts: [{ inlineData: { data: Buffer.from('img').toString('base64') } }] } }] } };
}

function textResponse() {
    return { data: { candidates: [{ content: { parts: [{ text: 'hello' }] } }] } };
}

test('Gemini image call posts to the fixed address even with a tampered base URL', async () => {
    const seen = {};
    const restore = mockAxiosPost(async (url) => {
        seen.url = url;
        return imageResponse();
    });
    const savePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-img-')), 'out');
    try {
        await Utils.callGeminiImage.call(HEARTBEAT, 'prompt', savePath, 1, {
            apiKey: 'secret-key',
            provider: 'google',
            baseUrl: 'https://attacker.example/v1',
            modelCode: 'gemini-3-pro-image'
        });
    } finally {
        restore();
    }
    assert.equal(
        seen.url,
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image:generateContent?key=secret-key'
    );
    assert.ok(fs.existsSync(`${savePath}.png`));
});

test('Gemini image call honors custom base URLs only for direct providers', async () => {
    const seen = {};
    const restore = mockAxiosPost(async (url) => {
        seen.url = url;
        return imageResponse();
    });
    const savePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-img-')), 'out');
    try {
        await Utils.callGeminiImage.call(HEARTBEAT, 'prompt', savePath, 1, {
            apiKey: 'secret-key',
            provider: 'direct',
            baseUrl: 'https://my-gateway.example/v1/',
            modelCode: 'my-model'
        });
    } finally {
        restore();
    }
    assert.equal(seen.url, 'https://my-gateway.example/v1/models/my-model:generateContent?key=secret-key');
});

test('Gemini image cancellation does not save a late response or retry', async () => {
    const controller = new AbortController();
    let posts = 0;
    const restore = mockAxiosPost(async () => {
        posts += 1;
        controller.abort();
        return imageResponse();
    });
    const savePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-cancel-')), 'out');
    try {
        await assert.rejects(
            Utils.callGeminiImage.call(HEARTBEAT, 'prompt', savePath, 3, {
                apiKey: 'key', provider: 'google', modelCode: 'gemini-3-pro-image', signal: controller.signal
            }),
            (error) => error.code === 'AI_GENERATION_CANCELED'
        );
    } finally { restore(); }
    assert.equal(posts, 1);
    assert.equal(fs.existsSync(`${savePath}.png`), false);
});

test('OpenAI image cancellation does not save a late response or retry', async () => {
    const controller = new AbortController();
    let posts = 0;
    const restore = mockAxiosPost(async () => {
        posts += 1;
        controller.abort();
        return { data: { data: [{ b64_json: Buffer.from('image').toString('base64') }] } };
    });
    const savePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'openai-cancel-')), 'out');
    try {
        await assert.rejects(
            Utils.callOpenAiCompatibleImageByConfig.call(HEARTBEAT, {
                provider: 'openai', code: 'gpt-image-2', transport: 'openai_images',
                base_url: 'https://api.openai.com/v1', api_key: 'key'
            }, 'prompt', savePath, 3, { signal: controller.signal }),
            (error) => error.code === 'AI_GENERATION_CANCELED'
        );
    } finally { restore(); }
    assert.equal(posts, 1);
    assert.equal(fs.existsSync(`${savePath}.png`), false);
});

test('Gemini image call fails with a clear error instead of ReferenceError', async () => {
    await assert.rejects(
        Utils.callGeminiImage.call(HEARTBEAT, 'prompt', path.join(os.tmpdir(), 'nope'), 1, {
            apiKey: 'secret-key',
            provider: 'google',
            baseUrl: '',
            modelCode: ''
        }),
        /모델 주소 정보/
    );
});

test('Gemini text call posts to the fixed address even with a tampered base URL', async () => {
    const seen = {};
    const restore = mockAxiosPost(async (url) => {
        seen.url = url;
        return textResponse();
    });
    try {
        const text = await Utils.callGeminiText.call(HEARTBEAT, 'prompt', 1, {
            apiKey: 'secret-key',
            provider: 'google',
            baseUrl: 'https://attacker.example/v1',
            modelCode: 'gemini-3-flash',
            usageLabel: 'test',
            logStart: false
        });
        assert.equal(text, 'hello');
    } finally {
        restore();
    }
    assert.equal(
        seen.url,
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash:generateContent?key=secret-key'
    );
});

test('Gemini text Invalid URL error includes the safe endpoint without the API key', async () => {
    const invalidUrlError = Object.assign(new Error('Invalid URL'), { code: 'ERR_INVALID_URL' });
    const restore = mockAxiosPost(async () => { throw invalidUrlError; });
    try {
        await assert.rejects(
            Utils.callGeminiText.call(HEARTBEAT, 'prompt', 1, {
                apiKey: 'must-not-appear',
                provider: 'google',
                modelCode: 'gemini-3-flash',
                usageLabel: '테스트 모델',
                logStart: false
            }),
            (error) => {
                assert.match(error.message, /Invalid URL/);
                assert.match(error.message, /generativelanguage[.]googleapis[.]com/);
                assert.doesNotMatch(error.message, /must-not-appear/);
                return true;
            }
        );
    } finally {
        restore();
    }
});

test('Gemini image Invalid URL error includes the safe endpoint without the API key', async () => {
    const invalidUrlError = Object.assign(new Error('Invalid URL'), { code: 'ERR_INVALID_URL' });
    const restore = mockAxiosPost(async () => { throw invalidUrlError; });
    try {
        await assert.rejects(
            Utils.callGeminiImage.call(HEARTBEAT, 'prompt', path.join(os.tmpdir(), 'invalid-url-image'), 1, {
                apiKey: 'must-not-appear',
                provider: 'google',
                modelCode: 'gemini-3-pro-image'
            }),
            (error) => {
                assert.match(error.message, /Invalid URL/);
                assert.match(error.message, /generativelanguage[.]googleapis[.]com/);
                assert.doesNotMatch(error.message, /must-not-appear/);
                return true;
            }
        );
    } finally {
        restore();
    }
});
