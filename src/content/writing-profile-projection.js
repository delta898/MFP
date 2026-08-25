const { normalizeWritingProfile } = require('./writing-profile');

const CONTENT_KINDS = Object.freeze(['blog', 'shopping']);

function cloneValue(value) {
    return JSON.parse(JSON.stringify(value));
}

function projectWritingProfile(input = {}, options = {}) {
    const kind = String(options.kind || '').trim().toLowerCase();
    if (!CONTENT_KINDS.includes(kind)) {
        const error = new Error(`지원하지 않는 콘텐츠 profile kind입니다: ${kind || '(없음)'}`);
        error.code = 'INVALID_WRITING_PROFILE_KIND';
        throw error;
    }

    const profile = normalizeWritingProfile(input);
    return {
        kind,
        common: cloneValue(profile.common),
        channel: cloneValue(profile.channels[kind])
    };
}

module.exports = {
    CONTENT_KINDS,
    projectWritingProfile
};
