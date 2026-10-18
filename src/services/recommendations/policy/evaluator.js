const crypto = require('crypto');
const { validateRecommendationPolicyDecision } = require('../core/validators');
const { createRequirementRegistry } = require('./requirements');
const { evaluateCandidateEligibility } = require('./eligibility');
const { rankRecommendationCandidates } = require('./ranking');
const { POLICY_ID, POLICY_VERSION } = require('./scoring');

const POLICY_EVALUATION_SCHEMA_VERSION = 1;
const MAX_EVALUATION_CANDIDATES = 50;
const MAX_EVALUATION_DIAGNOSTICS = 50;

function compact(value, maxLength = 240) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function requirementCounts(requirements) {
    if (!requirements) return {};
    return {
        license_features: requirements.license_features?.length || 0,
        capability_ids: requirements.capability_ids?.length || 0,
        setting_keys: requirements.setting_keys?.length || 0,
        quota_classes: requirements.quota_classes?.length || 0,
        presentation_surfaces: requirements.presentation_surfaces?.length || 0
    };
}

function validatePolicyDecision(input, diagnostics, candidateId) {
    const validation = validateRecommendationPolicyDecision(input);
    if (validation.ok) return validation.value;
    if (diagnostics.length < MAX_EVALUATION_DIAGNOSTICS) {
        diagnostics.push({ candidate_id: compact(candidateId, 240), code: 'POLICY_DECISION_INVALID' });
    }
    return null;
}

function suppressedEligibilityPolicy(entry, decidedAt, diagnostics) {
    return validatePolicyDecision({
        policy_id: POLICY_ID,
        policy_version: POLICY_VERSION,
        eligible: false,
        suppression_reasons: entry.eligibility.suppression_reasons,
        score: 0,
        rank: 0,
        breakdown: {
            stage: 'eligibility',
            requirement_counts: requirementCounts(entry.eligibility.requirements)
        },
        decided_at: decidedAt
    }, diagnostics, entry.candidate?.candidate_id || entry.eligibility.candidate_id);
}

function selectedPolicy(entry, decidedAt, diagnostics) {
    return validatePolicyDecision({
        policy_id: POLICY_ID,
        policy_version: POLICY_VERSION,
        eligible: true,
        suppression_reasons: [],
        score: entry.score,
        rank: entry.rank,
        breakdown: {
            ...entry.breakdown,
            selection: { phase: entry.selection_phase }
        },
        decided_at: decidedAt
    }, diagnostics, entry.candidate.candidate_id);
}

function deferredPolicy(entry, decidedAt, diagnostics) {
    return validatePolicyDecision({
        policy_id: POLICY_ID,
        policy_version: POLICY_VERSION,
        eligible: false,
        suppression_reasons: [`ranking:${entry.deferred_reason}`],
        score: entry.score,
        rank: 0,
        breakdown: {
            ...entry.breakdown,
            selection: {
                deferred_reason: entry.deferred_reason,
                similar_to: compact(entry.similar_to, 240) || null
            }
        },
        decided_at: decidedAt
    }, diagnostics, entry.candidate.candidate_id);
}

function normalizeCandidateOrder(candidates = []) {
    return [...(Array.isArray(candidates) ? candidates : [])]
        .sort((left, right) => compact(left?.candidate_id, 240).localeCompare(compact(right?.candidate_id, 240)))
        .slice(0, MAX_EVALUATION_CANDIDATES);
}

function normalizeMaterializerReason(value) {
    const reason = compact(value, 120);
    return ['store_unavailable', 'write_failed'].includes(reason) ? reason : null;
}

function createRecommendationPolicyEvaluator(options = {}) {
    const contextCollector = options.contextCollector;
    const materializer = options.materializer || null;
    const requirementRegistry = options.requirementRegistry || createRequirementRegistry();
    const evaluationIdFactory = typeof options.evaluationIdFactory === 'function'
        ? options.evaluationIdFactory
        : () => `policy_eval:${crypto.randomUUID()}`;
    const rankingOptions = options.rankingOptions || {};
    if (!contextCollector || typeof contextCollector.collect !== 'function') {
        throw new Error('Policy Context collector가 필요합니다.');
    }

    return {
        async evaluate(input = {}, context = {}, runtimeOptions = {}) {
            const evaluationId = compact(evaluationIdFactory(), 240);
            const policyContext = await contextCollector.collect(input, context);
            const diagnostics = (Array.isArray(policyContext?.diagnostics) ? policyContext.diagnostics : [])
                .slice(0, MAX_EVALUATION_DIAGNOSTICS)
                .map((item) => ({ source: compact(item.source, 80), code: compact(item.code, 120) }));
            if (Array.isArray(input.candidates) && input.candidates.length > MAX_EVALUATION_CANDIDATES
                && diagnostics.length < MAX_EVALUATION_DIAGNOSTICS) {
                diagnostics.push({ source: 'evaluation', code: 'CANDIDATE_LIMIT_APPLIED' });
            }
            const entries = normalizeCandidateOrder(input.candidates).map((candidate) => ({
                candidate,
                eligibility: evaluateCandidateEligibility(candidate, policyContext, {
                    requirementRegistry,
                    ...(runtimeOptions.eligibilityOptions || {})
                })
            }));
            const seenCandidateIds = new Set();
            const seenDedupeKeys = new Set();
            for (const entry of entries) {
                if (entry.eligibility.eligible !== true) continue;
                const candidateId = compact(entry.candidate?.candidate_id, 240);
                const dedupeKey = compact(entry.candidate?.dedupe_key, 300);
                if (seenCandidateIds.has(candidateId) || seenDedupeKeys.has(dedupeKey)) {
                    entry.eligibility = {
                        ...entry.eligibility,
                        eligible: false,
                        suppression_reasons: ['evaluation_duplicate']
                    };
                    continue;
                }
                seenCandidateIds.add(candidateId);
                seenDedupeKeys.add(dedupeKey);
            }

            const ranking = rankRecommendationCandidates({ entries, policy_context: policyContext }, {
                ...rankingOptions,
                ...(runtimeOptions.rankingOptions || {})
            });
            const suppressed = [];
            for (const entry of entries.filter((item) => item.eligibility.eligible !== true)) {
                const policy = suppressedEligibilityPolicy(entry, policyContext.observed_at, diagnostics);
                if (policy) suppressed.push({
                    candidate_id: compact(entry.candidate?.candidate_id || entry.eligibility.candidate_id, 240),
                    policy
                });
            }
            for (const entry of ranking.deferred) {
                const policy = deferredPolicy(entry, policyContext.observed_at, diagnostics);
                if (policy) suppressed.push({ candidate_id: entry.candidate.candidate_id, policy });
            }

            const selected = ranking.selected.map((entry) => ({
                entry,
                policy: selectedPolicy(entry, policyContext.observed_at, diagnostics)
            })).filter((item) => item.policy);
            const materialized = await Promise.all(selected.map(async ({ entry, policy }) => {
                if (!materializer || typeof materializer.materialize !== 'function') {
                    if (diagnostics.length < MAX_EVALUATION_DIAGNOSTICS) diagnostics.push({
                        candidate_id: entry.candidate.candidate_id,
                        code: 'MATERIALIZER_UNAVAILABLE'
                    });
                    return null;
                }
                try {
                    const result = await materializer.materialize(entry.candidate, policy, {
                        ...context,
                        owner_user_id: policyContext.owner_user_id,
                        available_at: policyContext.observed_at,
                        opportunity_key: entry.candidate.dedupe_key,
                        delivery_key: evaluationId,
                        operation_id: evaluationId,
                        adapter_id: POLICY_ID
                    });
                    return {
                        candidate_id: entry.candidate.candidate_id,
                        recommendation: result.recommendation,
                        persisted: result.persisted === true,
                        deduplicated: result.deduplicated === true,
                        reason: normalizeMaterializerReason(result.reason)
                    };
                } catch (_error) {
                    if (diagnostics.length < MAX_EVALUATION_DIAGNOSTICS) diagnostics.push({
                        candidate_id: entry.candidate.candidate_id,
                        code: 'MATERIALIZATION_FAILED'
                    });
                    return null;
                }
            }));
            const completed = materialized.filter(Boolean);
            return {
                schema_version: POLICY_EVALUATION_SCHEMA_VERSION,
                evaluation_id: evaluationId,
                owner_user_id: compact(policyContext.owner_user_id, 240),
                evaluated_at: policyContext.observed_at,
                policy: { id: POLICY_ID, version: POLICY_VERSION },
                recommendations: completed,
                volatile: completed.filter((item) => !item.persisted),
                suppressed,
                ranking: ranking.stats,
                diagnostics: diagnostics.slice(0, MAX_EVALUATION_DIAGNOSTICS)
            };
        }
    };
}

module.exports = {
    MAX_EVALUATION_CANDIDATES,
    MAX_EVALUATION_DIAGNOSTICS,
    POLICY_EVALUATION_SCHEMA_VERSION,
    createRecommendationPolicyEvaluator,
    deferredPolicy,
    normalizeCandidateOrder,
    normalizeMaterializerReason,
    selectedPolicy,
    suppressedEligibilityPolicy
};
