const test = require('node:test');
const assert = require('node:assert/strict');
const { createSmartUsageService } = require('./usage-service');

test('commits a successful provider call with the same smart usage session', async () => {
    const calls = [];
    const service = createSmartUsageService({
        License: {
            async reserveSmartUsage(input) {
                calls.push(['reserve', input]);
                return { success: true, sessionId: input.sessionId, operationId: input.operationId, usage: { remaining: 19 } };
            },
            async commitSmartUsage(input) {
                calls.push(['commit', input]);
                return { success: true, sessionId: input.sessionId, operationId: input.operationId, usage: { remaining: 19 } };
            },
            async releaseSmartUsage(input) { calls.push(['release', input]); return { success: true }; }
        }
    });

    const result = await service.run('content_idea', {
        sessionId: 'session-1',
        operationId: 'operation-1'
    }, async () => ({ ideas: ['idea'] }));

    assert.deepEqual(result.result, { ideas: ['idea'] });
    assert.equal(result.sessionId, 'session-1');
    assert.deepEqual(calls.map(([name]) => name), ['reserve', 'commit']);
});

test('releases a reservation when the provider call fails', async () => {
    const calls = [];
    const service = createSmartUsageService({
        License: {
            async reserveSmartUsage(input) { calls.push(['reserve', input]); return { success: true, sessionId: input.sessionId, operationId: input.operationId }; },
            async commitSmartUsage() { calls.push(['commit']); return { success: true }; },
            async releaseSmartUsage(input) { calls.push(['release', input]); return { success: true }; }
        }
    });

    await assert.rejects(
        service.run('keyword_discovery', { sessionId: 'session-2', operationId: 'operation-2' }, async () => {
            throw new Error('naver unavailable');
        }),
        /naver unavailable/
    );
    assert.deepEqual(calls.map(([name]) => name), ['reserve', 'release']);
});

test('uses the canonical monthly status after a successful commit', async () => {
    const service = createSmartUsageService({
        License: {
            async reserveSmartUsage(input) {
                return {
                    success: true,
                    sessionId: input.sessionId,
                    operationId: input.operationId,
                    usage: { capability: 'content_idea', remaining: 60, requests_remaining: 1 }
                };
            },
            async commitSmartUsage(input) {
                return {
                    success: true,
                    sessionId: input.sessionId,
                    operationId: input.operationId,
                    usage: { capability: 'content_idea', remaining: 60, requests_remaining: 1 }
                };
            },
            async releaseSmartUsage() { return { success: true }; },
            async getSmartUsageStatus() {
                return {
                    success: true,
                    items: [{ capability: 'content_idea', limit: 80, used: 27, remaining: 53 }]
                };
            }
        }
    });

    const result = await service.run(
        'content_idea',
        { sessionId: 'session-status', operationId: 'operation-status' },
        async () => ({ ideas: ['idea'] })
    );

    assert.equal(result.usage.remaining, 53);
    assert.equal(result.usage.used, 27);
    assert.equal(result.usage.requests_remaining, 1);
});
