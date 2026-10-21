'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { handleRequest } = require('./stdio-server');
const { createServerState, buildToolResultPayload } = require('./protocol');

async function captureRequest(message, state, services = {}) {
    const chunks = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => { chunks.push(String(chunk)); return true; };
    try {
        await handleRequest(message, state, services, { name: 'bloggenius-mcp', version: 'test' });
    } finally {
        process.stdout.write = originalWrite;
    }
    return JSON.parse(chunks.join(''));
}

test('stdio request handler exposes Agent tools and dispatches MCP tools/call', async () => {
    const state = createServerState();
    const calls = [];
    const services = { adapter: {
        listTools: () => [{ name: 'blog_content_queue_list_topics', inputSchema: { type: 'object' } }],
        async callTool(input) {
            calls.push(input);
            return { ok: true, status: 'completed', results: [{ result: { success: true } }] };
        }
    } };
    const initialized = await captureRequest({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }, state, services);
    assert.equal(initialized.result.serverInfo.name, 'bloggenius-mcp');

    const tools = await captureRequest({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }, state, services);
    assert.equal(tools.result.tools[0].name, 'blog_content_queue_list_topics');

    const result = await captureRequest({
        jsonrpc: '2.0', id: 3, method: 'tools/call',
        params: { name: 'blog_content_queue_list_topics', arguments: { scope: 'queue' } }
    }, state, services);
    assert.equal(result.result.isError, false);
    assert.equal(result.result.structuredContent.status, 'completed');
    assert.match(result.result.content[0].text, /completed/);
    assert.equal(calls[0].name, 'blog_content_queue_list_topics');
});

test('stdio request handler rejects tools before initialize and returns safe tool failures', async () => {
    const state = createServerState();
    const services = { adapter: { listTools: () => [], async callTool() { throw new Error('expected failure'); } } };
    const beforeInitialize = await captureRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, state, services);
    assert.equal(beforeInitialize.error.code, -32002);

    await captureRequest({ jsonrpc: '2.0', id: 2, method: 'initialize' }, state, services);
    const failed = await captureRequest({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'fail' } }, state, services);
    assert.equal(failed.error.code, -32000);
    assert.equal(failed.error.message, 'expected failure');

    const actionFailure = buildToolResultPayload({
        ok: true,
        status: 'completed',
        results: [{ result: { success: false, message: '원고 생성은 되었지만 포스팅은 실패했습니다.' } }]
    });
    assert.equal(actionFailure.isError, true);
    assert.match(actionFailure.content[0].text, /포스팅은 실패/);

    const confirmation = buildToolResultPayload({
        ok: true,
        status: 'confirmation_required',
        confirmation: { id: 'confirm_test-123' },
        previews: [{ preview: { summary: '네이버 블로그 임시저장' } }]
    });
    assert.equal(confirmation.isError, false);
    assert.match(confirmation.content[0].text, /Confirmation ID: confirm_test-123/);
    assert.match(confirmation.content[0].text, /blog_confirmation_decide/);
    assert.match(confirmation.content[0].text, /decision="approve" or "reject"/);
});
