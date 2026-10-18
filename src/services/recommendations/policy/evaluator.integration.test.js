const test = require('node:test');
const assert = require('node:assert/strict');
const { createPolicyContextCollector } = require('./context');
const { createRecommendationPolicyEvaluator } = require('./evaluator');
const { createRecommendationMaterializer } = require('../adapters/recommendation-materializer');
const { RecommendationLifecycleStore, VolatileRecommendationRepository } = require('../lifecycle-store');

const NOW = '2026-08-24T15:00:00.000Z';

function candidate() {
    return {
        candidate_id: 'candidate:integration:content', kind: 'content_opportunity', producer_id: 'content-opportunity-v1',
        owner_user_id: 'owner-local', title: '통합 후보', summary: '통합 요약', explanation: '저장 활동 근거',
        evidence: [{
            evidence_id: 'evidence:integration:content', kind: 'owner_activity', stage: 'saved', strength: 'medium',
            summary: '저장 활동', observed_at: '2026-08-24T14:00:00.000Z', expires_at: null,
            source_ref: { kind: 'artifact', id: 'topic:integration', label: '', provider_id: '', transport: '', url: '', timestamp: '2026-08-24T14:00:00.000Z' },
            features: {}
        }],
        handoff: null, dedupe_key: 'content:integration', created_at: '2026-08-24T14:00:00.000Z',
        expires_at: '2026-08-25T14:00:00.000Z', metadata: { topic: '통합 후보' }
    };
}

test('policy evaluation persists once and suppresses the next active duplicate', async () => {
    const lifecycle = new RecommendationLifecycleStore({ repository: new VolatileRecommendationRepository() });
    const eventStore = {
        getLocalOwnerIdentity() { return { owner_user_id: 'owner-local' }; },
        listRecommendations: lifecycle.listRecommendations.bind(lifecycle),
        createRecommendation: lifecycle.createRecommendation.bind(lifecycle)
    };
    const contextCollector = createPolicyContextCollector({
        eventStore,
        now: () => new Date(NOW),
        async licenseFeatureReader() {
            return { cmd_batch: true, cmd_trends: true, cmd_shopping: true,
                enable_related_posts_auto_link: true, enable_sns_distribution: false };
        },
        async settingReadinessReader() { return {}; },
        async quotaReader() { return { publishing: { known: true, unlimited: true } }; }
    });
    const evaluator = createRecommendationPolicyEvaluator({
        contextCollector,
        materializer: createRecommendationMaterializer({ eventStore, now: () => Date.parse(NOW) }),
        evaluationIdFactory: () => 'policy_eval:integration'
    });

    const first = await evaluator.evaluate({ owner_user_id: 'owner-local', candidates: [candidate()] });
    const second = await evaluator.evaluate({ owner_user_id: 'owner-local', candidates: [candidate()] });
    assert.equal(first.recommendations.length, 1);
    assert.equal(first.recommendations[0].persisted, true);
    assert.equal(second.recommendations.length, 0);
    assert.deepEqual(second.suppressed[0].policy.suppression_reasons, ['active_duplicate']);
    assert.equal((await lifecycle.listRecommendations('owner-local')).length, 1);
});
