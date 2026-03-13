const test = require('node:test');
const assert = require('node:assert/strict');

const { createRuntimeConfigApi } = require('./runtime-config');

test('runtime config retries transient fetch failure before giving up', async () => {
    const calls = [];
    let remainingFailures = 1;
    const config = {
        LICENSE_CHK_URL: 'https://example.test',
        LICENSE_CHK_KEY: 'secret',
        GOOGLE_OAUTH_CLIENT_ID: '',
        GOOGLE_OAUTH_CLIENT_SECRET: ''
    };
    const api = createRuntimeConfigApi({
        config,
        logger: { debug() {} },
        createClientImpl: () => ({
            async rpc(_name, { p_keys }) {
                calls.push([...p_keys]);
                if (remainingFailures > 0) {
                    remainingFailures -= 1;
                    throw new Error('timeout');
                }
                return {
                    data: {
                        google_oauth_client_id: 'client-id',
                        google_oauth_client_secret: 'client-secret'
                    },
                    error: null
                };
            }
        }),
        requestTimeoutMs: 50,
        maxAttempts: 2
    });

    const ok = await api.ensureGoogleOauthClientConfig(true);
    assert.equal(ok, true);
    assert.equal(config.GOOGLE_OAUTH_CLIENT_ID, 'client-id');
    assert.equal(config.GOOGLE_OAUTH_CLIENT_SECRET, 'client-secret');
    assert.equal(calls.length, 2);
});

test('runtime config does not poison cache when every fetch attempt fails', async () => {
    const config = {
        LICENSE_CHK_URL: 'https://example.test',
        LICENSE_CHK_KEY: 'secret',
        GOOGLE_OAUTH_CLIENT_ID: '',
        GOOGLE_OAUTH_CLIENT_SECRET: ''
    };
    let fail = true;
    const api = createRuntimeConfigApi({
        config,
        logger: { debug() {} },
        createClientImpl: () => ({
            async rpc() {
                if (fail) throw new Error('timeout');
                return {
                    data: {
                        google_oauth_client_id: 'client-id',
                        google_oauth_client_secret: 'client-secret'
                    },
                    error: null
                };
            }
        }),
        requestTimeoutMs: 50,
        maxAttempts: 1
    });

    const first = await api.ensureGoogleOauthClientConfig(true);
    assert.equal(first, false);
    assert.equal(config.GOOGLE_OAUTH_CLIENT_ID, '');
    assert.equal(config.GOOGLE_OAUTH_CLIENT_SECRET, '');

    fail = false;

    const second = await api.ensureGoogleOauthClientConfig(true);
    assert.equal(second, true);
    assert.equal(config.GOOGLE_OAUTH_CLIENT_ID, 'client-id');
    assert.equal(config.GOOGLE_OAUTH_CLIENT_SECRET, 'client-secret');
});

test('runtime config reuses cached values when supabase client is unavailable later', async () => {
    const config = {
        LICENSE_CHK_URL: 'https://example.test',
        LICENSE_CHK_KEY: 'secret',
        GOOGLE_OAUTH_CLIENT_ID: '',
        GOOGLE_OAUTH_CLIENT_SECRET: ''
    };
    let clientAvailable = true;
    const api = createRuntimeConfigApi({
        config,
        logger: { debug() {} },
        createClientImpl: () => {
            if (!clientAvailable) return null;
            return {
                async rpc() {
                    return {
                        data: {
                            google_oauth_client_id: 'client-id',
                            google_oauth_client_secret: 'client-secret'
                        },
                        error: null
                    };
                }
            };
        }
    });

    const fetched = await api.fetchRuntimeConfig(['google_oauth_client_id', 'google_oauth_client_secret'], true);
    assert.equal(fetched.google_oauth_client_id, 'client-id');
    assert.equal(fetched.google_oauth_client_secret, 'client-secret');

    clientAvailable = false;

    const cached = await api.fetchRuntimeConfig(['google_oauth_client_id', 'google_oauth_client_secret'], false);
    assert.equal(cached.google_oauth_client_id, 'client-id');
    assert.equal(cached.google_oauth_client_secret, 'client-secret');
});
