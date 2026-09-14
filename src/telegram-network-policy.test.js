'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    calculateTelegramPollingBackoffMs,
    describeTelegramError,
    formatTelegramDiagnostic,
    shouldRetryTelegramWithIpv4
} = require('./telegram-network-policy');

test('polling backoff grows exponentially and stays bounded', () => {
    assert.deepEqual(
        [1, 2, 3, 4, 5, 6, 7, 8].map((count) => calculateTelegramPollingBackoffMs(count)),
        [1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]
    );
});

test('nested family selection errors are classified without exposing bot tokens', () => {
    const token = '123456:SECRET_TOKEN';
    const aggregate = new AggregateError([
        Object.assign(new Error(`connect ETIMEDOUT https://api.telegram.org/bot${token}/getMe`), { code: 'ETIMEDOUT', address: '149.154.166.110' }),
        Object.assign(new Error('connect EHOSTUNREACH'), { code: 'EHOSTUNREACH', address: '2001:db8::1' })
    ]);
    const error = Object.assign(new Error('EFATAL: AggregateError'), { code: 'EFATAL', cause: aggregate });
    const details = describeTelegramError(error, { botToken: token });

    assert.equal(details.category, 'network');
    assert.equal(shouldRetryTelegramWithIpv4(error), true);
    assert.match(formatTelegramDiagnostic(details), /ETIMEDOUT/);
    assert.doesNotMatch(JSON.stringify(details), /SECRET_TOKEN/);
});

test('Telegram HTTP failures map to actionable user guidance and never request IPv4 retry', () => {
    const cases = [
        [401, 'Unauthorized', 'token_invalid', 'Bot Token'],
        [400, 'Bad Request: chat not found', 'chat_not_found', '/start'],
        [403, 'Forbidden: bot was blocked by the user', 'chat_forbidden', '봇 차단'],
        [409, 'Conflict: terminated by other getUpdates request', 'polling_conflict', '다른 수신 봇'],
        [429, 'Too Many Requests', 'rate_limited', '12초']
    ];
    for (const [status, description, category, message] of cases) {
        const error = new Error('request failed');
        error.response = { status, data: { error_code: status, description, parameters: { retry_after: 12 } } };
        const details = describeTelegramError(error);
        assert.equal(details.category, category);
        assert.match(details.userMessage, new RegExp(message));
        assert.equal(shouldRetryTelegramWithIpv4(error), false);
    }
});
