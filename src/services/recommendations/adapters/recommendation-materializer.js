const { normalizeRecommendation } = require('../core/contract');
const { validateRecommendation } = require('../core/validators');
const { stableAdapterId } = require('./identity');

function createRecommendationMaterializer(options = {}) {
    const eventStore = options.eventStore || null;
    const Logger = options.Logger || console;
    const now = typeof options.now === 'function' ? options.now : () => Date.now();

    function resolveOwnerUserId(context = {}, candidate = {}) {
        const localOwner = eventStore && typeof eventStore.getLocalOwnerIdentity === 'function'
            ? eventStore.getLocalOwnerIdentity()
            : null;
        return String(candidate.owner_user_id
            || context?.memory?.owner_memory?.owner_user_id
            || context.owner_user_id
            || localOwner?.owner_user_id
            || '').trim();
    }

    return {
        async materialize(candidateInput = {}, policy = {}, context = {}) {
            const ownerUserId = resolveOwnerUserId(context, candidateInput);
            const candidate = { ...candidateInput, owner_user_id: ownerUserId };
            const availableAt = new Date(context.available_at || now()).toISOString();
            const recommendationId = String(context.recommendation_id || '').trim()
                || stableAdapterId(
                    'rec',
                    candidate.candidate_id,
                    context.delivery_key || context.opportunity_key || candidate.dedupe_key
                );
            const recommendation = normalizeRecommendation({
                recommendation_id: recommendationId,
                owner_user_id: ownerUserId,
                candidate,
                policy,
                status: 'available',
                available_at: availableAt,
                snoozed_until: null,
                expires_at: candidate.expires_at,
                last_event_at: availableAt
            });
            const validation = validateRecommendation(recommendation);
            if (!validation.ok) throw new Error(validation.errors.join(' '));
            if (!eventStore || typeof eventStore.createRecommendation !== 'function') {
                return { recommendation: validation.value, persisted: false, reason: 'store_unavailable' };
            }
            try {
                const result = await eventStore.createRecommendation(validation.value, {
                    operation_id: stableAdapterId('materialize', recommendationId, context.operation_id || context.opportunity_key),
                    metadata: { adapter_id: String(context.adapter_id || '').slice(0, 120) }
                });
                return { recommendation: result.recommendation, persisted: true, deduplicated: result.deduplicated === true };
            } catch (error) {
                Logger.warn?.(`⚠️ [RecommendationAdapter] materialization 실패: ${String(error.message || 'unknown').slice(0, 180)}`);
                return { recommendation: validation.value, persisted: false, reason: 'write_failed' };
            }
        }
    };
}

module.exports = { createRecommendationMaterializer };
