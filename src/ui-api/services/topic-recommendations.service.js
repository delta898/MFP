const crypto = require('crypto');

function clampLimit(value, fallback = 3) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(1, Math.min(5, Math.floor(parsed))) : fallback;
}

function createTopicRecommendationsService(options = {}) {
    const {
        agentRuntime,
        retrievalService,
        eventStore,
        learningService,
        cacheTtlMs = 30 * 60 * 1000,
        now = () => Date.now()
    } = options;
    let cache = null;

    if (!agentRuntime || typeof agentRuntime.handleParsedEnvelope !== 'function') {
        throw new Error('agentRuntime is required');
    }
    if (!retrievalService || typeof retrievalService.buildContextPacket !== 'function') {
        throw new Error('retrievalService is required');
    }

    function getOwnerUserId() {
        const owner = eventStore && typeof eventStore.getLocalOwnerIdentity === 'function'
            ? eventStore.getLocalOwnerIdentity()
            : null;
        return String(owner?.owner_user_id || '').trim();
    }

    async function generate({ limit, requestId }) {
        const messageId = String(requestId || crypto.randomUUID());
        const ownerUserId = getOwnerUserId();
        const userId = ownerUserId || 'ui:local';
        const conversationId = 'ui:topic-recommendations';
        const memory = await retrievalService.buildContextPacket({
            conversationId,
            userId,
            ownerUserId,
            limit: 12
        });
        const outcome = await agentRuntime.handleParsedEnvelope({
            schema_version: 1,
            actions: [{
                id: `act_ui_topic_recommend_${messageId}`,
                type: 'content.generate',
                domain: 'content.idea',
                name: 'suggest',
                requires_confirmation: false,
                params: { limit, query: '' }
            }]
        }, {
            channel: 'ui',
            user: { id: userId, channel: 'ui', username: '' },
            conversation: { id: conversationId, channel: 'ui' },
            messageId,
            memory
        });
        if (outcome?.status !== 'completed') {
            throw new Error(Array.isArray(outcome?.errors) ? outcome.errors.join(' ') : '글감 추천을 생성하지 못했습니다.');
        }
        const capabilityResult = Array.isArray(outcome?.results) ? outcome.results[0]?.result : null;
        if (capabilityResult?.success !== true) {
            throw new Error(capabilityResult?.message || '글감 추천을 생성하지 못했습니다.');
        }
        const ideas = Array.isArray(capabilityResult?.data?.ideas)
            ? capabilityResult.data.ideas.slice(0, limit)
            : [];
        return {
            schema_version: 1,
            generated_at: new Date(now()).toISOString(),
            cache_ttl_seconds: Math.floor(cacheTtlMs / 1000),
            ideas
        };
    }

    return {
        async getRecommendations(input = {}) {
            const limit = clampLimit(input.limit);
            const refresh = input.refresh === true;
            const cacheValid = cache && (now() - cache.createdAt) < cacheTtlMs;
            if (!refresh && cacheValid && cache.limit >= limit) {
                return {
                    ...cache.data,
                    ideas: cache.data.ideas.slice(0, limit),
                    cached: true
                };
            }
            const data = await generate({ limit, requestId: input.requestId });
            cache = { createdAt: now(), limit, data };
            return { ...data, cached: false };
        },

        async recordOutcome(input = {}) {
            if (!learningService || typeof learningService.recordOutcome !== 'function') {
                throw new Error('recommendation learning service is not ready');
            }
            return learningService.recordOutcome({
                stage: input.stage,
                subject: input.subject,
                recommendation: input.recommendation,
                feedback: input.feedback,
                entity_ref: input.entityRef || input.entity_ref,
                result_ref: input.resultRef || input.result_ref,
                owner_user_id: getOwnerUserId(),
                source: 'topic-recommendation-ui',
                provenance: {
                    channel: 'ui',
                    surface: 'blog.quick',
                    action: input.stage
                }
            });
        }
    };
}

module.exports = {
    createTopicRecommendationsService
};
