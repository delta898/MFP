'use strict';

const BLOG_IMAGE_MODES = Object.freeze(['generate', 'prompt_only', 'none']);
const BLOG_IMAGE_MODE_SET = new Set(BLOG_IMAGE_MODES);

function normalizeBlogImageMode(value, options = {}) {
    const normalized = String(value || '').trim().toLowerCase();
    if (BLOG_IMAGE_MODE_SET.has(normalized)) return normalized;
    if (typeof options.legacyGenerate === 'boolean') return options.legacyGenerate ? 'generate' : 'prompt_only';
    return BLOG_IMAGE_MODE_SET.has(options.fallback) ? options.fallback : 'prompt_only';
}

module.exports = { BLOG_IMAGE_MODES, normalizeBlogImageMode };
