const test = require('node:test');
const assert = require('node:assert/strict');

const { createAgentRuntime } = require('./runtime');

function createStubCapabilityRegistry() {
    const executedActions = [];

    return {
        executedActions,
        async validateAction(action = {}) {
            return {
                ok: true,
                errors: [],
                normalizedParams: action.params || {}
            };
        },
        async previewAction(action = {}) {
            return {
                kind: 'preview',
                summary: `${action.domain}.${action.name}`
            };
        },
        async executeAction(action = {}) {
            executedActions.push(JSON.parse(JSON.stringify(action)));

            if (action.domain === 'content.register_topic' && action.name === 'execute') {
                return {
                    success: true,
                    message: 'register executed',
                    data: {
                        rowIndices: [0, 5]
                    },
                    sideEffects: []
                };
            }

            if (action.domain === 'content.publish' && action.name === 'execute') {
                return {
                    success: true,
                    message: 'publish executed',
                    data: {
                        targetRowIndices: action.params?.targetRowIndices || []
                    },
                    sideEffects: ['publish_run_started']
                };
            }

            throw new Error(`unexpected action: ${action.domain}.${action.name}`);
        }
    };
}

test('agent runtime forwards newly added row indices to publish action on approval', async () => {
    const capabilityRegistry = createStubCapabilityRegistry();
    const runtime = createAgentRuntime({ capabilityRegistry });

    const prepared = await runtime.handlePlan({
        plan_id: 'plan-1',
        goal: 'register and publish',
        reason: 'test',
        confirmation_mode: 'plan',
        conversation_id: 'conv-1',
        steps: [
            {
                id: 'step-1',
                action: {
                    id: 'register-1',
                    type: 'content.register',
                    domain: 'content.register_topic',
                    name: 'execute',
                    params: {
                        theme: '골프존'
                    },
                    requires_confirmation: true
                },
                preconditions: [],
                requires_confirmation: true
            },
            {
                id: 'step-2',
                action: {
                    id: 'publish-1',
                    type: 'content.publish',
                    domain: 'content.publish',
                    name: 'execute',
                    params: {
                        platforms: ['naver']
                    },
                    requires_confirmation: true
                },
                preconditions: [],
                requires_confirmation: true
            }
        ]
    }, {
        user: { id: 'user-1' },
        conversation: { id: 'conv-1' }
    });

    assert.equal(prepared.ok, true);
    assert.equal(prepared.status, 'confirmation_required');

    const decided = await runtime.handleConfirmationDecision({
        confirmationId: prepared.confirmation.id,
        decision: 'approve'
    }, {
        user: { id: 'user-1' },
        conversation: { id: 'conv-1' }
    });

    assert.equal(decided.ok, true);
    assert.equal(decided.status, 'executed');
    assert.equal(capabilityRegistry.executedActions.length, 2);
    assert.deepEqual(capabilityRegistry.executedActions[1].params.targetRowIndices, [0, 5]);
});

test('agent runtime keeps explicit publish row targets when they are already present', async () => {
    const capabilityRegistry = createStubCapabilityRegistry();
    const runtime = createAgentRuntime({ capabilityRegistry });

    const prepared = await runtime.handlePlan({
        plan_id: 'plan-2',
        goal: 'publish explicit rows',
        reason: 'test',
        confirmation_mode: 'plan',
        conversation_id: 'conv-2',
        steps: [
            {
                id: 'step-1',
                action: {
                    id: 'register-2',
                    type: 'content.register',
                    domain: 'content.register_topic',
                    name: 'execute',
                    params: {
                        theme: '골프존'
                    },
                    requires_confirmation: true
                },
                preconditions: [],
                requires_confirmation: true
            },
            {
                id: 'step-2',
                action: {
                    id: 'publish-2',
                    type: 'content.publish',
                    domain: 'content.publish',
                    name: 'execute',
                    params: {
                        targetRowIndices: [3]
                    },
                    requires_confirmation: true
                },
                preconditions: [],
                requires_confirmation: true
            }
        ]
    }, {
        user: { id: 'user-2' },
        conversation: { id: 'conv-2' }
    });

    const decided = await runtime.handleConfirmationDecision({
        confirmationId: prepared.confirmation.id,
        decision: 'approve'
    }, {
        user: { id: 'user-2' },
        conversation: { id: 'conv-2' }
    });

    assert.equal(decided.ok, true);
    assert.deepEqual(capabilityRegistry.executedActions[1].params.targetRowIndices, [3]);
});
