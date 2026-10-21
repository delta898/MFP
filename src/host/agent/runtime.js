const { buildCapabilityId } = require('../../services/agent-actions/capability-id');
const {
    normalizeRuntimeContext,
    buildInvalidResult,
    buildCompletedResult,
    buildConfirmationResult
} = require('./contracts/runtime-contract');
const { validatePlan } = require('./planning/planner-contract');
const { createPlanner } = require('./planning/planner');

function createAgentRuntime(options = {}) {
    const capabilityRegistry = options.capabilityRegistry;
    const confirmationStore = options.confirmationStore;
    const eventStore = options.eventStore || null;
    const logger = options.Logger || null;

    if (!capabilityRegistry) {
        throw new Error('capabilityRegistry is required');
    }
    if (!confirmationStore) {
        throw new Error('confirmationStore is required');
    }

    const planner = options.planner || createPlanner({
        capabilityRegistry,
        CONFIG: options.CONFIG
    });

    async function recordEvent(event) {
        if (!eventStore || typeof eventStore.appendEvent !== 'function') return;
        try {
            await eventStore.appendEvent(event);
        } catch (_ignore) { }
    }

    function extractSuccessfulRegisterRowIndices(results = []) {
        return Array.from(new Set(
            (Array.isArray(results) ? results : [])
                .filter((item) => item?.action_domain === 'content.register_topic' && item?.action_name === 'execute')
                .flatMap((item) => (Array.isArray(item?.result?.data?.rowIndices) ? item.result.data.rowIndices : []))
                .map((item) => Number(item))
                .filter((item) => Number.isInteger(item) && item >= 0)
        ));
    }

    function hydrateActionFromPreviousResults(action = {}, previousResults = []) {
        if (action?.domain !== 'content.publish' || action?.name !== 'execute') {
            return action;
        }

        const currentTargets = Array.isArray(action?.params?.targetRowIndices)
            ? action.params.targetRowIndices
            : [];
        const hasExplicitTargets = currentTargets.some((item) => Number.isInteger(Number(item)) && Number(item) >= 0);
        if (hasExplicitTargets) {
            return action;
        }

        const inferredRowIndices = extractSuccessfulRegisterRowIndices(previousResults);
        if (inferredRowIndices.length === 0) {
            return action;
        }

        return {
            ...action,
            params: {
                ...(action.params || {}),
                targetRowIndices: inferredRowIndices
            }
        };
    }

    async function executeActions(actions = [], context = {}, plan = null) {
        const results = [];
        for (const action of actions) {
            const hydratedAction = hydrateActionFromPreviousResults(action, results);
            const capabilityId = buildCapabilityId(hydratedAction.domain, hydratedAction.name);
            logger?.info?.(`[AgentRuntime] action execution started capability_id=${capabilityId}`);
            let result;
            try {
                result = await capabilityRegistry.executeAction(hydratedAction, context);
            } catch (error) {
                const errorCode = String(error?.code || error?.name || 'UNKNOWN').replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 80) || 'UNKNOWN';
                logger?.error?.(`[AgentRuntime] action execution failed capability_id=${capabilityId} error_code=${errorCode}`);
                await recordEvent({
                    event_type: 'capability.action.failed',
                    actor_type: 'system',
                    actor_id: context?.user?.id || '',
                    conversation_id: context?.conversation?.id || '',
                    message_id: context?.messageId || '',
                    payload: { action: hydratedAction, error_code: errorCode, plan },
                    user: context?.user,
                    conversation: context?.conversation
                });
                throw error;
            }
            logger?.info?.(`[AgentRuntime] action execution completed capability_id=${capabilityId} success=${result?.success !== false}`);
            results.push({
                action_id: hydratedAction.id,
                action_type: hydratedAction.type,
                action_domain: hydratedAction.domain,
                action_name: hydratedAction.name,
                capability_id: capabilityId,
                result
            });
            await recordEvent({
                event_type: `capability.${action.type === 'setting.query' ? 'query' : action.type === 'setting.update' ? 'update' : 'action'}.executed`,
                actor_type: 'system',
                actor_id: context?.user?.id || '',
                conversation_id: context?.conversation?.id || '',
                message_id: context?.messageId || '',
                payload: {
                    action: hydratedAction,
                    result,
                    plan
                },
                user: context?.user,
                conversation: context?.conversation
            });
        }
        return results;
    }

    function buildSyntheticCapabilityResult(action = {}, message = '', data = {}) {
        return [{
            action_id: String(action.id || '').trim() || 'act_synthetic',
            action_type: action.type,
            action_domain: action.domain,
            action_name: action.name,
            capability_id: buildCapabilityId(action.domain, action.name),
            result: {
                success: true,
                message,
                data,
                sideEffects: []
            }
        }];
    }

    return {
        confirmationStore,

        async handleEnvelope(envelope = {}, context = {}) {
            const planningStartedAt = Date.now();
            const planning = await planner.buildPlan(envelope, context);
            logger?.info?.(`[AgentRuntime] planning completed duration_ms=${Date.now() - planningStartedAt} ok=${planning.ok === true}`);
            if (!planning.ok) {
                logger?.warn?.(`[AgentRuntime] plan rejected action_count=${Array.isArray(envelope.actions) ? envelope.actions.length : 0} error_count=${(planning.errors || []).length}`);
                await recordEvent({
                    event_type: 'agent.plan.rejected',
                    actor_type: 'agent',
                    actor_id: context?.user?.id || '',
                    conversation_id: context?.conversation?.id || '',
                    message_id: context?.messageId || '',
                    payload: { error_count: (planning.errors || []).length },
                    user: context?.user,
                    conversation: context?.conversation
                });
                return buildInvalidResult(planning.errors || ['요청 계획을 만들지 못했습니다.']);
            }

            const plan = planning.plan;
            logger?.info?.(`[AgentRuntime] plan accepted plan_id=${String(plan.plan_id || 'unknown')} action_count=${plan.steps.length}`);
            const outcome = await this.handlePlan(plan, context);
            return { ...outcome, plan };
        },

        async handlePlan(planInput = {}, context = {}) {
            const runtimeContext = normalizeRuntimeContext(context);
            const validation = validatePlan(planInput);
            if (!validation.ok) {
                await recordEvent({
                    event_type: 'agent.plan.rejected',
                    actor_type: 'agent',
                    actor_id: context?.user?.id || '',
                    conversation_id: context?.conversation?.id || '',
                    message_id: context?.messageId || '',
                    payload: { error_count: validation.errors.length },
                    user: context?.user,
                    conversation: context?.conversation
                });
                return buildInvalidResult(validation.errors);
            }

            const normalizedPlan = validation.plan;
            const normalizedActions = [];
            const normalizedSteps = [];
            for (const step of normalizedPlan.steps) {
                const action = step.action;
                const actionValidation = await capabilityRegistry.validateAction(action, context);
                if (!actionValidation.ok) {
                    if (actionValidation.correctionProposal) {
                        const correctedAction = {
                            ...action,
                            params: {
                                ...(action.params || {}),
                                category: actionValidation.correctionProposal.canonical_value
                            },
                            reason: action.reason || `입력값 보정: ${actionValidation.correctionProposal.raw_input} → ${actionValidation.correctionProposal.canonical_value}`
                        };
                        const preview = await capabilityRegistry.previewAction(correctedAction, context);
                        const correctedPlan = {
                            ...normalizedPlan,
                            confirmation_mode: 'plan',
                            steps: [{
                                ...step,
                                action: correctedAction,
                                requires_confirmation: true
                            }]
                        };
                        const confirmation = confirmationStore.create({
                            conversationId: runtimeContext?.conversation?.id || normalizedPlan.conversation_id || '',
                            messageId: normalizedPlan.message_id || '',
                            channel: runtimeContext?.channel || 'telegram',
                            userId: runtimeContext?.user?.id || '',
                            kind: 'correction',
                            plan: correctedPlan,
                            correction: actionValidation.correctionProposal,
                            actions: [correctedAction],
                            previews: [{
                                action_id: correctedAction.id,
                                capability_id: buildCapabilityId(correctedAction.domain, correctedAction.name),
                                preview: {
                                    ...preview,
                                    summary: `'${actionValidation.correctionProposal.raw_input}' 대신 '${actionValidation.correctionProposal.canonical_value}'로 처리합니다.`
                                }
                            }]
                        });
                        await recordEvent({
                            event_type: 'agent.confirmation.requested',
                            actor_type: 'agent',
                            actor_id: runtimeContext?.user?.id || '',
                            conversation_id: confirmation.conversationId,
                            message_id: confirmation.messageId,
                            payload: confirmation,
                            user: runtimeContext?.user,
                            conversation: runtimeContext?.conversation
                        });
                        return buildConfirmationResult(confirmation, confirmation.previews, { memory: runtimeContext.memory || {} });
                    }
                    await recordEvent({
                        event_type: 'capability.action.validation_failed',
                        actor_type: 'agent',
                        actor_id: runtimeContext?.user?.id || '',
                        conversation_id: runtimeContext?.conversation?.id || '',
                        message_id: runtimeContext?.messageId || '',
                        payload: {
                            capability_id: buildCapabilityId(action.domain, action.name),
                            error_count: (actionValidation.errors || []).length
                        },
                        user: runtimeContext?.user,
                        conversation: runtimeContext?.conversation
                    });
                    return buildInvalidResult(actionValidation.errors);
                }
                const normalizedAction = {
                    ...action,
                    params: actionValidation.normalizedParams || {}
                };
                normalizedActions.push(normalizedAction);
                normalizedSteps.push({
                    ...step,
                    action: normalizedAction
                });
            }

            const planned = {
                ...normalizedPlan,
                steps: normalizedSteps
            };

            await recordEvent({
                event_type: 'agent.plan.created',
                actor_type: 'agent',
                actor_id: runtimeContext?.user?.id || '',
                conversation_id: runtimeContext?.conversation?.id || planned.conversation_id || '',
                message_id: planned.message_id || '',
                payload: {
                    plan: planned
                },
                user: runtimeContext?.user,
                conversation: runtimeContext?.conversation
            });

            await recordEvent({
                event_type: 'agent.intent.parsed',
                actor_type: 'agent',
                actor_id: runtimeContext?.user?.id || '',
                conversation_id: runtimeContext?.conversation?.id || planned.conversation_id || '',
                message_id: planned.message_id || '',
                payload: {
                    envelope: {
                        version: '1.0',
                        conversation_id: planned.conversation_id,
                        message_id: planned.message_id,
                        actions: normalizedActions
                    }
                },
                user: runtimeContext?.user,
                conversation: runtimeContext?.conversation
            });

            if (normalizedActions.length === 1) {
                const pendingAction = normalizedActions[0];
                if (String(pendingAction.domain || '').trim() === 'agent.pending'
                    && (pendingAction.name === 'apply_latest' || pendingAction.name === 'reject_latest')) {
                    const latestPending = confirmationStore.getPendingByUser(runtimeContext?.user?.id || '').slice(-1)[0] || null;
                    if (!latestPending) {
                        return buildCompletedResult(
                            buildSyntheticCapabilityResult(
                                pendingAction,
                                '현재 확인 대기 중인 요청이 없습니다.',
                                { pending: [] }
                            ),
                            { memory: runtimeContext.memory || {} }
                        );
                    }

                    const decision = pendingAction.name === 'apply_latest' ? 'approve' : 'reject';
                    const outcome = await this.handleConfirmationDecision({
                        confirmationId: latestPending.id,
                        decision
                    }, context);

                    if (!outcome.ok) {
                        return buildInvalidResult([outcome.message || '확인 대기 중인 요청을 처리하지 못했습니다.']);
                    }

                    if (outcome.status === 'rejected') {
                        return buildCompletedResult(
                            buildSyntheticCapabilityResult(
                                pendingAction,
                                '가장 최근 확인 대기 중인 요청을 취소했습니다.',
                                { confirmation_id: latestPending.id }
                            ),
                            { memory: runtimeContext.memory || {} }
                        );
                    }

                    return buildCompletedResult([
                        ...buildSyntheticCapabilityResult(
                            pendingAction,
                            '가장 최근 확인 대기 중인 요청을 적용했습니다.',
                            { confirmation_id: latestPending.id }
                        ),
                        ...(Array.isArray(outcome.results) ? outcome.results : [])
                    ], { memory: runtimeContext.memory || {} });
                }
            }

            const previewItems = [];
            let requiresConfirmation = false;

            for (const action of normalizedActions) {
                const preview = await capabilityRegistry.previewAction(action, context);
                previewItems.push({
                    action_id: action.id,
                    capability_id: buildCapabilityId(action.domain, action.name),
                    preview
                });
                if (action.requires_confirmation) requiresConfirmation = true;
            }

            if (requiresConfirmation) {
                let supersededConfirmation = null;
                if (planned.supersedes_confirmation_id) {
                    supersededConfirmation = confirmationStore.reject(planned.supersedes_confirmation_id);
                    if (supersededConfirmation) {
                        await recordEvent({
                            event_type: 'agent.confirmation.superseded',
                            actor_type: 'agent',
                            actor_id: runtimeContext?.user?.id || '',
                            conversation_id: supersededConfirmation.conversationId || '',
                            message_id: supersededConfirmation.messageId || '',
                            payload: {
                                previous_confirmation_id: supersededConfirmation.id,
                                replacement_plan_id: planned.plan_id
                            },
                            user: runtimeContext?.user,
                            conversation: runtimeContext?.conversation
                        });
                    }
                }
                const confirmation = confirmationStore.create({
                    conversationId: runtimeContext?.conversation?.id || planned.conversation_id || '',
                    messageId: planned.message_id || '',
                    channel: runtimeContext?.channel || 'telegram',
                    userId: runtimeContext?.user?.id || '',
                    plan: planned,
                    actions: normalizedActions,
                    previews: previewItems,
                    superseded_confirmation_id: supersededConfirmation?.id || planned.supersedes_confirmation_id || ''
                });
                await recordEvent({
                    event_type: 'agent.confirmation.requested',
                    actor_type: 'agent',
                    actor_id: runtimeContext?.user?.id || '',
                    conversation_id: confirmation.conversationId,
                    message_id: confirmation.messageId,
                    payload: confirmation,
                    user: runtimeContext?.user,
                    conversation: runtimeContext?.conversation
                });
                return buildConfirmationResult(confirmation, previewItems, { memory: runtimeContext.memory || {} });
            }

            const results = await executeActions(normalizedActions, context, planned);
            return buildCompletedResult(results, { memory: runtimeContext.memory || {} });
        },

        async handleParsedEnvelope(envelope = {}, context = {}) {
            return this.handleEnvelope(envelope, context);
        },

        async handleConfirmationDecision(input = {}, context = {}) {
            const confirmationId = String(input.confirmationId || '').trim();
            const decision = String(input.decision || '').trim().toLowerCase();
            const item = confirmationStore.get(confirmationId);

            if (!item) {
                return { ok: false, status: 'not_found', message: '확인 요청을 찾지 못했습니다.' };
            }
            if (item.status === 'expired') {
                return { ok: false, status: 'expired', message: '확인 요청이 만료되었습니다.' };
            }
            if (item.status !== 'pending') {
                return { ok: false, status: 'invalid_state', message: '이미 처리된 확인 요청입니다.' };
            }

            if (decision === 'reject') {
                const rejected = confirmationStore.reject(confirmationId);
                await recordEvent({
                    event_type: 'agent.confirmation.rejected',
                    actor_type: 'user',
                    actor_id: context?.user?.id || rejected?.userId || '',
                    conversation_id: rejected?.conversationId || '',
                    message_id: rejected?.messageId || '',
                    payload: { confirmation_id: confirmationId },
                    user: context?.user,
                    conversation: context?.conversation
                });
                return { ok: true, status: 'rejected', confirmation: rejected };
            }

            const accepted = confirmationStore.accept(confirmationId);
            await recordEvent({
                event_type: 'agent.confirmation.accepted',
                actor_type: 'user',
                actor_id: context?.user?.id || accepted?.userId || '',
                conversation_id: accepted?.conversationId || '',
                message_id: accepted?.messageId || '',
                payload: {
                    confirmation_id: confirmationId,
                    correction: accepted?.correction || null
                },
                user: context?.user,
                conversation: context?.conversation
            });

            const acceptedActions = Array.isArray(accepted?.plan?.steps)
                ? accepted.plan.steps.map((step) => step.action).filter(Boolean)
                : (accepted.actions || []);
            const results = await executeActions(acceptedActions, context, accepted?.plan || null);
            if (accepted?.correction) {
                await recordEvent({
                    event_type: 'domain.alias.accepted',
                    actor_type: 'user',
                    actor_id: context?.user?.id || accepted?.userId || '',
                    conversation_id: accepted?.conversationId || '',
                    message_id: accepted?.messageId || '',
                    payload: accepted.correction,
                    user: context?.user,
                    conversation: context?.conversation
                });
            }
            confirmationStore.markExecuted(confirmationId);
            return { ok: true, status: 'executed', confirmation: accepted, results };
        }
    };
}

module.exports = {
    createAgentRuntime
};
