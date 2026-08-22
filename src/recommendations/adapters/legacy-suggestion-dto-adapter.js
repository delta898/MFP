function recommendationToLegacySuggestion(recommendation = {}, options = {}) {
    const candidate = recommendation.candidate || {};
    return {
        id: recommendation.recommendation_id,
        type: String(candidate.metadata?.legacy_type || candidate.kind || 'recommendation'),
        summary: candidate.summary,
        payload: {
            source: String(candidate.metadata?.legacy_source || ''),
            feedback_key: String(candidate.metadata?.legacy_feedback_key || ''),
            recommendation_id: recommendation.recommendation_id,
            feedback_transport: 'recommendation',
            persistence_status: options.persisted === false ? 'unavailable' : 'available'
        },
        recommendation_id: recommendation.recommendation_id,
        feedback_transport: 'recommendation',
        feedback_enabled: options.persisted !== false,
        status: 'proposed'
    };
}

module.exports = { recommendationToLegacySuggestion };
