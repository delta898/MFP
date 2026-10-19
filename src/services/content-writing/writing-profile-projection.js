const { normalizeWritingProfile } = require('./writing-profile');

const CONTENT_KINDS = Object.freeze(['blog', 'shopping']);

function cloneValue(value) {
    return JSON.parse(JSON.stringify(value));
}

function getCurrentReferenceFingerprint(profile) {
    const references = profile.channels.blog.style_references || {};
    const statuses = [
        references.sample_text?.status,
        ...(references.blog_urls || []).map((item) => item.status)
    ].filter((status) => status && status !== 'empty');
    const hasAnalyzedSource = statuses.some((status) => status === 'analyzed');
    if (!references.fingerprint || !hasAnalyzedSource || statuses.some((status) => status === 'pending' || status === 'stale')) return null;
    return references.fingerprint;
}

function projectWritingProfile(input = {}, options = {}) {
    const kind = String(options.kind || '').trim().toLowerCase();
    if (!CONTENT_KINDS.includes(kind)) {
        const error = new Error(`지원하지 않는 콘텐츠 profile kind입니다: ${kind || '(없음)'}`);
        error.code = 'INVALID_WRITING_PROFILE_KIND';
        throw error;
    }

    const profile = normalizeWritingProfile(input);
    const common = cloneValue(profile.common);
    const channel = cloneValue(profile.channels[kind]);
    if (kind === 'blog' && !getCurrentReferenceFingerprint(profile)) {
        channel.style_references.fingerprint = null;
    }
    return {
        kind,
        common,
        channel
    };
}

module.exports = {
    CONTENT_KINDS,
    getCurrentReferenceFingerprint,
    projectWritingProfile
};
