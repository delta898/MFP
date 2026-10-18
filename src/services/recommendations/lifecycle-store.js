const {
    RECOMMENDATION_EVENT_TYPES,
    RECOMMENDATION_FEEDBACK_VALUES,
    RECOMMENDATION_SENSITIVE_DATA_KEY_PATTERN,
    isPlainObject
} = require('./core/contract');
const { validateRecommendation, validateSafeValue, IDENTIFIER_PATTERN } = require('./core/validators');
const {
    ACTIVE_STATES,
    buildRecommendationEventId,
    buildRecommendationEvent,
    applyRecommendationEvent
} = require('./core/lifecycle');

const COMMAND_KEYS = new Set([
    'owner_user_id', 'ownerUserId', 'recommendation_id', 'recommendationId',
    'event_type', 'eventType', 'operation_id', 'operationId', 'occurred_at',
    'occurredAt', 'previous_status', 'snoozed_until', 'snoozedUntil',
    'reason_code', 'reasonCode', 'error_code', 'errorCode', 'feedback', 'metadata'
]);

function assertIdentifier(value, fieldName) {
    if (!IDENTIFIER_PATTERN.test(String(value || ''))) throw new Error(`${fieldName} 형식이 올바르지 않습니다.`);
}

function validateCommand(command = {}) {
    if (!isPlainObject(command)) throw new Error('transition command는 object여야 합니다.');
    for (const key of Object.keys(command)) {
        if (!COMMAND_KEYS.has(key)) throw new Error(`command.${key}는 허용되지 않습니다.`);
        if (RECOMMENDATION_SENSITIVE_DATA_KEY_PATTERN.test(key)) throw new Error(`command.${key}에는 민감 데이터를 넣을 수 없습니다.`);
    }
    const ownerUserId = String(command.owner_user_id || command.ownerUserId || '').trim();
    const recommendationId = String(command.recommendation_id || command.recommendationId || '').trim();
    const operationId = String(command.operation_id || command.operationId || '').trim();
    assertIdentifier(ownerUserId, 'owner_user_id');
    assertIdentifier(recommendationId, 'recommendation_id');
    assertIdentifier(operationId, 'operation_id');
    const eventType = String(command.event_type || command.eventType || '').trim();
    if (!RECOMMENDATION_EVENT_TYPES.includes(eventType) || eventType === 'recommendation.created') {
        throw new Error('transition에 지원되지 않는 recommendation event입니다.');
    }
    const feedback = String(command.feedback || '').trim().toLowerCase();
    if (eventType === 'recommendation.feedback_recorded' && !RECOMMENDATION_FEEDBACK_VALUES.includes(feedback)) {
        throw new Error('recommendation feedback는 helpful 또는 not_helpful이어야 합니다.');
    }
    if (eventType !== 'recommendation.feedback_recorded' && feedback) {
        throw new Error('feedback은 recommendation.feedback_recorded 이벤트에서만 허용됩니다.');
    }
    if (command.metadata !== undefined && !isPlainObject(command.metadata)) {
        throw new Error('metadata는 object여야 합니다.');
    }
    const errors = [];
    validateSafeValue(command.metadata || {}, 'metadata', errors);
    if (errors.length > 0) throw new Error(errors.join(' '));
    return { ownerUserId, recommendationId, operationId, eventType };
}

class VolatileRecommendationRepository {
    constructor(options = {}) {
        this.mode = 'volatile';
        this.reason = String(options.reason || 'persistent store unavailable');
        this.maxItems = Math.max(1, Math.min(5000, Number.parseInt(options.maxItems, 10) || 1000));
        this.records = new Map();
        this.events = new Set();
    }

    _key(ownerUserId, recommendationId) {
        return `${ownerUserId}\u0000${recommendationId}`;
    }

    async hasEvent(eventId) { return this.events.has(eventId); }

    async get(ownerUserId, recommendationId) {
        return this.records.get(this._key(ownerUserId, recommendationId)) || null;
    }

    async findActiveByDedupeKey(ownerUserId, dedupeKey, now) {
        const currentTime = Date.parse(now || new Date().toISOString());
        return (await this.list(ownerUserId, { limit: this.maxItems })).find((item) =>
            item.candidate?.dedupe_key === dedupeKey
            && ACTIVE_STATES.includes(item.status)
            && Date.parse(item.expires_at) > currentTime
        ) || null;
    }

    async list(ownerUserId, options = {}) {
        const limit = Math.max(1, Math.min(this.maxItems, Number.parseInt(options.limit, 10) || 100));
        return [...this.records.values()]
            .filter((item) => item.owner_user_id === ownerUserId)
            .filter((item) => !options.status || item.status === options.status)
            .sort((left, right) => right.available_at.localeCompare(left.available_at)
                || left.recommendation_id.localeCompare(right.recommendation_id))
            .slice(0, limit);
    }

    async listAvailable(ownerUserId, options = {}) {
        const now = Date.parse(options.now || new Date().toISOString());
        return (await this.list(ownerUserId, { ...options, status: 'available' })).filter((item) =>
            Date.parse(item.available_at) <= now && Date.parse(item.expires_at) > now
        );
    }

    async listDue(ownerUserId, options = {}) {
        const now = Date.parse(options.now || new Date().toISOString());
        const limit = Math.max(1, Math.min(200, Number.parseInt(options.limit, 10) || 50));
        return [...this.records.values()]
            .filter((item) => item.owner_user_id === ownerUserId
                && ['available', 'snoozed', 'action_failed'].includes(item.status))
            .filter((item) => Date.parse(item.expires_at) <= now
                || (item.status === 'snoozed' && Date.parse(item.snoozed_until) <= now))
            .sort((left, right) => left.last_event_at.localeCompare(right.last_event_at)
                || left.recommendation_id.localeCompare(right.recommendation_id))
            .slice(0, limit);
    }

    async saveEventAndProjection(event, recommendation) {
        if (!this.records.has(this._key(recommendation.owner_user_id, recommendation.recommendation_id))
            && this.records.size >= this.maxItems) {
            throw new Error('volatile recommendation 저장 한도에 도달했습니다.');
        }
        this.events.add(event.id);
        this.records.set(
            this._key(recommendation.owner_user_id, recommendation.recommendation_id),
            JSON.parse(JSON.stringify(recommendation))
        );
        return recommendation;
    }
}

class RecommendationLifecycleStore {
    constructor(options = {}) {
        if (!options.repository) throw new Error('recommendation repository가 필요합니다.');
        this.repository = options.repository;
        this.queues = new Map();
    }

    _runExclusive(key, operation) {
        const previous = this.queues.get(key) || Promise.resolve();
        const current = previous.catch(() => undefined).then(operation);
        this.queues.set(key, current);
        return current.finally(() => {
            if (this.queues.get(key) === current) this.queues.delete(key);
        });
    }

    getRecommendationStoreStatus() {
        return {
            mode: this.repository.mode || 'unavailable',
            reason: String(this.repository.reason || '')
        };
    }

    async createRecommendation(input, context = {}) {
        const validation = validateRecommendation(input);
        if (!validation.ok) throw new Error(validation.errors.join(' '));
        const recommendation = validation.value;
        if (recommendation.status !== 'available') throw new Error('새 recommendation은 available 상태여야 합니다.');
        const operationId = String(context.operation_id || context.operationId || '').trim();
        assertIdentifier(operationId, 'operation_id');
        if (context.metadata !== undefined && !isPlainObject(context.metadata)) {
            throw new Error('metadata는 object여야 합니다.');
        }
        const contextErrors = [];
        validateSafeValue(context.metadata || {}, 'metadata', contextErrors);
        if (contextErrors.length > 0) throw new Error(contextErrors.join(' '));
        const queueKey = `create:${recommendation.owner_user_id}:${recommendation.candidate.dedupe_key}`;
        return this._runExclusive(queueKey, async () => {
            const existingById = await this.repository.get(recommendation.owner_user_id, recommendation.recommendation_id);
            if (existingById) return { recommendation: existingById, deduplicated: true };
            const existing = await this.repository.findActiveByDedupeKey(
                recommendation.owner_user_id,
                recommendation.candidate.dedupe_key,
                recommendation.available_at
            );
            if (existing) return { recommendation: existing, deduplicated: true };
            const event = buildRecommendationEvent({
                owner_user_id: recommendation.owner_user_id,
                recommendation_id: recommendation.recommendation_id,
                event_type: 'recommendation.created',
                operation_id: operationId,
                occurred_at: recommendation.last_event_at,
                metadata: context.metadata || {}
            }, { ...recommendation, status: null });
            event.payload.recommendation = recommendation;
            if (await this.repository.hasEvent(event.id)) {
                return { recommendation: await this.repository.get(recommendation.owner_user_id, recommendation.recommendation_id), deduplicated: true, event_id: event.id };
            }
            const projection = applyRecommendationEvent(null, event);
            await this.repository.saveEventAndProjection(event, projection);
            return { recommendation: projection, deduplicated: false, event_id: event.id };
        });
    }

    async transitionRecommendation(command = {}) {
        const identity = validateCommand(command);
        const queueKey = `transition:${identity.ownerUserId}:${identity.recommendationId}`;
        return this._runExclusive(queueKey, async () => {
            const eventId = buildRecommendationEventId({
                owner_user_id: identity.ownerUserId,
                recommendation_id: identity.recommendationId,
                event_type: identity.eventType,
                operation_id: identity.operationId
            });
            if (await this.repository.hasEvent(eventId)) {
                return {
                    recommendation: await this.repository.get(identity.ownerUserId, identity.recommendationId),
                    deduplicated: true,
                    event_id: eventId
                };
            }
            const current = await this.repository.get(identity.ownerUserId, identity.recommendationId);
            if (!current) throw new Error('recommendation을 찾을 수 없습니다.');
            const event = buildRecommendationEvent(command, current);
            const projection = applyRecommendationEvent(current, event);
            await this.repository.saveEventAndProjection(event, projection);
            return { recommendation: projection, deduplicated: false, event_id: event.id };
        });
    }

    async getRecommendation(ownerUserId, recommendationId) {
        assertIdentifier(ownerUserId, 'owner_user_id');
        assertIdentifier(recommendationId, 'recommendation_id');
        return this.repository.get(ownerUserId, recommendationId);
    }

    async findActiveByDedupeKey(ownerUserId, dedupeKey, now = new Date().toISOString()) {
        assertIdentifier(ownerUserId, 'owner_user_id');
        return this.repository.findActiveByDedupeKey(ownerUserId, String(dedupeKey || ''), now);
    }

    async listRecommendations(ownerUserId, options = {}) {
        assertIdentifier(ownerUserId, 'owner_user_id');
        let items = await this.repository.list(ownerUserId, options);
        if (options.status) items = items.filter((item) => item.status === options.status);
        return items;
    }

    async listAvailableRecommendations(ownerUserId, options = {}) {
        assertIdentifier(ownerUserId, 'owner_user_id');
        if (typeof this.repository.listAvailable === 'function') {
            return this.repository.listAvailable(ownerUserId, options);
        }
        const now = Date.parse(options.now || new Date().toISOString());
        return (await this.listRecommendations(ownerUserId, { ...options, status: 'available' }))
            .filter((item) => Date.parse(item.available_at) <= now && Date.parse(item.expires_at) > now);
    }

    async reconcileDueRecommendations(ownerUserId, options = {}) {
        assertIdentifier(ownerUserId, 'owner_user_id');
        const nowIso = new Date(options.now || Date.now()).toISOString();
        const now = Date.parse(nowIso);
        const limit = Math.max(1, Math.min(200, Number.parseInt(options.limit, 10) || 50));
        const due = typeof this.repository.listDue === 'function'
            ? await this.repository.listDue(ownerUserId, { now: nowIso, limit })
            : (await this.repository.list(ownerUserId, { limit: Math.min(500, limit * 4) }))
                .filter((item) => ACTIVE_STATES.includes(item.status) && (
                    Date.parse(item.expires_at) <= now
                    || (item.status === 'snoozed' && Date.parse(item.snoozed_until) <= now)
                )).slice(0, limit);
        const results = [];
        for (const item of due) {
            const expires = Date.parse(item.expires_at) <= now;
            const eventType = expires ? 'recommendation.expired' : 'recommendation.reactivated';
            const boundary = expires ? item.expires_at : item.snoozed_until;
            results.push(await this.transitionRecommendation({
                owner_user_id: ownerUserId,
                recommendation_id: item.recommendation_id,
                event_type: eventType,
                operation_id: `reconcile:${eventType.split('.').pop()}:${boundary}`,
                occurred_at: nowIso,
                reason_code: expires ? 'expiry_due' : 'snooze_due'
            }));
        }
        return results;
    }
}

function createVolatileRecommendationStore(options = {}) {
    return new RecommendationLifecycleStore({
        repository: new VolatileRecommendationRepository(options)
    });
}

module.exports = {
    validateCommand,
    VolatileRecommendationRepository,
    RecommendationLifecycleStore,
    createVolatileRecommendationStore
};
