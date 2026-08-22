const RECOMMENDATION_SCHEMA_VERSION = 1;

const RECOMMENDATION_KINDS = Object.freeze([
    'content_opportunity',
    'commerce_opportunity',
    'setup_guidance',
    'recovery_action',
    'workflow_hint'
]);

const RECOMMENDATION_STATES = Object.freeze([
    'available',
    'snoozed',
    'action_in_progress',
    'action_failed',
    'action_completed',
    'dismissed',
    'expired'
]);

const RECOMMENDATION_EVENT_TYPES = Object.freeze([
    'recommendation.created',
    'recommendation.delivered',
    'recommendation.opened',
    'recommendation.snoozed',
    'recommendation.dismissed',
    'recommendation.action_started',
    'recommendation.action_failed',
    'recommendation.action_completed',
    'recommendation.expired'
]);

const RECOMMENDATION_EVIDENCE_KINDS = Object.freeze([
    'owner_activity',
    'knowledge',
    'system_state',
    'capability_state'
]);

const RECOMMENDATION_EVIDENCE_STAGES = Object.freeze([
    'observed',
    'generated',
    'saved',
    'selected',
    'drafted',
    'published',
    'feedback'
]);

const RECOMMENDATION_EVIDENCE_STRENGTHS = Object.freeze([
    'weak',
    'medium',
    'strong',
    'explicit'
]);

const RECOMMENDATION_SOURCE_REF_KINDS = Object.freeze([
    'event',
    'artifact',
    'knowledge',
    'setting',
    'job',
    'capability'
]);

const RECOMMENDATION_HANDOFF_TYPES = Object.freeze(['presentation', 'capability']);

const RECOMMENDATION_PRESENTATION_SURFACES = Object.freeze([
    'dashboard.recommendations',
    'blog.quick',
    'blog.topics',
    'blog.collect',
    'blog.trend_posting',
    'shopping.items',
    'shopping.batch',
    'settings.wordpress',
    'settings.shopping_connect',
    'settings.ai',
    'logs.system'
]);

const RECOMMENDATION_SENSITIVE_DATA_KEY_PATTERN = /(?:api[_-]?key|secret|password|authorization|access[_-]?token|refresh[_-]?token|raw[_-]?(?:response|body|payload))/i;

function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function compactText(value, maxLength = 240) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function normalizeToken(value, maxLength = 80) {
    return compactText(value, maxLength).toLowerCase();
}

function normalizeSafeValue(value, depth = 0) {
    if (depth > 4) return null;
    if (value === null || value === undefined) return value ?? null;
    if (typeof value === 'string') return compactText(value, 1000);
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'boolean') return value;
    if (Array.isArray(value)) return value.slice(0, 20).map((item) => normalizeSafeValue(item, depth + 1));
    if (!isPlainObject(value)) return null;
    return Object.fromEntries(
        Object.entries(value)
            .slice(0, 30)
            .filter(([key]) => !RECOMMENDATION_SENSITIVE_DATA_KEY_PATTERN.test(key))
            .map(([key, item]) => [compactText(key, 80), normalizeSafeValue(item, depth + 1)])
            .filter(([key]) => key)
    );
}

function normalizeSourceRef(value = {}) {
    const source = isPlainObject(value) ? value : {};
    return {
        kind: normalizeToken(source.kind, 40),
        id: compactText(source.id, 240),
        label: compactText(source.label || source.publisher || source.source, 160),
        provider_id: compactText(source.provider_id || source.providerId, 120),
        transport: normalizeToken(source.transport, 80),
        url: compactText(source.url, 1000),
        timestamp: compactText(source.timestamp, 80) || null
    };
}

function normalizeRecommendationEvidence(value = {}) {
    const evidence = isPlainObject(value) ? value : {};
    return {
        evidence_id: compactText(evidence.evidence_id || evidence.evidenceId, 240),
        kind: normalizeToken(evidence.kind, 40),
        stage: normalizeToken(evidence.stage, 40),
        strength: normalizeToken(evidence.strength, 40),
        summary: compactText(evidence.summary, 300),
        observed_at: compactText(evidence.observed_at || evidence.observedAt, 80),
        expires_at: compactText(evidence.expires_at || evidence.expiresAt, 80) || null,
        source_ref: normalizeSourceRef(evidence.source_ref || evidence.sourceRef),
        features: normalizeSafeValue(evidence.features || {})
    };
}

function normalizeRecommendationHandoff(value) {
    if (value === null || value === undefined) return null;
    const handoff = isPlainObject(value) ? value : {};
    const type = normalizeToken(handoff.type, 40);
    if (type === 'presentation') {
        const target = isPlainObject(handoff.target) ? handoff.target : {};
        return {
            type,
            label: compactText(handoff.label, 80),
            target: {
                surface: normalizeToken(target.surface, 80),
                view: normalizeToken(target.view, 80),
                tab: normalizeToken(target.tab, 80)
            },
            payload: normalizeSafeValue(handoff.payload || {})
        };
    }
    if (type === 'capability') {
        return {
            type,
            label: compactText(handoff.label, 80),
            capability_id: normalizeToken(handoff.capability_id || handoff.capabilityId, 160),
            params: normalizeSafeValue(handoff.params || {}),
            intent: compactText(handoff.intent, 180)
        };
    }
    return { type, label: compactText(handoff.label, 80) };
}

function normalizeRecommendationCandidate(value = {}) {
    const candidate = isPlainObject(value) ? value : {};
    return {
        schema_version: RECOMMENDATION_SCHEMA_VERSION,
        candidate_id: compactText(candidate.candidate_id || candidate.candidateId, 240),
        kind: normalizeToken(candidate.kind, 60),
        producer_id: compactText(candidate.producer_id || candidate.producerId, 160),
        owner_user_id: compactText(candidate.owner_user_id || candidate.ownerUserId, 240),
        title: compactText(candidate.title, 180),
        summary: compactText(candidate.summary, 300),
        explanation: compactText(candidate.explanation, 500),
        evidence: (Array.isArray(candidate.evidence) ? candidate.evidence : [])
            .slice(0, 12)
            .map(normalizeRecommendationEvidence),
        handoff: normalizeRecommendationHandoff(candidate.handoff),
        dedupe_key: compactText(candidate.dedupe_key || candidate.dedupeKey, 300),
        created_at: compactText(candidate.created_at || candidate.createdAt, 80),
        expires_at: compactText(candidate.expires_at || candidate.expiresAt, 80),
        metadata: normalizeSafeValue(candidate.metadata || {})
    };
}

function normalizeRecommendationPolicyDecision(value = {}) {
    const policy = isPlainObject(value) ? value : {};
    const score = Number(policy.score);
    const rank = Number(policy.rank);
    return {
        policy_id: compactText(policy.policy_id || policy.policyId, 160),
        policy_version: Number.isInteger(Number(policy.policy_version ?? policy.policyVersion))
            ? Number(policy.policy_version ?? policy.policyVersion)
            : 0,
        eligible: policy.eligible === true,
        suppression_reasons: (Array.isArray(policy.suppression_reasons || policy.suppressionReasons)
            ? (policy.suppression_reasons || policy.suppressionReasons)
            : [])
            .slice(0, 12)
            .map((item) => compactText(item, 160))
            .filter(Boolean),
        score: Number.isFinite(score) ? score : 0,
        rank: Number.isInteger(rank) ? rank : 0,
        breakdown: normalizeSafeValue(policy.breakdown || {}),
        decided_at: compactText(policy.decided_at || policy.decidedAt, 80)
    };
}

function normalizeRecommendation(value = {}) {
    const recommendation = isPlainObject(value) ? value : {};
    return {
        schema_version: RECOMMENDATION_SCHEMA_VERSION,
        recommendation_id: compactText(recommendation.recommendation_id || recommendation.recommendationId, 240),
        owner_user_id: compactText(recommendation.owner_user_id || recommendation.ownerUserId, 240),
        candidate: normalizeRecommendationCandidate(recommendation.candidate),
        policy: normalizeRecommendationPolicyDecision(recommendation.policy),
        status: normalizeToken(recommendation.status, 60),
        available_at: compactText(recommendation.available_at || recommendation.availableAt, 80),
        snoozed_until: compactText(recommendation.snoozed_until || recommendation.snoozedUntil, 80) || null,
        expires_at: compactText(recommendation.expires_at || recommendation.expiresAt, 80),
        last_event_at: compactText(recommendation.last_event_at || recommendation.lastEventAt, 80)
    };
}

function toPublicRecommendationDto(value = {}) {
    const recommendation = normalizeRecommendation(value);
    const handoff = recommendation.candidate.handoff;
    const action = handoff?.type === 'presentation'
        ? {
            type: handoff.type,
            label: handoff.label,
            target: handoff.target,
            payload: handoff.payload
        }
        : handoff?.type === 'capability'
            ? { type: handoff.type, label: handoff.label }
            : null;
    return {
        schema_version: recommendation.schema_version,
        recommendation_id: recommendation.recommendation_id,
        kind: recommendation.candidate.kind,
        title: recommendation.candidate.title,
        summary: recommendation.candidate.summary,
        explanation: recommendation.candidate.explanation,
        evidence: recommendation.candidate.evidence.map((item) => ({
            evidence_id: item.evidence_id,
            kind: item.kind,
            stage: item.stage,
            strength: item.strength,
            summary: item.summary,
            observed_at: item.observed_at,
            source: {
                label: item.source_ref.label,
                url: item.source_ref.url,
                timestamp: item.source_ref.timestamp
            }
        })),
        status: recommendation.status,
        available_at: recommendation.available_at,
        snoozed_until: recommendation.snoozed_until,
        expires_at: recommendation.expires_at,
        action
    };
}

module.exports = {
    RECOMMENDATION_SCHEMA_VERSION,
    RECOMMENDATION_KINDS,
    RECOMMENDATION_STATES,
    RECOMMENDATION_EVENT_TYPES,
    RECOMMENDATION_EVIDENCE_KINDS,
    RECOMMENDATION_EVIDENCE_STAGES,
    RECOMMENDATION_EVIDENCE_STRENGTHS,
    RECOMMENDATION_SOURCE_REF_KINDS,
    RECOMMENDATION_HANDOFF_TYPES,
    RECOMMENDATION_PRESENTATION_SURFACES,
    RECOMMENDATION_SENSITIVE_DATA_KEY_PATTERN,
    isPlainObject,
    compactText,
    normalizeSafeValue,
    normalizeSourceRef,
    normalizeRecommendationEvidence,
    normalizeRecommendationHandoff,
    normalizeRecommendationCandidate,
    normalizeRecommendationPolicyDecision,
    normalizeRecommendation,
    toPublicRecommendationDto
};
