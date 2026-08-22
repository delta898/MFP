const test = require('node:test');
const assert = require('node:assert/strict');
const { validateRecommendationCandidate } = require('../core/validators');
const { createMemoryBasedSuggestionProvider } = require('./legacy-memory-candidate-adapter');

const NOW = Date.parse('2026-08-23T06:00:00.000Z');

test('legacy memory signals map to valid canonical candidates without raw payloads', async () => {
    const provider = createMemoryBasedSuggestionProvider({ now: () => NOW });
    const result = await provider.generate({}, {
        memory: {
            owner_memory: { owner_user_id: 'owner-local' },
            preferences: [{ name: 'preferred_trends_collect_time', value: { time: '07:00' }, updated_at: '2026-08-23T01:00:00.000Z' }],
            recent_job_runs: [{ id: 'job-1', job_name: 'trends', status: 'failed', finished_at: '2026-08-23T02:00:00.000Z', result: { raw_response: 'secret' } }],
            pending_confirmations: []
        },
        knowledge: [{ kind: 'trends', provider_id: 'trends-main', transport: 'builtin_api', items: [{ id: 'trend-1', title: 'AI 검색', timestamp: '2026-08-23T03:00:00.000Z' }] }]
    });
    assert.equal(result.candidates.length, 3);
    result.candidates.forEach((candidate) => assert.equal(validateRecommendationCandidate(candidate).ok, true));
    assert.equal(JSON.stringify(result.candidates).includes('raw_response'), false);
    assert.equal(result.candidates[2].kind, 'content_opportunity');
});

test('pending confirmation stays legacy-only and has no feedback or false action', async () => {
    const provider = createMemoryBasedSuggestionProvider({ now: () => NOW });
    const result = await provider.generate({}, {
        memory: { owner_memory: { owner_user_id: 'owner-local' }, preferences: [], recent_job_runs: [], pending_confirmations: [{ id: 'confirm-1' }] },
        knowledge: []
    });
    assert.equal(result.candidates.length, 0);
    assert.equal(result.legacyItems[0].feedback_enabled, false);
    assert.equal(result.legacyItems[0].actionable, false);
});

test('historic suggestion feedback still suppresses a legacy signal without backfill', async () => {
    const provider = createMemoryBasedSuggestionProvider({ now: () => NOW });
    const result = await provider.generate({}, {
        memory: {
            owner_memory: { owner_user_id: 'owner-local' },
            preferences: [
                { name: 'preferred_trends_collect_time', value: { time: '07:00' } },
                { name: 'suggestion_feedback.workflow_hint.preferred_trends_collect_time', value: { not_helpful_count: 2 } }
            ],
            recent_job_runs: [], pending_confirmations: []
        }, knowledge: []
    });
    assert.deepEqual(result.candidates, []);
});
