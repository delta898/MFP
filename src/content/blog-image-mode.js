const BLOG_IMAGE_MODES = Object.freeze(['generate', 'prompt_only', 'none']);
const BLOG_IMAGE_MODE_SET = new Set(BLOG_IMAGE_MODES);

function normalizeBlogImageMode(value, options = {}) {
    const normalized = String(value || '').trim().toLowerCase();
    if (BLOG_IMAGE_MODE_SET.has(normalized)) return normalized;
    if (typeof options.legacyGenerate === 'boolean') {
        return options.legacyGenerate ? 'generate' : 'prompt_only';
    }
    return BLOG_IMAGE_MODE_SET.has(options.fallback) ? options.fallback : 'prompt_only';
}

function parseBlogImageMode(value, options = {}) {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized) {
        if (BLOG_IMAGE_MODE_SET.has(normalized)) return normalized;
        const error = new Error('이미지 처리 방식이 올바르지 않습니다.');
        error.code = 'INVALID_BLOG_IMAGE_MODE';
        throw error;
    }
    return normalizeBlogImageMode('', options);
}

function includesBlogImagePrompts(mode) {
    return normalizeBlogImageMode(mode) !== 'none';
}

function generatesBlogImages(mode) {
    return normalizeBlogImageMode(mode) === 'generate';
}

function stripBlogImagePromptBlocks(content) {
    return String(content || '')
        .replace(/\[\[IMAGE_\d+\s*\n[\s\S]*?\n\]\]/g, '')
        .replace(/\[\[IMAGE_\d+\s*:[^\]]*\]\]/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

module.exports = {
    BLOG_IMAGE_MODES,
    normalizeBlogImageMode,
    parseBlogImageMode,
    includesBlogImagePrompts,
    generatesBlogImages,
    stripBlogImagePromptBlocks
};
