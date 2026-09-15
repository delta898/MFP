const test = require('node:test');
const assert = require('node:assert/strict');

const { createQuickPublishRuntime } = require('./quick-publish-runtime');

test('disposing a preview session also releases its owned generated workspace', () => {
    const disposed = [];
    const runtime = createQuickPublishRuntime({
        disposePreviewSession: (session) => disposed.push(session.previewId)
    });
    runtime.registerPreviewSession({ previewId: 'preview-1', targetDirs: { wordpress: '/workspace/generated' } });
    assert.equal(runtime.deletePreviewSession('preview-1'), true);
    assert.deepEqual(disposed, ['preview-1']);
    assert.equal(runtime.getPreviewSession('preview-1'), null);
});

test('expired preview sessions release their owned generated workspace', () => {
    const disposed = [];
    const runtime = createQuickPublishRuntime({
        previewTtlMs: 1000,
        disposePreviewSession: (session) => disposed.push(session.previewId)
    });
    runtime.registerPreviewSession({ previewId: 'preview-expired' });
    runtime.cleanupPreviewSessions(Date.now() + 2000);
    assert.deepEqual(disposed, ['preview-expired']);
});
