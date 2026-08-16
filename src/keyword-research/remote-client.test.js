const test = require('node:test');
const assert = require('node:assert/strict');
const {
    createKeywordRemoteError,
    createKeywordResearchRemoteClient
} = require('./remote-client');

test('remote keyword client sends one authenticated analysis request', async () => {
    let captured;
    const client = createKeywordResearchRemoteClient({
        baseUrl: 'https://keyword.example.test/',
        tokenCache: {
            getToken: async () => 'access-token',
            refreshToken: async () => 'unused'
        },
        httpClient: {
            post: async (...args) => {
                captured = args;
                return { data: { success: true, analysis: { selected_keyword: '제주 여행' } } };
            }
        }
    });

    const result = await client.analyze({ subject: '제주 여행', keywords: ['제주 여행'] });
    assert.equal(result.selected_keyword, '제주 여행');
    assert.equal(captured[0], 'https://keyword.example.test/api/v1/keyword-research/analyze');
    assert.equal(captured[2].headers.Authorization, 'Bearer access-token');
});

test('remote keyword client refreshes once after an unauthorized response', async () => {
    const tokens = [];
    let calls = 0;
    const client = createKeywordResearchRemoteClient({
        tokenCache: {
            getToken: async () => 'expired-token',
            refreshToken: async () => 'fresh-token'
        },
        httpClient: {
            post: async (url, body, config) => {
                tokens.push(config.headers.Authorization);
                calls += 1;
                if (calls === 1) {
                    const error = new Error('unauthorized');
                    error.response = { status: 401, data: { message: 'unauthorized' } };
                    throw error;
                }
                return { data: { success: true, analysis: { selected_keyword: '키워드' } } };
            }
        }
    });

    assert.equal((await client.analyze({ keywords: ['키워드'] })).selected_keyword, '키워드');
    assert.deepEqual(tokens, ['Bearer expired-token', 'Bearer fresh-token']);
});

test('remote keyword errors preserve rate limit semantics', () => {
    const error = createKeywordRemoteError({
        response: { status: 429, data: { code: 'RATE_LIMITED', message: 'rate_limited' } }
    });
    assert.equal(error.code, 'KEYWORD_REMOTE_RATE_LIMITED');
    assert.equal(error.status, 429);
});
