'use strict';

const crypto = require('crypto');
const { normalizeRuntimeContext } = require('../../../host/agent/contracts/runtime-contract');
const { getActionInputPolicy, formatInputPolicy } = require('../../../services/agent-actions/input-policy');

const BLOG_ACTION_PREFIXES = ['content.register_topic.', 'content.queue.', 'content.manuscript.'];

function toToolName(actionId) {
    return `blog_${String(actionId || '').replace(/[^a-zA-Z0-9_]/g, '_')}`;
}

function buildToolDefinitions(capabilityRegistry) {
    const actions = capabilityRegistry.listAgentActions()
        .filter((action) => BLOG_ACTION_PREFIXES.some((prefix) => action.id.startsWith(prefix)));
    return [
        ...actions.map((action) => {
            const inputPolicy = getActionInputPolicy(action);
            const inputSchema = structuredClone(action.agentExposure.inputSchema);
            for (const [field, prompt] of Object.entries({ ...inputPolicy.required, ...inputPolicy.optional })) {
                const property = inputSchema.properties?.[field];
                if (property) property.description = [property.description, prompt].filter(Boolean).join(' ');
            }
            return {
                name: toToolName(action.id),
                title: action.agentExposure.title,
                description: [
                    action.agentExposure.description,
                    `Use when: ${action.agentExposure.useWhen}`,
                    `Avoid when: ${action.agentExposure.avoidWhen}`,
                    action.agentExposure.outputDescription ? `Returns: ${action.agentExposure.outputDescription}` : '',
                    formatInputPolicy(inputPolicy),
                    action.confirmPolicy === 'required' ? 'Requires explicit confirmation before execution.' : ''
                ]
                    .filter(Boolean).join('\n\n'),
                inputSchema
            };
        }),
        {
            name: 'blog_confirmation_decide',
            title: 'Blog action confirmation',
            description: 'Approve or reject a pending BlogGenius action confirmation in this MCP session. If the approval call times out, check blog_confirmation_status instead of repeating the action.',
            inputSchema: {
                type: 'object',
                properties: {
                    confirmation_id: { type: 'string', minLength: 1 },
                    decision: { type: 'string', enum: ['approve', 'reject'] }
                },
                required: ['confirmation_id', 'decision'],
                additionalProperties: false
            }
        },
        {
            name: 'blog_confirmation_update',
            title: 'Update Blog action options',
            description: 'Update optional parameters on a pending BlogGenius confirmation before approving it. Use this when the user supplies or clarifies options after seeing the preview; the updated preview must be reviewed before approval.',
            inputSchema: {
                type: 'object',
                properties: {
                    confirmation_id: { type: 'string', minLength: 1 },
                    action_id: { type: 'string', minLength: 1 },
                    parameters: {
                        type: 'object',
                        minProperties: 1,
                        description: 'A partial set of fields from the original action input schema. Only provided fields are changed, and BlogGenius validates the merged values before updating the preview.'
                    }
                },
                required: ['confirmation_id', 'parameters'],
                additionalProperties: false
            }
        },
        {
            name: 'blog_confirmation_status',
            title: 'Blog action confirmation status',
            description: 'Check the current state and final result of a BlogGenius confirmation in this MCP session. Use this after an approval call times out or its result is unclear. Never repeat the side-effecting action to check whether it ran.',
            inputSchema: {
                type: 'object',
                properties: { confirmation_id: { type: 'string', minLength: 1 } },
                required: ['confirmation_id'],
                additionalProperties: false
            }
        }
    ];
}

function createMcpContext(callContext = {}, messageId = '') {
    const userId = String(callContext.userId || callContext.user_id || 'mcp:stdio').trim();
    const conversationId = String(callContext.conversationId || callContext.conversation_id || `mcp:${userId}`).trim();
    return normalizeRuntimeContext({
        channel: 'mcp',
        user: { id: userId, channel: 'mcp' },
        conversation: { id: conversationId, channel: 'mcp' },
        messageId: String(messageId || crypto.randomUUID()),
        metadata: { transport: String(callContext.transport || 'mcp') }
    });
}

function createMcpAgentActionAdapter(options = {}) {
    const capabilityRegistry = options.capabilityRegistry;
    const runtime = options.runtime;
    const retrieval = options.retrieval || null;
    if (!capabilityRegistry || typeof capabilityRegistry.listAgentActions !== 'function') {
        throw new Error('MCP Agent adapter requires the composed Agent Action Catalog.');
    }
    if (!runtime || typeof runtime.handleEnvelope !== 'function' || typeof runtime.handleConfirmationDecision !== 'function') {
        throw new Error('MCP Agent adapter requires the shared Agent Runtime.');
    }

    function listTools() {
        return buildToolDefinitions(capabilityRegistry);
    }

    async function buildContext(callContext, messageId) {
        const context = createMcpContext(callContext, messageId);
        if (retrieval?.buildContextPacket) {
            context.memory = await retrieval.buildContextPacket({
                conversationId: context.conversation.id,
                userId: context.user.id,
                limit: 8
            });
        }
        return context;
    }

    async function callTool(input = {}, callContext = {}) {
        const name = String(input.name || '').trim();
        const args = input.arguments && typeof input.arguments === 'object' && !Array.isArray(input.arguments)
            ? input.arguments : {};
        const context = await buildContext(callContext, crypto.randomUUID());

        if (name === 'blog_confirmation_decide' || name === 'blog_confirmation_status' || name === 'blog_confirmation_update') {
            const confirmationId = String(args.confirmation_id || '').trim();
            const item = runtime.confirmationStore?.get?.(confirmationId);
            if (!item || item.channel !== 'mcp'
                || item.userId !== context.user.id
                || item.conversationId !== context.conversation.id) {
                return { ok: false, status: 'not_found', message: '현재 MCP 세션에서 처리할 수 있는 확인 요청을 찾지 못했습니다.' };
            }
            if (name === 'blog_confirmation_status') {
                const execution = item.execution || null;
                return {
                    ok: item.status !== 'failed' && item.status !== 'expired',
                    status: item.status,
                    message: item.status === 'accepted'
                        ? '승인은 접수됐지만 완료 결과가 아직 기록되지 않았습니다. 중복 실행하지 말고 잠시 후 상태를 다시 조회해 주세요.'
                        : item.status === 'executed'
                            ? '승인된 작업의 실행이 완료되었습니다.'
                            : item.status === 'failed'
                                ? `승인된 작업 실행이 실패했습니다. 오류 코드: ${execution?.errorCode || 'UNKNOWN'}. 같은 작업을 다시 승인하지 말고 결과와 원고 작업공간을 확인해 주세요.`
                                : item.status === 'rejected'
                                    ? '이 확인 요청은 거절되었습니다.'
                                    : item.status === 'expired'
                                        ? '이 확인 요청은 만료되었습니다.'
                                        : '확인 요청이 아직 대기 중입니다.',
                    ...(Array.isArray(execution?.results) ? {
                        results: execution.results.map((entry) => ({
                            action_id: entry.action_id,
                            result: { success: entry.success, message: entry.message }
                        }))
                    } : {})
                };
            }
            if (name === 'blog_confirmation_update') {
                if (item.status !== 'pending') {
                    return { ok: false, status: item.status, message: '대기 중인 확인 요청만 수정할 수 있습니다.' };
                }
                return runtime.updatePendingConfirmation({
                    confirmationId,
                    actionId: args.action_id,
                    parameters: args.parameters
                }, context);
            }
            if (item.status !== 'pending') {
                return {
                    ok: item.status === 'executed',
                    status: item.status,
                    message: item.status === 'accepted'
                        ? '승인이 이미 접수되어 실행 중입니다. 중복 실행하지 않았습니다. blog_confirmation_status로 상태를 확인해 주세요.'
                        : `이 확인 요청은 이미 ${item.status} 상태입니다. 중복 실행하지 않았습니다.`,
                    ...(Array.isArray(item.execution?.results) ? {
                        results: item.execution.results.map((entry) => ({
                            action_id: entry.action_id,
                            result: { success: entry.success, message: entry.message }
                        }))
                    } : {})
                };
            }
            if (args.decision === 'approve') {
                let acknowledge;
                let acknowledged = false;
                const accepted = new Promise((resolve) => { acknowledge = resolve; });
                const execution = runtime.handleConfirmationDecision(
                    { confirmationId, decision: 'approve' }, context,
                    { onAccepted: () => { acknowledged = true; acknowledge({
                        ok: true,
                        status: 'accepted',
                        confirmation_id: confirmationId,
                        message: '승인을 접수했습니다. 작업은 백그라운드에서 진행됩니다. blog_confirmation_status로 진행 상태와 최종 결과를 확인해 주세요.'
                    }); } }
                );
                const outcome = Promise.resolve(execution).catch((error) => {
                    if (!acknowledged) throw error;
                    const current = runtime.confirmationStore?.get?.(confirmationId);
                    if (current?.status === 'accepted') {
                        const code = String(error?.code || error?.name || 'UNKNOWN').replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 80) || 'UNKNOWN';
                        runtime.confirmationStore.markExecutionFailed?.(confirmationId, code);
                    }
                    throw error;
                });
                return Promise.race([accepted, outcome]);
            }
            return runtime.handleConfirmationDecision({ confirmationId, decision: args.decision }, context);
        }

        const action = capabilityRegistry.listAgentActions()
            .find((candidate) => toToolName(candidate.id) === name
                && BLOG_ACTION_PREFIXES.some((prefix) => candidate.id.startsWith(prefix)));
        if (!action) throw new Error(`Unknown BlogGenius MCP tool: ${name}`);

        const outcome = await runtime.handleEnvelope({
            version: '1.0',
            conversation_id: context.conversation.id,
            message_id: context.messageId,
            actions: [{
                id: `act_${crypto.randomUUID()}`,
                action_id: action.id,
                params: args,
                reason: `MCP tool request: ${action.id}`
            }]
        }, context);
        return outcome;
    }

    return { listTools, callTool };
}

module.exports = { BLOG_ACTION_PREFIXES, toToolName, buildToolDefinitions, createMcpContext, createMcpAgentActionAdapter };
