'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const optionalUi = fs.readFileSync(path.join(repoRoot, 'ui/scripts/features/settings-next/optional-services.js'), 'utf8');
const inboundUi = fs.readFileSync(path.join(repoRoot, 'ui/scripts/features/settings-next/external-connections.js'), 'utf8');

test('Telegram connection UI explains staged verification and preserves backend guidance', () => {
    assert.match(optionalUi, /Bot·채팅·메시지 확인 중/);
    assert.match(optionalUi, /tested[?][.]message/);
    assert.match(optionalUi, /입력값은 반영됨/);
});

test('Telegram inbound UI shows the safe polling stop reason', () => {
    assert.match(inboundUi, /TELEGRAM_INBOUND_LAST_ERROR_MESSAGE/);
    assert.match(inboundUi, /TELEGRAM_INBOUND_RUNNING !== true/);
});
