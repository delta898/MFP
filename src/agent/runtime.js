const { buildCapabilityId, validateActionEnvelope } = require('./action-schema');
const { ConfirmationStore } = require('./confirmation-store');
const {
    normalizeRuntimeContext,
    buildInvalidResult,
    buildCompletedResult,
    buildConfirmationResult
} = require('./runtime-contract');

function createAgentRuntime(options = {}) {
    const capabilityRegistry = options.capabilityRegistry;
    const confirmationStore = options.confirmationStore || new ConfirmationStore();
    const eventStore = options.eventStore || null;

    if (!capabilityRegistry) {
        throw new Error('capabilityRegistry is required');
    }

    async function recordEvent(event) {
        if (!eventStore || typeof eventStore.appendEvent !== 'function') return;
        try {
            await eventStore.appendEvent(event);
        } catch (_ignore) { }
    }

    async function executeActions(actions = [], context = {}) {
        const results = [];
        for (const action of actions) {
            const result = await capabilityRegistry.executeAction(action, context);
            results.push({
                action_id: action.id,
                capability_id: buildCapabilityId(action.domain, action.name),
                result
            });
            await recordEvent({
                event_type: `capability.${action.type === 'setting.query' ? 'query' : action.type === 'setting.update' ? 'update' : 'action'}.executed`,
                actor_type: 'system',
                actor_id: context?.user?.id || '',
                conversation_id: context?.conversation?.id || '',
                message_id: context?.messageId || '',
                payload: {
                    action,
                    result
                },
                user: context?.user,
                conversation: context?.conversation
            });
        }
        return results;
    }

    return {
        confirmationStore,

        async handleParsedEnvelope(envelope = {}, context = {}) {
            const runtimeContext = normalizeRuntimeContext(context);
            const validation = validateActionEnvelope(envelope, capabilityRegistry);
            if (!validation.ok) {
                return buildInvalidResult(validation.errors);
            }

            const normalizedActions = [];
            for (const action of validation.envelope.actions) {
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
                        const confirmation = confirmationStore.create({
                            conversationId: runtimeContext?.conversation?.id || validation.envelope.conversation_id || '',
                            messageId: validation.envelope.message_id || '',
                            channel: runtimeContext?.channel || 'telegram',
                            userId: runtimeContext?.user?.id || '',
                            kind: 'correction',
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
                    return buildInvalidResult(actionValidation.errors);
                }
                normalizedActions.push({
                    ...action,
                    params: actionValidation.normalizedParams || {}
                });
            }

            const normalizedEnvelope = {
                ...validation.envelope,
                actions: normalizedActions
            };

            await recordEvent({
                event_type: 'agent.intent.parsed',
                actor_type: 'agent',
                actor_id: runtimeContext?.user?.id || '',
                conversation_id: runtimeContext?.conversation?.id || normalizedEnvelope.conversation_id || '',
                message_id: normalizedEnvelope.message_id || '',
                payload: {
                    envelope: normalizedEnvelope,
                    memory: runtimeContext.memory || {}
                },
                user: runtimeContext?.user,
                conversation: runtimeContext?.conversation
            });

            const previewItems = [];
            let requiresConfirmation = false;

            for (const action of normalizedEnvelope.actions) {
                const preview = await capabilityRegistry.previewAction(action, context);
                previewItems.push({
                    action_id: action.id,
                    capability_id: buildCapabilityId(action.domain, action.name),
                    preview
                });
                if (action.requires_confirmation) requiresConfirmation = true;
            }

            if (requiresConfirmation) {
                const confirmation = confirmationStore.create({
                    conversationId: runtimeContext?.conversation?.id || normalizedEnvelope.conversation_id || '',
                    messageId: normalizedEnvelope.message_id || '',
                    channel: runtimeContext?.channel || 'telegram',
                    userId: runtimeContext?.user?.id || '',
                    actions: normalizedEnvelope.actions,
                    previews: previewItems
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

            const results = await executeActions(normalizedEnvelope.actions, context);
            return buildCompletedResult(results, { memory: runtimeContext.memory || {} });
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

            const results = await executeActions(accepted.actions || [], context);
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
