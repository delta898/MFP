async function recordRecommendationFeedback(options = {}) {
    const eventStore = options.eventStore;
    const ownerUserId = String(options.owner_user_id || options.ownerUserId || '').trim();
    const recommendationId = String(options.recommendation_id || options.recommendationId || '').trim();
    const feedback = String(options.feedback || '').trim().toLowerCase();
    const operationId = String(options.operation_id || options.operationId || '').trim();
    const occurredAt = new Date(options.occurred_at || options.occurredAt || Date.now()).toISOString();
    if (!eventStore || typeof eventStore.transitionRecommendation !== 'function') {
        return { recorded: false, reason: 'store_unavailable' };
    }
    if (!['helpful', 'not_helpful'].includes(feedback)) throw new Error('지원하지 않는 recommendation feedback입니다.');
    const recorded = await eventStore.transitionRecommendation({
        owner_user_id: ownerUserId,
        recommendation_id: recommendationId,
        event_type: 'recommendation.feedback_recorded',
        operation_id: `${operationId}_feedback`,
        occurred_at: occurredAt,
        feedback,
        metadata: { source: String(options.source || '').slice(0, 80) }
    });
    let dismissed = null;
    if (feedback === 'not_helpful') {
        dismissed = await eventStore.transitionRecommendation({
            owner_user_id: ownerUserId,
            recommendation_id: recommendationId,
            event_type: 'recommendation.dismissed',
            operation_id: `${operationId}_dismiss`,
            occurred_at: occurredAt,
            reason_code: 'not_helpful_feedback'
        });
    }
    return { recorded: true, feedback: recorded, dismissed };
}

module.exports = { recordRecommendationFeedback };
