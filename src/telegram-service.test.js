const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const TelegramService = require('./telegram-service');

test('Telegram connection failures provide safe corrective guidance', async () => {
    const originalPost = axios.post;
    axios.post = async (url) => {
        if (String(url).endsWith('/getMe')) return { data: { ok: true } };
        const error = new Error('Request failed with status code 400');
        error.response = {
            status: 400,
            data: { ok: false, description: 'Bad Request: chat not found' }
        };
        throw error;
    };

    try {
        const result = await TelegramService.testConnection('test-token', 'wrong-chat-id');
        assert.equal(result.success, false);
        assert.equal(result.stage, 'chat');
        assert.equal(result.category, 'chat_not_found');
        assert.match(result.message, /Chat ID.*\/start/);
    } finally {
        axios.post = originalPost;
    }
});

test('Telegram connection failures identify an invalid bot token', async () => {
    const originalPost = axios.post;
    axios.post = async () => {
        const error = new Error('Request failed with status code 401');
        error.response = {
            status: 401,
            data: { ok: false, description: 'Unauthorized' }
        };
        throw error;
    };

    try {
        const result = await TelegramService.testConnection('invalid-token', 'test-chat-id');
        assert.equal(result.success, false);
        assert.equal(result.stage, 'token');
        assert.equal(result.category, 'token_invalid');
        assert.match(result.message, /Bot Token.*BotFather/);
    } finally {
        axios.post = originalPost;
    }
});

test('Telegram connection verification checks token, chat, and message in order', async () => {
    const originalPost = axios.post;
    const methods = [];
    axios.post = async (url) => {
        methods.push(String(url).split('/').pop());
        return { status: 200, data: { ok: true } };
    };

    try {
        const result = await TelegramService.testConnection('valid-token', '123456');
        assert.deepEqual(methods, ['getMe', 'getChat', 'sendMessage']);
        assert.deepEqual(result, {
            success: true,
            stage: 'complete',
            message: '연결됨 · 테스트 메시지를 전송했습니다.'
        });
    } finally {
        axios.post = originalPost;
    }
});

test('Telegram retries a family-selection network failure over IPv4 without exposing credentials', async () => {
    const originalPost = axios.post;
    const calls = [];
    axios.post = async (_url, _body, config = {}) => {
        calls.push(Boolean(config.httpsAgent));
        if (config.httpsAgent) return { status: 200, data: { ok: true } };
        const ipv4 = Object.assign(new Error('connect timeout'), { code: 'ETIMEDOUT', address: '149.154.166.110' });
        const ipv6 = Object.assign(new Error('host unreachable'), { code: 'EHOSTUNREACH', address: '2001:db8::1' });
        const aggregate = new AggregateError([ipv4, ipv6]);
        throw Object.assign(new Error('EFATAL: AggregateError'), { code: 'EFATAL', cause: aggregate });
    };

    try {
        const result = await TelegramService.testConnection('123456:SECRET_TOKEN', '123456');
        assert.equal(result.success, true);
        assert.deepEqual(calls, [false, true, false, true, false, true]);
    } finally {
        axios.post = originalPost;
    }
});
