const test = require('node:test');
const assert = require('node:assert/strict');

const { createAgentRuntime } = require('./runtime');
const { ConfirmationStore } = require('../../adapters/storage/confirmations/confirmation-store');

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
    const confirmationStore = new ConfirmationStore();
    const runtime = createAgentRuntime({ capabilityRegistry, confirmationStore });

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
    assert.equal(decided.confirmation.status, 'executed');
    assert.equal(prepared.confirmation.id, decided.confirmation.id);
    assert.equal(confirmationStore.get(prepared.confirmation.id).execution.results[0].message, 'register executed');
    assert.equal(capabilityRegistry.executedActions.length, 2);
    assert.deepEqual(capabilityRegistry.executedActions[1].params.targetRowIndices, [0, 5]);
});

test('agent runtime records a failed confirmation outcome before surfacing the execution error', async () => {
    const confirmationStore = new ConfirmationStore();
    const runtime = createAgentRuntime({
        confirmationStore,
        capabilityRegistry: {
            async validateAction(action = {}) { return { ok: true, errors: [], normalizedParams: action.params || {} }; },
            async previewAction() { return { summary: 'external action' }; },
            async executeAction() { throw Object.assign(new Error('provider details'), { code: 'ERR_BAD_REQUEST' }); }
        }
    });
    const prepared = await runtime.handlePlan({
        plan_id: 'plan-fail', goal: 'execute', reason: 'test', confirmation_mode: 'plan', conversation_id: 'conv-fail',
        steps: [{
            id: 'step-fail',
            action: { id: 'call-fail', type: 'example.command', domain: 'example', name: 'run', params: {}, requires_confirmation: true },
            preconditions: [], requires_confirmation: true
        }]
    }, { user: { id: 'user-fail' }, conversation: { id: 'conv-fail' } });

    await assert.rejects(() => runtime.handleConfirmationDecision({
        confirmationId: prepared.confirmation.id, decision: 'approve'
    }, { user: { id: 'user-fail' }, conversation: { id: 'conv-fail' } }), /provider details/);

    const failed = confirmationStore.get(prepared.confirmation.id);
    assert.equal(failed.status, 'failed');
    assert.deepEqual(failed.execution, { success: false, errorCode: 'ERR_BAD_REQUEST' });
});

test('agent runtime validates option updates and refreshes the pending confirmation preview', async () => {
    const capabilityRegistry = createStubCapabilityRegistry();
    const confirmationStore = new ConfirmationStore();
    const runtime = createAgentRuntime({ capabilityRegistry, confirmationStore });
    const context = {
        channel: 'mcp',
        user: { id: 'mcp-user' },
        conversation: { id: 'mcp:conversation' }
    };
    const prepared = await runtime.handlePlan({
        plan_id: 'plan-update', goal: 'save draft', reason: 'test', confirmation_mode: 'plan',
        conversation_id: 'mcp:conversation',
        steps: [{
            id: 'step-update',
            action: {
                id: 'action-update', action_id: 'content.manuscript.generate_and_publish',
                type: 'content.publish', domain: 'content.manuscript', name: 'generate_and_publish',
                params: { subject: 'AI agents', target: 'naver', post_status: 'draft' },
                requires_confirmation: true
            },
            preconditions: [], requires_confirmation: true
        }]
    }, context);

    const updated = await runtime.updatePendingConfirmation({
        confirmationId: prepared.confirmation.id,
        parameters: { image_mode: 'none', naver_category: 'AI' }
    }, context);
    assert.equal(updated.ok, true);
    assert.equal(updated.confirmation.status, 'pending');
    assert.equal(updated.confirmation.plan.steps[0].action.params.image_mode, 'none');
    assert.equal(updated.confirmation.plan.steps[0].action.params.naver_category, 'AI');
    assert.equal(updated.previews[0].preview.summary, 'content.manuscript.generate_and_publish');

    capabilityRegistry.validateAction = async (action) => action.params.image_mode === 'invalid'
        ? { ok: false, errors: ['이미지 방식이 올바르지 않습니다.'] }
        : { ok: true, normalizedParams: action.params };
    const invalid = await runtime.updatePendingConfirmation({
        confirmationId: prepared.confirmation.id,
        parameters: { image_mode: 'invalid' }
    }, context);
    assert.equal(invalid.status, 'invalid_input');
    assert.equal(confirmationStore.get(prepared.confirmation.id).plan.steps[0].action.params.image_mode, 'none');

    const wrongOwner = await runtime.updatePendingConfirmation({
        confirmationId: prepared.confirmation.id,
        parameters: { image_mode: 'generate' }
    }, { ...context, user: { id: 'other-user' } });
    assert.equal(wrongOwner.status, 'not_found');
});

test('agent runtime keeps explicit publish row targets when they are already present', async () => {
    const capabilityRegistry = createStubCapabilityRegistry();
    const runtime = createAgentRuntime({ capabilityRegistry, confirmationStore: new ConfirmationStore() });

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

test('confirmation decision enforces each owner field and rejects invalid decisions without mutation', async () => {
    const store = new ConfirmationStore();
    const registry = createStubCapabilityRegistry();
    const runtime = createAgentRuntime({ capabilityRegistry: registry, confirmationStore: store });
    const owner = { channel: 'mcp', user: { id: 'owner' }, conversation: { id: 'conversation' } };
    store.create({ id: 'owned', channel: 'mcp', userId: 'owner', conversationId: 'conversation', actions: [{ id: 'a', domain: 'content.register_topic', name: 'execute' }] });
    const others = [
        { ...owner, channel: 'telegram' },
        { ...owner, user: { id: 'other' } },
        { ...owner, conversation: { id: 'other' } },
        { ...owner, user: { id: '' } },
        { ...owner, conversation: { id: '' } }
    ];
    for (const context of others) for (const decision of ['approve', 'reject']) {
        const result = await runtime.handleConfirmationDecision({ confirmationId: 'owned', decision }, context);
        assert.equal(result.ok, false);
        assert.equal(store.get('owned').status, 'pending');
        assert.equal(registry.executedActions.length, 0);
    }
    for (const decision of ['', 'yes', 'cancel', 'approved']) {
        const result = await runtime.handleConfirmationDecision({ confirmationId: 'owned', decision }, owner);
        assert.equal(result.ok, false);
        assert.equal(store.get('owned').status, 'pending');
        assert.equal(registry.executedActions.length, 0);
    }
    assert.equal((await runtime.handleConfirmationDecision({ confirmationId: 'owned', decision: 'approve' }, owner)).status, 'executed');
    assert.equal(registry.executedActions.length, 1);
    assert.equal((await runtime.handleConfirmationDecision({ confirmationId: 'owned', decision: 'approve' }, owner)).ok, false);
    assert.equal(registry.executedActions.length, 1);
});

test('expired and concurrent confirmation decisions never execute twice', async () => {
    const store = new ConfirmationStore({ ttlMs: 1000 });
    let now = 10000;
    store._now = () => now;
    let executions = 0;
    let release;
    const wait = new Promise(resolve => { release = resolve; });
    const runtime = createAgentRuntime({ confirmationStore: store, capabilityRegistry: {
        async executeAction() { executions++; await wait; return { success: true }; }
    } });
    const owner = { channel: 'mcp', user: { id: 'owner' }, conversation: { id: 'conversation' } };
    const create = id => store.create({ id, channel: 'mcp', userId: 'owner', conversationId: 'conversation', actions: [{ id: 'a', domain: 'example', name: 'run' }] });
    create('expired'); now += 1000;
    assert.equal((await runtime.handleConfirmationDecision({ confirmationId: 'expired', decision: 'approve' }, owner)).status, 'expired');
    assert.equal(executions, 0);
    create('concurrent');
    const first = runtime.handleConfirmationDecision({ confirmationId: 'concurrent', decision: 'approve' }, owner);
    const second = runtime.handleConfirmationDecision({ confirmationId: 'concurrent', decision: 'approve' }, owner);
    assert.equal((await second).ok, false);
    release();
    assert.equal((await first).status, 'executed');
    assert.equal(executions, 1);
});


test('plan replacement only supersedes a pending confirmation belonging to the caller', async (t) => {
    const owner = { channel: 'mcp', user: { id: 'owner' }, conversation: { id: 'conversation' } };
    const cases = [
        ['other channel', { ...owner, channel: 'telegram' }, 'pending', false],
        ['other user', { ...owner, user: { id: 'other' } }, 'pending', false],
        ['other conversation', { ...owner, conversation: { id: 'other' } }, 'pending', false],
        ['missing user', { ...owner, user: {} }, 'pending', false],
        ['missing conversation', { ...owner, conversation: {} }, 'pending', false],
        ['accepted', owner, 'accepted', false],
        ['executed', owner, 'executed', false],
        ['same owner', owner, 'pending', true]
    ];
    for (const [label, context, initialStatus, allowed] of cases) {
        await t.test(label, async () => {
            const confirmationStore = new ConfirmationStore();
            const capabilityRegistry = createStubCapabilityRegistry();
            const runtime = createAgentRuntime({ confirmationStore, capabilityRegistry });
            const original = confirmationStore.create({ channel: owner.channel, userId: owner.user.id, conversationId: owner.conversation.id });
            if (initialStatus === 'accepted') confirmationStore.accept(original.id);
            if (initialStatus === 'executed') confirmationStore.markExecuted(original.id, []);
            const result = await runtime.handlePlan({
                plan_id: 'replacement', goal: 'replace', reason: 'test', confirmation_mode: 'plan',
                supersedes_confirmation_id: original.id,
                steps: [{ id: 'step', action: { id: 'action', type: 'content.publish', domain: 'content.publish', name: 'execute', params: {}, requires_confirmation: true }, preconditions: [], requires_confirmation: true }]
            }, context);
            assert.equal(confirmationStore.get(original.id).status, allowed ? 'rejected' : initialStatus);
            assert.equal(result.ok, allowed);
            assert.equal(capabilityRegistry.executedActions.length, 0);
            if (allowed) {
                assert.equal(result.confirmation.supersededConfirmationId, original.id);
                assert.equal(result.confirmation.status, 'pending');
            } else {
                assert.equal(confirmationStore.items.size, 1);
            }
        });
    }
});

test('expiry between lookup and transition blocks approval, rejection and replacement', async (t) => {
    for (const operation of ['approve', 'reject', 'replace']) await t.test(operation, async () => {
        const store = new ConfirmationStore({ ttlMs: 1000 });
        let now = 10000;
        store._now = () => now;
        const registry = createStubCapabilityRegistry();
        const runtime = createAgentRuntime({ confirmationStore: store, capabilityRegistry: registry });
        const owner = { channel: 'mcp', user: { id: 'owner' }, conversation: { id: 'conversation' } };
        store.create({ id: 'boundary', channel: 'mcp', userId: 'owner', conversationId: 'conversation', actions: [{ id: 'a', domain: 'content.register_topic', name: 'execute' }] });
        const originalGet = store.get.bind(store);
        let advance = true;
        store.get = id => { const result = originalGet(id); if (advance) { advance = false; now += 1000; } return result; };
        const result = operation === 'replace' ? await runtime.handlePlan({
            plan_id: 'replacement', goal: 'replace', reason: 'test', confirmation_mode: 'plan', supersedes_confirmation_id: 'boundary',
            steps: [{ id: 'step', action: { id: 'action', type: 'content.publish', domain: 'content.publish', name: 'execute', params: {}, requires_confirmation: true }, preconditions: [], requires_confirmation: true }]
        }, owner) : await runtime.handleConfirmationDecision({ confirmationId: 'boundary', decision: operation }, owner);
        assert.equal(result.ok, false);
        assert.equal(store.get('boundary').status, 'expired');
        assert.equal(store.items.size, 1);
        assert.equal(registry.executedActions.length, 0);
    });
});
