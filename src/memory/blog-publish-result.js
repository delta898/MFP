const BLOG_PUBLISH_PLATFORMS = Object.freeze(['naver', 'wordpress']);
const BLOG_POST_STATUS_TO_STAGE = Object.freeze({
    draft: 'drafted',
    schedule: 'scheduled',
    publish: 'published'
});
const BLOG_PUBLISH_RESULT_STAGES = Object.freeze(Object.values(BLOG_POST_STATUS_TO_STAGE));

function normalizeToken(value) {
    return String(value || '').trim().toLowerCase();
}

function resolveBlogPublishStage(postStatus) {
    return BLOG_POST_STATUS_TO_STAGE[normalizeToken(postStatus)] || '';
}

function classifyBlogPublishResultEvent(event = {}) {
    const eventType = String(event.event_type || '').trim().toLowerCase();
    const payload = event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload)
        ? event.payload
        : {};
    const stage = normalizeToken(payload.stage);
    const platform = normalizeToken(payload.platform);
    const expectedType = `activity.lifecycle.blog.${stage}`;
    if (eventType !== expectedType) return null;
    if (normalizeToken(payload.domain) !== 'blog') return null;
    if (!BLOG_PUBLISH_RESULT_STAGES.includes(stage)) return null;
    if (!BLOG_PUBLISH_PLATFORMS.includes(platform)) return null;

    const postStatus = normalizeToken(payload.metadata?.post_status);
    if (resolveBlogPublishStage(postStatus) !== stage) return null;

    return {
        id: String(event.id || '').trim(),
        timestamp: event.timestamp || null,
        operation_id: String(payload.entity_ref || '').trim(),
        subject: String(payload.subject || '').trim(),
        source: String(payload.source || '').trim(),
        platform,
        post_status: postStatus,
        result_ref: String(payload.result_ref || '').trim(),
        processed: true,
        publicly_published: stage === 'published'
    };
}

function buildBlogPublishResultEvidence(input = {}) {
    const operationId = String(input.operationId || input.operation_id || '').trim();
    const subject = String(input.subject || '').trim();
    const source = String(input.source || '').trim();
    const postStatus = normalizeToken(input.postStatus || input.post_status);
    const stage = resolveBlogPublishStage(postStatus);
    const results = input.results && typeof input.results === 'object' && !Array.isArray(input.results)
        ? input.results
        : {};

    if (!operationId || !source || !stage) return [];

    return BLOG_PUBLISH_PLATFORMS.flatMap((platform) => {
        const result = results[platform];
        if (!result || result.success !== true) return [];
        return [{
            domain: 'blog',
            stage,
            subject,
            source,
            entity_ref: operationId,
            platform,
            result_ref: String(result.postUrl || '').trim(),
            evidence_id: `${operationId}:blog:${platform}:${stage}`,
            metadata: {
                post_status: postStatus,
                processed: true,
                publicly_published: stage === 'published',
                reused: result.reused === true
            }
        }];
    });
}

module.exports = {
    BLOG_PUBLISH_PLATFORMS,
    BLOG_POST_STATUS_TO_STAGE,
    BLOG_PUBLISH_RESULT_STAGES,
    resolveBlogPublishStage,
    classifyBlogPublishResultEvent,
    buildBlogPublishResultEvidence
};
