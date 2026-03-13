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
            description: 'Prepare a blog topic register/publish request. Use only for blog content registration or publish preparation. Do not use for file creation, note writing, or generic document editing.',
            inputSchema: {
                type: 'object',
                description: 'At least one of register_request or publish_request is required.',
                properties: {
                    conversation_id: {
                        type: 'string',
                        description: 'Optional client conversation or session id.'
                    },
                    user_id: {
                        type: 'string',
                        description: 'Optional client user id.'
                    },
                    message_id: {
                        type: 'string',
                        description: 'Optional client message id.'
                    },
                    register_request: {
                        type: 'object',
                        description: 'Blog topic registration request. Prefer { intent: "content.register_topic", payload: { theme, keywords?, platforms?, options? } }.',
                        properties: {
                            intent: {
                                type: 'string',
                                enum: ['content.register_topic']
                            },
                            payload: {
                                type: 'object',
                                properties: {
                                    theme: {
                                        type: 'string',
                                        description: 'Required topic title or theme.'
                                    },
                                    keywords: {
                                        type: 'array',
                                        items: { type: 'string' }
                                    },
                                    platforms: {
                                        type: 'array',
                                        items: {
                                            type: 'string',
                                            enum: ['naver', 'wordpress']
                                        }
                                    },
                                    options: {
                                        type: 'object',
                                        properties: {
                                            image_gen: { type: 'boolean' },
                                            external_reference: { type: 'boolean' },
                                            post_status: {
                                                type: 'string',
                                                enum: ['draft', 'publish']
                                            },
                                            category: { type: 'string' },
                                            naver_category: { type: 'string' },
                                            wordpress_category: { type: 'string' },
                                            instruction: { type: 'string' },
                                            schedule_date: { type: 'string' }
                                        }
                                    }
                                },
                                required: ['theme']
                            }
                        }
                    },
                    publish_request: {
                        type: 'object',
                        description: 'Blog publish request. Prefer { intent: "content.publish", payload: { target?, platforms?, auto_trigger?, options? } }.',
                        properties: {
                            intent: {
                                type: 'string',
                                enum: ['content.publish']
                            },
                            payload: {
                                type: 'object',
                                properties: {
                                    target: {
                                        type: 'string',
                                        enum: ['all', 'naver', 'wordpress', 'selected']
                                    },
                                    platforms: {
                                        type: 'array',
                                        items: {
                                            type: 'string',
                                            enum: ['naver', 'wordpress']
                                        }
                                    },
                                    auto_trigger: {
                                        type: 'boolean',
                                        description: 'false means prepare/register only and do not execute publish.'
                                    },
                                    options: {
                                        type: 'object',
                                        properties: {
                                            post_status: {
                                                type: 'string',
                                                enum: ['draft', 'publish']
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    },
                    meta: {
                        type: 'object',
                        properties: {
                            explicit_params: {
                                type: 'array',
                                items: { type: 'string' }
                            }
                        }
                    },
                    ui: {
                        type: 'object',
                        properties: {
                            show_publish_options: {
                                type: 'boolean',
                                description: 'Show publish-specific preview controls.'
                            }
                        }
                    }
                }
            }
        },
        {
            name: 'confirmation_decide',
            title: 'Decide Confirmation',
            description: 'Approve or reject a previously issued confirmation token. If confirmation_id is omitted, the latest pending confirmation for the same user/conversation will be used when possible.',
            inputSchema: {
                type: 'object',
                properties: {
                    confirmation_id: {
                        type: 'string',
                        description: 'Optional confirmation id. If omitted, the latest pending confirmation for the same user/conversation is used.'
                    },
                    decision: {
                        type: 'string',
                        enum: ['approve', 'reject', '승인', '거부', '취소']
                    },
                    conversation_id: { type: 'string' },
                    user_id: { type: 'string' },
                    message_id: { type: 'string' }
                },
                required: ['decision']
            }
        }
    ];
}

function normalizeRequestWrapper(request = null, intent = '') {
    if (!request || typeof request !== 'object' || Array.isArray(request)) return null;

    if (request.payload && typeof request.payload === 'object' && !Array.isArray(request.payload)) {
        return {
            ...request,
            intent: String(request.intent || intent).trim() || intent,
            payload: request.payload
        };
    }

    const raw = { ...request };
    delete raw.intent;

    return {
        intent: String(request.intent || intent).trim() || intent,
        payload: raw
    };
}

function coercePrepareInput(input = {}) {
    return {
        ...input,
        register_request: normalizeRequestWrapper(input.register_request, 'content.register_topic'),
        publish_request: normalizeRequestWrapper(input.publish_request, 'content.publish')
    };
}

function normalizeDecision(value = '') {
    const raw = String(value || '').trim().toLowerCase();
    if (['approve', 'approved', 'accept', 'accepted', 'ok', 'yes', 'confirm', 'confirmed', '승인', '확인', '적용'].includes(raw)) {
        return 'approve';
    }
    if (['reject', 'rejected', 'decline', 'cancel', 'cancelled', 'canceled', 'no', '거부', '취소', '중단'].includes(raw)) {
        return 'reject';
    }
    return raw || 'approve';
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

    async function prepareTool(input = {}, callOptions = {}) {
        const coercedInput = coercePrepareInput(input);
        const context = buildMcpContext(coercedInput, callOptions.contextOverride || {});
        const bundle = await prepareContentRequestBundle({
            source: 'mcp_tool',
            register_request: coercedInput.register_request || null,
            publish_request: coercedInput.publish_request || null,
            meta: coercedInput.meta || {},
            ui: coercedInput.ui || {}
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

    async function decideTool(input = {}, callOptions = {}) {
        const decision = normalizeDecision(input.decision);
        const context = buildMcpContext(input, callOptions.contextOverride || {});
        let confirmationId = resolveConfirmationId(input);

        if (!confirmationId && runtime?.confirmationStore) {
            const userPending = typeof runtime.confirmationStore.getPendingByUser === 'function'
                ? runtime.confirmationStore.getPendingByUser(context?.user?.id || '')
                : [];
            const allPending = typeof runtime.confirmationStore.getPending === 'function'
                ? runtime.confirmationStore.getPending()
                : userPending;

            const latestSameConversation = Array.isArray(userPending)
                ? userPending.filter((item) => String(item?.conversationId || '').trim() === context?.conversation?.id).slice(-1)[0] || null
                : null;
            const latestUserPending = Array.isArray(userPending) ? userPending.slice(-1)[0] || null : null;
            const latestGlobalPending = Array.isArray(allPending) ? allPending.slice(-1)[0] || null : null;

            confirmationId = latestSameConversation?.id || latestUserPending?.id || latestGlobalPending?.id || '';
        }

        if (!confirmationId) {
            return {
                ok: false,
                status: 'not_found',
                message: '확인 요청 id가 없고, 현재 사용자 기준으로도 pending confirmation을 찾지 못했습니다.'
            };
        }

        const outcome = await runtime.handleConfirmationDecision({
            confirmationId,
            decision
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
        async callTool(input = {}, callOptions = {}) {
            const name = String(input.name || '').trim();
            const args = input.arguments && typeof input.arguments === 'object' ? input.arguments : {};

            if (name === 'content_request_prepare') {
                return prepareTool(args, callOptions);
            }
            if (name === 'confirmation_decide') {
                return decideTool(args, callOptions);
            }
            throw new Error(`지원하지 않는 MCP prototype tool입니다: ${name}`);
        }
    };
}

module.exports = {
    createMcpPrototypeAdapter
};
