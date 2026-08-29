const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveStatusEnvironment } = require('./trends-env-status');

test('trends environment status prefers an explicit argument', () => {
    assert.equal(resolveStatusEnvironment(['development'], { TRENDS_ENV: 'local' }), 'development');
    assert.equal(resolveStatusEnvironment([], { TRENDS_ENV: 'local' }), 'local');
    assert.equal(resolveStatusEnvironment([], {}), '');
});
