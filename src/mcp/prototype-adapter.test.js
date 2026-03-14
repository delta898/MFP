const test = require('node:test');
const assert = require('node:assert/strict');

const { createAgentRuntime } = require('../agent/runtime');
const { createMcpPrototypeAdapter } = require('./prototype-adapter');
const { normalizeRegisterTopicParams, buildTopicRegistrationPreview } = require('../capabilities/content/register-topic');
const { normalizePublishParams, buildPublishRequestPreview } = require('../capabilities/content/publish');

function createStubCapabilityRegistry() {
    return {
        async validateAction(action = {}) {
            return {
                ok: true,
                errors: [],
                normalizedParams: action.params || {}
            };
        },
        async previewAction(action = {}) {
            if (action.domain === 'content.register_topic') {
                return buildTopicRegistrationPreview(action.params || {});
            }
            if (action.domain === 'content.publish') {
                return buildPublishRequestPreview(action.params || {});
            }
            return {
                kind: 'generic',
                summary: action.domain || 'unknown'
            };
        },
        async executeAction(action = {}, context = {}) {
            if (action.domain === 'content.register_topic' && action.name === 'prepare') {
                return {
                    success: true,
                    data: normalizeRegisterTopicParams(action.params || {}, context)
                };
            }
            if (action.domain === 'content.publish' && action.name === 'prepare') {
                return {
                    success: true,
                    data: normalizePublishParams(action.params || {})
                };
            }
            if (action.domain === 'content.register_topic' && action.name === 'execute') {
                return {
                    success: true,
                    message: 'register executed',
                    data: {
                        theme: action.params?.theme || '',
                        channel: context.channel
                    },
                    sideEffects: []
                };
            }
            if (action.domain === 'content.publish' && action.name === 'execute') {
                return {
                    success: true,
                    message: 'publish executed',
                    data: {
                        target: action.params?.target || 'selected',
                        channel: context.channel
                    },
                    sideEffects: []
                };
            }
            throw new Error(`unexpected action: ${action.domain}.${action.name}`);
        }
    };
}

test('mcp prototype adapter prepares bundle and returns confirmation token', async () => {
    const capabilityRegistry = createStubCapabilityRegistry();
    const runtime = createAgentRuntime({ capabilityRegistry });
    const adapter = createMcpPrototypeAdapter({ capabilityRegistry, runtime });

    const result = await adapter.callTool({
        name: 'content_request_prepare',
        arguments: {
            conversation_id: 'mcp:session-1',
            user_id: 'user-1',
            message_id: 'msg-1',
            register_request: {
                intent: 'content.register_topic',
                payload: {
                    theme: 'MCP 테스트'
                }
            },
            publish_request: {
                intent: 'content.publish',
                payload: {
                    target: 'naver',
                    auto_trigger: false,
                    options: {
                        post_status: 'draft'
                    }
                }
            },
            ui: {
                show_publish_options: true
            }
        }
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, 'confirmation_required');
    assert.equal(result.bundle.kind, 'content_request_bundle');
    assert.equal(result.bundle.register_request.payload.theme, 'MCP 테스트');
    assert.equal(result.bundle.publish_request.payload.auto_trigger, false);
    assert.equal(result.previews.length, 2);
    assert.equal(result.confirmation_token.token_type, 'agent.confirmation');
    assert.equal(result.confirmation_token.channel, 'mcp');
    assert.equal(result.confirmation_token.action_count, 1);
});

test('mcp prototype adapter exposes host-friendly top-level tool schemas', async () => {
    const capabilityRegistry = createStubCapabilityRegistry();
    const runtime = createAgentRuntime({ capabilityRegistry });
    const adapter = createMcpPrototypeAdapter({ capabilityRegistry, runtime });

    const tools = adapter.listTools();
    const prepareTool = tools.find((tool) => tool.name === 'content_request_prepare');

    assert.equal(prepareTool.inputSchema.type, 'object');
    assert.equal(Object.prototype.hasOwnProperty.call(prepareTool.inputSchema, 'anyOf'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(prepareTool.inputSchema, 'oneOf'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(prepareTool.inputSchema, 'allOf'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(prepareTool.inputSchema, 'enum'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(prepareTool.inputSchema, 'not'), false);
});

test('mcp prototype adapter executes approved confirmation with only enabled actions', async () => {
    const capabilityRegistry = createStubCapabilityRegistry();
    const runtime = createAgentRuntime({ capabilityRegistry });
    const adapter = createMcpPrototypeAdapter({ capabilityRegistry, runtime });

    const prepared = await adapter.callTool({
        name: 'content_request_prepare',
        arguments: {
            conversation_id: 'mcp:session-2',
            user_id: 'user-2',
            register_request: {
                intent: 'content.register_topic',
                payload: {
                    theme: '실행 테스트'
                }
            },
            publish_request: {
                intent: 'content.publish',
                payload: {
                    target: 'all',
                    auto_trigger: false
                }
            },
            ui: {
                show_publish_options: true
            }
        }
    });

    const decided = await adapter.callTool({
        name: 'confirmation_decide',
        arguments: {
            confirmation_id: prepared.confirmation_token.confirmation_id,
            decision: 'approve',
            conversation_id: 'mcp:session-2',
            user_id: 'user-2'
        }
    });

    assert.equal(decided.ok, true);
    assert.equal(decided.status, 'executed');
    assert.equal(decided.results.length, 1);
    assert.equal(decided.results[0].action_domain, 'content.register_topic');
    assert.equal(decided.confirmation_token.status, 'accepted');
});

test('mcp prototype adapter infers request wrappers when host omits intent and payload keys', async () => {
    const capabilityRegistry = createStubCapabilityRegistry();
    const runtime = createAgentRuntime({ capabilityRegistry });
    const adapter = createMcpPrototypeAdapter({ capabilityRegistry, runtime });

    const result = await adapter.callTool({
        name: 'content_request_prepare',
        arguments: {
            conversation_id: 'mcp:session-3',
            user_id: 'user-3',
            register_request: {
                theme: 'Wrapper 없는 요청',
                platforms: ['naver']
            },
            publish_request: {
                target: 'naver',
                auto_trigger: false,
                options: {
                    post_status: 'draft'
                }
            },
            ui: {
                show_publish_options: true
            }
        }
    });

    assert.equal(result.ok, true);
    assert.equal(result.bundle.register_request.intent, 'content.register_topic');
    assert.equal(result.bundle.publish_request.intent, 'content.publish');
    assert.equal(result.bundle.register_request.payload.theme, 'Wrapper 없는 요청');
    assert.equal(result.bundle.publish_request.payload.target, 'naver');
    assert.equal(result.bundle.publish_request.payload.auto_trigger, false);
});

test('mcp prototype adapter accepts simplified top-level fields for core register flow', async () => {
    const capabilityRegistry = createStubCapabilityRegistry();
    const runtime = createAgentRuntime({ capabilityRegistry });
    const adapter = createMcpPrototypeAdapter({ capabilityRegistry, runtime });

    const result = await adapter.callTool({
        name: 'content_request_prepare',
        arguments: {
            topic: '단순 입력 주제',
            keywords: ['키워드1', '키워드2'],
            instruction: '초보자 친화적으로 작성',
            platforms: ['naver', 'wordpress'],
            naver_category: '기술',
            wordpress_category: 'Tech'
        }
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, 'confirmation_required');
    assert.equal(result.bundle.register_request.payload.theme, '단순 입력 주제');
    assert.deepEqual(result.bundle.register_request.payload.keywords, ['키워드1', '키워드2']);
    assert.deepEqual(result.bundle.register_request.payload.platforms, ['naver', 'wordpress']);
    assert.equal(result.bundle.register_request.payload.options.instruction, '초보자 친화적으로 작성');
    assert.equal(result.bundle.register_request.payload.options.naver_category, '기술');
    assert.equal(result.bundle.register_request.payload.options.wordpress_category, 'Tech');
    assert.equal(result.bundle.register_request.payload.options.image_gen, true);
    assert.equal(result.bundle.register_request.payload.options.external_reference, true);
});

test('mcp prototype adapter requests clarification when topic is missing', async () => {
    const capabilityRegistry = createStubCapabilityRegistry();
    const runtime = createAgentRuntime({ capabilityRegistry });
    const adapter = createMcpPrototypeAdapter({ capabilityRegistry, runtime });

    const result = await adapter.callTool({
        name: 'content_request_prepare',
        arguments: {
            keywords: ['주제없음']
        }
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, 'needs_clarification');
    assert.equal(result.clarification.question, '어떤 주제로 글감을 등록하거나 발행할까요?');
    assert.deepEqual(result.clarification.missing_fields, ['theme']);
});

test('mcp prototype adapter resolves latest pending confirmation when host omits confirmation id', async () => {
    const capabilityRegistry = createStubCapabilityRegistry();
    const runtime = createAgentRuntime({ capabilityRegistry });
    const adapter = createMcpPrototypeAdapter({ capabilityRegistry, runtime });

    await adapter.callTool({
        name: 'content_request_prepare',
        arguments: {
            conversation_id: 'mcp:session-4',
            user_id: 'user-4',
            register_request: {
                theme: '승인 fallback 테스트'
            }
        }
    });

    const decided = await adapter.callTool({
        name: 'confirmation_decide',
        arguments: {
            decision: '승인',
            conversation_id: 'mcp:session-4',
            user_id: 'user-4'
        }
    });

    assert.equal(decided.ok, true);
    assert.equal(decided.status, 'executed');
    assert.equal(decided.results.length, 1);
    assert.equal(decided.results[0].action_domain, 'content.register_topic');
});

test('mcp prototype adapter falls back to latest global pending when host sends mismatched user and conversation ids', async () => {
    const capabilityRegistry = createStubCapabilityRegistry();
    const runtime = createAgentRuntime({ capabilityRegistry });
    const adapter = createMcpPrototypeAdapter({ capabilityRegistry, runtime });

    await adapter.callTool({
        name: 'content_request_prepare',
        arguments: {
            register_request: {
                theme: 'LM Studio fallback 테스트'
            }
        }
    });

    const decided = await adapter.callTool({
        name: 'confirmation_decide',
        arguments: {
            decision: 'approve',
            conversation_id: '2025-07-18 14:36:01.948258',
            user_id: 'delta898',
            message_id: '1721436265.948258'
        }
    });

    assert.equal(decided.ok, true);
    assert.equal(decided.status, 'executed');
    assert.equal(decided.results.length, 1);
    assert.equal(decided.results[0].action_domain, 'content.register_topic');
});
