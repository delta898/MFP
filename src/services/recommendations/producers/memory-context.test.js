const test = require('node:test');
const assert = require('node:assert/strict');
const { validateRecommendationCandidate } = require('../core/validators');
const { createMemoryContextRecommendationProducer } = require('./memory-context');

const NOW = Date.parse('2026-08-23T06:00:00.000Z');

test('memory context produces valid canonical candidates without raw payloads', async () => {
    const producer = createMemoryContextRecommendationProducer({ now: () => NOW });
    const result = await producer.produce({}, {
        memory: {
            owner_memory: { owner_user_id: 'owner-local' },
            preferences: [],
            recent_job_runs: [{ id: 'job-1', job_name: 'trends', status: 'failed', finished_at: '2026-08-23T02:00:00.000Z', result: { raw_response: 'secret' } }],
            pending_confirmations: []
        },
        knowledge: [{ kind: 'trends', provider_id: 'trends-main', transport: 'builtin_api', items: [{ id: 'trend-1', title: 'AI 검색', timestamp: '2026-08-23T03:00:00.000Z' }] }]
    });
    assert.equal(result.candidates.length, 2);
    result.candidates.forEach((candidate) => assert.equal(validateRecommendationCandidate(candidate).ok, true));
    assert.equal(JSON.stringify(result.candidates).includes('raw_response'), false);
    assert.equal(result.candidates[1].kind, 'content_opportunity');
});

test('pending confirmations are not emitted as Recommendations', async () => {
    const producer = createMemoryContextRecommendationProducer({ now: () => NOW });
    const result = await producer.produce({}, {
        memory: { owner_memory: { owner_user_id: 'owner-local' }, preferences: [], recent_job_runs: [], pending_confirmations: [{ id: 'confirm-1' }] },
        knowledge: []
    });
    assert.equal(result.candidates.length, 0);
    assert.deepEqual(result.candidates, []);
});
