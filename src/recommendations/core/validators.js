const {
    RECOMMENDATION_KINDS,
    RECOMMENDATION_STATES,
    RECOMMENDATION_EVIDENCE_KINDS,
    RECOMMENDATION_EVIDENCE_STAGES,
    RECOMMENDATION_EVIDENCE_STRENGTHS,
    RECOMMENDATION_SOURCE_REF_KINDS,
    RECOMMENDATION_PRESENTATION_SURFACES,
    RECOMMENDATION_SENSITIVE_DATA_KEY_PATTERN,
    isPlainObject,
    normalizeRecommendationCandidate,
    normalizeRecommendationPolicyDecision,
    normalizeRecommendation
} = require('./contract');

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/;
const CAPABILITY_ID_PATTERN = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*){2,}$/;
const UI_TOKEN_PATTERN = /^[a-z][a-z0-9_-]*$/;
const FORBIDDEN_DATA_KEY_PATTERN = RECOMMENDATION_SENSITIVE_DATA_KEY_PATTERN;

function validTimestamp(value) {
    return typeof value === 'string' && value.trim() !== '' && Number.isFinite(Date.parse(value));
}

function validateIdentifier(value, path, errors) {
    if (!IDENTIFIER_PATTERN.test(String(value || ''))) errors.push(`${path} 형식이 올바르지 않습니다.`);
}

function validateTimestamp(value, path, errors, required = true) {
    if (!value && !required) return;
    if (!validTimestamp(value)) errors.push(`${path}는 유효한 ISO-8601 시각이어야 합니다.`);
}

function validateSafeValue(value, path, errors, depth = 0) {
    if (depth > 4) {
        errors.push(`${path}의 중첩 깊이는 4 이하여야 합니다.`);
        return;
    }
    if (value === null || value === undefined || typeof value === 'boolean') return;
    if (typeof value === 'string') {
        if (value.length > 1000) errors.push(`${path} 문자열은 1000자 이하여야 합니다.`);
        return;
    }
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) errors.push(`${path} 숫자는 유한값이어야 합니다.`);
        return;
    }
    if (Array.isArray(value)) {
        if (value.length > 20) errors.push(`${path} 배열은 20개 이하여야 합니다.`);
        value.forEach((item, index) => validateSafeValue(item, `${path}[${index}]`, errors, depth + 1));
        return;
    }
    if (!isPlainObject(value)) {
        errors.push(`${path}에는 JSON-compatible 값만 사용할 수 있습니다.`);
        return;
    }
    const entries = Object.entries(value);
    if (entries.length > 30) errors.push(`${path} object는 30개 이하의 key만 가질 수 있습니다.`);
    for (const [key, item] of entries) {
        if (FORBIDDEN_DATA_KEY_PATTERN.test(key)) errors.push(`${path}.${key}에는 secret 또는 raw provider data를 넣을 수 없습니다.`);
        validateSafeValue(item, `${path}.${key}`, errors, depth + 1);
    }
}

function validateSourceRef(sourceRef, path, errors, rawSourceRef = {}) {
    rejectUnknownKeys(rawSourceRef, [
        'kind', 'id', 'label', 'publisher', 'source', 'provider_id', 'providerId',
        'transport', 'url', 'timestamp'
    ], path, errors);
    if (!RECOMMENDATION_SOURCE_REF_KINDS.includes(sourceRef.kind)) {
        errors.push(`${path}.kind가 지원되지 않습니다.`);
    }
    if (!sourceRef.id && !sourceRef.provider_id) {
        errors.push(`${path}에는 id 또는 provider_id가 필요합니다.`);
    }
    if (sourceRef.timestamp) validateTimestamp(sourceRef.timestamp, `${path}.timestamp`, errors);
    if (sourceRef.url) {
        try {
            const url = new URL(sourceRef.url);
            if (!['http:', 'https:'].includes(url.protocol)) throw new Error('unsupported protocol');
            if (url.username || url.password) errors.push(`${path}.url에는 credential을 포함할 수 없습니다.`);
            for (const key of url.searchParams.keys()) {
                if (FORBIDDEN_DATA_KEY_PATTERN.test(key)) {
                    errors.push(`${path}.url query에는 credential을 포함할 수 없습니다.`);
                    break;
                }
            }
        } catch (_error) {
            errors.push(`${path}.url은 http 또는 https URL이어야 합니다.`);
        }
    }
}

function validateEvidence(evidence, path, errors, rawEvidence = {}) {
    rejectUnknownKeys(rawEvidence, [
        'evidence_id', 'evidenceId', 'kind', 'stage', 'strength', 'summary',
        'observed_at', 'observedAt', 'expires_at', 'expiresAt', 'source_ref',
        'sourceRef', 'features'
    ], path, errors);
    validateIdentifier(evidence.evidence_id, `${path}.evidence_id`, errors);
    if (!RECOMMENDATION_EVIDENCE_KINDS.includes(evidence.kind)) errors.push(`${path}.kind가 지원되지 않습니다.`);
    if (!RECOMMENDATION_EVIDENCE_STAGES.includes(evidence.stage)) errors.push(`${path}.stage가 지원되지 않습니다.`);
    if (!RECOMMENDATION_EVIDENCE_STRENGTHS.includes(evidence.strength)) errors.push(`${path}.strength가 지원되지 않습니다.`);
    if (!evidence.summary) errors.push(`${path}.summary가 필요합니다.`);
    validateTimestamp(evidence.observed_at, `${path}.observed_at`, errors);
    validateTimestamp(evidence.expires_at, `${path}.expires_at`, errors, false);
    if (validTimestamp(evidence.observed_at) && validTimestamp(evidence.expires_at)
        && Date.parse(evidence.expires_at) <= Date.parse(evidence.observed_at)) {
        errors.push(`${path}.expires_at은 observed_at 이후여야 합니다.`);
    }
    validateSourceRef(
        evidence.source_ref,
        `${path}.source_ref`,
        errors,
        rawEvidence.source_ref || rawEvidence.sourceRef
    );
    validateSafeValue(rawEvidence.features || {}, `${path}.features`, errors);

    if (evidence.kind === 'knowledge') {
        if (evidence.stage !== 'observed' || evidence.strength !== 'weak') {
            errors.push(`${path}의 external knowledge는 observed / weak 사실이어야 합니다.`);
        }
        if (evidence.source_ref.kind !== 'knowledge' || !evidence.source_ref.provider_id || !evidence.source_ref.transport) {
            errors.push(`${path}의 external knowledge에는 knowledge provider provenance가 필요합니다.`);
        }
    }
}

function resolvePresentationSurfaces(options = {}) {
    const configured = Array.isArray(options.presentationSurfaces) ? options.presentationSurfaces : null;
    return new Set(configured || RECOMMENDATION_PRESENTATION_SURFACES);
}

function rejectUnknownKeys(value, allowedKeys, path, errors) {
    if (!isPlainObject(value)) {
        errors.push(`${path}는 object여야 합니다.`);
        return;
    }
    for (const key of Object.keys(value)) {
        if (!allowedKeys.includes(key)) errors.push(`${path}.${key}는 허용되지 않습니다.`);
    }
}

function validateRawHandoffShape(handoff, path, errors) {
    if (handoff === null || handoff === undefined) return;
    if (!isPlainObject(handoff)) {
        errors.push(`${path}는 object 또는 null이어야 합니다.`);
        return;
    }
    const type = String(handoff.type || '').trim().toLowerCase();
    if (type === 'presentation') {
        rejectUnknownKeys(handoff, ['type', 'label', 'target', 'payload'], path, errors);
        rejectUnknownKeys(handoff.target, ['surface', 'view', 'tab'], `${path}.target`, errors);
        validateSafeValue(handoff.payload || {}, `${path}.payload`, errors);
        return;
    }
    if (type === 'capability') {
        rejectUnknownKeys(handoff, ['type', 'label', 'capability_id', 'capabilityId', 'params', 'intent'], path, errors);
        validateSafeValue(handoff.params || {}, `${path}.params`, errors);
    }
}

function validateHandoff(handoff, path, errors, options = {}) {
    if (handoff === null) return;
    if (!handoff.label) errors.push(`${path}.label이 필요합니다.`);
    if (handoff.type === 'presentation') {
        if (!resolvePresentationSurfaces(options).has(handoff.target?.surface)) {
            errors.push(`${path}.target.surface가 등록되지 않은 화면입니다.`);
        }
        for (const field of ['view', 'tab']) {
            const value = handoff.target?.[field];
            if (value && !UI_TOKEN_PATTERN.test(value)) errors.push(`${path}.target.${field} 형식이 올바르지 않습니다.`);
        }
        return;
    }
    if (handoff.type === 'capability') {
        if (!CAPABILITY_ID_PATTERN.test(handoff.capability_id || '')) {
            errors.push(`${path}.capability_id 형식이 올바르지 않습니다.`);
        }
        if (!handoff.intent) errors.push(`${path}.intent가 필요합니다.`);
        if (!isPlainObject(handoff.params)) errors.push(`${path}.params는 object여야 합니다.`);
        return;
    }
    errors.push(`${path}.type이 지원되지 않습니다.`);
}

function validateRecommendationCandidate(input = {}, options = {}) {
    const value = normalizeRecommendationCandidate(input);
    const errors = [];
    rejectUnknownKeys(input, [
        'schema_version', 'candidate_id', 'candidateId', 'kind', 'producer_id',
        'producerId', 'owner_user_id', 'ownerUserId', 'title', 'summary',
        'explanation', 'evidence', 'handoff', 'dedupe_key', 'dedupeKey',
        'created_at', 'createdAt', 'expires_at', 'expiresAt', 'metadata'
    ], 'candidate', errors);
    if (input.schema_version !== undefined && Number(input.schema_version) !== 1) {
        errors.push('schema_version이 지원되지 않습니다.');
    }
    validateIdentifier(value.candidate_id, 'candidate_id', errors);
    validateIdentifier(value.producer_id, 'producer_id', errors);
    validateIdentifier(value.owner_user_id, 'owner_user_id', errors);
    if (!RECOMMENDATION_KINDS.includes(value.kind)) errors.push('kind가 지원되지 않습니다.');
    if (!value.title) errors.push('title이 필요합니다.');
    if (!value.summary) errors.push('summary가 필요합니다.');
    if (!value.explanation) errors.push('explanation이 필요합니다.');
    const rawEvidence = Array.isArray(input.evidence) ? input.evidence : [];
    if (rawEvidence.length === 0) errors.push('evidence는 최소 1개 이상이어야 합니다.');
    if (rawEvidence.length > 12) errors.push('evidence는 최대 12개까지 허용됩니다.');
    value.evidence.forEach((item, index) => validateEvidence(item, `evidence[${index}]`, errors, rawEvidence[index]));
    validateRawHandoffShape(input?.handoff, 'handoff', errors);
    validateHandoff(value.handoff, 'handoff', errors, options);
    if (!value.dedupe_key) errors.push('dedupe_key가 필요합니다.');
    validateTimestamp(value.created_at, 'created_at', errors);
    validateTimestamp(value.expires_at, 'expires_at', errors);
    if (validTimestamp(value.created_at) && validTimestamp(value.expires_at)
        && Date.parse(value.expires_at) <= Date.parse(value.created_at)) {
        errors.push('expires_at은 created_at 이후여야 합니다.');
    }
    validateSafeValue(input.metadata || {}, 'metadata', errors);
    return { ok: errors.length === 0, errors, value };
}

function validateRecommendationPolicyDecision(input = {}) {
    const value = normalizeRecommendationPolicyDecision(input);
    const errors = [];
    rejectUnknownKeys(input, [
        'policy_id', 'policyId', 'policy_version', 'policyVersion', 'eligible',
        'suppression_reasons', 'suppressionReasons', 'score', 'rank', 'breakdown',
        'decided_at', 'decidedAt'
    ], 'policy', errors);
    validateIdentifier(value.policy_id, 'policy_id', errors);
    if (!Number.isInteger(value.policy_version) || value.policy_version < 1) {
        errors.push('policy_version은 1 이상의 정수여야 합니다.');
    }
    if (!Number.isFinite(value.score) || value.score < 0 || value.score > 1) {
        errors.push('score는 0 이상 1 이하의 숫자여야 합니다.');
    }
    if (value.eligible && (!Number.isInteger(value.rank) || value.rank < 1)) {
        errors.push('eligible policy의 rank는 1 이상의 정수여야 합니다.');
    }
    if (!value.eligible && value.rank !== 0) errors.push('suppressed policy의 rank는 0이어야 합니다.');
    if (!value.eligible && value.suppression_reasons.length === 0) {
        errors.push('suppressed policy에는 suppression_reasons가 필요합니다.');
    }
    const rawSuppressionReasons = input.suppression_reasons || input.suppressionReasons;
    if (Array.isArray(rawSuppressionReasons) && rawSuppressionReasons.length > 12) {
        errors.push('suppression_reasons는 최대 12개까지 허용됩니다.');
    }
    validateSafeValue(input.breakdown || {}, 'breakdown', errors);
    validateTimestamp(value.decided_at, 'decided_at', errors);
    return { ok: errors.length === 0, errors, value };
}

function validateRecommendation(input = {}, options = {}) {
    const value = normalizeRecommendation(input);
    const errors = [];
    rejectUnknownKeys(input, [
        'schema_version', 'recommendation_id', 'recommendationId', 'owner_user_id',
        'ownerUserId', 'candidate', 'policy', 'status', 'available_at', 'availableAt',
        'snoozed_until', 'snoozedUntil', 'expires_at', 'expiresAt', 'last_event_at',
        'lastEventAt'
    ], 'recommendation', errors);
    if (input.schema_version !== undefined && Number(input.schema_version) !== 1) {
        errors.push('schema_version이 지원되지 않습니다.');
    }
    validateIdentifier(value.recommendation_id, 'recommendation_id', errors);
    validateIdentifier(value.owner_user_id, 'owner_user_id', errors);
    const candidateResult = validateRecommendationCandidate(input.candidate, options);
    errors.push(...candidateResult.errors.map((error) => `candidate.${error}`));
    const policyResult = validateRecommendationPolicyDecision(input.policy);
    errors.push(...policyResult.errors.map((error) => `policy.${error}`));
    if (value.owner_user_id && value.candidate.owner_user_id && value.owner_user_id !== value.candidate.owner_user_id) {
        errors.push('owner_user_id가 candidate owner와 일치하지 않습니다.');
    }
    if (!value.policy.eligible) errors.push('materialized recommendation의 policy는 eligible이어야 합니다.');
    if (!RECOMMENDATION_STATES.includes(value.status)) errors.push('status가 지원되지 않습니다.');
    validateTimestamp(value.available_at, 'available_at', errors);
    validateTimestamp(value.snoozed_until, 'snoozed_until', errors, false);
    validateTimestamp(value.expires_at, 'expires_at', errors);
    validateTimestamp(value.last_event_at, 'last_event_at', errors);
    if (validTimestamp(value.available_at) && validTimestamp(value.expires_at)
        && Date.parse(value.expires_at) <= Date.parse(value.available_at)) {
        errors.push('expires_at은 available_at 이후여야 합니다.');
    }
    if (value.status === 'snoozed' && !value.snoozed_until) {
        errors.push('snoozed recommendation에는 snoozed_until이 필요합니다.');
    }
    if (value.status !== 'snoozed' && value.snoozed_until) {
        errors.push('snoozed 상태가 아니면 snoozed_until을 가질 수 없습니다.');
    }
    return { ok: errors.length === 0, errors, value };
}

module.exports = {
    IDENTIFIER_PATTERN,
    CAPABILITY_ID_PATTERN,
    FORBIDDEN_DATA_KEY_PATTERN,
    validTimestamp,
    validateSafeValue,
    validateRecommendationCandidate,
    validateRecommendationPolicyDecision,
    validateRecommendation
};
