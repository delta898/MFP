const test = require('node:test');
const assert = require('node:assert/strict');
const {
    getInternalUiOrigin,
    normalizeInternalUiPort
} = require('./internal-ui-origin');

test('internal UI origin follows the canonical LISTEN_PORT', () => {
    assert.equal(
        getInternalUiOrigin({ LISTEN_HOST: '127.0.0.1', LISTEN_PORT: 4578 }),
        'http://127.0.0.1:4578'
    );
});

test('internal UI calls use loopback even when the server binds to all interfaces', () => {
    assert.equal(
        getInternalUiOrigin({ LISTEN_HOST: '0.0.0.0', LISTEN_PORT: 4588 }),
        'http://127.0.0.1:4588'
    );
});

test('internal UI port rejects invalid values and uses the bounded default', () => {
    assert.equal(normalizeInternalUiPort(0), 4577);
    assert.equal(normalizeInternalUiPort(65536), 4577);
    assert.equal(normalizeInternalUiPort('49123'), 49123);
});
