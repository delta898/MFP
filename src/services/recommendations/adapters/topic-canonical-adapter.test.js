const test = require('node:test');
const assert = require('node:assert/strict');
const { validateRecommendationCandidate, validateRecommendationPolicyDecision } = require('../core/validators');
const { buildCanonicalTopicCandidate, buildCanonicalTopicPolicy, materializeTopicIdeas } = require('./topic-canonical-adapter');

const topicCandidate = {
    id: 'topic_candidate_1', candidate_type: 'trend_seed', topic_seed: 'AI 검색',
    source_refs: [{ kind: 'knowledge', provider_id: 'trends-main', transport: 'builtin_api', timestamp: '2026-08-23T01:00:00.000Z' }],
    explanation: '최근 트렌드입니다.',
    ranking: { policy_id: 'topic-ranking-v1', policy_version: 1, score: 31, rank: 2, breakdown: [{ code: 'trend_freshness', points: 15 }] }
};

test('topic lane maps to valid canonical candidate and normalized policy', () => {
    const candidate = buildCanonicalTopicCandidate({ candidate_id: topicCandidate.id, title: 'AI 검색 변화', summary: '검색 변화 정리', reason: '최근 트렌드' }, topicCandidate, { owner_user_id: 'owner-local', now: '2026-08-23T02:00:00.000Z' });
    const policy = buildCanonicalTopicPolicy(topicCandidate, candidate.created_at);
    assert.equal(validateRecommendationCandidate(candidate).ok, true);
    assert.equal(validateRecommendationPolicyDecision(policy).ok, true);
    assert.equal(policy.score > 0 && policy.score < 1, true);
});

test('topic materialization adds only canonical id while preserving idea fields', async () => {
    const idea = { id: 'idea-1', candidate_id: topicCandidate.id, title: 'AI 검색 변화', summary: '검색 변화 정리', reason: '최근 트렌드', recommendation: { run_id: 'run-1', candidate_id: topicCandidate.id } };
    const result = await materializeTopicIdeas({ ideas: [idea], candidates: [topicCandidate], run_id: 'run-1', owner_user_id: 'owner-local', now: '2026-08-23T02:00:00.000Z' }, {
        materializer: { async materialize() { return { recommendation: { recommendation_id: 'rec_topic_1' }, persisted: true }; } }
    });
    assert.equal(result[0].id, idea.id);
    assert.equal(result[0].recommendation.run_id, 'run-1');
    assert.equal(result[0].recommendation.recommendation_id, 'rec_topic_1');
});
