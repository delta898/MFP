const test = require('node:test');
const assert = require('node:assert/strict');

const {
    PUBLIC_RUNTIME_CONFIG_KEYS,
    createRuntimeConfigApi,
    normalizePublicRuntimeConfigKeys
} = require('./runtime-config');

const PUBLIC_SETTING = 'blog_auto_categories_master';

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
                return { data: { [PUBLIC_SETTING]: 'value' }, error: null };
            }
        }),
        requestTimeoutMs: 50,
        maxAttempts: 2
    });

    const values = await api.fetchRuntimeConfig([PUBLIC_SETTING], true);
    assert.deepEqual(values, { [PUBLIC_SETTING]: 'value' });
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
                return { data: { [PUBLIC_SETTING]: 'value' }, error: null };
            }
        }),
        requestTimeoutMs: 50,
        maxAttempts: 1
    });

    assert.deepEqual(await api.fetchRuntimeConfig([PUBLIC_SETTING], true), {});
    fail = false;
    assert.deepEqual(
        await api.fetchRuntimeConfig([PUBLIC_SETTING], true),
        { [PUBLIC_SETTING]: 'value' }
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
                return { data: { [PUBLIC_SETTING]: 'value' }, error: null };
            }
        })
    });

    const fetched = await api.fetchRuntimeConfig([PUBLIC_SETTING], true);
    const cached = await api.fetchRuntimeConfig([PUBLIC_SETTING], false);

    assert.deepEqual(fetched, { [PUBLIC_SETTING]: 'value' });
    assert.deepEqual(cached, { [PUBLIC_SETTING]: 'value' });
    assert.equal(callCount, 1);
});

test('runtime config rejects empty, unknown, and credential key requests before RPC', async () => {
    let callCount = 0;
    const api = createRuntimeConfigApi({
        config: createConfiguredRuntime(),
        logger: { debug() {} },
        createClientImpl: () => ({
            async rpc() {
                callCount += 1;
                return { data: {}, error: null };
            }
        })
    });

    await assert.rejects(api.fetchRuntimeConfig([], true), /non-empty array/);
    await assert.rejects(api.fetchRuntimeConfig(['unknown_setting'], true), /non-public key/);
    await assert.rejects(api.fetchRuntimeConfig(['naver_client_secret'], true), /non-public key/);
    assert.equal(callCount, 0);
});

test('runtime config public key contract is explicit and deduplicated', () => {
    assert.ok(PUBLIC_RUNTIME_CONFIG_KEYS.includes(PUBLIC_SETTING));
    assert.deepEqual(
        normalizePublicRuntimeConfigKeys([PUBLIC_SETTING, PUBLIC_SETTING]),
        [PUBLIC_SETTING]
    );
});
