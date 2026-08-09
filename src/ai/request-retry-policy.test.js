const test = require('node:test');
const assert = require('node:assert/strict');

const {
    parseRetryAfterMs,
    resolveAiRetryDecision
} = require('./request-retry-policy');

test('AI retry policy respects Retry-After for rate limits', () => {
    const error = { response: { status: 429, headers: { 'retry-after': '20' } } };
    assert.equal(parseRetryAfterMs(error), 20000);
    assert.deepEqual(resolveAiRetryDecision(error, 1), {
        retryable: true,
        isRateLimited: true,
        delayMs: 20000,
        status: 429
    });
});

test('AI retry policy uses a longer fallback for repeated 429 responses', () => {
    const error = { response: { status: 429, headers: {} } };
    assert.equal(resolveAiRetryDecision(error, 1).delayMs, 15000);
    assert.equal(resolveAiRetryDecision(error, 2).delayMs, 30000);
    assert.equal(resolveAiRetryDecision(error, 4).delayMs, 60000);
});

test('AI retry policy reads Google retry delay from the error body', () => {
    const error = {
        response: {
            status: 429,
            headers: {},
            data: {
                error: {
                    message: 'Quota exceeded. Please retry in 51.451335694s.'
                }
            }
        }
    };
    assert.equal(parseRetryAfterMs(error), 52452);
    assert.equal(resolveAiRetryDecision(error, 1).delayMs, 52452);
});

test('AI retry policy reads structured Google RetryInfo with a safety margin', () => {
    const error = {
        response: {
            status: 429,
            headers: {},
            data: {
                error: {
                    details: [{ retryDelay: '16.691984491s' }]
                }
            }
        }
    };
    assert.equal(parseRetryAfterMs(error), 17692);
});

test('AI retry policy does not retry authentication or invalid requests', () => {
    assert.equal(resolveAiRetryDecision({ response: { status: 400 } }, 1).retryable, false);
    assert.equal(resolveAiRetryDecision({ response: { status: 401 } }, 1).retryable, false);
    assert.equal(resolveAiRetryDecision({ response: { status: 500 } }, 1).retryable, true);
});
