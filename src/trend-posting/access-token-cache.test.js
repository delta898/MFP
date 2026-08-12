const test = require('node:test');
const assert = require('node:assert/strict');

const { createAccessTokenCache } = require('./access-token-cache');

test('access token cache reuses a token until its refresh window', async () => {
    let now = Date.parse('2026-08-12T00:00:00.000Z');
    let issueCount = 0;
    const cache = createAccessTokenCache({
        now: () => now,
        refreshSkewMs: 60000,
        issueToken: async () => ({
            success: true,
            accessToken: `token-${++issueCount}`,
            expiresAt: new Date(now + 15 * 60 * 1000).toISOString()
        })
    });

    assert.equal(await cache.getToken(), 'token-1');
    assert.equal(await cache.getToken(), 'token-1');
    assert.equal(issueCount, 1);

    now += 14 * 60 * 1000 + 1;
    assert.equal(await cache.getToken(), 'token-2');
    assert.equal(issueCount, 2);
});
test('access token cache coalesces concurrent token requests', async () => {
    let resolveIssue;
    let issueCount = 0;
    const cache = createAccessTokenCache({
        now: () => Date.parse('2026-08-12T00:00:00.000Z'),
        issueToken: () => {
            issueCount += 1;
            return new Promise((resolve) => { resolveIssue = resolve; });
        }
    });

    const first = cache.getToken();
    const second = cache.getToken();
    resolveIssue({
        success: true,
        accessToken: 'shared-token',
        expiresAt: '2026-08-12T00:15:00.000Z'
    });

    assert.deepEqual(await Promise.all([first, second]), ['shared-token', 'shared-token']);
    assert.equal(issueCount, 1);
});

test('access token cache rejects invalid issuance responses without retaining them', async () => {
    let issueCount = 0;
    const cache = createAccessTokenCache({
        now: () => Date.parse('2026-08-12T00:00:00.000Z'),
        issueToken: async () => {
            issueCount += 1;
            return { success: false, code: 'LICENSE_NOT_ACTIVE', message: 'inactive' };
        }
    });

    await assert.rejects(cache.getToken(), (error) => error.code === 'LICENSE_NOT_ACTIVE');
    await assert.rejects(cache.getToken(), (error) => error.code === 'LICENSE_NOT_ACTIVE');
    assert.equal(issueCount, 2);
});
