const test = require('node:test');
const assert = require('node:assert/strict');
const {
    SNS_AI_MODES,
    isSnsAiMode,
    normalizeSnsAiMode
} = require('./sns-ai-policy');

test('SNS AI policy exposes only the supported model roles', () => {
    assert.deepEqual(SNS_AI_MODES, ['none', 'blog_text', 'chat']);
    assert.equal(isSnsAiMode('blog_text'), true);
    assert.equal(isSnsAiMode('other'), false);
});

test('SNS AI mode fails closed to none for unknown config values', () => {
    assert.equal(normalizeSnsAiMode(' CHAT '), 'chat');
    assert.equal(normalizeSnsAiMode('unknown'), 'none');
    assert.equal(normalizeSnsAiMode(''), 'none');
});
