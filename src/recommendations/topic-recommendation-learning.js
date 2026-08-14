const crypto = require('crypto');

const TOPIC_RECOMMENDATION_CONTEXT_VERSION = 1;
const TOPIC_RECOMMENDATION_OUTCOME_STAGES = Object.freeze([
    'selected',
    'saved',
    'drafted',
    'published',
    'feedback'
]);

function compact(value, maxLength = 240) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function finite(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeBreakdown(values = []) {
    return (Array.isArray(values) ? values : []).slice(0, 12).map((item) => ({
        code: compact(item?.code, 80),
        points: finite(item?.points),
        evidence: item?.evidence && typeof item.evidence === 'object' && !Array.isArray(item.evidence)
            ? item.evidence
            : null
    })).filter((item) => item.code);
}

function normalizeSourceRefs(values = []) {
    return (Array.isArray(values) ? values : []).slice(0, 8).map((item) => ({
        kind: compact(item?.kind, 60),
        id: compact(item?.id, 240),
        provider_id: compact(item?.provider_id, 120),
        transport: compact(item?.transport, 80),
        source: compact(item?.source, 80),
        timestamp: item?.timestamp || null
    })).filter((item) => item.kind || item.id || item.provider_id);
}

function normalizeRecommendationContext(value = {}) {
    const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return {
        schema_version: TOPIC_RECOMMENDATION_CONTEXT_VERSION,
        run_id: compact(input.run_id || input.runId, 240),
        candidate_id: compact(input.candidate_id || input.candidateId, 240),
        topic_seed: compact(input.topic_seed || input.topicSeed, 180),
        policy_id: compact(input.policy_id || input.policyId, 120),
        policy_version: finite(input.policy_version ?? input.policyVersion, 0),
        rank: finite(input.rank, 0),
        score: finite(input.score, 0),
        breakdown: normalizeBreakdown(input.breakdown),
        source_refs: normalizeSourceRefs(input.source_refs || input.sourceRefs)
    };
}

function createRecommendationRunId() {
    return `topic_recommendation_run_${crypto.randomUUID()}`;
}

function buildRecommendationContext(input = {}) {
    const candidate = input.candidate && typeof input.candidate === 'object' ? input.candidate : {};
    const ranking = candidate.ranking && typeof candidate.ranking === 'object' ? candidate.ranking : {};
    const policy = input.policy && typeof input.policy === 'object' ? input.policy : {};
    return normalizeRecommendationContext({
        run_id: input.run_id || input.runId,
        candidate_id: candidate.id,
        topic_seed: candidate.topic_seed,
        policy_id: ranking.policy_id || policy.id,
        policy_version: ranking.policy_version || policy.version,
        rank: ranking.rank,
        score: ranking.score,
        breakdown: ranking.breakdown,
        source_refs: candidate.source_refs
    });
}

function stableOutcomeEvidenceId(context = {}, stage = '', discriminator = '') {
    const material = [context.run_id, context.candidate_id, stage, compact(discriminator, 500)].join(':');
    const digest = crypto.createHash('sha256').update(material).digest('hex');
    return `topic-recommendation-outcome:${digest}`;
}

function createTopicRecommendationLearningService(options = {}) {
    const recordActivityLifecycle = typeof options.recordActivityLifecycle === 'function'
        ? options.recordActivityLifecycle
        : async () => null;

    return {
        async recordOutcome(input = {}) {
            const stage = compact(input.stage, 40).toLowerCase();
            if (!TOPIC_RECOMMENDATION_OUTCOME_STAGES.includes(stage)) {
                throw new Error(`지원하지 않는 추천 outcome stage입니다: ${stage || '(empty)'}`);
            }
            const recommendation = normalizeRecommendationContext(input.recommendation);
            if (!recommendation.run_id || !recommendation.candidate_id) {
                return { recorded: false, reason: 'missing_recommendation_context' };
            }
            const subject = compact(input.subject || recommendation.topic_seed, 240);
            const discriminator = input.evidence_id
                || input.evidenceId
                || input.result_ref
                || input.resultRef
                || input.entity_ref
                || input.entityRef
                || input.feedback;
            const evidenceId = stableOutcomeEvidenceId(recommendation, stage, discriminator);
            const result = await recordActivityLifecycle({
                domain: 'blog',
                stage,
                subject,
                source: compact(input.source || 'topic-recommendation', 120),
                entity_ref: compact(input.entity_ref || input.entityRef || recommendation.candidate_id, 500),
                platform: compact(input.platform, 80),
                result_ref: compact(input.result_ref || input.resultRef, 500),
                evidence_id: evidenceId,
                owner_user_id: compact(input.owner_user_id || input.ownerUserId, 240),
                provenance: input.provenance || input,
                metadata: {
                    ...(input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata)
                        ? input.metadata
                        : {}),
                    ...(input.feedback ? { feedback: compact(input.feedback, 40) } : {}),
                    recommendation
                }
            });
            return { recorded: Boolean(result), evidence_id: evidenceId, result };
        }
    };
}

module.exports = {
    TOPIC_RECOMMENDATION_CONTEXT_VERSION,
    TOPIC_RECOMMENDATION_OUTCOME_STAGES,
    normalizeRecommendationContext,
    createRecommendationRunId,
    buildRecommendationContext,
    stableOutcomeEvidenceId,
    createTopicRecommendationLearningService
};
