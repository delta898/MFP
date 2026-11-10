'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, 'bot-service.js'), 'utf8');

test('Telegram inbound polling uses IPv4 compatibility and delayed auto-start', () => {
    assert.match(source, /request:\s*\{ family: 4 \}/);
    assert.match(source, /autoStart: false/);
    assert.match(source, /this[.]setupListeners\(chatId\)[\s\S]{0,200}this[.]bot[.]startPolling/);
});

test('Telegram polling logs safe diagnostics and applies bounded backoff', () => {
    assert.match(source, /POLLING_ERROR_THRESHOLD = 8/);
    assert.match(source, /POLLING_MAX_BACKOFF_MS = 30000/);
    assert.match(source, /calculatePollingBackoffMs/);
    assert.match(source, /formatTelegramDiagnostic\(details\)/);
    assert.match(source, /recordPollingSuccess\(\)/);
    assert.doesNotMatch(source, /Polling Error .*error[.]message/);
});

test('Telegram /start and /help route through the Agent help capability', () => {
    assert.match(source, /handleCommand\(chatId, text, msg\)/);
    assert.match(source, /handleRoutedTelegramMessage\(chatId, commandText, msg, \{ preParsedEnvelope \}\)/);
    assert.doesNotMatch(source, /에이전트에게 이렇게 명령해 보세요/);
});

test('Telegram callback uses the originating chat identity for the real confirmation runtime', async () => {
    const Telegram = require('./bot-service');
    const { createAgentRuntime } = require('../../../host/agent/runtime');
    const { ConfirmationStore } = require('../../storage/confirmations/confirmation-store');
    const store = new ConfirmationStore();
    let executions = 0;
    const runtime = createAgentRuntime({ confirmationStore: store, capabilityRegistry: {
        async executeAction() { executions++; return { success: true, message: 'ok', data: {}, sideEffects: [] }; }
    } });
    store.create({ id: 'confirm_test', channel: 'telegram', userId: '123', conversationId: 'telegram:123', actions: [{ id: 'a', domain: 'example', name: 'run' }] });
    const original = { ensureAgentRuntime: Telegram.ensureAgentRuntime, bot: Telegram.bot, pendingOptionalInputs: Telegram.pendingOptionalInputs };
    Telegram.ensureAgentRuntime = () => runtime;
    Telegram.pendingOptionalInputs = new Map();
    Telegram.bot = { async answerCallbackQuery() {}, async editMessageReplyMarkup() {}, async editMessageText() {} };
    try {
        await Telegram.handleAgentCallback('456', 1, 'agent_confirm:confirm_test', { id: 'query', message: {} });
        assert.equal(store.get('confirm_test').status, 'pending');
        assert.equal(executions, 0);
        await Telegram.handleAgentCallback('123', 1, 'agent_confirm:confirm_test', { id: 'query', message: {} });
        assert.equal(store.get('confirm_test').status, 'executed');
        assert.equal(executions, 1);
    } finally {
        Object.assign(Telegram, original);
    }
});
