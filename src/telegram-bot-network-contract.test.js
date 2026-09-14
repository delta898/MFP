'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, 'telegram-bot.service.js'), 'utf8');

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
