const test = require('node:test');
const assert = require('node:assert/strict');
const { createSuggestionEngine } = require('./engine');

test('compatibility engine materializes candidates and preserves legacy-only items', async () => {
    const engine = createSuggestionEngine({
        providers: [{ async generate() { return { candidates: [{ candidate_id: 'candidate-1', created_at: '2026-08-23T01:00:00.000Z', dedupe_key: 'key-1' }], legacyItems: [{ id: 'confirm-1', summary: '확인 대기', feedback_enabled: false }] }; } }],
        recommendationMaterializer: {
            async materialize(_candidate, policy) {
                assert.equal(policy.policy_id, 'legacy-suggestion-compat-v1');
                return { persisted: true, recommendation: { recommendation_id: 'rec_1', status: 'available', candidate: { kind: 'workflow_hint', summary: '운영 안내', metadata: { legacy_type: 'workflow_hint' } } } };
            }
        }
    });
    const result = await engine.generateSuggestions({ limit: 3 }, {});
    assert.equal(result.suggestions.length, 2);
    assert.equal(result.suggestions[0].feedback_enabled, false);
    assert.equal(result.suggestions[1].feedback_transport, 'recommendation');
});
