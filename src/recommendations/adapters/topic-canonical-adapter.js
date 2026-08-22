const { stableAdapterId } = require('./identity');

const DAY_MS = 86400000;

function normalizeTopicScore(value) {
    const score = Number(value);
    if (!Number.isFinite(score) || score <= 0) return 0;
    return Math.min(1, score / (score + 100));
}

function sourceRefToEvidence(ref = {}, candidateId, index, nowIso) {
    const isKnowledge = String(ref.kind || '') === 'knowledge';
    const observedAt = Number.isFinite(Date.parse(String(ref.timestamp || '')))
        ? new Date(ref.timestamp).toISOString()
        : nowIso;
    const sourceId = String(ref.id || ref.provider_id || `${candidateId}:${index}`);
    return {
        evidence_id: stableAdapterId('evidence', candidateId, sourceId, index),
        kind: isKnowledge ? 'knowledge' : 'owner_activity',
        stage: 'observed',
        strength: isKnowledge ? 'weak' : (String(ref.kind || '') === 'request' ? 'explicit' : 'medium'),
        summary: isKnowledge ? '외부 지식에서 관찰된 주제입니다.' : '사용자 요청 또는 활동에서 확인된 주제입니다.',
        observed_at: observedAt,
        expires_at: new Date(Date.parse(nowIso) + DAY_MS).toISOString(),
        source_ref: isKnowledge ? {
            kind: 'knowledge', id: sourceId, label: String(ref.source || ref.provider_id || '외부 지식'),
            provider_id: String(ref.provider_id || 'topic-lane'), transport: String(ref.transport || 'internal_query'),
            url: '', timestamp: observedAt
        } : {
            kind: 'event', id: sourceId, label: String(ref.kind || 'owner activity'),
            provider_id: '', transport: '', url: '', timestamp: observedAt
        },
        features: {}
    };
}

function buildCanonicalTopicCandidate(idea = {}, topicCandidate = {}, input = {}) {
    const nowIso = new Date(input.now || Date.now()).toISOString();
    const ownerUserId = String(input.owner_user_id || input.ownerUserId || '').trim();
    const candidateId = String(topicCandidate.id || idea.candidate_id || '').trim();
    const refs = Array.isArray(topicCandidate.source_refs) ? topicCandidate.source_refs.slice(0, 8) : [];
    const evidence = (refs.length > 0 ? refs : [{ kind: 'event', id: candidateId }])
        .map((ref, index) => sourceRefToEvidence(ref, candidateId, index, nowIso));
    return {
        candidate_id: candidateId,
        kind: 'content_opportunity',
        producer_id: 'topic-recommendation-adapter-v1',
        owner_user_id: ownerUserId,
        title: String(idea.title || topicCandidate.topic_seed || '').trim(),
        summary: String(idea.summary || idea.reason || '').trim(),
        explanation: String(idea.reason || topicCandidate.explanation || '추천 후보와 사용자 맥락을 반영했습니다.').trim(),
        evidence,
        handoff: {
            type: 'presentation',
            label: '빠른 포스팅에서 보기',
            target: { surface: 'blog.quick', view: '', tab: '' },
            payload: { query: String(topicCandidate.topic_seed || idea.title || '').trim().slice(0, 180) }
        },
        dedupe_key: `topic-opportunity:${candidateId}`,
        created_at: nowIso,
        expires_at: new Date(Date.parse(nowIso) + DAY_MS).toISOString(),
        metadata: { topic_candidate_type: String(topicCandidate.candidate_type || '') }
    };
}

function buildCanonicalTopicPolicy(topicCandidate = {}, nowIso = new Date().toISOString()) {
    const ranking = topicCandidate.ranking || {};
    return {
        policy_id: String(ranking.policy_id || 'topic-ranking-v1'),
        policy_version: Math.max(1, Number(ranking.policy_version || 1)),
        eligible: true,
        suppression_reasons: [],
        score: normalizeTopicScore(ranking.score),
        rank: Math.max(1, Number(ranking.rank || 1)),
        breakdown: { legacy_score: Number(ranking.score || 0), factors: Array.isArray(ranking.breakdown) ? ranking.breakdown.slice(0, 12) : [] },
        decided_at: nowIso
    };
}

async function materializeTopicIdeas(input = {}, options = {}) {
    const materializer = options.materializer;
    if (!materializer || typeof materializer.materialize !== 'function') return input.ideas || [];
    const candidates = new Map((Array.isArray(input.candidates) ? input.candidates : [])
        .map((candidate) => [String(candidate?.id || ''), candidate]));
    const ideas = [];
    for (const idea of Array.isArray(input.ideas) ? input.ideas : []) {
        const topicCandidate = candidates.get(String(idea.candidate_id || ''));
        if (!topicCandidate) {
            ideas.push(idea);
            continue;
        }
        const candidate = buildCanonicalTopicCandidate(idea, topicCandidate, input);
        const policy = buildCanonicalTopicPolicy(topicCandidate, candidate.created_at);
        try {
            const materialized = await materializer.materialize(candidate, policy, {
                memory: input.memory,
                owner_user_id: input.owner_user_id,
                opportunity_key: candidate.dedupe_key,
                available_at: candidate.created_at,
                operation_id: `${input.run_id || 'topic-run'}:${candidate.candidate_id}`,
                adapter_id: 'topic-recommendation-adapter-v1'
            });
            ideas.push({
                ...idea,
                recommendation: {
                    ...(idea.recommendation || {}),
                    ...(materialized.persisted === false
                        ? {}
                        : { recommendation_id: materialized.recommendation.recommendation_id })
                },
                recommendation_persistence: materialized.persisted === false ? 'unavailable' : 'available'
            });
        } catch (_error) {
            ideas.push({ ...idea, recommendation_persistence: 'unavailable' });
        }
    }
    return ideas;
}

module.exports = {
    normalizeTopicScore,
    buildCanonicalTopicCandidate,
    buildCanonicalTopicPolicy,
    materializeTopicIdeas
};
