const test = require('node:test');
const assert = require('node:assert/strict');

const { createRuntimeConfigApi } = require('./runtime-config');

function createConfiguredRuntime(overrides = {}) {
    return {
        LICENSE_CHK_URL: 'https://example.test',
        LICENSE_CHK_KEY: 'public-key',
        ...overrides
    };
}

test('runtime config retries transient fetch failure before giving up', async () => {
    const calls = [];
    let remainingFailures = 1;
    const api = createRuntimeConfigApi({
        config: createConfiguredRuntime(),
        logger: { debug() {} },
        createClientImpl: () => ({
            async rpc(_name, { p_keys }) {
                calls.push([...p_keys]);
                if (remainingFailures > 0) {
                    remainingFailures -= 1;
                    throw new Error('timeout');
                }
                return { data: { public_setting: 'value' }, error: null };
            }
        }),
        requestTimeoutMs: 50,
        maxAttempts: 2
    });

    const values = await api.fetchRuntimeConfig(['public_setting'], true);
    assert.deepEqual(values, { public_setting: 'value' });
    assert.equal(calls.length, 2);
});

test('runtime config does not poison cache when every fetch attempt fails', async () => {
    let fail = true;
    const api = createRuntimeConfigApi({
        config: createConfiguredRuntime(),
        logger: { debug() {} },
        createClientImpl: () => ({
            async rpc() {
                if (fail) throw new Error('timeout');
                return { data: { public_setting: 'value' }, error: null };
            }
        }),
        requestTimeoutMs: 50,
        maxAttempts: 1
    });

    assert.deepEqual(await api.fetchRuntimeConfig(['public_setting'], true), {});
    fail = false;
    assert.deepEqual(
        await api.fetchRuntimeConfig(['public_setting'], true),
        { public_setting: 'value' }
    );
});

test('runtime config reuses cached public values', async () => {
    let callCount = 0;
    const api = createRuntimeConfigApi({
        config: createConfiguredRuntime(),
        logger: { debug() {} },
        createClientImpl: () => ({
            async rpc() {
                callCount += 1;
                return { data: { public_setting: 'value' }, error: null };
            }
        })
    });

    const fetched = await api.fetchRuntimeConfig(['public_setting'], true);
    const cached = await api.fetchRuntimeConfig(['public_setting'], false);

    assert.deepEqual(fetched, { public_setting: 'value' });
    assert.deepEqual(cached, { public_setting: 'value' });
    assert.equal(callCount, 1);
});

test('runtime config still resolves Naver credentials until the gateway migration stage', async () => {
    const config = createConfiguredRuntime({ NAVER_CLIENT_ID: '', NAVER_CLIENT_SECRET: '' });
    const api = createRuntimeConfigApi({
        config,
        logger: { debug() {} },
        createClientImpl: () => ({
            async rpc() {
                return {
                    data: {
                        naver_client_id: 'naver-id',
                        naver_client_secret: 'naver-secret'
                    },
                    error: null
                };
            }
        })
    });

    assert.equal(await api.ensureNaverSearchCredentials(true), true);
    assert.equal(config.NAVER_CLIENT_ID, 'naver-id');
    assert.equal(config.NAVER_CLIENT_SECRET, 'naver-secret');
    assert.equal(api.ensureGoogleOauthClientConfig, undefined);
});
