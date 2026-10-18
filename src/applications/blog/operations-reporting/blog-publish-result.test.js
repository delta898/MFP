const test = require('node:test');
const assert = require('node:assert/strict');

const {
    resolveBlogPublishStage,
    classifyBlogPublishResultEvent,
    buildBlogPublishResultEvidence
} = require('./blog-publish-result');

test('blog publish result maps each successful post status to one lifecycle stage', () => {
    assert.equal(resolveBlogPublishStage('draft'), 'drafted');
    assert.equal(resolveBlogPublishStage('schedule'), 'scheduled');
    assert.equal(resolveBlogPublishStage('publish'), 'published');
    assert.equal(resolveBlogPublishStage('unknown'), '');
});

test('blog publish result records one fact per successful platform', () => {
    const evidence = buildBlogPublishResultEvidence({
        operationId: 'operation-1',
        subject: '플랫폼별 결과',
        source: 'quick-publish',
        postStatus: 'schedule',
        results: {
            naver: { success: true, postUrl: 'https://blog.naver.com/post/1' },
            wordpress: { success: true, postUrl: 'https://example.com/post/1' }
        }
    });

    assert.equal(evidence.length, 2);
    assert.deepEqual(evidence.map((item) => item.platform), ['naver', 'wordpress']);
    assert.equal(evidence.every((item) => item.stage === 'scheduled'), true);
    assert.equal(evidence.every((item) => item.metadata.processed === true), true);
    assert.equal(evidence.every((item) => item.metadata.publicly_published === false), true);
});

test('blog publish result excludes failed and unknown platforms', () => {
    const evidence = buildBlogPublishResultEvidence({
        operationId: 'operation-2',
        subject: '부분 성공',
        source: 'continuous-publishing',
        postStatus: 'publish',
        results: {
            naver: { success: false },
            wordpress: { success: true, reused: true },
            unsupported: { success: true }
        }
    });

    assert.equal(evidence.length, 1);
    assert.equal(evidence[0].platform, 'wordpress');
    assert.equal(evidence[0].metadata.publicly_published, true);
    assert.equal(evidence[0].metadata.reused, true);
    assert.equal(evidence[0].evidence_id, 'operation-2:blog:wordpress:published');
});

test('blog publish result requires a stable operation, source, and supported status', () => {
    const results = { naver: { success: true } };
    assert.deepEqual(buildBlogPublishResultEvidence({ source: 'quick', postStatus: 'draft', results }), []);
    assert.deepEqual(buildBlogPublishResultEvidence({ operationId: 'op', postStatus: 'draft', results }), []);
    assert.deepEqual(buildBlogPublishResultEvidence({ operationId: 'op', source: 'quick', postStatus: 'other', results }), []);
});

test('stored publish result is normalized from its lifecycle stage', () => {
    const result = classifyBlogPublishResultEvent({
        id: 'event-1',
        event_type: 'activity.lifecycle.blog.published',
        timestamp: '2026-09-02T12:00:00.000Z',
        payload: {
            domain: 'blog',
            stage: 'published',
            subject: '공개한 글',
            source: 'quick-publish',
            entity_ref: 'operation-3',
            platform: 'wordpress',
            result_ref: 'https://example.com/post',
            metadata: { post_status: 'publish', publicly_published: false }
        }
    });

    assert.equal(result.processed, true);
    assert.equal(result.publicly_published, true);
    assert.equal(result.post_status, 'publish');
});

test('stored publish result rejects mismatched or unsupported evidence', () => {
    const base = {
        id: 'event-2',
        event_type: 'activity.lifecycle.blog.drafted',
        payload: {
            domain: 'blog',
            stage: 'drafted',
            source: 'quick-publish',
            platform: 'naver',
            metadata: { post_status: 'draft' }
        }
    };
    assert.equal(classifyBlogPublishResultEvent(base)?.post_status, 'draft');
    assert.equal(classifyBlogPublishResultEvent({ ...base, event_type: 'activity.lifecycle.blog.published' }), null);
    assert.equal(classifyBlogPublishResultEvent({ ...base, payload: { ...base.payload, platform: 'other' } }), null);
});
