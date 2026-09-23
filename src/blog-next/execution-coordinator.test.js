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
