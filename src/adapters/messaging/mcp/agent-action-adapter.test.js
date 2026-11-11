'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createMcpAgentActionAdapter, toToolName } = require('./agent-action-adapter');

function createFixture() {
    const confirmation = {
        id: 'confirm-1', channel: 'mcp', userId: 'mcp-user-1', conversationId: 'mcp:conversation-1', status: 'pending'
    };
    const calls = [];
    const action = {
        id: 'content.queue.list_topics', type: 'content.query', domain: 'content.queue', name: 'list_topics',
        agentExposure: {
            title: 'Queue', description: 'Read queue', useWhen: 'Read it', avoidWhen: 'Do not mutate',
            inputSchema: { type: 'object', properties: { scope: { type: 'string' } }, additionalProperties: false }
        }
    };
    const registry = {
        listAgentActions: () => [action, { ...action, id: 'agent.meta.get_identity' }]
    };
    const runtime = {
        confirmationStore: {
            get: (id) => id === confirmation.id ? confirmation : null,
            markExecutionFailed: (id, code) => { confirmation.status = 'failed'; confirmation.execution = { errorCode: code }; }
        },
        async handleEnvelope(envelope, context) {
            calls.push({ envelope, context });
            return { ok: true, status: 'completed', results: [] };
        },
        async handleConfirmationDecision(input, context) {
            calls.push({ confirmationInput: input, context });
            confirmation.status = input.decision === 'approve' ? 'accepted' : 'rejected';
            return { ok: true, status: 'rejected' };
        },
        async updatePendingConfirmation(input, context) {
            calls.push({ updateInput: input, context });
            return { ok: true, status: 'confirmation_required', message: '옵션을 반영했습니다.' };
        }
    };
    return { action, calls, confirmation, capabilityRegistry: registry, runtime };
}

test('MCP tools are projected only from the Blog Agent Action Catalog', () => {
    const fixture = createFixture();
    const adapter = createMcpAgentActionAdapter(fixture);
    const tools = adapter.listTools();
    assert.deepEqual(tools.map((tool) => tool.name), [toToolName(fixture.action.id), 'blog_confirmation_decide', 'blog_confirmation_update', 'blog_confirmation_status']);
    assert.deepEqual(tools[0].inputSchema, fixture.action.agentExposure.inputSchema);
});

test('MCP tool schemas and descriptions expose the shared input policy', () => {
    const fixture = createFixture();
    fixture.action.agentExposure.inputSchema.properties.scope = { type: 'string' };
    fixture.action.agentExposure.inputPolicy = {
        scope: { kind: 'required', question: '조회 범위를 알려주세요.' },
        category: { kind: 'optional', prompt: '카테고리를 지정할 수 있습니다.' }
    };
    fixture.action.agentExposure.inputSchema.properties.category = { type: 'string' };
    const tool = createMcpAgentActionAdapter(fixture).listTools()[0];

    assert.match(tool.description, /필수 정보 질문/);
    assert.match(tool.description, /선택 정보/);
    assert.match(tool.inputSchema.properties.scope.description, /조회 범위를 알려주세요/);
    assert.match(tool.inputSchema.properties.category.description, /카테고리를 지정할 수 있습니다/);
});

test('MCP action calls use AgentRuntime.handleEnvelope and server-owned identity', async () => {
    const fixture = createFixture();
    const adapter = createMcpAgentActionAdapter(fixture);
    const result = await adapter.callTool({
        name: toToolName(fixture.action.id),
        arguments: { scope: 'queue' }
    }, { userId: 'mcp-user-1', conversationId: 'mcp:conversation-1' });

    assert.equal(result.status, 'completed');
    assert.equal(fixture.calls.length, 1);
    assert.equal(fixture.calls[0].envelope.actions[0].action_id, fixture.action.id);
    assert.deepEqual(fixture.calls[0].envelope.actions[0].params, { scope: 'queue' });
    assert.equal(fixture.calls[0].context.user.id, 'mcp-user-1');
});

test('MCP confirmation is bound to the originating MCP session', async () => {
    const fixture = createFixture();
    const adapter = createMcpAgentActionAdapter(fixture);
    const denied = await adapter.callTool({
        name: 'blog_confirmation_decide',
        arguments: { confirmation_id: fixture.confirmation.id, decision: 'approve' }
    }, { userId: 'other-user', conversationId: 'other-conversation' });
    assert.equal(denied.status, 'not_found');
    assert.equal(fixture.calls.length, 0);

    const accepted = await adapter.callTool({
        name: 'blog_confirmation_decide',
        arguments: { confirmation_id: fixture.confirmation.id, decision: 'reject' }
    }, { userId: 'mcp-user-1', conversationId: 'mcp:conversation-1' });
    assert.equal(accepted.status, 'rejected');
    assert.equal(fixture.calls.length, 1);
});

test('MCP confirmation status recovers completed results and repeated approval does not execute twice', async () => {
    const fixture = createFixture();
    fixture.confirmation.status = 'executed';
    fixture.confirmation.execution = {
        success: true,
        results: [{ action_id: 'content.manuscript.generate_and_publish', success: true, message: '원고를 임시저장했습니다. 원고 ID: draft-123.' }]
    };
    const adapter = createMcpAgentActionAdapter(fixture);

    const status = await adapter.callTool({
        name: 'blog_confirmation_status',
        arguments: { confirmation_id: fixture.confirmation.id }
    }, { userId: 'mcp-user-1', conversationId: 'mcp:conversation-1' });
    assert.equal(status.status, 'executed');
    assert.match(status.results[0].result.message, /draft-123/);

    const repeatedApprove = await adapter.callTool({
        name: 'blog_confirmation_decide',
        arguments: { confirmation_id: fixture.confirmation.id, decision: 'approve' }
    }, { userId: 'mcp-user-1', conversationId: 'mcp:conversation-1' });
    assert.match(repeatedApprove.message, /중복 실행하지 않았습니다/);
    assert.equal(fixture.calls.length, 0);
});

test('MCP accepts approval immediately while execution continues and exposes later status', async () => {
    const fixture = createFixture();
    let finishExecution;
    fixture.runtime.handleConfirmationDecision = (input, context, options) => {
        fixture.calls.push({ confirmationInput: input, context });
        fixture.confirmation.status = 'accepted';
        options.onAccepted();
        return new Promise((resolve) => { finishExecution = resolve; });
    };
    const adapter = createMcpAgentActionAdapter(fixture);

    const ack = await adapter.callTool({
        name: 'blog_confirmation_decide',
        arguments: { confirmation_id: fixture.confirmation.id, decision: 'approve' }
    }, { userId: 'mcp-user-1', conversationId: 'mcp:conversation-1' });
    assert.equal(ack.status, 'accepted');
    assert.match(ack.message, /백그라운드/);
    assert.equal(fixture.confirmation.status, 'accepted');
    assert.equal(fixture.calls.length, 1);

    fixture.confirmation.status = 'executed';
    fixture.confirmation.execution = { results: [{ action_id: 'content.manuscript.generate', success: true, message: '임시저장 완료' }] };
    const status = await adapter.callTool({
        name: 'blog_confirmation_status',
        arguments: { confirmation_id: fixture.confirmation.id }
    }, { userId: 'mcp-user-1', conversationId: 'mcp:conversation-1' });
    assert.equal(status.status, 'executed');
    finishExecution({ ok: true, status: 'executed' });
});

test('MCP can update options on a pending confirmation before approval', async () => {
    const fixture = createFixture();
    const adapter = createMcpAgentActionAdapter(fixture);
    const result = await adapter.callTool({
        name: 'blog_confirmation_update',
        arguments: {
            confirmation_id: fixture.confirmation.id,
            parameters: { image_mode: 'none', naver_category: 'AI' }
        }
    }, { userId: 'mcp-user-1', conversationId: 'mcp:conversation-1' });

    assert.equal(result.status, 'confirmation_required');
    assert.deepEqual(fixture.calls[0].updateInput.parameters, { image_mode: 'none', naver_category: 'AI' });
});

test('MCP decisions reach the real runtime with the originating session identity', async () => {
    const { createAgentRuntime } = require('../../../host/agent/runtime');
    const { ConfirmationStore } = require('../../storage/confirmations/confirmation-store');
    const confirmationStore = new ConfirmationStore();
    let executions = 0;
    const capabilityRegistry = { listAgentActions: () => [], async executeAction() { executions++; return { success: true, message: 'ok' }; } };
    const runtime = createAgentRuntime({ capabilityRegistry, confirmationStore });
    const adapter = createMcpAgentActionAdapter({ capabilityRegistry, runtime });
    confirmationStore.create({ id: 'real', channel: 'mcp', userId: 'owner', conversationId: 'mcp:owner', actions: [{ id: 'a', domain: 'example', name: 'run' }] });
    const call = (decision, userId, conversationId) => adapter.callTool({ name: 'blog_confirmation_decide', arguments: { confirmation_id: 'real', decision } }, { userId, conversationId });
    for (const [user, conversation] of [['other', 'mcp:owner'], ['owner', 'mcp:other']]) {
        for (const decision of ['approve', 'reject']) assert.equal((await call(decision, user, conversation)).status, 'not_found');
    }
    assert.equal((await call('invalid', 'owner', 'mcp:owner')).status, 'invalid_input');
    assert.equal(confirmationStore.get('real').status, 'pending');
    assert.equal(executions, 0);
    assert.equal((await call('approve', 'owner', 'mcp:owner')).status, 'accepted');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(confirmationStore.get('real').status, 'executed');
    assert.equal(executions, 1);
});

test('MCP reports expiry between its lookup and runtime lookup or transition', async () => {
    const { createAgentRuntime } = require('../../../host/agent/runtime');
    const { ConfirmationStore } = require('../../storage/confirmations/confirmation-store');
    for (const boundary of ['lookup', 'transition']) {
        const store = new ConfirmationStore();
        let runs = 0;
        const registry = { listAgentActions: () => [], async executeAction() { runs++; return { success: true }; } };
        const runtime = createAgentRuntime({ capabilityRegistry: registry, confirmationStore: store });
        store.create({ id: boundary, channel: 'mcp', userId: 'owner', conversationId: 'mcp:owner', actions: [{ id: 'a', domain: 'example', name: 'run' }] });
        const get = store.get.bind(store);
        const accept = store.accept.bind(store);
        let reads = 0;
        if (boundary === 'lookup') store.get = id => { if (++reads === 2) store.items.get(id).expiresAtMs = Date.now() - 1; return get(id); };
        else store.accept = id => { store.items.get(id).expiresAtMs = Date.now() - 1; return accept(id); };
        const result = await createMcpAgentActionAdapter({ capabilityRegistry: registry, runtime }).callTool({ name: 'blog_confirmation_decide', arguments: { confirmation_id: boundary, decision: 'approve' } }, { userId: 'owner', conversationId: 'mcp:owner' });
        assert.equal(result.status, 'expired', boundary);
        assert.equal(result.ok, false);
        assert.equal(runs, 0);
    }
});

test('MCP real runtime acknowledges a long action without waiting and blocks duplicate approval', async () => {
    const { createAgentRuntime } = require('../../../host/agent/runtime');
    const { ConfirmationStore } = require('../../storage/confirmations/confirmation-store');
    const store = new ConfirmationStore();
    let finish, runs = 0;
    const registry = { listAgentActions: () => [], executeAction() { runs++; return new Promise(resolve => { finish = resolve; }); } };
    const runtime = createAgentRuntime({ capabilityRegistry: registry, confirmationStore: store });
    store.create({ id: 'long', channel: 'mcp', userId: 'owner', conversationId: 'mcp:owner', actions: [{ id: 'a', domain: 'example', name: 'run' }] });
    const adapter = createMcpAgentActionAdapter({ capabilityRegistry: registry, runtime });
    const call = (userId = 'owner') => adapter.callTool({ name: 'blog_confirmation_decide', arguments: { confirmation_id: 'long', decision: 'approve' } }, { userId, conversationId: 'mcp:owner' });
    const [first, second] = await Promise.all([call(), call()]);
    assert.equal(first.status, 'accepted');
    assert.equal(first.ok, true);
    assert.equal(second.status, 'accepted');
    assert.equal(second.ok, false);
    assert.equal((await call('other')).status, 'not_found');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(runs, 1);
    assert.equal(store.get('long').status, 'accepted');
    finish({ success: true });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(store.get('long').status, 'executed');
});

test('MCP records a background execution failure after acknowledging', async () => {
    const { createAgentRuntime } = require('../../../host/agent/runtime');
    const { ConfirmationStore } = require('../../storage/confirmations/confirmation-store');
    const store = new ConfirmationStore();
    let fail;
    const registry = { listAgentActions: () => [], executeAction() { return new Promise((_, reject) => { fail = reject; }); } };
    const runtime = createAgentRuntime({ capabilityRegistry: registry, confirmationStore: store });
    store.create({ id: 'failure', channel: 'mcp', userId: 'owner', conversationId: 'mcp:owner', actions: [{ id: 'a', domain: 'example', name: 'run' }] });
    const adapter = createMcpAgentActionAdapter({ capabilityRegistry: registry, runtime });
    const context = { userId: 'owner', conversationId: 'mcp:owner' };
    const ack = await adapter.callTool({ name: 'blog_confirmation_decide', arguments: { confirmation_id: 'failure', decision: 'approve' } }, context);
    assert.equal(ack.status, 'accepted');
    await new Promise(resolve => setImmediate(resolve));
    fail(Object.assign(new Error('test failure'), { code: 'TEST_FAILURE' }));
    await new Promise(resolve => setImmediate(resolve));
    const status = await adapter.callTool({ name: 'blog_confirmation_status', arguments: { confirmation_id: 'failure' } }, context);
    assert.equal(status.status, 'failed');
    assert.match(status.message, /TEST_FAILURE/);
});

test('MCP tracks a long running action past retention and retains its completed result', async () => {
    const { createAgentRuntime } = require('../../../host/agent/runtime');
    const { ConfirmationStore } = require('../../storage/confirmations/confirmation-store');
    const store = new ConfirmationStore({ ttlMs: 1000 });
    let now = 10000, finish, runs = 0;
    store._now = () => now;
    const registry = { listAgentActions: () => [], executeAction() { runs++; return new Promise(resolve => { finish = resolve; }); } };
    const runtime = createAgentRuntime({ capabilityRegistry: registry, confirmationStore: store });
    const adapter = createMcpAgentActionAdapter({ capabilityRegistry: registry, runtime });
    const context = { userId: 'owner', conversationId: 'mcp:owner' };
    store.create({ id: 'long-retention', channel: 'mcp', userId: 'owner', conversationId: 'mcp:owner', actions: [{ id: 'a', domain: 'example', name: 'run' }] });
    const call = name => adapter.callTool({ name, arguments: { confirmation_id: 'long-retention', decision: 'approve' } }, context);
    assert.equal((await call('blog_confirmation_decide')).status, 'accepted');
    await new Promise(resolve => setImmediate(resolve));
    now += 3000;
    assert.equal((await call('blog_confirmation_status')).status, 'accepted');
    assert.equal((await call('blog_confirmation_decide')).ok, false);
    assert.equal(runs, 1);
    finish({ success: true, message: 'done' });
    await new Promise(resolve => setImmediate(resolve));
    const result = await call('blog_confirmation_status');
    assert.equal(result.status, 'executed');
    assert.equal(result.results[0].result.message, 'done');
    now += 1000;
    assert.equal((await call('blog_confirmation_status')).status, 'not_found');
});


test('MCP does not acknowledge or execute when persisting approval fails', async t => {
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const { createAgentRuntime } = require('../../../host/agent/runtime');
    const { ConfirmationStore } = require('../../storage/confirmations/confirmation-store');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'approval-failure-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const persistPath = path.join(dir, 'state.json');
    const store = new ConfirmationStore({ persistPath });
    let runs = 0;
    const registry = { listAgentActions: () => [], async executeAction() { runs++; return { success: true }; } };
    const runtime = createAgentRuntime({ capabilityRegistry: registry, confirmationStore: store });
    store.create({ id: 'persist-failure', channel: 'mcp', userId: 'owner', conversationId: 'mcp:owner', actions: [{ id: 'a', domain: 'example', name: 'run' }] });
    const persist = store._persist.bind(store);
    store._persist = () => {
        if (store.items.get('persist-failure')?.status === 'accepted') throw Object.assign(new Error('injected'), { code: 'CONFIRMATION_STORAGE_ERROR' });
        return persist();
    };
    const adapter = createMcpAgentActionAdapter({ capabilityRegistry: registry, runtime });
    await assert.rejects(adapter.callTool({ name: 'blog_confirmation_decide', arguments: { confirmation_id: 'persist-failure', decision: 'approve' } }, { userId: 'owner', conversationId: 'mcp:owner' }), { code: 'CONFIRMATION_STORAGE_ERROR' });
    assert.equal(runs, 0);
    assert.equal(new ConfirmationStore({ persistPath }).get('persist-failure').status, 'pending');
});
