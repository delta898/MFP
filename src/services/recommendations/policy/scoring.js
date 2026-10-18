const POLICY_ID = 'proactive-guidance-ranking-v1';
const POLICY_VERSION = 1;

const COMPONENT_WEIGHTS = Object.freeze({
    grounding_quality: 0.30,
    owner_relevance: 0.25,
    freshness: 0.20,
    operational_urgency: 0.15,
    action_readiness: 0.10
});

const STRENGTH_VALUES = Object.freeze({ weak: 0.25, medium: 0.55, strong: 0.8, explicit: 1 });
const STAGE_VALUES = Object.freeze({
    observed: 0.25,
    generated: 0.2,
    saved: 0.65,
    selected: 0.8,
    drafted: 0.85,
    published: 0.95,
    feedback: 0.8
});
const URGENCY_VALUES = Object.freeze({
    recovery_action: 1,
    workflow_hint: 0.8,
    setup_guidance: 0.65,
    commerce_opportunity: 0.45,
    content_opportunity: 0.45
});
const KIND_PRIORITY = Object.freeze([
    'recovery_action',
    'workflow_hint',
    'setup_guidance',
    'commerce_opportunity',
    'content_opportunity'
]);

function clamp(value) {
    return Math.max(0, Math.min(1, Number.isFinite(Number(value)) ? Number(value) : 0));
}

function round(value) {
    return Math.round(clamp(value) * 1_000_000) / 1_000_000;
}

function timeRemainingRatio(start, end, now) {
    const startMs = Date.parse(start);
    const endMs = Date.parse(end);
    const nowMs = Date.parse(now);
    if (![startMs, endMs, nowMs].every(Number.isFinite) || endMs <= startMs) return null;
    return clamp((endMs - nowMs) / (endMs - startMs));
}

function groundingQuality(evidence = []) {
    if (!Array.isArray(evidence) || evidence.length === 0) return 0;
    const strengths = evidence.map((item) => STRENGTH_VALUES[item?.strength] || 0);
    const strongest = Math.max(...strengths, 0);
    const kinds = new Set(evidence.map((item) => String(item?.kind || '').trim()).filter(Boolean));
    const diversity = clamp(kinds.size / 3);
    return round(strongest * 0.75 + diversity * 0.25);
}

function ownerRelevance(evidence = []) {
    const ownerEvidence = (Array.isArray(evidence) ? evidence : [])
        .filter((item) => item?.kind === 'owner_activity');
    if (ownerEvidence.length === 0) return 0.4;
    return round(Math.max(...ownerEvidence.map((item) => {
        const stage = STAGE_VALUES[item.stage] || 0;
        const strength = STRENGTH_VALUES[item.strength] || 0;
        return strength === 1 ? 1 : stage * 0.7 + strength * 0.3;
    })));
}

function freshness(candidate = {}, now) {
    const candidateRatio = timeRemainingRatio(candidate.created_at, candidate.expires_at, now) ?? 0;
    const expiring = (Array.isArray(candidate.evidence) ? candidate.evidence : [])
        .map((item) => timeRemainingRatio(item.observed_at, item.expires_at, now))
        .filter((value) => value !== null);
    const evidenceRatio = expiring.length > 0
        ? expiring.reduce((sum, value) => sum + value, 0) / expiring.length
        : candidateRatio;
    return round(candidateRatio * 0.6 + evidenceRatio * 0.4);
}

function operationalUrgency(candidate = {}) {
    return URGENCY_VALUES[candidate.kind] ?? 0.4;
}

function actionReadiness(candidate = {}, eligibility = {}) {
    if (eligibility.eligible !== true) return 0;
    if (candidate?.handoff?.type === 'presentation' || candidate?.handoff?.type === 'capability') return 1;
    return 0.5;
}

function scoreRecommendationCandidate(candidate = {}, input = {}) {
    const now = input.now || new Date().toISOString();
    const values = {
        grounding_quality: groundingQuality(candidate.evidence),
        owner_relevance: ownerRelevance(candidate.evidence),
        freshness: freshness(candidate, now),
        operational_urgency: operationalUrgency(candidate),
        action_readiness: actionReadiness(candidate, input.eligibility || { eligible: true })
    };
    const components = Object.fromEntries(Object.entries(COMPONENT_WEIGHTS).map(([key, weight]) => [key, {
        value: round(values[key]),
        weight,
        contribution: round(values[key] * weight)
    }]));
    const evidence = Array.isArray(candidate.evidence) ? candidate.evidence : [];
    const score = round(Object.values(components).reduce((sum, item) => sum + item.contribution, 0));
    return {
        policy_id: POLICY_ID,
        policy_version: POLICY_VERSION,
        score,
        breakdown: {
            components,
            evidence_count: evidence.length,
            evidence_kinds: [...new Set(evidence.map((item) => String(item?.kind || '')).filter(Boolean))].sort(),
            strongest_strength: ['explicit', 'strong', 'medium', 'weak']
                .find((strength) => evidence.some((item) => item?.strength === strength)) || '',
            kind_priority: Math.max(0, KIND_PRIORITY.indexOf(candidate.kind))
        }
    };
}

function compareScoredCandidates(left, right) {
    return right.score - left.score
        || KIND_PRIORITY.indexOf(left.candidate.kind) - KIND_PRIORITY.indexOf(right.candidate.kind)
        || String(left.candidate.candidate_id).localeCompare(String(right.candidate.candidate_id));
}

module.exports = {
    COMPONENT_WEIGHTS,
    KIND_PRIORITY,
    POLICY_ID,
    POLICY_VERSION,
    STAGE_VALUES,
    STRENGTH_VALUES,
    URGENCY_VALUES,
    actionReadiness,
    compareScoredCandidates,
    freshness,
    groundingQuality,
    operationalUrgency,
    ownerRelevance,
    scoreRecommendationCandidate,
    timeRemainingRatio
};
