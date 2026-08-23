const { validateRecommendationCandidate } = require('../core/validators');
const { ACTIVE_STATES } = require('../core/lifecycle');
const { createRequirementRegistry } = require('./requirements');

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_COOLDOWNS_MS = Object.freeze({
    dismissed: 7 * DAY_MS,
    action_completed: 14 * DAY_MS
});

function compact(value, maxLength = 240) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function appendReason(reasons, reason) {
    if (reason && reasons.length < 12 && !reasons.includes(reason)) reasons.push(reason);
}

function isWithinCooldown(item, nowMs, cooldowns) {
    const duration = Number(cooldowns[item.status]);
    const lastEvent = Date.parse(item.last_event_at);
    return Number.isFinite(duration) && duration > 0 && Number.isFinite(lastEvent)
        && lastEvent + duration > nowMs;
}

function evaluateCandidateEligibility(candidateInput = {}, policyContext = {}, options = {}) {
    const validation = validateRecommendationCandidate(candidateInput);
    const reasons = [];
    if (!validation.ok) {
        return {
            candidate_id: compact(candidateInput?.candidate_id, 240),
            eligible: false,
            suppression_reasons: ['candidate_invalid'],
            requirements: null,
            matched_history: []
        };
    }
    const candidate = validation.value;
    const requirementRegistry = options.requirementRegistry || createRequirementRegistry();
    const requirements = requirementRegistry.resolve(candidate);
    const cooldowns = { ...DEFAULT_COOLDOWNS_MS, ...(options.cooldowns || {}) };
    const nowMs = Date.parse(policyContext.observed_at || options.now || new Date().toISOString());
    const contextOwner = compact(policyContext.owner_user_id, 240);

    if (!contextOwner || contextOwner !== candidate.owner_user_id) appendReason(reasons, 'owner_mismatch');
    if (!Number.isFinite(nowMs)) appendReason(reasons, 'policy_time_invalid');
    if (Number.isFinite(nowMs) && Date.parse(candidate.created_at) > nowMs) {
        appendReason(reasons, 'candidate_created_in_future');
    }
    if (Number.isFinite(nowMs) && Date.parse(candidate.expires_at) <= nowMs) {
        appendReason(reasons, 'candidate_expired');
    }

    for (const feature of requirements.license_features) {
        if (policyContext?.license?.known !== true) appendReason(reasons, 'license_context_unknown');
        else if (policyContext.license.features?.[feature] !== true) appendReason(reasons, `license_feature_disabled:${feature}`);
    }
    for (const capabilityId of requirements.capability_ids) {
        if (policyContext?.capabilities?.known !== true) appendReason(reasons, 'capability_context_unknown');
        else if (!policyContext.capabilities.ids?.includes(capabilityId)) {
            appendReason(reasons, `capability_unavailable:${capabilityId}`);
        }
    }
    for (const surface of requirements.presentation_surfaces) {
        if (policyContext?.presentation?.known !== true) appendReason(reasons, 'presentation_context_unknown');
        else if (!policyContext.presentation.surfaces?.includes(surface)) {
            appendReason(reasons, `presentation_unavailable:${surface}`);
        }
    }
    for (const settingKey of requirements.setting_keys) {
        if (policyContext?.settings?.known !== true) appendReason(reasons, 'settings_context_unknown');
        else if (policyContext.settings.values?.[settingKey] !== true) {
            appendReason(reasons, `setting_unready:${settingKey}`);
        }
    }
    for (const quotaClass of requirements.quota_classes) {
        const quota = policyContext?.quota?.[quotaClass];
        if (quota?.known !== true) appendReason(reasons, `quota_context_unknown:${quotaClass}`);
        else if (quota.unlimited !== true && Number(quota.remaining) <= 0) {
            appendReason(reasons, `quota_exhausted:${quotaClass}`);
        }
    }

    const historyKnown = policyContext?.history?.known === true;
    if (!historyKnown) appendReason(reasons, 'recommendation_history_unknown');
    const matchedHistory = historyKnown
        ? (Array.isArray(policyContext.history.items) ? policyContext.history.items : [])
            .filter((item) => item.dedupe_key === candidate.dedupe_key)
        : [];
    for (const item of matchedHistory) {
        if (ACTIVE_STATES.includes(item.status) && Date.parse(item.expires_at) > nowMs) {
            appendReason(reasons, 'active_duplicate');
        } else if (isWithinCooldown(item, nowMs, cooldowns)) {
            appendReason(reasons, `cooldown:${item.status}`);
        }
    }

    return {
        candidate_id: candidate.candidate_id,
        eligible: reasons.length === 0,
        suppression_reasons: reasons,
        requirements,
        matched_history: matchedHistory.map((item) => ({
            recommendation_id: item.recommendation_id,
            status: item.status,
            last_event_at: item.last_event_at
        }))
    };
}

module.exports = {
    DAY_MS,
    DEFAULT_COOLDOWNS_MS,
    evaluateCandidateEligibility,
    isWithinCooldown
};
