const crypto = require('node:crypto');
const { IDENTIFIER_PATTERN } = require('../core/validators');

const ACTIONABLE_STATES = new Set(['available', 'action_failed']);
const REQUEST_KEYS = new Set(['ownerUserId', 'owner_user_id', 'recommendationId', 'recommendation_id']);
const DECISION_KEYS = new Set([...REQUEST_KEYS, 'confirmationId', 'confirmation_id', 'decision']);

class RecommendationHandoffError extends Error {
    constructor(code, message) {
        super(message);
        this.name = 'RecommendationHandoffError';
        this.code = code;
    }
}

function assertRequestShape(input, allowedKeys) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new RecommendationHandoffError('invalid_request', '요청 형식이 올바르지 않습니다.');
    }
    const unknown = Object.keys(input).filter((key) => !allowedKeys.has(key));
    if (unknown.length > 0) {
        throw new RecommendationHandoffError('untrusted_action_input', '추천 실행 요청에는 recommendation id 외의 액션 정보를 넣을 수 없습니다.');
    }
}

function identityFrom(input = {}) {
    const ownerUserId = String(input.ownerUserId || input.owner_user_id || '').trim();
    const recommendationId = String(input.recommendationId || input.recommendation_id || '').trim();
    if (!IDENTIFIER_PATTERN.test(ownerUserId) || !IDENTIFIER_PATTERN.test(recommendationId)) {
        throw new RecommendationHandoffError('invalid_identity', '추천 식별자 형식이 올바르지 않습니다.');
    }
    return { ownerUserId, recommendationId };
}

function splitCapabilityId(capabilityId) {
    const index = capabilityId.lastIndexOf('.');
    if (index <= 0 || index >= capabilityId.length - 1) {
        throw new RecommendationHandoffError('capability_unavailable', '추천에 연결된 기능을 사용할 수 없습니다.');
    }
    return { domain: capabilityId.slice(0, index), name: capabilityId.slice(index + 1) };
}

function stableErrorCode(error) {
    const value = String(error?.code || '').trim().toLowerCase();
    return /^[a-z][a-z0-9_:-]{0,119}$/.test(value) ? value : 'capability_execution_failed';
}

function createRecommendationHandoffService(options = {}) {
    const recommendationStore = options.recommendationStore;
    const capabilityRegistry = options.capabilityRegistry;
    const confirmationStore = options.confirmationStore;
    const now = typeof options.now === 'function' ? options.now : () => new Date();
    const operationIdFactory = typeof options.operationIdFactory === 'function'
        ? options.operationIdFactory
        : () => `handoff:${crypto.randomUUID()}`;
    if (!recommendationStore?.getRecommendation || !recommendationStore?.transitionRecommendation) {
        throw new Error('recommendation lifecycle store가 필요합니다.');
    }
    if (!capabilityRegistry?.get || !capabilityRegistry?.validateAction
        || !capabilityRegistry?.previewAction || !capabilityRegistry?.executeAction) {
        throw new Error('capability registry가 필요합니다.');
    }
    if (!confirmationStore?.create || !confirmationStore?.get || !confirmationStore?.accept
        || !confirmationStore?.reject || !confirmationStore?.markExecuted) {
        throw new Error('confirmation store가 필요합니다.');
    }

    function timestamp() {
        return new Date(now()).toISOString();
    }

    async function loadRecommendation(identity) {
        const recommendation = await recommendationStore.getRecommendation(
            identity.ownerUserId,
            identity.recommendationId
        );
        if (!recommendation) {
            throw new RecommendationHandoffError('recommendation_not_found', '추천을 찾을 수 없습니다.');
        }
        if (!ACTIONABLE_STATES.has(recommendation.status)) {
            throw new RecommendationHandoffError('recommendation_not_actionable', '현재 상태에서는 이 추천을 실행할 수 없습니다.');
        }
        if (Date.parse(recommendation.expires_at) <= Date.parse(timestamp())) {
            throw new RecommendationHandoffError('recommendation_expired', '추천이 만료되었습니다.');
        }
        if (!recommendation.candidate?.handoff) {
            throw new RecommendationHandoffError('handoff_unavailable', '이 추천에는 실행할 후속 동작이 없습니다.');
        }
        return recommendation;
    }

    async function resolveCapability(recommendation, context) {
        const handoff = recommendation.candidate.handoff;
        const capability = capabilityRegistry.get(handoff.capability_id);
        if (!capability) {
            throw new RecommendationHandoffError('capability_unavailable', '추천에 연결된 기능을 사용할 수 없습니다.');
        }
        const names = splitCapabilityId(handoff.capability_id);
        const action = {
            id: `recommendation_action:${crypto.createHash('sha256').update(recommendation.recommendation_id).digest('hex').slice(0, 24)}`,
            type: capability.type,
            domain: names.domain,
            name: names.name,
            params: handoff.params || {},
            requires_confirmation: capability.confirmPolicy !== 'never',
            reason: handoff.intent
        };
        let validation;
        try {
            validation = await capabilityRegistry.validateAction(action, context);
        } catch (_error) {
            throw new RecommendationHandoffError('capability_validation_failed', '현재 설정이나 사용 권한으로 이 동작을 실행할 수 없습니다.');
        }
        if (!validation?.ok) {
            throw new RecommendationHandoffError('capability_validation_failed', '현재 설정이나 사용 권한으로 이 동작을 실행할 수 없습니다.');
        }
        action.params = validation.normalizedParams || {};
        let preview;
        try {
            preview = await capabilityRegistry.previewAction(action, context);
        } catch (_error) {
            throw new RecommendationHandoffError('capability_preview_failed', '추천 동작의 미리보기를 만들 수 없습니다.');
        }
        return { action, preview, capability };
    }

    async function execute(identity, recommendation, action, operationId, context) {
        try {
            await recommendationStore.transitionRecommendation({
                owner_user_id: identity.ownerUserId,
                recommendation_id: identity.recommendationId,
                event_type: 'recommendation.action_started',
                operation_id: `${operationId}:started`,
                occurred_at: timestamp(),
                metadata: { capability_id: recommendation.candidate.handoff.capability_id }
            });
        } catch (_error) {
            throw new RecommendationHandoffError('action_start_rejected', '추천 상태가 변경되어 동작을 시작하지 못했습니다.');
        }

        let result;
        try {
            result = await capabilityRegistry.executeAction(action, context);
            if (result?.success === false) {
                const error = new Error('capability returned an unsuccessful result');
                error.code = 'capability_unsuccessful_result';
                throw error;
            }
        } catch (error) {
            try {
                await recommendationStore.transitionRecommendation({
                    owner_user_id: identity.ownerUserId,
                    recommendation_id: identity.recommendationId,
                    event_type: 'recommendation.action_failed',
                    operation_id: `${operationId}:failed`,
                    occurred_at: timestamp(),
                    error_code: stableErrorCode(error),
                    metadata: { capability_id: recommendation.candidate.handoff.capability_id }
                });
            } catch (_recordError) {
                throw new RecommendationHandoffError(
                    'failure_record_failed',
                    '동작 실행 결과가 불확실해 자동 재시도를 중단했습니다. 상태를 확인해 주세요.'
                );
            }
            throw new RecommendationHandoffError('capability_execution_failed', '추천 동작 실행에 실패했습니다. 다시 시도할 수 있습니다.');
        }

        try {
            const transitioned = await recommendationStore.transitionRecommendation({
                owner_user_id: identity.ownerUserId,
                recommendation_id: identity.recommendationId,
                event_type: 'recommendation.action_completed',
                operation_id: `${operationId}:completed`,
                occurred_at: timestamp(),
                metadata: { capability_id: recommendation.candidate.handoff.capability_id }
            });
            return { result, recommendation: transitioned.recommendation };
        } catch (_error) {
            throw new RecommendationHandoffError(
                'completion_record_failed',
                '동작은 실행됐지만 완료 상태를 기록하지 못했습니다. 중복 실행하지 말고 상태를 확인해 주세요.'
            );
        }
    }

    return {
        async prepare(input = {}, context = {}) {
            assertRequestShape(input, REQUEST_KEYS);
            const identity = identityFrom(input);
            const recommendation = await loadRecommendation(identity);
            const handoff = recommendation.candidate.handoff;
            if (handoff.type === 'presentation') {
                return {
                    ok: true,
                    status: 'presentation',
                    recommendation_id: identity.recommendationId,
                    action: {
                        type: 'presentation',
                        label: handoff.label,
                        target: handoff.target,
                        payload: handoff.payload
                    }
                };
            }
            if (handoff.type !== 'capability') {
                throw new RecommendationHandoffError('handoff_unavailable', '지원되지 않는 추천 후속 동작입니다.');
            }
            const resolved = await resolveCapability(recommendation, context);
            const operationId = operationIdFactory();
            if (resolved.capability.confirmPolicy !== 'never') {
                const confirmation = confirmationStore.create({
                    channel: 'app',
                    userId: identity.ownerUserId,
                    kind: 'recommendation_action',
                    actions: [resolved.action],
                    previews: [resolved.preview],
                    correlation: {
                        kind: 'recommendation_action',
                        owner_id: identity.ownerUserId,
                        resource_id: identity.recommendationId,
                        operation_id: operationId
                    }
                });
                return {
                    ok: true,
                    status: 'confirmation_required',
                    recommendation_id: identity.recommendationId,
                    confirmation: {
                        id: confirmation.id,
                        label: handoff.label,
                        preview: resolved.preview,
                        expires_at: confirmation.expiresAt
                    }
                };
            }
            const executed = await execute(identity, recommendation, resolved.action, operationId, context);
            return {
                ok: true,
                status: 'executed',
                recommendation_id: identity.recommendationId,
                result: executed.result
            };
        },

        async decide(input = {}, context = {}) {
            assertRequestShape(input, DECISION_KEYS);
            const identity = identityFrom(input);
            const confirmationId = String(input.confirmationId || input.confirmation_id || '').trim();
            const decision = String(input.decision || '').trim().toLowerCase();
            if (!IDENTIFIER_PATTERN.test(confirmationId) || !['accept', 'reject'].includes(decision)) {
                throw new RecommendationHandoffError('invalid_decision', '확인 응답 형식이 올바르지 않습니다.');
            }
            const confirmation = confirmationStore.get(confirmationId);
            const correlation = confirmation?.correlation;
            if (!confirmation || confirmation.kind !== 'recommendation_action'
                || correlation?.kind !== 'recommendation_action'
                || correlation.owner_id !== identity.ownerUserId
                || correlation.resource_id !== identity.recommendationId) {
                throw new RecommendationHandoffError('confirmation_not_found', '확인 요청을 찾을 수 없습니다.');
            }
            if (confirmation.status === 'expired') {
                throw new RecommendationHandoffError('confirmation_expired', '확인 요청이 만료되었습니다.');
            }
            if (confirmation.status !== 'pending') {
                throw new RecommendationHandoffError('confirmation_already_decided', '이미 처리된 확인 요청입니다.');
            }
            if (decision === 'reject') {
                confirmationStore.reject(confirmationId);
                return { ok: true, status: 'rejected', recommendation_id: identity.recommendationId };
            }

            const recommendation = await loadRecommendation(identity);
            const resolved = await resolveCapability(recommendation, context);
            if (resolved.capability.confirmPolicy === 'never') {
                throw new RecommendationHandoffError('confirmation_policy_changed', '기능의 확인 정책이 변경되어 다시 시작해야 합니다.');
            }
            confirmationStore.accept(confirmationId);
            const executed = await execute(
                identity,
                recommendation,
                resolved.action,
                correlation.operation_id,
                context
            );
            confirmationStore.markExecuted(confirmationId);
            return {
                ok: true,
                status: 'executed',
                recommendation_id: identity.recommendationId,
                result: executed.result
            };
        }
    };
}

module.exports = {
    RecommendationHandoffError,
    createRecommendationHandoffService
};
