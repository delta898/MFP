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
