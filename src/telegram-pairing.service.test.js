'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createTelegramPairingService } = require('./telegram-pairing.service');

class FakeBot extends EventEmitter {
    static instances = [];
    constructor(token) { super(); this.token = token; this.sent = []; FakeBot.instances.push(this); }
    async startPolling() { this.started = true; }
    async stopPolling(options) { this.started = false; this.stopOptions = options; }
    async sendMessage(chatId, text) { this.sent.push({ chatId, text }); }
}

function setup(config = {}) {
    FakeBot.instances = [];
    const calls = [];
    const TelegramBotService = {
        getStatus: () => ({ running: false }),
        async stop() { calls.push('stop'); },
        init() { calls.push('init'); }
    };
    return {
        calls,
        service: createTelegramPairingService({
            TelegramBot: FakeBot,
            TelegramBotService,
            CONFIG: { NOTIFY_TELEGRAM_INBOUND_ENABLED: false, ...config }
        })
    };
}

test('Telegram pairing accepts only the private-chat deep-link start and verifies its one-time code', async () => {
    const { service } = setup();
    const started = await service.start({ botToken: 'token', username: 'example_bot' });
    assert.match(started.deepLink, /^https:\/\/t\.me\/example_bot\?start=bg_/);
    const bot = FakeBot.instances[0];
    const payload = new URL(started.deepLink).searchParams.get('start');
    await bot.listeners('message')[0]({ chat: { id: 123, type: 'group' }, text: `/start ${payload}` });
    assert.equal(bot.sent.length, 0);
    await bot.listeners('message')[0]({ chat: { id: 456, type: 'private' }, text: '/start wrong' });
    assert.equal(bot.sent.length, 0);
    await bot.listeners('message')[0]({ chat: { id: 456, type: 'private' }, text: `/start ${payload}` });
    assert.equal(bot.sent.length, 1);
    const code = bot.sent[0].text.match(/<code>([A-Z2-9]+)<\/code>/)[1];
    await assert.rejects(
        service.complete({ sessionId: started.sessionId, code: 'BADCODE1' }),
        (error) => error.code === 'TELEGRAM_PAIRING_CODE_INVALID'
    );
    const result = await service.complete({ sessionId: started.sessionId, code: code.toLowerCase() });
    assert.deepEqual(result, { botToken: 'token', chatId: '456' });
    assert.equal(bot.started, false);
});

test('pairing rejects a wrong code and cancel resumes configured inbound polling', async () => {
    const { service, calls } = setup({
        NOTIFY_TELEGRAM_INBOUND_ENABLED: true,
        NOTIFY_TELEGRAM_BOT_TOKEN: 'saved-token',
        NOTIFY_TELEGRAM_CHAT_ID: 'saved-chat'
    });
    const started = await service.start({ botToken: 'new-token', username: 'example_bot' });
    await assert.rejects(
        service.complete({ sessionId: started.sessionId, code: 'BADCODE1' }),
        (error) => error.code === 'TELEGRAM_PAIRING_NOT_STARTED'
    );
    await service.cancel();
    assert.deepEqual(calls, ['init']);
    assert.deepEqual(FakeBot.instances[0].stopOptions, { cancel: true, reason: 'Telegram pairing cancelled' });
});
