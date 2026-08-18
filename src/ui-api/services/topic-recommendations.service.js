const crypto = require('crypto');

function clampLimit(value, fallback = 3) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(1, Math.min(5, Math.floor(parsed))) : fallback;
}

function normalizeQuery(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 180);
}

function createTopicRecommendationsService(options = {}) {
    const {
        agentRuntime,
        retrievalService,
        eventStore,
        learningService,
        smartUsageService = null,
        cacheTtlMs = 30 * 60 * 1000,
        now = () => Date.now()
    } = options;
    const cacheByQuery = new Map();

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

    async function generate({ limit, query, requestId }) {
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
                params: { limit, query }
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
            const query = normalizeQuery(input.query);
            const currentTime = now();
            for (const [cacheKey, entry] of cacheByQuery.entries()) {
                if ((currentTime - entry.createdAt) >= cacheTtlMs) cacheByQuery.delete(cacheKey);
            }
            const cache = cacheByQuery.get(query) || null;
            const cacheValid = cache && (currentTime - cache.createdAt) < cacheTtlMs;
            if (!refresh && cacheValid && cache.limit >= limit) {
                return {
                    ...cache.data,
                    ideas: cache.data.ideas.slice(0, limit),
                    cached: true
                };
            }
            const createRecommendations = () => generate({ limit, query, requestId: input.requestId });
            const usageResult = smartUsageService
                ? await smartUsageService.run('content_idea', {
                    sessionId: input.sessionId,
                    operationId: input.operationId || input.requestId,
                    metadata: { surface: 'blog.quick', query_present: Boolean(query) }
                }, createRecommendations)
                : { result: await createRecommendations(), sessionId: input.sessionId || '', usage: null };
            const data = usageResult.result;
            cacheByQuery.set(query, { createdAt: currentTime, limit, data });
            return {
                ...data,
                cached: false,
                smart_usage: usageResult.usage,
                smart_usage_session_id: usageResult.sessionId
            };
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
    createTopicRecommendationsService,
    normalizeQuery
};
