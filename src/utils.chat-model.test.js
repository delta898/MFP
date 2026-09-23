const test = require('node:test');
const assert = require('node:assert/strict');

const Utils = require('./utils');

test('writing and Chat task modes dispatch to their explicit model roles', async () => {
    const originalWriting = Utils.callWritingText;
    const originalChat = Utils.callChatText;
    const calls = [];
    Utils.callWritingText = async (...args) => {
        calls.push({ role: 'writing', args });
        return 'writing-result';
    };
    Utils.callChatText = async (...args) => {
        calls.push({ role: 'chat', args });
        return 'chat-result';
    };

    try {
        assert.equal(await Utils.callTextModelByMode('default', 'write'), 'writing-result');
        assert.equal(await Utils.callTextModelByMode('custom', 'chat'), 'chat-result');
        assert.deepEqual(calls.map((call) => call.role), ['writing', 'chat']);
    } finally {
        Utils.callWritingText = originalWriting;
        Utils.callChatText = originalChat;
    }
});

test('Telegram and Agent Memory always dispatch through the common Chat Model role', async () => {
    const originalChat = Utils.callChatText;
    const calls = [];
    Utils.callChatText = async (prompt, retries, options) => {
        calls.push({ prompt, retries, options });
        return prompt;
    };

    try {
        assert.equal(await Utils.callTelegramChatModel('telegram', 2), 'telegram');
        assert.equal(await Utils.callAgentMemoryModel('memory', 1), 'memory');
        assert.deepEqual(calls.map((call) => call.options.usageLabel), [
            'Telegram Chat Model',
            'Agent Memory AI'
        ]);
    } finally {
        Utils.callChatText = originalChat;
    }
});

test('writing and Chat model roles apply automatic reasoning defaults', async () => {
    const originalCallTextByConfig = Utils.callTextByConfig;
    const calls = [];
    Utils.callTextByConfig = async (_config, _prompt, _retries, options) => {
        calls.push(options);
        return 'ok';
    };

    try {
        await Utils.callWritingText('article');
        await Utils.callChatText('hashtags');
        await Utils.callChatText('legacy', 1, { reasoningEffort: 'minimal' });
        assert.deepEqual(calls.map((options) => options.reasoningEffort), [
            'medium',
            'low',
            'low'
        ]);
    } finally {
        Utils.callTextByConfig = originalCallTextByConfig;
    }
});
