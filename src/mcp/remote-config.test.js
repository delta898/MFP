const test = require('node:test');
const assert = require('node:assert/strict');

const {
    ensureRuntimeRemoteMcpConfig,
    generateRemoteMcpBearerToken
} = require('./remote-config');

test('generateRemoteMcpBearerToken returns a fixed-length 43 char base64url token', () => {
    const token = generateRemoteMcpBearerToken();
    assert.equal(token.length, 43);
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
});

test('ensureRuntimeRemoteMcpConfig generates a runtime token only when requested', () => {
    const config = {};
    const result = ensureRuntimeRemoteMcpConfig(config, { generateTokenIfMissing: true });

    assert.equal(result.authMode, 'bearer');
    assert.equal(result.authToken.length, 43);
    assert.equal(result.generatedToken, true);
    assert.equal(config.mcp.remote.auth.bearer_token, result.authToken);
    assert.equal(config.MCP_REMOTE_AUTH_TOKEN, result.authToken);
});

test('ensureRuntimeRemoteMcpConfig keeps auth mode as none when token is blank', () => {
    const config = {};
    const result = ensureRuntimeRemoteMcpConfig(config);

    assert.equal(result.authMode, 'none');
    assert.equal(result.authToken, '');
    assert.equal(result.generatedToken, false);
});
