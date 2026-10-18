const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildPublishQuotaPreflight,
    createPublishOperationId,
    hasSuccessfulPlatformResult,
    settlePublishQuota
} = require('./publish-quota');

test('preflight limits selected work to remaining quota', () => {
    assert.deepEqual(buildPublishQuotaPreflight(7, { remaining: 3 }), {
        selected: 7,
        remaining: 3,
        executable: 3,
        unlimited: false,
        message: '7건 선택 · 잔여 3회 · 최대 3건 실행'
    });
});

test('preflight allows every selected item for unlimited plans', () => {
    const result = buildPublishQuotaPreflight(7, { remaining: -1 });
    assert.equal(result.executable, 7);
    assert.equal(result.message, '7건 선택 · 잔여 무제한 · 최대 7건 실행');
});

test('stable publish identity is repeatable and includes post status', () => {
    const first = createPublishOperationId({ scope: 'sheet', stableKey: 'row-12', postStatus: 'draft' });
    const second = createPublishOperationId({ scope: 'sheet', stableKey: 'row-12', postStatus: 'draft' });
    assert.equal(first, second);
    assert.equal(first, 'sheet:row-12:draft');
});

test('platform result succeeds when at least one platform succeeds', () => {
    assert.equal(hasSuccessfulPlatformResult({ naver: { success: false }, wordpress: { success: true } }), true);
    assert.equal(hasSuccessfulPlatformResult({ naver: { success: false }, wordpress: { success: false } }), false);
});

test('settlement commits partial success and releases total failure', async () => {
    const calls = [];
    const License = {
        async commitPublishQuota(operationId) { calls.push(['commit', operationId]); return { success: true }; },
        async releasePublishQuota(operationId) { calls.push(['release', operationId]); return { success: true }; }
    };
    await settlePublishQuota({ License, operationId: 'op-1', results: { naver: { success: true }, wordpress: { success: false } } });
    await settlePublishQuota({ License, operationId: 'op-2', results: { naver: { success: false } } });
    assert.deepEqual(calls, [['commit', 'op-1'], ['release', 'op-2']]);
});
