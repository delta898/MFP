const test = require('node:test');
const assert = require('node:assert/strict');
const { createBlogNextExecutionCoordinator } = require('./execution-coordinator');
const { createAiGenerationOperationManager } = require('./ai-generation-operations');

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}

function settled() {
    return new Promise((resolve) => setImmediate(resolve));
}

test('cancellation keeps the shared lease until the actual task settles and discards its late result', async () => {
    const coordinator = createBlogNextExecutionCoordinator();
    const manager = createAiGenerationOperationManager({ coordinator, createId: () => 'operation-1' });
    const pending = deferred();
    const started = manager.start({ subject: '주제' }, async (context) => {
        context.setStage('writing');
        return pending.promise;
    });
    await settled();

    assert.equal(manager.get(started.operationId).state, 'running');
    assert.equal(manager.getCurrent().operationId, started.operationId);
    assert.equal(manager.cancel(started.operationId).cancelOutcome, 'requested');
    assert.equal(manager.cancel(started.operationId).cancelOutcome, 'already_requested');
    assert.equal(manager.get(started.operationId).state, 'cancel_requested');
    assert.equal(coordinator.getStatus().busy, true);
    assert.throws(() => manager.start({}, async () => null), (error) => error.apiCode === 'BLOG_NEXT_EXECUTION_BUSY');

    pending.resolve({ draftId: 'must-not-appear' });
    await settled();
    const finished = manager.get(started.operationId);
    assert.equal(finished.state, 'canceled');
    assert.equal(finished.busy, false);
    assert.equal('result' in finished, false);
    assert.deepEqual(coordinator.getStatus(), { busy: false });
    assert.equal(manager.getCurrent(), null);
});

test('cancel before detached task starts prevents task execution', async () => {
    const coordinator = createBlogNextExecutionCoordinator();
    const manager = createAiGenerationOperationManager({ coordinator });
    let calls = 0;
    const started = manager.start({}, async () => { calls += 1; });
    assert.equal(manager.cancel(started.operationId).state, 'cancel_requested');
    await settled();
    assert.equal(calls, 0);
    assert.equal(manager.get(started.operationId).state, 'canceled');
    assert.deepEqual(coordinator.getStatus(), { busy: false });
});

test('commit boundary rejects late cancellation while keeping final result', async () => {
    const coordinator = createBlogNextExecutionCoordinator();
    const manager = createAiGenerationOperationManager({ coordinator });
    const pending = deferred();
    const started = manager.start({}, async (context) => {
        context.beginCommit();
        return pending.promise;
    });
    await settled();

    assert.equal(manager.get(started.operationId).canCancel, false);
    assert.equal(manager.cancel(started.operationId).cancelOutcome, 'too_late');
    pending.resolve({ draftId: 'created' });
    await settled();
    assert.equal(manager.get(started.operationId).result.draftId, 'created');
    assert.equal(manager.cancel(started.operationId).cancelOutcome, 'already_finished');
});

test('failure is retained briefly and a different operation cannot be canceled', async () => {
    let currentTime = new Date('2026-09-23T00:00:00.000Z');
    const coordinator = createBlogNextExecutionCoordinator();
    const manager = createAiGenerationOperationManager({
        coordinator,
        now: () => currentTime,
        retentionMs: 1000
    });
    const started = manager.start({}, async () => {
        const error = new Error('모델 요청 실패');
        error.code = 'AI_MODEL_FAILED';
        throw error;
    });
    assert.throws(() => manager.cancel('other-operation'), (error) => error.status === 404);
    await settled();
    assert.deepEqual(manager.get(started.operationId).error, {
        code: 'AI_MODEL_FAILED', message: '모델 요청 실패'
    });
    assert.deepEqual(coordinator.getStatus(), { busy: false });
    currentTime = new Date('2026-09-23T00:00:01.001Z');
    assert.throws(() => manager.get(started.operationId), (error) => error.status === 404);
});

test('shared coordinator rejects a generation while another Blog Beta task holds the lease', () => {
    const coordinator = createBlogNextExecutionCoordinator();
    const other = coordinator.acquire({ source: 'continuous_runner' });
    const manager = createAiGenerationOperationManager({ coordinator });
    assert.throws(() => manager.start({}, async () => null), (error) => error.status === 409);
    other.release();
});
