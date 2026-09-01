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
