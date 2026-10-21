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
    fixture.runtime.handleConfirmationDecision = (input, context) => {
        fixture.calls.push({ confirmationInput: input, context });
        fixture.confirmation.status = 'accepted';
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
