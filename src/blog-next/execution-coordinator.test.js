const test = require('node:test');
const assert = require('node:assert/strict');

const { createBlogNextExecutionCoordinator } = require('./execution-coordinator');

test('Blog Beta coordinator admits one execution and exposes only bounded public status', () => {
    const coordinator = createBlogNextExecutionCoordinator({
        now: () => new Date('2026-09-02T00:00:00.000Z')
    });

    const lease = coordinator.acquire({
        source: 'local_markdown',
        subject: '원고 붙여넣기',
        message: '원고를 처리하고 있습니다.',
        rawPayload: '노출되면 안 됨'
    });

    assert.ok(lease);
    assert.deepEqual(coordinator.getStatus(), {
        busy: true,
        state: 'running',
        executionId: 'blog-next-1',
        source: 'local_markdown',
        subject: '원고 붙여넣기',
        message: '원고를 처리하고 있습니다.',
        startedAt: '2026-09-02T00:00:00.000Z'
    });
    assert.equal(coordinator.acquire({ source: 'continuous_runner' }), null);
});

test('Blog Beta coordinator releases idempotently and admits the next execution', () => {
    const coordinator = createBlogNextExecutionCoordinator();
    const first = coordinator.acquire({ source: 'continuous_runner' });

    assert.equal(first.release(), true);
    assert.equal(first.release(), false);
    assert.deepEqual(coordinator.getStatus(), { busy: false });
    assert.ok(coordinator.acquire({ source: 'local_markdown' }));
});

test('Blog Beta coordinator rejects unknown execution sources', () => {
    const coordinator = createBlogNextExecutionCoordinator();

    assert.throws(
        () => coordinator.acquire({ source: 'legacy_blog' }),
        (error) => error.code === 'BLOG_NEXT_EXECUTION_SOURCE_INVALID'
    );
});

test('Blog Beta coordinator reports only the current execution progress', () => {
    const coordinator = createBlogNextExecutionCoordinator();
    const first = coordinator.acquire({ source: 'local_markdown', message: '준비 중' });
    assert.equal(first.updateProgress({ stage: 'body', message: '원고 2/5구간을 입력하고 있습니다.', postStatus: 'draft' }), true);
    assert.equal(coordinator.getStatus().progressStage, 'body');
    assert.equal(coordinator.getStatus().postStatus, 'draft');
    assert.equal(coordinator.getStatus().message, '원고 2/5구간을 입력하고 있습니다.');
    assert.equal(first.updateProgress({ stage: '', message: '무효' }), false);
    first.release();
    const next = coordinator.acquire({ source: 'local_markdown', message: '다음 작업' });
    assert.equal(first.updateProgress({ stage: 'verifying', message: '오래된 작업' }), false);
    assert.equal(coordinator.getStatus().message, '다음 작업');
    next.release();
});

test('Blog Beta coordinator only stops eligible local Markdown work and retains its terminal status', () => {
    const coordinator = createBlogNextExecutionCoordinator({
        now: () => new Date('2026-09-24T00:00:00.000Z')
    });
    const lease = coordinator.acquire({ source: 'local_markdown', canStop: true, message: '네이버 포스팅 중' });
    assert.equal(coordinator.getStatus().canStop, true);
    const stopped = coordinator.requestStop();
    assert.equal(stopped.accepted, true);
    assert.equal(lease.signal.aborted, true);
    assert.equal(coordinator.getStatus().state, 'stop_requested');
    lease.release();
    assert.deepEqual(coordinator.getStatus(), {
        busy: false,
        state: 'stopped',
        executionId: 'blog-next-1',
        source: 'local_markdown',
        subject: '원고 포스팅',
        message: '네이버 포스팅을 중지했습니다. 이미 처리된 저장·발행은 되돌리지 않습니다.',
        startedAt: '2026-09-24T00:00:00.000Z',
        finishedAt: '2026-09-24T00:00:00.000Z'
    });
});

test('Blog Beta coordinator does not allow stopping other or non-stoppable executions', () => {
    const coordinator = createBlogNextExecutionCoordinator();
    const lease = coordinator.acquire({ source: 'local_markdown', canStop: false });
    assert.equal(coordinator.requestStop().accepted, false);
    lease.release();
    const other = coordinator.acquire({ source: 'continuous_runner', canStop: true });
    assert.equal(coordinator.requestStop().accepted, false);
    other.release();
});

test('Blog Beta coordinator closes the stop window before the final request', () => {
    const coordinator = createBlogNextExecutionCoordinator();
    const lease = coordinator.acquire({ source: 'local_markdown' });
    lease.setCanStop(true);
    assert.equal(coordinator.getStatus().canStop, true);
    lease.updateProgress({ stage: 'submitting', message: '네이버 블로그에 발행을 요청하고 있습니다.' });
    assert.equal(coordinator.getStatus().canStop, undefined);
    assert.equal(coordinator.requestStop().accepted, false);
    lease.release();
});
