const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const TelegramService = require('./telegram-service');

test('Telegram connection failures provide safe corrective guidance', async () => {
    const originalPost = axios.post;
    axios.post = async () => {
        const error = new Error('Request failed with status code 400');
        error.response = {
            status: 400,
            data: { ok: false, description: 'Bad Request: chat not found' }
        };
        throw error;
    };

    try {
        const result = await TelegramService.testConnection('test-token', 'wrong-chat-id');
        assert.deepEqual(result, { success: false, message: 'Chat ID를 확인해 주세요.' });
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
        assert.deepEqual(result, { success: false, message: 'Bot Token을 확인해 주세요.' });
    } finally {
        axios.post = originalPost;
    }
});
