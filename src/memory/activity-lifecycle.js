const crypto = require('crypto');
const { normalizeInteractionProvenance } = require('./interaction-provenance');

const ACTIVITY_LIFECYCLE_VERSION = 1;
const ACTIVITY_EVENT_PREFIX = 'activity.lifecycle';
const ACTIVITY_SIGNAL_DOMAINS = Object.freeze(['blog', 'shopping', 'sns']);
const ACTIVITY_SIGNAL_STAGES = Object.freeze([
    'observed',
    'generated',
    'saved',
    'selected',
    'drafted',
    'scheduled',
    'published',
    'feedback'
]);
const ACTIVITY_SIGNAL_STRENGTHS = Object.freeze(['weak', 'medium', 'strong', 'explicit']);
const DEFAULT_STRENGTH_BY_STAGE = Object.freeze({
    observed: 'weak',
    generated: 'weak',
    saved: 'medium',
    selected: 'strong',
    drafted: 'strong',
    scheduled: 'strong',
    published: 'strong',
    feedback: 'explicit'
});

function compactText(value, maxLength = 240) {
    const text = String(value ?? '').replace(/\s+/g, ' ').trim();
    if (text.length <= maxLength) return text;
    return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

function normalizeToken(value) {
    return String(value || '').trim().toLowerCase();
}

function buildActivityEventType(domain, stage) {
    const normalizedDomain = normalizeToken(domain);
    const normalizedStage = normalizeToken(stage);
    if (!ACTIVITY_SIGNAL_DOMAINS.includes(normalizedDomain)) {
        throw new Error(`지원하지 않는 activity domain입니다: ${normalizedDomain || '(empty)'}`);
    }
    if (!ACTIVITY_SIGNAL_STAGES.includes(normalizedStage)) {
        throw new Error(`지원하지 않는 activity stage입니다: ${normalizedStage || '(empty)'}`);
    }
    return `${ACTIVITY_EVENT_PREFIX}.${normalizedDomain}.${normalizedStage}`;
}

function parseActivityEventType(value) {
    const match = String(value || '').trim().toLowerCase().match(/^activity\.lifecycle\.([a-z]+)\.([a-z]+)$/);
    if (!match) return null;
    const domain = match[1];
    const stage = match[2];
    if (!ACTIVITY_SIGNAL_DOMAINS.includes(domain) || !ACTIVITY_SIGNAL_STAGES.includes(stage)) return null;
    return { domain, stage };
}

function buildStableActivityEventId(evidenceId) {
    const normalizedEvidenceId = compactText(evidenceId, 500);
    if (!normalizedEvidenceId) return '';
    const digest = crypto.createHash('sha256').update(normalizedEvidenceId).digest('hex');
    return `activity_${digest}`;
}

function normalizeActivityEvidence(input = {}) {
    const domain = normalizeToken(input.domain);
    const stage = normalizeToken(input.stage);
    const eventType = buildActivityEventType(domain, stage);
    const strength = normalizeToken(input.strength) || DEFAULT_STRENGTH_BY_STAGE[stage];
    if (!ACTIVITY_SIGNAL_STRENGTHS.includes(strength)) {
        throw new Error(`지원하지 않는 activity strength입니다: ${strength || '(empty)'}`);
    }

    const subject = compactText(input.subject);
    const entityRef = compactText(input.entity_ref || input.entityRef, 500);
    const source = compactText(input.source, 120);
    if (!subject && !entityRef) {
        throw new Error('activity evidence에는 subject 또는 entity_ref가 필요합니다.');
    }
    if (!source) throw new Error('activity evidence에는 source가 필요합니다.');

    const evidenceId = compactText(input.evidence_id || input.evidenceId, 500);
    const provenance = normalizeInteractionProvenance(input.provenance || input, input);
    const payload = {
        schema_version: ACTIVITY_LIFECYCLE_VERSION,
        domain,
        stage,
        strength,
        subject,
        source,
        entity_ref: entityRef,
        platform: compactText(input.platform, 80),
        result_ref: compactText(input.result_ref || input.resultRef, 500),
        evidence_id: evidenceId,
        request_id: provenance.request_id,
        metadata: input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata)
            ? input.metadata
            : {}
    };

    return {
        id: buildStableActivityEventId(evidenceId),
        event_type: eventType,
        actor_type: provenance.actor_type,
        actor_id: provenance.actor_id,
        channel: provenance.channel,
        conversation_id: provenance.conversation_id,
        message_id: provenance.message_id,
        timestamp: input.timestamp || undefined,
        owner_user_id: compactText(input.owner_user_id || input.ownerUserId, 240),
        payload
    };
}

function createActivityLifecycleRecorder(options = {}) {
    const eventStore = options.eventStore || null;
    const Logger = options.Logger || null;

    return async function recordActivityLifecycle(input = {}) {
        if (!eventStore || eventStore.disabled || typeof eventStore.recordActivityLifecycle !== 'function') {
            return null;
        }
        try {
            return await eventStore.recordActivityLifecycle(input);
        } catch (error) {
            Logger?.warn?.(`⚠️ [AgentMemory] Activity lifecycle 기록 실패: ${error.message}`);
            return null;
        }
    };
}

module.exports = {
    ACTIVITY_LIFECYCLE_VERSION,
    ACTIVITY_EVENT_PREFIX,
    ACTIVITY_SIGNAL_DOMAINS,
    ACTIVITY_SIGNAL_STAGES,
    ACTIVITY_SIGNAL_STRENGTHS,
    DEFAULT_STRENGTH_BY_STAGE,
    buildActivityEventType,
    parseActivityEventType,
    buildStableActivityEventId,
    normalizeActivityEvidence,
    createActivityLifecycleRecorder
};
