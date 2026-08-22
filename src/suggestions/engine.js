const { recommendationToLegacySuggestion } = require('../recommendations/adapters/legacy-suggestion-dto-adapter');

function createSuggestionEngine(options = {}) {
    const providers = Array.isArray(options.providers) ? options.providers : [];
    const knowledgeRegistry = options.knowledgeRegistry || null;
    const recommendationMaterializer = options.recommendationMaterializer || null;
    const Logger = options.Logger || console;

    return {
        async generateSuggestions(input = {}, context = {}) {
            const knowledge = knowledgeRegistry
                ? await knowledgeRegistry.fetchForRoute('suggestions', {
                    topic: input.topic || '',
                    intent: input.intent || '',
                    query: input.query || '',
                    limit: input.limit || 5,
                    purpose: 'suggestions'
                }, context)
                : [];
            const suggestions = [];
            const candidates = [];
            for (const provider of providers) {
                if (!provider || typeof provider.generate !== 'function') continue;
                const items = await provider.generate(input, { ...context, knowledge });
                if (Array.isArray(items)) suggestions.push(...items);
                if (Array.isArray(items?.legacyItems)) suggestions.push(...items.legacyItems);
                if (Array.isArray(items?.candidates)) candidates.push(...items.candidates);
            }

            for (let index = 0; index < candidates.length; index += 1) {
                const candidate = candidates[index];
                const policy = {
                    policy_id: 'legacy-suggestion-compat-v1',
                    policy_version: 1,
                    eligible: true,
                    suppression_reasons: [],
                    score: Math.max(0.1, 1 - (index * 0.1)),
                    rank: index + 1,
                    breakdown: { compatibility_order: index + 1 },
                    decided_at: candidate.created_at
                };
                if (!recommendationMaterializer || typeof recommendationMaterializer.materialize !== 'function') continue;
                try {
                    const materialized = await recommendationMaterializer.materialize(candidate, policy, {
                        ...context,
                        opportunity_key: candidate.dedupe_key,
                        available_at: candidate.created_at,
                        operation_id: candidate.candidate_id,
                        adapter_id: 'legacy-memory-adapter-v1'
                    });
                    suggestions.push(recommendationToLegacySuggestion(materialized.recommendation, materialized));
                } catch (error) {
                    Logger.warn?.(`⚠️ [SuggestionAdapter] canonical 변환 실패: ${String(error.message || 'unknown').slice(0, 180)}`);
                    suggestions.push({
                        id: candidate.candidate_id,
                        type: String(candidate.metadata?.legacy_type || candidate.kind),
                        summary: candidate.summary,
                        payload: { source: String(candidate.metadata?.legacy_source || ''), persistence_status: 'unavailable' },
                        feedback_enabled: false,
                        status: 'proposed'
                    });
                }
            }

            return {
                suggestions: suggestions.slice(0, Math.max(1, Math.min(5, Number(input.limit || 3)))),
                knowledge
            };
        }
    };
}

module.exports = {
    createSuggestionEngine
};
