const test = require('node:test');
const assert = require('node:assert/strict');
const { createAgentRuntime } = require('./runtime');
const { ConfirmationStore } = require('../../adapters/storage/confirmations/confirmation-store');

function makePendingActionHarness() {
    const confirmationStore = new ConfirmationStore();
    const executed = [];
    const pendingAction = (name) => ({
        id: `agent.pending.${name}`,
        type: 'agent.command', domain: 'agent.pending', name,
        agentExposure: { inputSchema: { type: 'object', properties: {}, additionalProperties: false } }
    });
    const targetAction = {
        id: 'example.change', type: 'example.command', domain: 'example', name: 'change', params: {}, requires_confirmation: true
    };
    confirmationStore.create({
        id: 'confirm-1', userId: 'user-1',
        actions: [targetAction],
        plan: { steps: [{ action: targetAction }] }
    });
    const capabilityRegistry = {
        getAgentAction(id) { return id === 'agent.pending.apply_latest' ? pendingAction('apply_latest') : id === 'agent.pending.reject_latest' ? pendingAction('reject_latest') : null; },
        async validateAction(action) { return { ok: true, errors: [], normalizedParams: action.params }; },
        async previewAction() { return { summary: '가장 최근 확인 요청을 처리합니다.' }; },
        async executeAction(action) {
            executed.push(action);
            return { success: true, message: '변경 완료', data: {}, sideEffects: [] };
        }
    };
    return { runtime: createAgentRuntime({ capabilityRegistry, confirmationStore }), confirmationStore, executed };
}

function commandEnvelope(actionId, name) {
    return {
        version: '1.0', conversation_id: 'conv-1', message_id: `msg-${name}`,
        actions: [{ id: `invoke-${name}`, action_id: actionId, params: {}, reason: '사용자 요청' }]
    };
}

const context = { user: { id: 'user-1' }, conversation: { id: 'conv-1' } };

test('apply-latest routes through Host confirmation execution and marks the request executed', async () => {
    const harness = makePendingActionHarness();
    const result = await harness.runtime.handleParsedEnvelope(commandEnvelope('agent.pending.apply_latest', 'apply_latest'), context);
    assert.equal(result.status, 'completed');
    assert.equal(harness.confirmationStore.get('confirm-1').status, 'executed');
    assert.deepEqual(harness.executed.map((action) => action.id), ['example.change']);
    assert.match(result.results[0].result.message, /적용했습니다/);
});

test('reject-latest cancels the pending request without executing its actions', async () => {
    const harness = makePendingActionHarness();
    const result = await harness.runtime.handleParsedEnvelope(commandEnvelope('agent.pending.reject_latest', 'reject_latest'), context);
    assert.equal(result.status, 'completed');
    assert.equal(harness.confirmationStore.get('confirm-1').status, 'rejected');
    assert.deepEqual(harness.executed, []);
    assert.match(result.results[0].result.message, /취소했습니다/);
});
