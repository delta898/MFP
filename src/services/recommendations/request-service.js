const { toPublicRecommendationDto } = require('./core/contract');

function createRecommendationRequestService(options = {}) {
    const providers = Array.isArray(options.providers) ? options.providers : [];
    const knowledgeRegistry = options.knowledgeRegistry || null;
    const recommendationMaterializer = options.recommendationMaterializer || null;
    const Logger = options.Logger || console;

    return {
        async getRecommendations(input = {}, context = {}) {
            const knowledge = knowledgeRegistry
                ? await knowledgeRegistry.fetchForRoute('recommendations', {
                    topic: input.topic || '',
                    intent: input.intent || '',
                    query: input.query || '',
                    limit: input.limit || 5,
                    purpose: 'recommendations'
                }, context)
                : [];
            const recommendations = [];
            const candidates = [];
            for (const provider of providers) {
                if (!provider || typeof provider.produce !== 'function') continue;
                const items = await provider.produce(input, { ...context, knowledge });
                if (Array.isArray(items?.candidates)) candidates.push(...items.candidates);
            }

            for (let index = 0; index < candidates.length; index += 1) {
                const candidate = candidates[index];
                const policy = {
                    policy_id: 'agent-requested-recommendation-v1',
                    policy_version: 1,
                    eligible: true,
                    suppression_reasons: [],
                    score: Math.max(0.1, 1 - (index * 0.1)),
                    rank: index + 1,
                    breakdown: { request_order: index + 1 },
                    decided_at: candidate.created_at
                };
                if (!recommendationMaterializer || typeof recommendationMaterializer.materialize !== 'function') continue;
                try {
                    const materialized = await recommendationMaterializer.materialize(candidate, policy, {
                        ...context,
                        opportunity_key: candidate.dedupe_key,
                        available_at: candidate.created_at,
                        operation_id: candidate.candidate_id,
                        adapter_id: 'agent-memory-context-v1'
                    });
                    if (materialized.recommendation?.status !== 'available') continue;
                    recommendations.push({
                        ...toPublicRecommendationDto(materialized.recommendation),
                        feedback_enabled: materialized.persisted === true
                    });
                } catch (error) {
                    Logger.warn?.(`⚠️ [RecommendationRequest] canonical 저장 실패: ${String(error.message || 'unknown').slice(0, 180)}`);
                }
            }

            return {
                recommendations: recommendations.slice(0, Math.max(1, Math.min(5, Number(input.limit || 3)))),
                knowledge
            };
        }
    };
}

module.exports = {
    createRecommendationRequestService
};
