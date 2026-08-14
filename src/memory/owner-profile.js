function text(value) {
    return String(value ?? '').trim();
}

function normalizeFacet(item = {}) {
    return {
        value: text(item.display_value || item.normalized_value),
        normalized_value: text(item.normalized_value),
        evidence_count: Number(item.evidence_count || 0),
        last_used_at: item.last_used_at || null,
        evidence: {
            kind: 'topic_facet',
            id: text(item.id)
        }
    };
}

function collectFeedback(signals = []) {
    const counts = { helpful: 0, not_helpful: 0, accepted: 0, rejected: 0, unknown: 0 };
    const evidence = [];
    for (const signal of signals) {
        if (text(signal.stage) !== 'feedback') continue;
        const feedback = text(signal.payload?.metadata?.feedback).toLowerCase();
        if (Object.hasOwn(counts, feedback)) counts[feedback] += 1;
        else counts.unknown += 1;
        evidence.push({
            domain: text(signal.domain),
            subject: text(signal.subject),
            feedback: feedback || 'unknown',
            timestamp: signal.timestamp || null,
            evidence: signal.evidence || null,
            recommendation: signal.payload?.metadata?.recommendation || null
        });
    }
    return { counts, recent: evidence.slice(0, 20) };
}

function collectRecentSubjects(signals = []) {
    return signals
        .filter((signal) => text(signal.subject))
        .slice(0, 30)
        .map((signal) => ({
            subject: text(signal.subject),
            domain: text(signal.domain),
            stage: text(signal.stage),
            strength: text(signal.strength),
            timestamp: signal.timestamp || null,
            evidence: signal.evidence || null
        }));
}

function buildOwnerProfileProjection(input = {}) {
    const ownerUserId = text(input.owner_user_id || input.ownerUserId);
    const activity = input.activity && typeof input.activity === 'object' ? input.activity : {};
    const semantics = input.topic_semantics && typeof input.topic_semantics === 'object'
        ? input.topic_semantics
        : input.topicSemantics && typeof input.topicSemantics === 'object'
            ? input.topicSemantics
            : {};
    const signals = Array.isArray(activity.signals) ? activity.signals : [];

    return {
        schema_version: 1,
        projection_kind: 'owner_profile',
        owner_user_id: ownerUserId,
        generated_at: input.generated_at || input.generatedAt || new Date().toISOString(),
        interests: {
            keywords: (Array.isArray(semantics.keywords) ? semantics.keywords : []).map(normalizeFacet),
            categories: (Array.isArray(semantics.categories) ? semantics.categories : []).map(normalizeFacet),
            platforms: (Array.isArray(semantics.platforms) ? semantics.platforms : []).map(normalizeFacet)
        },
        activity: {
            counts_by_domain: { ...(activity.counts_by_domain || {}) },
            counts_by_stage: { ...(activity.counts_by_stage || {}) },
            counts_by_strength: { ...(activity.counts_by_strength || {}) },
            recent_subjects: collectRecentSubjects(signals)
        },
        feedback: collectFeedback(signals),
        evidence_summary: {
            scanned_count: Number(activity.scanned_evidence_count || 0),
            supported_count: Number(activity.supported_evidence_count || 0),
            excluded_count: Number(activity.excluded_evidence_count || 0),
            truncated: Boolean(activity.truncated)
        }
    };
}

module.exports = {
    buildOwnerProfileProjection,
    normalizeFacet,
    collectFeedback
};
