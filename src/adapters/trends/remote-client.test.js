const test = require('node:test');
const assert = require('node:assert/strict');

const { createTrendPostingRemoteClient } = require('./remote-client');

test('remote client sends bearer token and normalized query parameters', async () => {
    const calls = [];
    const client = createTrendPostingRemoteClient({
        baseUrl: 'https://trendapi.example.test/',
        tokenCache: {
            async getToken() { return 'read-token'; },
            async refreshToken() { return 'refreshed-token'; }
        },
        axios: {
            async get(url, options) {
                calls.push({ url, options });
                return { data: { success: true, items: [] } };
            }
        }
    });

    await client.getRows({
        categories: ['맛집', '국내여행'],
        dateFrom: '2026-08-05',
        dateTo: '2026-08-11'
    });

    assert.equal(calls[0].url, 'https://trendapi.example.test/api/v1/trends');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer read-token');
    assert.deepEqual(calls[0].options.params, {
        categories: '맛집,국내여행',
        date_from: '2026-08-05',
        date_to: '2026-08-11',
        limit: 5000
    });
});

test('remote client refreshes once after an unauthorized response', async () => {
    const tokens = [];
    let requestCount = 0;
    const client = createTrendPostingRemoteClient({
        baseUrl: 'https://trendapi-dev.example.test',
        tokenCache: {
            async getToken() { return 'expired-token'; },
            async refreshToken() { return 'fresh-token'; }
        },
        axios: {
            async get(_url, options) {
                requestCount += 1;
                tokens.push(options.headers.Authorization);
                if (requestCount === 1) {
                    const error = new Error('Unauthorized');
                    error.response = { status: 401, data: { message: 'Unauthorized' } };
                    throw error;
                }
                return { data: { success: true } };
            }
        }
    });

    assert.deepEqual(await client.getMeta(), { success: true });
    assert.deepEqual(tokens, ['Bearer expired-token', 'Bearer fresh-token']);
});

test('remote client does not retry non-authentication failures', async () => {
    let requestCount = 0;
    const client = createTrendPostingRemoteClient({
        baseUrl: 'https://trendapi-dev.example.test',
        tokenCache: {
            async getToken() { return 'read-token'; },
            async refreshToken() { return 'unused'; }
        },
        axios: {
            async get() {
                requestCount += 1;
                const error = new Error('Too many requests');
                error.response = { status: 429, data: { message: 'rate limited' } };
                throw error;
            }
        }
    });

    await assert.rejects(client.getMeta(), (error) => error.code === 'TRENDS_REMOTE_RATE_LIMITED');
    assert.equal(requestCount, 1);
});

test('remote client never falls back to a Production endpoint', () => {
    assert.throws(() => createTrendPostingRemoteClient({
        tokenCache: {
            async getToken() { return 'read-token'; },
            async refreshToken() { return 'read-token'; }
        },
        axios: { async get() { return { data: {} }; } }
    }), (error) => error.code === 'TRENDS_API_NOT_CONFIGURED');
});
