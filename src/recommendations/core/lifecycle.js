const crypto = require('node:crypto');
const { normalizeSafeValue } = require('./contract');

const OBSERVATIONAL_EVENTS = Object.freeze([
    'recommendation.delivered',
    'recommendation.opened',
    'recommendation.feedback_recorded'
]);

const TERMINAL_STATES = Object.freeze([
    'action_completed',
    'dismissed',
    'rotated',
    'expired'
]);

const ACTIVE_STATES = Object.freeze([
    'available',
    'snoozed',
    'action_in_progress',
    'action_failed'
]);

const TRANSITIONS = Object.freeze({
    'recommendation.created': Object.freeze({ from: [null], to: 'available' }),
    'recommendation.snoozed': Object.freeze({ from: ['available', 'action_failed'], to: 'snoozed' }),
    'recommendation.reactivated': Object.freeze({ from: ['snoozed'], to: 'available' }),
    'recommendation.dismissed': Object.freeze({ from: ['available', 'snoozed', 'action_failed'], to: 'dismissed' }),
    'recommendation.rotated': Object.freeze({ from: ['available', 'action_failed'], to: 'rotated' }),
    'recommendation.action_started': Object.freeze({ from: ['available', 'action_failed'], to: 'action_in_progress' }),
    'recommendation.action_failed': Object.freeze({ from: ['action_in_progress'], to: 'action_failed' }),
    'recommendation.action_completed': Object.freeze({ from: ['action_in_progress'], to: 'action_completed' }),
    'recommendation.expired': Object.freeze({ from: ['available', 'snoozed', 'action_failed'], to: 'expired' })
});

function toIsoTimestamp(value, fieldName = 'occurred_at') {
    const timestamp = String(value || '').trim();
    if (!timestamp || !Number.isFinite(Date.parse(timestamp))) {
        throw new Error(`${fieldName}는 유효한 ISO-8601 시각이어야 합니다.`);
    }
    return new Date(timestamp).toISOString();
}

function assertTransition(eventType, currentStatus) {
    if (OBSERVATIONAL_EVENTS.includes(eventType)) {
        if (!['available', 'action_failed'].includes(currentStatus)) {
            throw new Error(`${eventType} 이벤트는 ${currentStatus || 'none'} 상태에서 기록할 수 없습니다.`);
        }
        return currentStatus;
    }
    const rule = TRANSITIONS[eventType];
    if (!rule) throw new Error(`지원되지 않는 recommendation event입니다: ${eventType}`);
    if (!rule.from.includes(currentStatus ?? null)) {
        throw new Error(`${eventType} 전이는 ${currentStatus || 'none'} 상태에서 허용되지 않습니다.`);
    }
    return rule.to;
}

function buildRecommendationEventId({ owner_user_id, recommendation_id, event_type, operation_id }) {
    const values = [owner_user_id, recommendation_id, event_type, operation_id]
        .map((value) => String(value || '').trim());
    if (values.some((value) => !value)) throw new Error('event id 생성에는 owner, recommendation, event type, operation id가 필요합니다.');
    const digest = crypto.createHash('sha256').update(values.join(':')).digest('hex');
    return `recommendation_event:${digest}`;
}

function buildRecommendationEvent(command = {}, current = null) {
    const eventType = String(command.event_type || command.eventType || '').trim();
    const ownerUserId = String(command.owner_user_id || command.ownerUserId || '').trim();
    const recommendationId = String(command.recommendation_id || command.recommendationId || '').trim();
    const operationId = String(command.operation_id || command.operationId || '').trim();
    const occurredAt = toIsoTimestamp(command.occurred_at || command.occurredAt, 'occurred_at');
    const previousStatus = current?.status || null;
    const nextStatus = assertTransition(eventType, previousStatus);
    const snoozedUntil = command.snoozed_until || command.snoozedUntil || null;
    if (eventType === 'recommendation.snoozed') {
        const normalizedSnooze = toIsoTimestamp(snoozedUntil, 'snoozed_until');
        if (Date.parse(normalizedSnooze) <= Date.parse(occurredAt)) {
            throw new Error('snoozed_until은 occurred_at 이후여야 합니다.');
        }
    } else if (snoozedUntil) {
        throw new Error('snoozed_until은 recommendation.snoozed 이벤트에서만 허용됩니다.');
    }
    if (!ownerUserId || !recommendationId || !operationId) {
        throw new Error('owner_user_id, recommendation_id, operation_id가 필요합니다.');
    }
    if (command.previous_status && String(command.previous_status).trim() !== previousStatus) {
        throw new Error('요청한 previous_status가 현재 recommendation 상태와 일치하지 않습니다.');
    }
    return {
        id: buildRecommendationEventId({
            owner_user_id: ownerUserId,
            recommendation_id: recommendationId,
            event_type: eventType,
            operation_id: operationId
        }),
        event_type: eventType,
        timestamp: occurredAt,
        owner_user_id: ownerUserId,
        payload: {
            schema_version: 1,
            recommendation_id: recommendationId,
            owner_user_id: ownerUserId,
            operation_id: operationId,
            previous_status: previousStatus,
            next_status: nextStatus,
            occurred_at: occurredAt,
            snoozed_until: eventType === 'recommendation.snoozed'
                ? toIsoTimestamp(snoozedUntil, 'snoozed_until')
                : null,
            reason_code: String(command.reason_code || command.reasonCode || '').trim().slice(0, 120),
            error_code: String(command.error_code || command.errorCode || '').trim().slice(0, 120),
            feedback: String(command.feedback || '').trim().toLowerCase(),
            recommendation: eventType === 'recommendation.created' ? current : null,
            metadata: normalizeSafeValue(command.metadata || {})
        }
    };
}

function applyRecommendationEvent(current, event = {}) {
    const payload = event.payload || {};
    const eventType = String(event.event_type || '').trim();
    const currentStatus = current?.status || null;
    const nextStatus = assertTransition(eventType, currentStatus);
    if (payload.previous_status !== undefined && payload.previous_status !== currentStatus) {
        throw new Error('event previous_status가 projection과 일치하지 않습니다.');
    }
    if (payload.next_status !== undefined && payload.next_status !== nextStatus) {
        throw new Error('event next_status가 lifecycle 규칙과 일치하지 않습니다.');
    }
    if (eventType === 'recommendation.created') {
        if (!payload.recommendation) throw new Error('created event에는 recommendation snapshot이 필요합니다.');
        return {
            ...payload.recommendation,
            status: 'available',
            snoozed_until: null,
            last_event_at: toIsoTimestamp(payload.occurred_at || event.timestamp)
        };
    }
    if (OBSERVATIONAL_EVENTS.includes(eventType)) return { ...current };
    return {
        ...current,
        status: nextStatus,
        snoozed_until: eventType === 'recommendation.snoozed' ? payload.snoozed_until : null,
        last_event_at: toIsoTimestamp(payload.occurred_at || event.timestamp)
    };
}

module.exports = {
    ACTIVE_STATES,
    TERMINAL_STATES,
    OBSERVATIONAL_EVENTS,
    TRANSITIONS,
    assertTransition,
    buildRecommendationEventId,
    buildRecommendationEvent,
    applyRecommendationEvent
};
