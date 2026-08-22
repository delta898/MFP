const test = require('node:test');
const assert = require('node:assert/strict');
const { validateRecommendationCandidate } = require('../core/validators');
const { createMemoryBasedSuggestionProvider } = require('./legacy-memory-candidate-adapter');
const { createRecommendationMaterializer } = require('./recommendation-materializer');

async function candidateFixture() {
    const provider = createMemoryBasedSuggestionProvider({ now: () => Date.parse('2026-08-23T06:00:00.000Z') });
    const result = await provider.generate({}, {
        memory: { owner_memory: { owner_user_id: 'owner-local' }, preferences: [], pending_confirmations: [], recent_job_runs: [{ id: 'job-1', job_name: 'trends', status: 'failed' }] },
        knowledge: []
    });
    assert.equal(validateRecommendationCandidate(result.candidates[0]).ok, true);
    return result.candidates[0];
}

test('materializer uses stable recommendation and operation identities', async () => {
    const calls = [];
    const eventStore = {
        async createRecommendation(recommendation, context) {
            calls.push({ recommendation, context });
            return { recommendation, deduplicated: calls.length > 1 };
        }
    };
    const candidate = await candidateFixture();
    const materializer = createRecommendationMaterializer({ eventStore, now: () => Date.parse(candidate.created_at) });
    const policy = { policy_id: 'legacy-suggestion-compat-v1', policy_version: 1, eligible: true, suppression_reasons: [], score: 1, rank: 1, breakdown: {}, decided_at: candidate.created_at };
    const first = await materializer.materialize(candidate, policy, { opportunity_key: candidate.dedupe_key });
    const second = await materializer.materialize(candidate, policy, { opportunity_key: candidate.dedupe_key });
    assert.equal(first.recommendation.recommendation_id, second.recommendation.recommendation_id);
    assert.equal(calls[0].context.operation_id, calls[1].context.operation_id);
});

test('materialization failure returns safe non-persistent canonical output', async () => {
    const candidate = await candidateFixture();
    const warnings = [];
    const materializer = createRecommendationMaterializer({
        eventStore: { async createRecommendation() { throw new Error('db secret details'); } },
        Logger: { warn: (message) => warnings.push(message) }, now: () => Date.parse(candidate.created_at)
    });
    const result = await materializer.materialize(candidate, {
        policy_id: 'legacy-suggestion-compat-v1', policy_version: 1, eligible: true,
        suppression_reasons: [], score: 1, rank: 1, breakdown: {}, decided_at: candidate.created_at
    }, { opportunity_key: candidate.dedupe_key });
    assert.equal(result.persisted, false);
    assert.equal(result.reason, 'write_failed');
    assert.equal(Object.hasOwn(result, 'error'), false);
    assert.equal(warnings.length, 1);
});
