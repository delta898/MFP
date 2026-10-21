'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ConfirmationStore } = require('./confirmation-store');

test('confirmation store retains a compact execution outcome for later status checks', () => {
    const store = new ConfirmationStore();
    store.create({ id: 'confirm-result', channel: 'mcp', userId: 'u1', conversationId: 'mcp:u1' });
    store.accept('confirm-result');

    const completed = store.markExecuted('confirm-result', [{
        action_id: 'content.manuscript.generate_and_publish',
        capability_id: 'content.manuscript.generate_and_publish',
        result: { success: true, message: '원고 ID: draft-123', data: { manuscript: 'large content omitted' } }
    }]);

    assert.equal(completed.status, 'executed');
    assert.deepEqual(completed.execution, {
        success: true,
        results: [{ action_id: 'content.manuscript.generate_and_publish', success: true, message: '원고 ID: draft-123' }]
    });
    assert.equal(Object.hasOwn(completed.execution.results[0], 'data'), false);
});

test('confirmation store marks thrown execution failures without persisting raw error messages', () => {
    const store = new ConfirmationStore();
    store.create({ id: 'confirm-failed', channel: 'mcp' });
    store.accept('confirm-failed');

    const failed = store.markExecutionFailed('confirm-failed', 'ERR_BAD_REQUEST');
    assert.equal(failed.status, 'failed');
    assert.deepEqual(failed.execution, { success: false, errorCode: 'ERR_BAD_REQUEST' });
});
