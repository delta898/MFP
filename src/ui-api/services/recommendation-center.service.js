const crypto = require('node:crypto');
const { toPublicRecommendationDto } = require('../../recommendations/core/contract');
const { IDENTIFIER_PATTERN } = require('../../recommendations/core/validators');
const { discoverySourcePreference } = require('./recommendation-refresh.service');
const { createApiError } = require('../errors');

const ACTIONABLE_STATES = new Set(['available', 'action_failed']);
const INTERACTIONS = new Set(['open', 'snooze', 'dismiss']);
const REQUEST_KEYS = new Set(['recommendation_id', 'interaction']);
const CONFIRMATION_KEYS = new Set(['recommendation_id', 'confirmation_id', 'decision']);
const DISCOVERY_REQUEST_KEYS = new Set();
const DISCOVERY_KINDS = new Set(['content_opportunity', 'commerce_opportunity']);
const SNOOZE_MS = 24 * 60 * 60 * 1000;

function boundedLimit(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? Math.max(1, Math.min(20, parsed)) : 6;
}

function assertExactKeys(input, allowed) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw createApiError(400, 'RECOMMENDATION_REQUEST_INVALID', '추천 요청 형식이 올바르지 않습니다.');
    }
    if (Object.keys(input).some((key) => !allowed.has(key))) {
        throw createApiError(400, 'RECOMMENDATION_REQUEST_UNSAFE', '허용되지 않은 추천 요청 필드가 있습니다.');
    }
}

function assertIdentifier(value, code, message) {
    const normalized = String(value || '').trim();
    if (!IDENTIFIER_PATTERN.test(normalized)) throw createApiError(400, code, message);
    return normalized;
}

function mapHandoffError(error) {
    if (error?.apiCode) return error;
    const code = String(error?.code || '').trim();
    const status = code.endsWith('_not_found') ? 404
        : (code.includes('invalid') || code.includes('untrusted')) ? 400
            : 409;
    return createApiError(status, `RECOMMENDATION_${code.toUpperCase() || 'HANDOFF_FAILED'}`, error?.message || '추천 동작을 처리하지 못했습니다.');
}

function createRecommendationCenterService(options = {}) {
    const eventStore = options.eventStore;
    const handoffService = options.handoffService;
    const refreshService = options.refreshService || null;
    const logger = options.logger;
    const now = typeof options.now === 'function' ? options.now : () => new Date();
    const operationIdFactory = typeof options.operationIdFactory === 'function'
        ? options.operationIdFactory
        : () => `recommendation_ui:${crypto.randomUUID()}`;
    if (!eventStore?.listRecommendations || !eventStore?.transitionRecommendation
        || !eventStore?.reconcileDueRecommendations) {
        throw new Error('recommendation event store가 필요합니다.');
    }
    if (!handoffService?.prepare || !handoffService?.decide) {
        throw new Error('recommendation handoff service가 필요합니다.');
    }

    function ownerUserId() {
        const owner = eventStore.getLocalOwnerIdentity?.();
        const value = String(owner?.owner_user_id || 'ui:local').trim();
        if (!IDENTIFIER_PATTERN.test(value)) {
            throw createApiError(503, 'RECOMMENDATION_OWNER_UNAVAILABLE', '추천 사용자 정보를 확인할 수 없습니다.');
        }
        return value;
    }

    function occurredAt() {
        return new Date(now()).toISOString();
    }

    async function transition(owner, recommendationId, eventType, operationId, extra = {}) {
        try {
            return await eventStore.transitionRecommendation({
                owner_user_id: owner,
                recommendation_id: recommendationId,
                event_type: eventType,
                operation_id: operationId,
                occurred_at: occurredAt(),
                ...extra
            });
        } catch (_error) {
            throw createApiError(409, 'RECOMMENDATION_STATE_CHANGED', '추천 상태가 변경되었습니다. 목록을 새로고침해 주세요.');
        }
    }

    const service = {
        async list(input = {}) {
            const owner = ownerUserId();
            const at = occurredAt();
            try {
                await eventStore.reconcileDueRecommendations(owner, { now: at, limit: 50 });
            } catch (error) {
                logger?.warn?.(`⚠️ [RecommendationCenter] due 상태 정리에 실패했습니다: ${error.message}`);
                // A read remains available when background reconciliation cannot write.
            }
            let items;
            try {
                items = await eventStore.listRecommendations(owner, { limit: 100 });
            } catch (error) {
                logger?.error?.(`❌ [RecommendationCenter] 추천 목록 조회 실패: ${error.message}`);
                throw createApiError(503, 'RECOMMENDATION_STORE_UNAVAILABLE', '추천 저장소를 불러올 수 없습니다.');
            }
            const nowMs = Date.parse(at);
            const actionable = (Array.isArray(items) ? items : [])
                .filter((item) => item.owner_user_id === owner && ACTIONABLE_STATES.has(item.status))
                .filter((item) => DISCOVERY_KINDS.has(item?.candidate?.kind))
                .filter((item) => Date.parse(item.available_at) <= nowMs && Date.parse(item.expires_at) > nowMs)
                .sort((left, right) => right.available_at.localeCompare(left.available_at)
                    || (left.policy?.rank || 999) - (right.policy?.rank || 999)
                    || left.recommendation_id.localeCompare(right.recommendation_id));
            let evaluated = null;
            if (refreshService?.refresh && (input.refresh === true || actionable.length === 0)) {
                try {
                    evaluated = await refreshService.refresh({ force: input.refresh === true });
                    if (evaluated?.status === 'evaluated') {
                        items = await eventStore.listRecommendations(owner, { limit: 100 });
                    }
                } catch (error) {
                    logger?.warn?.(`⚠️ [RecommendationCenter] 추천 평가 실패: ${error.message}`);
                    evaluated = { status: 'failed', candidate_count: 0, recommendation_count: 0 };
                }
            }
            const refreshedActionable = (evaluated?.status === 'evaluated' ? items : actionable)
                .filter((item) => item.owner_user_id === owner && ACTIONABLE_STATES.has(item.status))
                .filter((item) => DISCOVERY_KINDS.has(item?.candidate?.kind))
                .filter((item) => Date.parse(item.available_at) <= nowMs && Date.parse(item.expires_at) > nowMs)
                .sort((left, right) => right.available_at.localeCompare(left.available_at)
                    || (left.policy?.rank || 999) - (right.policy?.rank || 999)
                    || left.recommendation_id.localeCompare(right.recommendation_id));
            const limit = boundedLimit(input.limit);
            return {
                schema_version: 1,
                generated_at: at,
                count: refreshedActionable.length,
                items: refreshedActionable.slice(0, limit).map(toPublicRecommendationDto),
                refresh: evaluated,
                store: typeof eventStore.getRecommendationStoreStatus === 'function'
                    ? eventStore.getRecommendationStoreStatus()
                    : { mode: 'unknown', reason: '' }
            };
        },

        async interact(input = {}, context = {}) {
            assertExactKeys(input, REQUEST_KEYS);
            const recommendationId = assertIdentifier(
                input.recommendation_id,
                'RECOMMENDATION_ID_INVALID',
                '추천 ID 형식이 올바르지 않습니다.'
            );
            const interaction = String(input.interaction || '').trim().toLowerCase();
            if (!INTERACTIONS.has(interaction)) {
                throw createApiError(400, 'RECOMMENDATION_INTERACTION_INVALID', '지원하지 않는 추천 동작입니다.');
            }
            const owner = ownerUserId();
            const operationId = operationIdFactory();
            if (interaction === 'snooze') {
                const result = await transition(owner, recommendationId, 'recommendation.snoozed', `${operationId}:snooze`, {
                    snoozed_until: new Date(Date.parse(occurredAt()) + SNOOZE_MS).toISOString(),
                    reason_code: 'user_later'
                });
                return { status: 'snoozed', recommendation: toPublicRecommendationDto(result.recommendation) };
            }
            if (interaction === 'dismiss') {
                const current = await eventStore.getRecommendation?.(owner, recommendationId);
                const before = await eventStore.listRecommendations(owner, { limit: 100 });
                const activeIds = new Set((Array.isArray(before) ? before : [])
                    .filter((item) => ACTIONABLE_STATES.has(item.status))
                    .map((item) => item.recommendation_id));
                await transition(owner, recommendationId, 'recommendation.feedback_recorded', `${operationId}:feedback`, {
                    feedback: 'not_helpful', reason_code: 'user_not_interested'
                });
                const result = await transition(owner, recommendationId, 'recommendation.dismissed', `${operationId}:dismiss`, {
                    reason_code: 'user_not_interested'
                });
                let refresh = null;
                try {
                    refresh = await refreshService?.refresh?.({
                        force: true,
                        reason: 'user_dismiss_replacement',
                        preferred_source: discoverySourcePreference(current?.candidate)
                    }) || null;
                } catch (error) {
                    logger?.warn?.(`⚠️ [RecommendationCenter] 관심 없음 대체 카드 평가 실패: ${error.message}`);
                }
                const after = await eventStore.listRecommendations(owner, { limit: 100 });
                const replacement = (Array.isArray(after) ? after : [])
                    .filter((item) => ACTIONABLE_STATES.has(item.status))
                    .filter((item) => DISCOVERY_KINDS.has(item?.candidate?.kind))
                    .find((item) => !activeIds.has(item.recommendation_id)) || null;
                return {
                    status: 'dismissed',
                    recommendation: toPublicRecommendationDto(result.recommendation),
                    replacement: replacement ? toPublicRecommendationDto(replacement) : null,
                    refresh
                };
            }

            await transition(owner, recommendationId, 'recommendation.opened', `${operationId}:opened`, {
                reason_code: 'user_action'
            });
            try {
                return await handoffService.prepare({ ownerUserId: owner, recommendationId }, {
                    ...context,
                    channel: 'app',
                    user: { ...(context.user || {}), id: owner }
                });
            } catch (error) {
                throw mapHandoffError(error);
            }
        },

        async discover(input = {}) {
            assertExactKeys(input, DISCOVERY_REQUEST_KEYS);
            const owner = ownerUserId();
            const at = occurredAt();
            const items = await eventStore.listRecommendations(owner, { limit: 100 });
            const current = (Array.isArray(items) ? items : [])
                .filter((item) => item.owner_user_id === owner && ACTIONABLE_STATES.has(item.status))
                .filter((item) => DISCOVERY_KINDS.has(item?.candidate?.kind))
                .filter((item) => Date.parse(item.available_at) <= Date.parse(at) && Date.parse(item.expires_at) > Date.parse(at));
            let refresh = null;
            try {
                refresh = await refreshService?.refresh?.({ force: true, reason: 'user_new_discovery' }) || null;
            } catch (error) {
                logger?.warn?.(`⚠️ [RecommendationCenter] 새로운 발견 평가 실패: ${error.message}`);
            }
            const afterRefresh = await eventStore.listRecommendations(owner, { limit: 100 });
            const currentIds = new Set(current.map((item) => item.recommendation_id));
            const replacements = (Array.isArray(afterRefresh) ? afterRefresh : [])
                .filter((item) => item.owner_user_id === owner && ACTIONABLE_STATES.has(item.status))
                .filter((item) => DISCOVERY_KINDS.has(item?.candidate?.kind))
                .filter((item) => !currentIds.has(item.recommendation_id));
            const operationId = operationIdFactory();
            if (replacements.length > 0) {
                for (const item of current) {
                    await transition(owner, item.recommendation_id, 'recommendation.rotated', `${operationId}:rotate:${item.recommendation_id}`, {
                        reason_code: 'user_new_discovery'
                    });
                }
            }
            const result = await service.list({ limit: 3 });
            return { ...result, refresh, rotated_count: replacements.length > 0 ? current.length : 0 };
        },

        async decide(input = {}, context = {}) {
            assertExactKeys(input, CONFIRMATION_KEYS);
            const recommendationId = assertIdentifier(input.recommendation_id, 'RECOMMENDATION_ID_INVALID', '추천 ID 형식이 올바르지 않습니다.');
            const confirmationId = assertIdentifier(input.confirmation_id, 'RECOMMENDATION_CONFIRMATION_INVALID', '확인 요청 ID 형식이 올바르지 않습니다.');
            const decision = String(input.decision || '').trim().toLowerCase();
            if (!['accept', 'reject'].includes(decision)) {
                throw createApiError(400, 'RECOMMENDATION_DECISION_INVALID', '확인 응답이 올바르지 않습니다.');
            }
            const owner = ownerUserId();
            try {
                return await handoffService.decide({
                    ownerUserId: owner,
                    recommendationId,
                    confirmationId,
                    decision
                }, {
                    ...context,
                    channel: 'app',
                    user: { ...(context.user || {}), id: owner }
                });
            } catch (error) {
                throw mapHandoffError(error);
            }
        }
    };
    return service;
}

module.exports = {
    ACTIONABLE_STATES,
    DISCOVERY_KINDS,
    INTERACTIONS,
    SNOOZE_MS,
    boundedLimit,
    createRecommendationCenterService
};
