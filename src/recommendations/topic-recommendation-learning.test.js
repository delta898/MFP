const test = require('node:test');
const assert = require('node:assert/strict');
const {
    normalizeRecommendationContext,
    buildRecommendationContext,
    stableOutcomeEvidenceId,
    createTopicRecommendationLearningService
} = require('./topic-recommendation-learning');
const { resolveArtifactFeedbackTarget } = require('../memory/feedback-target');
const { collectFeedback } = require('../memory/owner-profile');
const { MemoryPayloadCodec } = require('../memory/payload-codec');

const recommendation = buildRecommendationContext({
    run_id: 'run-1',
    policy: { id: 'topic-ranking-v1', version: 1 },
    candidate: {
        id: 'candidate-1',
        candidate_type: 'trend_seed',
        topic_seed: '무료 홈서버',
        source_refs: [{ kind: 'knowledge', provider_id: 'naver-trends' }],
        ranking: {
            rank: 2,
            score: 31,
            breakdown: [{ code: 'trend_freshness', points: 15 }]
        }
    }
});

test('normalizes a compact recommendation provenance contract', () => {
    assert.deepEqual(recommendation, {
        schema_version: 1,
        run_id: 'run-1',
        candidate_id: 'candidate-1',
        candidate_type: 'trend_seed',
        basis: 'trend',
        topic_seed: '무료 홈서버',
        policy_id: 'topic-ranking-v1',
        policy_version: 1,
        rank: 2,
        score: 31,
        breakdown: [{ code: 'trend_freshness', points: 15, evidence: null }],
        source_refs: [{
            kind: 'knowledge',
            id: '',
            provider_id: 'naver-trends',
            transport: '',
            source: '',
            subject: '',
            domain: '',
            stage: '',
            timestamp: null
        }]
    });
    assert.equal(normalizeRecommendationContext(null).candidate_id, '');
});

test('records only meaningful recommendation outcomes with a stable evidence id', async () => {
    const calls = [];
    const service = createTopicRecommendationLearningService({
        async recordActivityLifecycle(input) {
            calls.push(input);
            return { id: 'activity-1' };
        }
    });
    const first = await service.recordOutcome({
        stage: 'selected',
        recommendation,
        subject: '무료 홈서버 실전 가이드',
        source: 'topic-recommendation-ui',
        evidence_id: 'click-1'
    });
    const secondId = stableOutcomeEvidenceId(recommendation, 'selected', 'click-1');

    assert.equal(first.recorded, true);
    assert.equal(first.evidence_id, secondId);
    assert.equal(calls[0].domain, 'blog');
    assert.equal(calls[0].stage, 'selected');
    assert.equal(calls[0].metadata.recommendation.candidate_id, 'candidate-1');
    assert.equal(calls[0].strength, undefined);

    const skipped = await service.recordOutcome({ stage: 'selected', recommendation: {} });
    assert.deepEqual(skipped, { recorded: false, reason: 'missing_recommendation_context' });
    await assert.rejects(() => service.recordOutcome({ stage: 'observed', recommendation }), /지원하지 않는/);
});

test('canonical topic feedback records recommendation feedback without converting other outcomes', async () => {
    const feedbackCalls = [];
    const service = createTopicRecommendationLearningService({
        recordActivityLifecycle: async () => ({ id: 'activity-1' }),
        recordRecommendationFeedback: async (input) => { feedbackCalls.push(input); return { recorded: true }; }
    });
    await service.recordOutcome({
        stage: 'feedback', feedback: 'not_helpful', owner_user_id: 'owner-local',
        recommendation: { run_id: 'run-1', recommendation_id: 'rec_1', candidate_id: 'candidate-1' }
    });
    await service.recordOutcome({
        stage: 'selected', owner_user_id: 'owner-local', result_ref: 'selection-1',
        recommendation: { run_id: 'run-1', recommendation_id: 'rec_1', candidate_id: 'candidate-1' }
    });
    assert.equal(feedbackCalls.length, 1);
    assert.equal(feedbackCalls[0].recommendation_id, 'rec_1');
    assert.equal(feedbackCalls[0].feedback, 'not_helpful');
});

test('carries recommendation provenance from artifact feedback into owner feedback projection', () => {
    const target = resolveArtifactFeedbackTarget({
        id: 'idea-1',
        artifact_type: 'content_idea',
        title: '무료 홈서버 실전 가이드',
        payload: { recommendation }
    });
    assert.equal(target.recommendation.candidate_id, 'candidate-1');

    const feedback = collectFeedback([{
        domain: 'blog',
        stage: 'feedback',
        subject: target.subject,
        timestamp: '2026-08-15T00:00:00.000Z',
        evidence: { id: 'feedback-1' },
        payload: { metadata: { feedback: 'helpful', recommendation: target.recommendation } }
    }]);
    assert.equal(feedback.recent[0].recommendation.candidate_id, 'candidate-1');
});

test('keeps compact recommendation provenance in a generated artifact payload', () => {
    const store = new MemoryPayloadCodec();
    const payload = store._summarizeArtifactPayload({
        title: '무료 홈서버 실전 가이드',
        recommendation
    });
    assert.equal(payload.recommendation.candidate_id, 'candidate-1');
    assert.equal(payload.recommendation.breakdown[0].code, 'trend_freshness');
});
