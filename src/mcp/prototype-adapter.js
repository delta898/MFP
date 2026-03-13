const { normalizeRuntimeContext } = require('../agent/runtime-contract');
const { buildConfirmationToken, resolveConfirmationId } = require('../internal-api/confirmation-schema');
const { validateContentRequestBundle } = require('../internal-api/content-request-schema');
const {
    prepareContentRequestBundle,
    buildContentExecutionActions,
    buildContentPreviewItems,
    deriveContentRequestGoal
} = require('../internal-api/content-request-builder');

function buildMcpToolDefinitions() {
    return [
        {
            name: 'content_request_prepare',
            title: 'Prepare Content Request',
            description: 'Normalize a canonical content request bundle and create a confirmation token for execution.',
            inputSchema: {
                type: 'object',
                properties: {
                    conversation_id: { type: 'string' },
                    user_id: { type: 'string' },
                    message_id: { type: 'string' },
                    register_request: { type: 'object' },
                    publish_request: { type: 'object' },
                    meta: { type: 'object' },
                    ui: { type: 'object' }
                }
            }
        },
        {
            name: 'confirmation_decide',
            title: 'Decide Confirmation',
            description: 'Approve or reject a previously issued confirmation token.',
            inputSchema: {
                type: 'object',
                properties: {
                    confirmation_id: { type: 'string' },
                    decision: {
                        type: 'string',
                        enum: ['approve', 'reject']
                    },
                    conversation_id: { type: 'string' },
                    user_id: { type: 'string' },
                    message_id: { type: 'string' }
                },
                required: ['confirmation_id', 'decision']
            }
        }
    ];
}

function buildMcpContext(input = {}, override = {}) {
    const userId = String(input.user_id || override.user_id || 'mcp-user').trim();
    const conversationId = String(input.conversation_id || override.conversation_id || `mcp:${userId}`).trim();

    return normalizeRuntimeContext({
        channel: 'mcp',
        user: {
            id: userId,
            channel: 'mcp'
        },
        conversation: {
            id: conversationId,
            channel: 'mcp'
        },
        messageId: String(input.message_id || override.message_id || '').trim(),
        metadata: {
            transport: 'mcp'
        }
    });
}

function buildPrototypePlan(bundle = {}, actions = [], context = {}) {
    return {
        plan_id: `${bundle.bundle_id}:plan`,
        goal: deriveContentRequestGoal(bundle),
        reason: 'mcp.content_request_prepare',
        confirmation_mode: 'plan',
        conversation_id: context?.conversation?.id || '',
        message_id: context?.messageId || '',
        supersedes_confirmation_id: '',
        steps: actions.map((action, index) => ({
            id: `step_${index + 1}`,
            action,
            preconditions: [],
            requires_confirmation: true
        }))
    };
}

function createMcpPrototypeAdapter(options = {}) {
    const capabilityRegistry = options.capabilityRegistry || null;
    const runtime = options.runtime || null;

    if (!capabilityRegistry) {
        throw new Error('capabilityRegistry is required');
    }
    if (!runtime || typeof runtime.handlePlan !== 'function' || typeof runtime.handleConfirmationDecision !== 'function') {
        throw new Error('runtime is required');
    }

    async function prepareTool(input = {}) {
        const context = buildMcpContext(input);
        const bundle = await prepareContentRequestBundle({
            source: 'mcp_tool',
            register_request: input.register_request || null,
            publish_request: input.publish_request || null,
            meta: input.meta || {},
            ui: input.ui || {}
        }, context, { capabilityRegistry });
        const validation = validateContentRequestBundle(bundle);
        if (!validation.ok) {
            return {
                ok: false,
                status: 'invalid',
                errors: validation.errors
            };
        }

        const actions = buildContentExecutionActions(bundle);
        if (actions.length === 0) {
            return {
                ok: false,
                status: 'invalid',
                errors: ['실행할 content action이 없습니다.']
            };
        }

        const plan = buildPrototypePlan(bundle, actions, context);
        const outcome = await runtime.handlePlan(plan, context);
        if (!outcome.ok) {
            return outcome;
        }

        return {
            ok: true,
            status: outcome.status,
            bundle,
            previews: buildContentPreviewItems(bundle),
            confirmation: outcome.confirmation || null,
            confirmation_token: outcome.confirmation ? buildConfirmationToken(outcome.confirmation) : null,
            results: outcome.results || []
        };
    }

    async function decideTool(input = {}) {
        const confirmationId = resolveConfirmationId(input);
        const decision = String(input.decision || '').trim().toLowerCase();
        const context = buildMcpContext(input);
        const outcome = await runtime.handleConfirmationDecision({
            confirmationId,
            decision: decision === 'approve' ? 'approve' : 'reject'
        }, context);

        return {
            ...outcome,
            confirmation_token: outcome.confirmation ? buildConfirmationToken(outcome.confirmation) : null
        };
    }

    return {
        listTools() {
            return buildMcpToolDefinitions();
        },
        async callTool(input = {}) {
            const name = String(input.name || '').trim();
            const args = input.arguments && typeof input.arguments === 'object' ? input.arguments : {};

            if (name === 'content_request_prepare') {
                return prepareTool(args);
            }
            if (name === 'confirmation_decide') {
                return decideTool(args);
            }
            throw new Error(`지원하지 않는 MCP prototype tool입니다: ${name}`);
        }
    };
}

module.exports = {
    createMcpPrototypeAdapter
};
